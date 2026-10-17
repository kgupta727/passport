import { db, Listing, Need, Requirement, Tenant, Trade, User, scoped, tenantById, userById, DAY, now } from './db.js';

/* ---------- 9.1 Suggested price: S = B x C x (1 + L) ---------- */

export const CONDITION_STEPS = {
  good: { label: 'Good', mult: 1.0, score: 90, blurb: 'Works perfectly, light signs of use at most.' },
  worn: { label: 'Worn', mult: 0.7, score: 65, blurb: 'Clearly used: scuffs or wear, nothing broken.' },
  damaged: { label: 'Damaged', mult: 0.4, score: 35, blurb: 'Something is off: a crack, stain or missing part.' },
} as const;
export type ConditionStep = keyof typeof CONDITION_STEPS;

export function conditionStep(score: number): ConditionStep {
  return score >= 80 ? 'good' : score >= 50 ? 'worn' : 'damaged';
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** B: median of the last 10 completed campus sales in the category. */
export function basePrice(tenantId: string, category: string): { cents: number | null; n: number } {
  const sales = scoped(db.sales, tenantId)
    .filter((s) => s.category === category)
    .sort((a, b) => b.at - a.at)
    .slice(0, 10);
  return { cents: median(sales.map((s) => s.cents)), n: sales.length };
}

export function stampCount(lineageId: string): number {
  return db.passport_events.filter((e) => e.lineage_id === lineageId && e.type === 'stamp').length;
}

export function suggestPrice(tenantId: string, category: string, conditionScore: number, stamps: number) {
  const B = basePrice(tenantId, category);
  const step = conditionStep(conditionScore);
  const C = CONDITION_STEPS[step].mult;
  const L = Math.min(0.25, 0.05 * stamps);
  if (B.cents == null) return { S_cents: null, B_cents: null, C, L, stamps, n: 0, step };
  const S = Math.round(B.cents * C * (1 + L));
  return { S_cents: S, B_cents: Math.round(B.cents), C, L, stamps, n: B.n, step };
}

/* ---------- 9.4 Fair meeting point: argmin_p max(b(p), s(p)) ---------- */

export function walkMinutes(tenant: Tenant, housing: string, zone: string): number {
  return tenant.config.walk[housing]?.[zone] ?? 15;
}

export function pickMeetingPoint(tenant: Tenant, buyerHousing: string, sellerHousing: string) {
  const options = tenant.config.safeZones.map((z) => {
    const b = walkMinutes(tenant, buyerHousing, z.id);
    const s = walkMinutes(tenant, sellerHousing, z.id);
    return { zone: z.id, name: z.name, b, s, worst: Math.max(b, s) };
  });
  options.sort((x, y) => x.worst - y.worst || x.b + x.s - (y.b + y.s));
  return { best: options[0], options };
}

/* ---------- 9.2 Ranking: Score = F x R x T ---------- */

export const reach = (m: number) => 1 / (1 + m / 10);

/** Claimed = trades that reached a booking (or the seller cancelled). Buyer-side hold lapses do not count against the seller. */
export function sellerStats(sellerId: string) {
  const counted = db.trades.filter((t) => {
    if (t.seller_id !== sellerId) return false;
    if (['COMPLETE', 'RESOLVED', 'NO_SHOW', 'REFUNDED', 'DISPUTED'].includes(t.state)) return true;
    if (t.state === 'CANCELLED') return db.trade_events.some((e) => e.trade_id === t.id && e.type === 'cancel' && e.actor_id === sellerId);
    return false;
  });
  const completed = counted.filter((t) => t.state === 'COMPLETE' || t.state === 'RESOLVED').length;
  return { completed, claimed: counted.length };
}

export function reliability(sellerId: string): { T: number; completed: number; claimed: number; floored: boolean } {
  const { completed, claimed } = sellerStats(sellerId);
  const ratio = claimed ? completed / claimed : 0.5;
  if (claimed < 3) return { T: Math.max(0.5, ratio), completed, claimed, floored: ratio < 0.5 || claimed === 0 };
  return { T: ratio, completed, claimed, floored: false };
}

/* ---------- 9.3 Fit Check scoring (plain code) ---------- */

export type FitStatus = 'met' | 'miss' | 'unknown';
export interface FitRow { key: string; label: string; status: FitStatus; weight: number; must: boolean; detail: string }

const norm = (s: any) => String(s ?? '').toLowerCase();

function textOf(l: Listing) {
  return norm([l.title, l.category, ...Object.values(l.details ?? {}).map((v) => (typeof v === 'object' ? JSON.stringify(v) : v))].join(' '));
}

export function evalRequirement(r: Requirement, l: Listing, ctx: { minutes: number; T: number }): { status: FitStatus; detail: string } {
  const d = l.details ?? {};
  switch (r.key) {
    case 'isbn':
      if (!d.isbn) return { status: 'unknown', detail: 'Seller has not listed the ISBN' };
      return d.isbn.replace(/-/g, '') === String(r.value).replace(/-/g, '')
        ? { status: 'met', detail: `ISBN ${d.isbn}` } : { status: 'miss', detail: `Different ISBN (${d.isbn})` };
    case 'edition':
      if (d.edition == null) return { status: 'unknown', detail: 'Edition not stated' };
      return Number(d.edition) === Number(r.value)
        ? { status: 'met', detail: `${ordinal(d.edition)} edition` } : { status: 'miss', detail: `This is the ${ordinal(d.edition)} edition` };
    case 'highlights': {
      if (!d.highlights) return { status: 'unknown', detail: 'Highlighting not stated' };
      const ok = r.value === 'none' ? d.highlights === 'none' : d.highlights !== 'heavy';
      return { status: ok ? 'met' : 'miss', detail: `Highlights: ${d.highlights}` };
    }
    case 'course':
      if (!d.course) return { status: 'unknown', detail: 'Course not stated' };
      return norm(d.course).replace(/\s/g, '') === norm(r.value).replace(/\s/g, '')
        ? { status: 'met', detail: d.course } : { status: 'miss', detail: `For ${d.course}` };
    case 'maxPriceCents': {
      const price = l.kind === 'service' ? d.hourly_cents ?? l.ask_cents : l.ask_cents;
      return price <= r.value ? { status: 'met', detail: `${money(price)} is within ${money(r.value)}` } : { status: 'miss', detail: `${money(price)} is over ${money(r.value)}` };
    }
    case 'keywords': {
      const words: string[] = Array.isArray(r.value) ? r.value : [r.value];
      const t = textOf(l);
      const hit = words.filter((w) => t.includes(norm(w)));
      return hit.length ? { status: 'met', detail: `Matches "${hit.join(', ')}"` } : { status: 'miss', detail: `No match for "${words.join(', ')}"` };
    }
    case 'quantity':
      if (d.quantity == null) return { status: 'unknown', detail: 'Quantity not stated' };
      return Number(d.quantity) >= Number(r.value) ? { status: 'met', detail: `${d.quantity} available` } : { status: 'miss', detail: `Only ${d.quantity}` };
    case 'section':
      if (!d.section) return { status: 'unknown', detail: 'Section not stated' };
      return norm(d.section).includes(norm(r.value)) ? { status: 'met', detail: `Section ${d.section}` } : { status: 'miss', detail: `Section ${d.section}` };
    case 'event':
      if (!d.event) return { status: 'unknown', detail: 'Event not stated' };
      return norm(d.event).includes(norm(r.value)) || norm(r.value).split(' ').every((w: string) => norm(d.event).includes(w))
        ? { status: 'met', detail: d.event } : { status: 'miss', detail: d.event };
    case 'date': {
      if (!d.date) return { status: 'unknown', detail: 'Date not stated' };
      return String(d.date).slice(0, 10) === String(r.value).slice(0, 10) ? { status: 'met', detail: d.date } : { status: 'miss', detail: `On ${d.date}` };
    }
    case 'weekday': {
      const days: number[] = (d.availability ?? l.free_windows ?? []).map((w: any) => w.weekday);
      if (!days.length) return { status: 'unknown', detail: 'Availability not stated' };
      return days.includes(Number(r.value)) ? { status: 'met', detail: `Free on ${WEEKDAYS[r.value]}` } : { status: 'miss', detail: `Not free on ${WEEKDAYS[r.value]}` };
    }
    case 'minCondition':
      return l.condition >= r.value ? { status: 'met', detail: `Condition ${l.condition}` } : { status: 'miss', detail: `Condition ${l.condition}` };
    case 'maxMinutes':
      return ctx.minutes <= r.value ? { status: 'met', detail: `${ctx.minutes} min away` } : { status: 'miss', detail: `${ctx.minutes} min away` };
    case 'minReliability':
      return ctx.T >= r.value ? { status: 'met', detail: `Seller closes ${Math.round(ctx.T * 100)}% of trades` } : { status: 'miss', detail: `Seller closes ${Math.round(ctx.T * 100)}% of trades` };
    default:
      return { status: 'unknown', detail: 'Not checked' };
  }
}

export function fitScore(reqs: Requirement[], l: Listing, ctx: { minutes: number; T: number }) {
  const rows: FitRow[] = reqs.map((r) => {
    const { status, detail } = evalRequirement(r, l, ctx);
    return { key: r.key, label: r.label, status, weight: r.weight, must: r.must, detail };
  });
  const sw = rows.reduce((a, r) => a + r.weight, 0);
  const F = sw ? rows.reduce((a, r) => a + r.weight * (r.status === 'met' ? 1 : r.status === 'unknown' ? 0.5 : 0), 0) / sw : 0.75;
  return { F, rows };
}

/* ---------- 9.6 Trust level ---------- */

export function trustCredit(userId: string) {
  const mine = db.trades
    .filter((t) => (t.buyer_id === userId || t.seller_id === userId) && (t.state === 'COMPLETE' || t.state === 'RESOLVED') && db.scans.some((s) => s.trade_id === t.id))
    .sort((a, b) => (a.ended_at ?? 0) - (b.ended_at ?? 0));
  const perCounterparty: Record<string, number> = {};
  let credit = 0;
  for (const t of mine) {
    const other = t.buyer_id === userId ? t.seller_id : t.buyer_id;
    const n = (perCounterparty[other] = (perCounterparty[other] ?? 0) + 1);
    credit += 1 / n;
  }
  const outcomes = db.outcomes.filter((o) => o.at_fault?.includes(userId));
  const noShows = outcomes.filter((o) => o.result === 'no_show').length;
  const lateCancels = outcomes.filter((o) => o.result === 'late_cancel').length;
  credit -= 2 * noShows + 0.5 * lateCancels;
  return { credit: Math.round(credit * 100) / 100, handoffs: mine.length, noShows, lateCancels };
}

export const LEVELS = [
  { level: 1, min: 0, next: 3 },
  { level: 2, min: 3, next: 10 },
  { level: 3, min: 10, next: 25 },
  { level: 4, min: 25, next: null as number | null },
];
export function trustLevel(credit: number) {
  const c = Math.max(0, credit);
  const L = [...LEVELS].reverse().find((l) => c >= l.min)!;
  return { level: L.level, credit, next: L.next, toNext: L.next == null ? 0 : Math.max(0, Math.ceil((L.next - c) * 100) / 100) };
}

export function refreshTrust(userId: string) {
  const u = userById(userId);
  if (!u) return;
  u.trust_credit = trustCredit(userId).credit;
}

export function publicUser(u: User | undefined) {
  if (!u) return null;
  const t = trustLevel(u.trust_credit);
  const ten = tenantById(u.tenant_id);
  return { id: u.id, handle: u.handle, name: u.name, tenant: ten.short, tenant_id: u.tenant_id, trust_level: t.level, housing: u.housing };
}

/* ---------- Listing freshness (fading) ---------- */

export function freshness(l: Listing): 'fresh' | 'fading' | 'hidden' {
  if (l.kind === 'service') return 'fresh';
  const age = (now() - l.last_confirmed_at) / DAY;
  if (age >= 21) return 'hidden';
  if (age >= 14) return 'fading';
  return 'fresh';
}

/* ---------- helpers ---------- */

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const money = (c: number | null | undefined) => (c == null ? '' : `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`);
export function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

export function tradeParty(t: Trade, uid: string): 'buyer' | 'seller' | 'carrier' | null {
  if (t.buyer_id === uid) return 'buyer';
  if (t.seller_id === uid) return 'seller';
  if (t.carrier_id === uid) return 'carrier';
  return null;
}

export function needOwnerTenant(n: Need) {
  return tenantById(n.tenant_id);
}
