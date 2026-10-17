import {
  db, id, now, save, MIN, HOUR, DAY, Trade, TradeState, Kind, Listing, Slot, userById, tenantById, Need, PaymentsMode, tripTenantIds,
} from './db.js';
import * as escrow from './escrow.js';
import {
  pickMeetingPoint, refreshTrust, money, plural, tradeParty, WEEKDAYS, reach, reliability, fitScore, stampCount, walkMinutes,
} from './logic.js';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const HOLD_MS = 30 * MIN;
const NO_SHOW_GRACE = 15 * MIN;
const EARLY_SCAN = 10 * MIN;
const LATE_CANCEL = 2 * HOUR;
const TICKET_AUTO_RELEASE = 24 * HOUR;
const PROBLEM_WINDOW = 24 * HOUR;

type Who = 'buyer' | 'seller' | 'party' | 'system' | 'admin' | 'winner';

/** The transition table from spec section 4. advanceTrade is the only writer of trades.state. */
const TRANSITIONS: Record<string, { from: TradeState[]; who: Who; kinds?: Kind[] }> = {
  fixed_price: { from: ['HELD'], who: 'system', kinds: ['service'] },
  accept_ask: { from: ['HELD'], who: 'buyer', kinds: ['item', 'textbook', 'ticket'] },
  offer: { from: ['HELD'], who: 'buyer', kinds: ['item', 'textbook', 'ticket'] },
  accept_offer: { from: ['HELD'], who: 'seller' },
  decline_offer: { from: ['HELD'], who: 'seller' },
  arena_price: { from: ['HELD'], who: 'winner', kinds: ['item', 'textbook'] },
  book: { from: ['PRICED'], who: 'buyer' },
  arrive: { from: ['BOOKED'], who: 'party' },
  both_scanned: { from: ['BOOKED'], who: 'system' },
  transfer_sent: { from: ['BOOKED'], who: 'seller', kinds: ['ticket'] },
  confirm_receipt: { from: ['BOOKED'], who: 'buyer', kinds: ['ticket'] },
  auto_release: { from: ['BOOKED'], who: 'system', kinds: ['ticket'] },
  session_end: { from: ['BOOKED'], who: 'system', kinds: ['service'] },
  hold_expired: { from: ['HELD', 'PRICED'], who: 'system' },
  slot_lapsed: { from: ['BOOKED'], who: 'system' },
  cancel: { from: ['HELD', 'PRICED', 'BOOKED'], who: 'party' },
  problem: { from: ['BOOKED', 'COMPLETE'], who: 'buyer' },
  resolve: { from: ['DISPUTED'], who: 'admin' },
};

export function notify(userId: string, type: string, title: string, body: string, link: string) {
  const u = userById(userId);
  if (!u) return;
  db.notifications.push({ id: id('ntf'), tenant_id: u.tenant_id, user_id: userId, type, title, body, link, read: false, created_at: now() });
}

function logEvent(t: Trade, type: string, actor: string, payload: Record<string, any> = {}) {
  db.trade_events.push({ id: id('tev'), trade_id: t.id, type, actor_id: actor, payload, created_at: now() });
}

export const listingOf = (t: Trade) => db.listings.find((l) => l.id === t.listing_id)!;
export const slotOf = (t: Trade) => (t.slot_id ? db.slots.find((s) => s.id === t.slot_id) ?? null : null);
const handle = (uid: string) => `@${userById(uid)?.handle ?? 'someone'}`;
const other = (t: Trade, uid: string) => (uid === t.buyer_id ? t.seller_id : t.buyer_id);

function passport(l: Listing, type: any, payload: Record<string, any>) {
  db.passport_events.push({ id: id('pev'), tenant_id: l.tenant_id, listing_id: l.id, lineage_id: l.lineage_id, type, payload, created_at: now() });
}

function outcome(t: Trade, result: string, at_fault: string[] = []) {
  db.outcomes.push({ id: id('out'), trade_id: t.id, result, reason: null, at_fault, created_at: now() });
}

function reopenListing(t: Trade) {
  const l = listingOf(t);
  if (l.kind !== 'service' && l.status === 'held') l.status = 'active';
}

export function claimListing(listingId: string, buyerId: string, needId: string | null): Trade {
  const l = db.listings.find((x) => x.id === listingId);
  const buyer = userById(buyerId)!;
  if (!l) throw new HttpError(404, 'Listing not found');
  if (l.tenant_id !== buyer.tenant_id && l.visibility !== 'open' && !tripTenantIds(buyer).includes(l.tenant_id)) throw new HttpError(403, 'Not visible on your campus');
  if (l.seller_id === buyerId) throw new HttpError(400, 'That is your own listing');
  if (l.status !== 'active') throw new HttpError(409, 'Someone else is holding this right now');
  const mine = db.trades.find((t) => t.listing_id === l.id && t.buyer_id === buyerId && ['HELD', 'PRICED', 'BOOKED'].includes(t.state));
  if (mine) return mine;
  const t: Trade = {
    id: id('trd'), tenant_id: l.tenant_id, listing_id: l.id, need_id: needId, buyer_id: buyerId, seller_id: l.seller_id,
    carrier_id: null, kind: l.kind, state: 'HELD', price_cents: null, pending_offer_cents: null, slot_id: null, safe_zone: null,
    payment_intent: null, escrow: 'none', hold_expires_at: now() + HOLD_MS, created_at: now(), ended_at: null,
    cross_campus: l.tenant_id !== buyer.tenant_id, tip_cents: 0,
  };
  db.trades.push(t);
  if (l.kind !== 'service') l.status = 'held';
  logEvent(t, 'claim', buyerId, { hold_expires_at: t.hold_expires_at });
  notify(l.seller_id, 'claimed', `${handle(buyerId)} claimed ${l.title}`, 'They have 30 minutes to lock a price.', `/trade/${t.id}`);
  if (l.kind === 'service') {
    const priorSessions = db.trades.filter((x) => x.listing_id === l.id && x.buyer_id === buyerId && x.state === 'COMPLETE').length;
    const rate = l.details.hourly_cents ?? l.ask_cents;
    const disc = priorSessions === 0 ? Number(l.details.first_discount_pct ?? 0) : 0;
    advanceTradeSync(t, 'fixed_price', 'system', { cents: Math.round(rate * (1 - disc / 100)), discount_pct: disc });
  }
  save();
  return t;
}

function checkWho(t: Trade, who: Who, actor: string, payload: any) {
  const party = tradeParty(t, actor);
  const u = userById(actor);
  switch (who) {
    case 'system': if (actor !== 'system') throw new HttpError(403, 'Only the server can do that'); break;
    case 'buyer': if (party !== 'buyer') throw new HttpError(403, 'Only the buyer can do that'); break;
    case 'seller': if (party !== 'seller') throw new HttpError(403, 'Only the seller can do that'); break;
    case 'party': if (!party) throw new HttpError(403, 'You are not part of this trade'); break;
    case 'admin': if (!u?.is_admin || u.tenant_id !== t.tenant_id) throw new HttpError(403, 'Admins only'); break;
    case 'winner': {
      const m = db.arena_matches.find((x) => x.trade_id === t.id && x.state === 'resolved');
      if (!m || m.winner_id !== actor) throw new HttpError(403, 'Only the duel winner picks the price');
      break;
    }
  }
}

/** Synchronous core (no payment calls). Used by advanceTrade and by system paths. */
function advanceTradeSync(t: Trade, event: string, actor: string, payload: Record<string, any> = {}): { pay?: 'authorize' | 'capture' | 'cancel' | 'refund' } {
  const rule = TRANSITIONS[event];
  if (!rule) throw new HttpError(400, `Unknown event ${event}`);
  if (!rule.from.includes(t.state)) throw new HttpError(409, `Cannot ${event.replace(/_/g, ' ')} while ${t.state.toLowerCase()}`);
  if (rule.kinds && !rule.kinds.includes(t.kind)) throw new HttpError(400, `Not available for ${t.kind} trades`);
  checkWho(t, rule.who, actor, payload);
  const l = listingOf(t);
  let pay: 'authorize' | 'capture' | 'cancel' | 'refund' | undefined;

  switch (event) {
    case 'fixed_price':
      t.price_cents = payload.cents;
      t.state = 'PRICED';
      break;
    case 'accept_ask':
      t.price_cents = l.ask_cents;
      t.state = 'PRICED';
      break;
    case 'offer': {
      const cents = Math.round(Number(payload.cents));
      if (!(cents > 0)) throw new HttpError(400, 'Enter an offer');
      if (cents >= l.ask_cents) {
        t.price_cents = l.ask_cents;
        t.state = 'PRICED';
        break;
      }
      if (l.floor_cents != null && cents >= l.floor_cents) {
        t.price_cents = cents;
        t.pending_offer_cents = null;
        t.state = 'PRICED';
        logEvent(t, 'auto_accepted', 'system', { cents });
        notify(t.seller_id, 'priced', `Auto-accepted ${money(cents)} for ${l.title}`, 'It was at or above your floor.', `/trade/${t.id}`);
      } else {
        t.pending_offer_cents = cents;
        notify(t.seller_id, 'offer', `${handle(t.buyer_id)} offered ${money(cents)}`, `For ${l.title}. Accept or keep your price.`, `/trade/${t.id}`);
      }
      break;
    }
    case 'accept_offer':
      if (!t.pending_offer_cents) throw new HttpError(409, 'No offer to accept');
      t.price_cents = t.pending_offer_cents;
      t.pending_offer_cents = null;
      t.state = 'PRICED';
      break;
    case 'decline_offer':
      t.pending_offer_cents = null;
      notify(t.buyer_id, 'offer', `${handle(t.seller_id)} kept the price at ${money(l.ask_cents)}`, 'You can still take it at the ask.', `/trade/${t.id}`);
      break;
    case 'arena_price': {
      const m = db.arena_matches.find((x) => x.trade_id === t.id && x.state === 'resolved')!;
      // Agreed stakes decide the price; the payload only matters for duels started before stakes existed.
      const agreed = m.stake_buyer != null ? (m.winner_id === t.buyer_id ? m.stake_buyer : m.stake_seller!) : null;
      const cents = agreed ?? Math.round(Number(payload.cents));
      if (cents < m.range_low || cents > m.range_high) throw new HttpError(400, `Pick between ${money(m.range_low)} and ${money(m.range_high)}`);
      m.state = 'priced';
      t.price_cents = cents;
      t.state = 'PRICED';
      passport(l, 'arena', { winner: userById(actor)?.handle, cents, low: m.range_low, high: m.range_high });
      break;
    }
    case 'book': {
      const s = payload.slot as Omit<Slot, 'id' | 'trade_id'>;
      if (!s) throw new HttpError(400, 'Pick a time');
      const slot: Slot = { id: id('slt'), trade_id: t.id, ...s };
      db.slots.push(slot);
      t.slot_id = slot.id;
      t.safe_zone = slot.safe_zone;
      if (payload.carrier_id) {
        t.carrier_id = payload.carrier_id;
        t.tip_cents = payload.tip_cents ?? 0;
      }
      t.state = 'BOOKED';
      pay = 'authorize';
      break;
    }
    case 'arrive': {
      if (db.arrivals.some((a) => a.trade_id === t.id && a.user_id === actor)) break;
      db.arrivals.push({ id: id('arr'), trade_id: t.id, user_id: actor, at: now(), distance_m: payload.distance_m ?? null });
      notify(other(t, actor), 'arrived', `${handle(actor)} is at the spot`, 'Open the handoff scan when you get there.', `/trade/${t.id}/scan`);
      break;
    }
    case 'both_scanned':
      if (t.kind === 'service') {
        t.checked_in = true;
        break;
      }
      complete(t);
      pay = 'capture';
      break;
    case 'transfer_sent':
      t.transfer_proof = payload.proof ?? null;
      t.transfer_sent_at = now();
      notify(t.buyer_id, 'transfer', `${handle(t.seller_id)} sent your ticket`, 'Check your ticket app, then tap I got the ticket.', `/trade/${t.id}`);
      break;
    case 'confirm_receipt':
    case 'auto_release':
    case 'session_end':
      complete(t);
      pay = 'capture';
      break;
    case 'hold_expired':
      t.state = 'EXPIRED';
      t.ended_at = now();
      reopenListing(t);
      outcome(t, 'expired');
      notify(t.buyer_id, 'expired', `Your hold on ${l.title} ended`, 'One tap tells us why, so we can find a better match.', `/trade/${t.id}`);
      break;
    case 'slot_lapsed': {
      const scans = db.scans.filter((s) => s.trade_id === t.id);
      const arrived = db.arrivals.filter((a) => a.trade_id === t.id).map((a) => a.user_id);
      const sellerSide = [t.seller_id, t.carrier_id].filter(Boolean) as string[];
      const buyerArrived = arrived.includes(t.buyer_id);
      const sellerArrived = arrived.some((u) => sellerSide.includes(u));
      t.ended_at = now();
      reopenListing(t);
      pay = 'cancel';
      if (scans.length === 1 || (buyerArrived && sellerArrived)) {
        t.state = 'REFUNDED';
        outcome(t, 'one_scan');
        notify(t.buyer_id, 'refund', 'Refunded: the handoff did not finish', 'Only one scan happened, so nobody gets a penalty.', `/trade/${t.id}`);
        notify(t.seller_id, 'refund', 'Handoff did not finish', 'Only one scan happened, so nobody gets a penalty.', `/trade/${t.id}`);
      } else {
        const fault = buyerArrived ? [t.seller_id] : sellerArrived ? [t.buyer_id] : [t.buyer_id, t.seller_id];
        t.state = 'NO_SHOW';
        outcome(t, 'no_show', fault);
        fault.forEach((u) => refreshTrust(u));
        notify(t.buyer_id, 'no_show', fault.includes(t.buyer_id) ? 'Marked as a no-show' : `Refunded: ${handle(t.seller_id)} did not show`, fault.includes(t.buyer_id) ? 'No scan from you by slot end + 15 min.' : 'Your money is back and they took a trust penalty.', `/trade/${t.id}`);
        notify(t.seller_id, 'no_show', fault.includes(t.seller_id) ? 'Marked as a no-show' : `${handle(t.buyer_id)} did not show`, fault.includes(t.seller_id) ? 'The buyer was refunded and you took a trust penalty.' : 'Your listing is open again. They took a trust penalty.', `/trade/${t.id}`);
      }
      break;
    }
    case 'cancel': {
      const slot = slotOf(t);
      const late = t.state === 'BOOKED' && slot && slot.starts_at - now() < LATE_CANCEL;
      if (t.state === 'BOOKED') pay = 'cancel';
      t.state = 'CANCELLED';
      t.ended_at = now();
      reopenListing(t);
      outcome(t, late ? 'late_cancel' : 'cancelled', late ? [actor] : []);
      if (late) refreshTrust(actor);
      notify(other(t, actor), 'cancelled', `${handle(actor)} cancelled ${l.title}`, late ? 'It was less than 2 hours before the slot, so they took a small trust penalty.' : 'No penalty. Any money held was released.', `/trade/${t.id}`);
      break;
    }
    case 'problem': {
      if (t.state === 'COMPLETE' && now() - (t.ended_at ?? 0) > PROBLEM_WINDOW) throw new HttpError(409, 'The 24-hour problem window has closed');
      t.state = 'DISPUTED';
      outcome(t, 'disputed');
      db.outcomes[db.outcomes.length - 1].reason = String(payload.reason ?? '').slice(0, 300) || null;
      notify(t.seller_id, 'dispute', `${handle(t.buyer_id)} reported a problem`, 'A campus admin will review the scan record and passport.', `/trade/${t.id}`);
      break;
    }
    case 'resolve': {
      const refundIt = payload.decision === 'refund';
      t.state = refundIt ? 'REFUNDED' : 'RESOLVED';
      t.ended_at = t.ended_at ?? now();
      pay = refundIt ? (t.escrow === 'captured' ? 'refund' : 'cancel') : t.escrow === 'authorized' ? 'capture' : undefined;
      outcome(t, refundIt ? 'dispute_refund' : 'dispute_release');
      const body = t.pay_mode === 'reservation' ? `Decided for the ${refundIt ? 'buyer' : 'seller'}. No money was held by Passport.` : refundIt ? 'The buyer was refunded.' : 'Escrow went to the seller.';
      [t.buyer_id, t.seller_id].forEach((u) => notify(u, 'resolved', 'Dispute resolved', body, `/trade/${t.id}`));
      break;
    }
  }
  logEvent(t, event, actor, payload.slot ? { ...payload, slot: undefined, slot_id: t.slot_id } : payload);
  return { pay };
}

function complete(t: Trade) {
  const l = listingOf(t);
  t.state = 'COMPLETE';
  t.ended_at = now();
  if (l.kind !== 'service') l.status = 'sold';
  const slot = slotOf(t);
  const zone = slot ? tenantById(slot.zone_tenant_id).config.safeZones.find((z) => z.id === slot.safe_zone)?.name : null;
  passport(l, 'stamp', {
    from: userById(t.seller_id)?.handle, to: userById(t.buyer_id)?.handle, cents: t.price_cents,
    where: zone ?? (t.kind === 'ticket' ? 'Digital transfer' : 'Video session'), method: t.kind === 'ticket' ? 'receipt confirmed' : 'dual scan',
  });
  db.sales.push({ id: id('sal'), tenant_id: l.tenant_id, category: l.category, cents: t.price_cents ?? l.ask_cents, at: now() });
  db.outcomes.push({ id: id('out'), trade_id: t.id, result: 'completed', reason: null, created_at: now() });
  refreshTrust(t.buyer_id);
  refreshTrust(t.seller_id);
  const need = t.need_id ? db.needs.find((n) => n.id === t.need_id) : null;
  if (need) {
    need.status = 'sorted';
    if (need.book_id) {
      db.kit_choices = db.kit_choices.filter((k) => !(k.user_id === need.user_id && k.book_id === need.book_id));
      db.kit_choices.push({ tenant_id: need.tenant_id, user_id: need.user_id, book_id: need.book_id, source: 'campus', cents: t.price_cents ?? 0 });
    }
  }
  const reserved = t.pay_mode === 'reservation';
  notify(t.buyer_id, 'complete', `Done: ${l.title}`, reserved ? 'Handoff verified and the passport got a new stamp.' : 'Escrow released and the passport got a new stamp.', `/trade/${t.id}`);
  notify(t.seller_id, 'complete', reserved ? `Sold: ${l.title}` : `Paid: ${money(t.price_cents)} for ${l.title}`, 'Handoff verified. Your trust went up.', `/trade/${t.id}`);
}

/** Demo toggle first, then the campus default, then the server default. */
export const paymentsMode = (tenantId?: string): PaymentsMode =>
  db.meta.payments_mode ?? (tenantId ? tenantById(tenantId).config.payments : undefined) ?? (process.env.PAYMENTS_MODE === 'escrow' ? 'escrow' : 'reservation');

/** Reservation relies on the dual scan as proof, so tickets and video sessions (no scan) always use escrow. */
export function payModeFor(t: Trade, slotMode?: string): PaymentsMode {
  if (t.pay_mode) return t.pay_mode;
  if (paymentsMode(t.tenant_id) === 'escrow' || t.kind === 'ticket' || slotMode === 'video') return 'escrow';
  return 'reservation';
}

async function runPayment(t: Trade, pay?: 'authorize' | 'capture' | 'cancel' | 'refund') {
  if (!pay || t.pay_mode === 'reservation') return;
  if (pay === 'authorize') {
    t.payment_intent = await escrow.authorize((t.price_cents ?? 0) + (t.tip_cents ?? 0), t.id);
    t.escrow = 'authorized';
  } else if (pay === 'capture') {
    await escrow.capture(t.payment_intent);
    t.escrow = 'captured';
  } else if (pay === 'cancel') {
    if (t.escrow === 'authorized') await escrow.cancel(t.payment_intent);
    if (t.escrow !== 'none') t.escrow = 'cancelled';
  } else if (pay === 'refund') {
    await escrow.refund(t.payment_intent);
    t.escrow = 'refunded';
  }
}

/** advance_trade(trade_id, event, actor): the only writer of trade state. */
export async function advanceTrade(tradeId: string, event: string, actor: string, payload: Record<string, any> = {}): Promise<Trade> {
  const t = db.trades.find((x) => x.id === tradeId);
  if (!t) throw new HttpError(404, 'Trade not found');
  if (event === 'book') {
    if (tradeParty(t, actor) !== 'buyer') throw new HttpError(403, 'Only the buyer can book');
    if (t.state !== 'PRICED') throw new HttpError(409, `Cannot book while ${t.state.toLowerCase()}`);
    payload = { ...payload, ...resolveBooking(t, payload) };
    const mode = payModeFor(t, payload.slot.mode);
    if (mode === 'escrow') {
      try {
        t.payment_intent = await escrow.authorize((t.price_cents ?? 0) + (payload.tip_cents ?? 0), t.id);
      } catch (e: any) {
        throw new HttpError(402, `Payment failed: ${e.message}`);
      }
    }
    advanceTradeSync(t, event, actor, payload);
    t.pay_mode = mode;
    t.escrow = mode === 'escrow' ? 'authorized' : 'none';
    notify(t.seller_id, 'booked', `Booked: ${listingOf(t).title}`, describeSlot(slotOf(t)), `/trade/${t.id}`);
    save();
    return t;
  }
  const { pay } = advanceTradeSync(t, event, actor, payload);
  try {
    await runPayment(t, pay);
  } catch (e: any) {
    logEvent(t, 'payment_error', 'system', { message: e.message });
  }
  save();
  return t;
}

/* ---------- Slots and booking ---------- */

export interface SlotOption {
  key: string; starts_at: number; ends_at: number; safe_zone: string; zone_name: string; zone_tenant_id: string;
  mode: 'in_person' | 'video' | 'digital'; b: number; s: number; label: string; carrier_id?: string; carrier?: string; tip_cents?: number; video_url?: string;
}

function nextOccurrence(from: number, weekday: number, hour: number, minute = 0) {
  const d = new Date(from);
  d.setHours(hour, minute, 0, 0);
  let diff = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  if (d.getTime() < from) d.setDate(d.getDate() + 7);
  return d.getTime();
}

export function slotLabel(ms: number) {
  const d = new Date(ms);
  const today = new Date(now());
  const tm = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const dayDiff = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(today).setHours(0, 0, 0, 0)) / DAY);
  const day = dayDiff === 0 ? 'Today' : dayDiff === 1 ? 'Tomorrow' : WEEKDAYS[d.getDay()];
  return `${day} ${tm}`;
}

export function describeSlot(s: Slot | null) {
  if (!s) return '';
  if (s.mode === 'digital') return 'Digital transfer';
  if (s.mode === 'video') return `${slotLabel(s.starts_at)}, campus video link`;
  const z = tenantById(s.zone_tenant_id).config.safeZones.find((x) => x.id === s.safe_zone);
  return `${slotLabel(s.starts_at)} at ${z?.name ?? s.safe_zone}`;
}

export function nextCarrier(fromTenant: string, toTenant: string) {
  const t = now();
  const trips = db.carriers
    .filter((c) => c.from_tenant === fromTenant && c.to_tenant === toTenant && c.travels_on > t)
    .sort((a, b) => a.travels_on - b.travels_on);
  if (trips.length) return { at: trips[0].travels_on, carrier: trips[0], label: 'trip' as const };
  const shuttle = tenantById(fromTenant).config.shuttleDays.find((s) => s.to === tenantById(toTenant).slug);
  if (shuttle) return { at: nextOccurrence(t, shuttle.weekday, 16), carrier: null, label: 'shuttle' as const, shuttle };
  return null;
}

export function slotOptions(t: Trade): SlotOption[] {
  const l = listingOf(t);
  const buyer = userById(t.buyer_id)!;
  const seller = userById(t.seller_id)!;
  const sellerTenant = tenantById(l.tenant_id);
  if (t.kind === 'ticket') {
    return [{ key: 'digital', starts_at: now(), ends_at: now() + DAY, safe_zone: 'digital', zone_name: 'Digital transfer', zone_tenant_id: l.tenant_id, mode: 'digital', b: 0, s: 0, label: 'Digital transfer, no meetup' }];
  }
  const myTrips = t.cross_campus ? db.carriers.filter((c) => c.user_id === buyer.id && c.to_tenant === l.tenant_id && c.travels_on > now()).sort((a, b) => a.travels_on - b.travels_on).slice(0, 3) : [];
  if (myTrips.length) {
    // The buyer is driving there: meet the seller at the seller's nearest safe zone an hour after leaving. No carrier.
    const zone = [...sellerTenant.config.safeZones].sort((a, b) => walkMinutes(sellerTenant, seller.housing, a.id) - walkMinutes(sellerTenant, seller.housing, b.id))[0];
    return myTrips.map((c) => {
      const at = c.travels_on + HOUR;
      return {
        key: `trip:${c.id}`, starts_at: at, ends_at: at + 30 * MIN, safe_zone: zone.id, zone_name: zone.name, zone_tenant_id: sellerTenant.id,
        mode: 'in_person' as const, b: 0, s: walkMinutes(sellerTenant, seller.housing, zone.id), label: `${slotLabel(at)} at ${zone.name}, ${sellerTenant.short} (your trip)`,
      };
    });
  }
  if (t.cross_campus) {
    const buyerTenant = tenantById(buyer.tenant_id);
    const zone = [...buyerTenant.config.safeZones].sort((a, b) => walkMinutes(buyerTenant, buyer.housing, a.id) - walkMinutes(buyerTenant, buyer.housing, b.id))[0];
    const trips = db.carriers.filter((c) => c.from_tenant === l.tenant_id && c.to_tenant === buyer.tenant_id && c.travels_on > now()).sort((a, b) => a.travels_on - b.travels_on).slice(0, 3);
    return trips.map((c) => ({
      key: `carrier:${c.id}`, starts_at: c.travels_on, ends_at: c.travels_on + 30 * MIN, safe_zone: zone.id, zone_name: zone.name, zone_tenant_id: buyerTenant.id,
      mode: 'in_person' as const, b: walkMinutes(buyerTenant, buyer.housing, zone.id), s: 0, label: `${slotLabel(c.travels_on)} at ${zone.name}`,
      carrier_id: c.user_id, carrier: userById(c.user_id)?.handle, tip_cents: c.tip_cents,
    }));
  }
  const fair = pickMeetingPoint(sellerTenant, buyer.housing, seller.housing).best;
  const isService = t.kind === 'service';
  const durMs = isService ? HOUR : 30 * MIN;
  const windows = (isService ? l.details.availability : l.free_windows) ?? [];
  const busy = db.trades
    .filter((x) => x.seller_id === t.seller_id && x.state === 'BOOKED' && x.slot_id)
    .map((x) => slotOf(x)!)
    .filter(Boolean);
  const starts: number[] = [];
  const from = now() + 5 * MIN;
  for (const w of windows) {
    const mins = isService ? [0] : [0, 30];
    for (const m of mins) {
      const a = nextOccurrence(from, w.weekday, w.hour, m);
      starts.push(a, a + 7 * DAY);
    }
  }
  const uniq = [...new Set(starts)].filter((s) => s >= from).sort((a, b) => a - b)
    .filter((s) => !busy.some((b) => s < b.ends_at && s + durMs > b.starts_at)).slice(0, 8);
  const mode: 'in_person' | 'video' = isService && l.details.mode === 'video' ? 'video' : 'in_person';
  return uniq.map((s) => ({
    key: `${s}`, starts_at: s, ends_at: s + durMs, safe_zone: mode === 'video' ? 'video' : fair.zone, zone_name: mode === 'video' ? 'Campus video link' : fair.name,
    zone_tenant_id: sellerTenant.id, mode, b: mode === 'video' ? 0 : fair.b, s: mode === 'video' ? 0 : fair.s,
    label: `${slotLabel(s)} ${mode === 'video' ? 'on video' : `at ${fair.name}`}`, video_url: mode === 'video' ? l.details.video_url : undefined,
  }));
}

function resolveBooking(t: Trade, payload: any) {
  const opts = slotOptions(t);
  const pick = opts.find((o) => o.key === payload.slot_key) ?? (payload.slot_key ? null : opts[0]);
  if (!pick) throw new HttpError(409, 'That time is no longer available');
  const zone = payload.safe_zone && pick.mode === 'in_person' && !t.cross_campus ? payload.safe_zone : pick.safe_zone;
  if (zone !== pick.safe_zone && !tenantById(pick.zone_tenant_id).config.safeZones.some((z) => z.id === zone)) throw new HttpError(400, 'Not a safe zone');
  return {
    slot: { starts_at: pick.starts_at, ends_at: pick.ends_at, safe_zone: zone, zone_tenant_id: pick.zone_tenant_id, mode: pick.mode, video_url: pick.video_url },
    carrier_id: pick.carrier_id, tip_cents: pick.tip_cents ?? 0,
  };
}

/* ---------- Scanning ---------- */

export function scanWindow(t: Trade) {
  const s = slotOf(t);
  if (!s || s.mode === 'digital') return null;
  return { opens: s.starts_at - EARLY_SCAN, closes: s.ends_at + NO_SHOW_GRACE };
}

export function sideOf(t: Trade, uid: string): 'buyer' | 'seller' | null {
  if (uid === t.buyer_id) return 'buyer';
  if (uid === t.seller_id || (t.carrier_id && uid === t.carrier_id)) return 'seller';
  return null;
}

export function recordScan(t: Trade, scannerId: string, method: 'qr' | 'code' | 'demo' | 'tap') {
  const side = sideOf(t, scannerId)!;
  const already = db.scans.filter((s) => s.trade_id === t.id).some((s) => sideOf(t, s.user_id) === side);
  if (already) throw new HttpError(409, 'You already scanned for this handoff');
  db.scans.push({ id: id('scn'), trade_id: t.id, user_id: scannerId, scanned_at: now(), method });
  logEvent(t, 'scan', scannerId, { method });
  const sides = new Set(db.scans.filter((s) => s.trade_id === t.id).map((s) => sideOf(t, s.user_id)));
  return sides.has('buyer') && sides.has('seller');
}

/* ---------- Timers (run_timers) ---------- */

export async function runTimers() {
  const t0 = now();
  for (const t of db.trades) {
    try {
      if ((t.state === 'HELD' || t.state === 'PRICED') && t.hold_expires_at < t0) {
        await advanceTradeAsSystem(t, 'hold_expired');
      } else if (t.state === 'BOOKED') {
        const s = slotOf(t);
        if (t.kind === 'ticket') {
          if (t.transfer_sent_at && t0 - t.transfer_sent_at >= TICKET_AUTO_RELEASE) await advanceTradeAsSystem(t, 'auto_release');
        } else if (s) {
          if (t.kind === 'service' && t.checked_in && t0 >= s.ends_at) await advanceTradeAsSystem(t, 'session_end');
          else if (!t.checked_in && t0 > s.ends_at + NO_SHOW_GRACE) await advanceTradeAsSystem(t, 'slot_lapsed');
        }
      }
    } catch (e) {
      console.error('timer', t.id, e);
    }
  }
  for (const l of db.listings) {
    if (l.status === 'active' && l.kind !== 'service' && (t0 - l.last_confirmed_at) / DAY >= 21) l.status = 'hidden';
  }
  const { tickArena } = await import('./arena.js');
  tickArena();
  await lockDuelPrices();
  save();
}

/** A resolved duel with agreed stakes prices the trade at once: nobody picks after the coin toss. */
export async function lockDuelPrices() {
  for (const m of db.arena_matches.filter((x) => x.state === 'resolved' && x.stake_buyer != null && x.winner_id)) {
    const t = db.trades.find((x) => x.id === m.trade_id);
    if (t?.state === 'HELD') await advanceTrade(t.id, 'arena_price', m.winner_id!, {}).catch((e) => console.error('duel lock', e));
  }
}

async function advanceTradeAsSystem(t: Trade, event: string) {
  const { pay } = advanceTradeSync(t, event, 'system');
  try {
    await runPayment(t, pay);
  } catch (e: any) {
    logEvent(t, 'payment_error', 'system', { message: e.message });
  }
}

export async function systemEvent(tradeId: string, event: string, payload: Record<string, any> = {}) {
  const t = db.trades.find((x) => x.id === tradeId)!;
  const { pay } = advanceTradeSync(t, event, 'system', payload);
  await runPayment(t, pay);
  save();
  return t;
}

/* ---------- Trade view: exactly one next action ---------- */

const STEPS = { item: ['Hold', 'Price', 'Book', 'Scan', 'Done'], textbook: ['Hold', 'Price', 'Book', 'Scan', 'Done'], ticket: ['Hold', 'Price', 'Pay', 'Transfer', 'Done'], service: ['Hold', 'Price', 'Book', 'Check in', 'Done'] };
const STEP_INDEX: Record<TradeState, number> = { HELD: 1, PRICED: 2, BOOKED: 3, COMPLETE: 4, RESOLVED: 4, DISPUTED: 4, EXPIRED: 1, CANCELLED: 1, NO_SHOW: 3, REFUNDED: 3 };

export function describeTrade(t: Trade, viewer: string) {
  const l = listingOf(t);
  const me = tradeParty(t, viewer);
  const isBuyer = me === 'buyer';
  const them = isBuyer ? t.seller_id : t.buyer_id;
  const theirHandle = handle(them);
  const slot = slotOf(t);
  const win = scanWindow(t);
  const minsLeft = Math.max(0, Math.ceil((t.hold_expires_at - now()) / MIN));
  const match = db.arena_matches.filter((m) => m.trade_id === t.id).at(-1) ?? null;
  const outcomes = db.outcomes.filter((o) => o.trade_id === t.id);
  const fail = ['EXPIRED', 'CANCELLED', 'NO_SHOW', 'REFUNDED'].includes(t.state);
  const scans = db.scans.filter((s) => s.trade_id === t.id);
  const myScan = scans.some((s) => sideOf(t, s.user_id) === sideOf(t, viewer));
  const theirScan = scans.some((s) => sideOf(t, s.user_id) !== sideOf(t, viewer));
  const verified = db.passport_events.some((e) => e.listing_id === l.id && e.type === 'verified' && e.payload.trade_id === t.id);
  const rated = db.ratings.some((r) => r.trade_id === t.id && r.rater_id === viewer);

  let title = l.title;
  let sentence = '';
  let action: { id: string; label: string } | null = null;
  let waiting: string | null = null;
  const secondary: { id: string; label: string }[] = [];
  const facts: { label: string; value: string }[] = [];
  let safety = '';
  let tone: 'sky' | 'butter' | 'sage' | 'lilac' | 'peach' = 'sky';

  const priceFact = () => facts.push({ label: 'Price', value: t.price_cents != null ? money(t.price_cents + (t.tip_cents ?? 0)) + (t.tip_cents ? ` incl. ${money(t.tip_cents)} carrier tip` : '') : `${money(l.ask_cents)} ask` });

  switch (t.state) {
    case 'HELD': {
      tone = 'butter';
      facts.push({ label: 'Ask', value: money(l.ask_cents) });
      facts.push({ label: 'Hold ends', value: `in ${plural(minsLeft, 'minute')}` });
      safety = payModeFor(t) === 'reservation' ? 'Never send money before you meet. Nobody legit asks for Venmo first.' : 'Pay only inside Passport. Nobody legit asks for Venmo first.';
      const duelOpen = match && (match.state === 'waiting' || match.state === 'live');
      const duelProposed = match && match.state === 'proposed';
      const iAccepted = !!match?.accepted?.includes(viewer);
      const duelResolved = match && match.state === 'resolved';
      if (isBuyer) {
        if (duelResolved) {
          sentence = match!.winner_id === viewer ? 'You won the duel. Pick your price inside the range.' : `${theirHandle} won the duel and is picking the price.`;
          if (match!.winner_id === viewer) action = { id: 'duel', label: 'Pick your price' };
          else waiting = `Waiting on ${theirHandle} to pick a price.`;
        } else if (duelProposed) {
          sentence = `Price Duel stakes: you pay ${money(match!.stake_buyer)} if you win, ${money(match!.stake_seller)} if ${theirHandle} wins.`;
          if (iAccepted) { waiting = `Waiting on ${theirHandle} to accept the stakes.`; secondary.push({ id: 'duel', label: 'Change the stakes' }); }
          else action = { id: 'duel', label: 'Set the duel stakes' };
        } else if (duelOpen) {
          sentence = 'Price Duel in progress. 20 seconds, rock paper scissors.';
          action = { id: 'duel', label: 'Back to the duel' };
        } else if (t.pending_offer_cents) {
          sentence = `You offered ${money(t.pending_offer_cents)}. ${theirHandle} can accept or keep ${money(l.ask_cents)}.`;
          action = { id: 'accept_ask', label: `Take it at ${money(l.ask_cents)}` };
          waiting = `Waiting on ${theirHandle} to answer your offer.`;
        } else {
          sentence = 'It is held for you. Lock a price to book the handoff.';
          action = { id: 'accept_ask', label: `Take it at ${money(l.ask_cents)}` };
          if (t.kind !== 'service') secondary.push({ id: 'offer', label: 'Make an offer' });
          if (l.arena_on && (t.kind === 'item' || t.kind === 'textbook') && tenantById(t.tenant_id).config.features.arena) secondary.push({ id: 'duel', label: 'Price Duel' });
        }
        secondary.push({ id: 'cancel', label: 'Release hold' });
      } else {
        if (t.pending_offer_cents) {
          sentence = `${theirHandle} offered ${money(t.pending_offer_cents)} (you asked ${money(l.ask_cents)}).`;
          action = { id: 'accept_offer', label: `Accept ${money(t.pending_offer_cents)}` };
          secondary.push({ id: 'decline_offer', label: `Keep ${money(l.ask_cents)}` });
        } else if (duelProposed && match!.accepted?.length) {
          sentence = `${theirHandle} wants a Price Duel: ${money(match!.stake_buyer)} if they win, ${money(match!.stake_seller)} if you win.`;
          if (iAccepted) waiting = `Waiting on ${theirHandle} to accept the stakes.`;
          else action = { id: 'duel', label: 'Review the stakes' };
        } else if (duelOpen) {
          const myMove = match!.p1_id === viewer ? match!.p1_move : match!.p2_move;
          sentence = `${theirHandle} challenged you to a Price Duel.`;
          if (!myMove) action = { id: 'duel', label: 'Play the Price Duel' };
          else waiting = `Waiting on ${theirHandle} to play.`;
        } else if (duelResolved && match!.winner_id === viewer) {
          sentence = 'You won the duel. Pick your price inside the range.';
          action = { id: 'duel', label: 'Pick your price' };
        } else {
          sentence = `${theirHandle} claimed it and is choosing a price.`;
          waiting = `Waiting on ${theirHandle} to lock a price. Nothing for you to do.`;
        }
        secondary.push({ id: 'cancel', label: 'Cancel trade' });
      }
      break;
    }
    case 'PRICED': {
      tone = 'sky';
      priceFact();
      safety = t.kind === 'ticket' ? 'Never pay outside the app for tickets. Escrow holds the money until you confirm.' : 'We only suggest public safe zones with staff nearby.';
      const opts = slotOptions(t);
      const first = opts[0];
      if (isBuyer) {
        if (t.kind === 'ticket') {
          sentence = 'Fund escrow. The seller is paid only after you confirm the ticket arrived.';
          action = { id: 'book', label: `Fund escrow ${money(t.price_cents)}` };
        } else if (!first) {
          sentence = t.cross_campus ? 'No carrier trips are posted yet. We will tell you when one is.' : 'The seller has no free windows this week.';
          waiting = 'Waiting on a time slot to open up.';
          secondary.push({ id: 'message', label: 'Ask for a time' });
        } else {
          sentence = t.cross_campus && first.carrier
            ? `@${first.carrier} is carrying it over. Meet at your campus safe zone.`
            : t.cross_campus ? `You are driving over. Meet ${theirHandle} at ${first.zone_name}.`
            : `Fairest spot for both of you: ${first.zone_name} (${first.b} min for you, ${first.s} for them).`;
          const reserve = payModeFor(t, first.mode) === 'reservation';
          if (reserve) sentence += ` You pay ${theirHandle} in person at the handoff.`;
          else if (first.mode === 'video') sentence = 'Pick a session time. Payment is held until the session ends.';
          facts.push({ label: 'Suggested', value: first.label });
          action = { id: 'book', label: reserve ? `Reserve ${slotLabel(first.starts_at)}` : `Book ${slotLabel(first.starts_at)} and fund escrow` };
          secondary.push({ id: 'change_slot', label: 'Change time or place' });
        }
        facts.push({ label: 'Hold ends', value: `in ${plural(minsLeft, 'minute')}` });
        secondary.push({ id: 'cancel', label: 'Release hold' });
      } else {
        sentence = `Price locked at ${money(t.price_cents)}.`;
        facts.push({ label: 'Hold ends', value: `in ${plural(minsLeft, 'minute')}` });
        waiting = `Waiting on ${theirHandle} to book ${t.kind === 'ticket' ? 'and fund escrow' : 'a time'}.`;
        secondary.push({ id: 'cancel', label: 'Cancel trade' });
      }
      break;
    }
    case 'BOOKED': {
      tone = 'lilac';
      priceFact();
      if (t.kind === 'ticket') {
        safety = 'Never pay outside the app for tickets. Escrow holds the money until you confirm.';
        facts.push({ label: 'Transfer', value: l.details.transfer_method ?? 'App transfer' });
        if (!t.transfer_sent_at) {
          if (isBuyer) { sentence = 'Escrow funded. The seller transfers the ticket in their ticketing app.'; waiting = `Waiting on ${theirHandle} to send the ticket.`; }
          else { sentence = `Escrow is funded. Transfer the ticket to ${theirHandle} in your ticket app, then upload proof.`; action = { id: 'transfer_sent', label: 'I sent the ticket' }; }
        } else {
          const rel = t.transfer_sent_at + TICKET_AUTO_RELEASE;
          if (isBuyer) { sentence = 'The seller says the ticket is sent. Check your ticket app.'; action = { id: 'confirm_receipt', label: 'I got the ticket' }; secondary.push({ id: 'problem', label: 'Problem' }); }
          else { sentence = 'Proof uploaded. Escrow releases when they confirm.'; waiting = `Waiting on ${theirHandle}. Auto-releases ${slotLabel(rel)} if they stay silent.`; }
          facts.push({ label: 'Auto-release', value: slotLabel(rel) });
        }
        secondary.push({ id: 'cancel', label: 'Cancel and refund' });
        break;
      }
      facts.unshift({ label: 'When', value: describeSlot(slot) });
      const reserved = t.pay_mode === 'reservation';
      if (reserved) facts.splice(1, 0, { label: 'Payment', value: `Pay in person, ${money((t.price_cents ?? 0) + (t.tip_cents ?? 0))}` });
      if (t.kind === 'service' && t.checked_in) {
        sentence = 'Session in progress. Escrow releases at the end unless the buyer taps Problem.';
        waiting = `Session ends ${slotLabel(slot!.ends_at)}.`;
        if (isBuyer) secondary.push({ id: 'problem', label: 'Problem' });
        safety = 'Ratings only come from completed, escrowed sessions.';
        break;
      }
      safety = t.kind === 'service'
        ? (reserved ? 'Meet in public study spaces. Pay the tutor at the session.' : 'Meet in public study spaces. Payment releases at session end.')
        : (reserved ? 'Check the item, then pay. Scanning confirms the handoff; Passport never holds the money.' : 'Check the item first. Scanning confirms you received it.');
      const inWindow = win && now() >= win.opens && now() <= win.closes;
      if (!inWindow) {
        sentence = t.cross_campus && t.carrier_id ? `@${userById(t.carrier_id ?? '')?.handle ?? 'carrier'} brings it to ${describeSlot(slot)}.` : `See you ${describeSlot(slot)}.`;
        waiting = `Your handoff code appears 10 minutes before (${slotLabel(win!.opens)}).`;
        if (slot?.mode === 'in_person') secondary.push({ id: 'scan', label: 'Open handoff scan' });
      } else if (slot?.mode === 'video') {
        sentence = 'Open the campus video link and both tap Check in.';
        if (!myScan) action = { id: 'checkin_tap', label: 'Check in' };
        else waiting = `Waiting on ${theirHandle} to check in.`;
        secondary.push({ id: 'open_video', label: 'Open video link' });
      } else if (myScan && !theirScan) {
        sentence = `You scanned ${theirHandle}. Keep your code open so they can scan you.`;
        action = { id: 'scan', label: 'Show my code' };
      } else {
        sentence = t.kind === 'service' ? 'At the table? Scan each other to start the session.'
          : reserved ? (isBuyer
            ? `At the spot? Check it, pay ${theirHandle} ${money((t.price_cents ?? 0) + (t.tip_cents ?? 0))} your usual way, then scan each other's code.`
            : `At the spot? Let them check it, collect ${money((t.price_cents ?? 0) + (t.tip_cents ?? 0))}, then scan each other's code.`)
          : 'At the spot? Scan each other\'s code. Money releases on the second scan.';
        action = { id: 'scan', label: theirScan ? 'Scan their code to finish' : 'Open handoff scan' };
      }
      secondary.push({ id: 'cancel', label: 'Cancel' });
      break;
    }
    case 'COMPLETE':
    case 'RESOLVED': {
      tone = 'sage';
      priceFact();
      const stampEv = db.passport_events.filter((e) => e.listing_id === l.id && e.type === 'stamp').at(-1);
      facts.push({ label: 'Stamped', value: stampEv ? `${stampEv.payload.where}` : 'Passport' });
      sentence = t.pay_mode === 'reservation'
        ? (t.state === 'RESOLVED' ? 'Resolved by your campus admin in the seller\'s favor.' : isBuyer ? 'Handoff verified. The passport has a new stamp.' : `Sold for ${money(t.price_cents)}, paid in person. Trust updated.`)
        : (t.state === 'RESOLVED' ? 'Resolved by your campus admin. Escrow went to the seller.' : isBuyer ? 'Escrow released. The passport has a new stamp.' : `You were paid ${money(t.price_cents)}. Trust updated.`);
      safety = 'Something wrong? You have 24 hours to tap Problem.';
      if (isBuyer && t.state === 'COMPLETE') {
        if (t.kind === 'service' && !rated) action = { id: 'rate', label: 'Rate this session' };
        else if (t.kind !== 'service' && t.kind !== 'ticket' && !verified) action = { id: 'verify', label: 'Did it match the passport?' };
        if (now() - (t.ended_at ?? 0) < PROBLEM_WINDOW) secondary.push({ id: 'problem', label: 'Problem' });
      }
      if (!action) waiting = 'All done. Nobody is waiting on anything.';
      break;
    }
    case 'DISPUTED':
      tone = 'butter';
      priceFact();
      sentence = 'A campus admin is reviewing the dual-scan record and the passport.';
      waiting = t.pay_mode === 'reservation' ? 'Waiting on your campus admin.' : 'Waiting on your campus admin. Escrow is frozen until then.';
      safety = 'Admins see the scan log, passport and any trade messages.';
      break;
    default: {
      tone = 'peach';
      const o = outcomes.find((x) => x.result !== 'completed');
      const fault = o?.at_fault ?? [];
      sentence = {
        EXPIRED: 'The 30-minute hold ran out, so the listing is open again.',
        CANCELLED: o?.result === 'late_cancel' ? 'Cancelled less than 2 hours before the slot.' : 'Cancelled before the handoff. No penalty.',
        NO_SHOW: fault.includes(viewer) ? 'No scan from you by slot end + 15 minutes.' : `${theirHandle} did not show. ${isBuyer ? (t.pay_mode === 'reservation' ? 'Nothing was charged.' : 'You were refunded.') : 'Your listing is open again.'}`,
        REFUNDED: t.pay_mode === 'reservation' ? 'Decided in the buyer\'s favor. Passport held no money, so nothing to refund.' : 'Refunded. The handoff did not finish, so nobody got a penalty.',
      }[t.state as 'EXPIRED'] ?? '';
      safety = 'Failed trades teach the matcher. Your reason stays private.';
      if (isBuyer && !o?.reason) action = { id: 'reason', label: 'What got in the way?' };
      else waiting = o?.reason ? `Thanks. We tuned your matches for "${REASONS[o.reason as keyof typeof REASONS] ?? o.reason}".` : 'This trade is closed.';
    }
  }

  return {
    steps: STEPS[t.kind],
    step: STEP_INDEX[t.state],
    failed: fail,
    tone, title, sentence, facts: facts.slice(0, 2), action, waiting, secondary, safety,
    hold_minutes_left: minsLeft,
    my_scan: myScan, their_scan: theirScan,
    scan_window: win,
    chat_archived: !!t.ended_at && now() - t.ended_at > 7 * DAY,
  };
}

export const REASONS = { too_far: 'too far', wrong_edition: 'wrong edition', price: 'price', seller_slow: 'seller slow' } as const;

/** Near-miss: adapt the need from a one-tap reason. */
export function applyNearMiss(t: Trade, reason: keyof typeof REASONS) {
  const o = db.outcomes.filter((x) => x.trade_id === t.id && x.result !== 'completed').at(-1);
  if (!o) throw new HttpError(409, 'Nothing to explain');
  o.reason = reason;
  const need = t.need_id ? db.needs.find((n) => n.id === t.need_id) : null;
  const l = listingOf(t);
  if (!need) return null;
  const upsert = (key: string, label: string, value: any, must = false) => {
    need.requirements = need.requirements.filter((r) => r.key !== key);
    need.requirements.push({ key, label, value, must, weight: must ? 3 : 1 });
  };
  if (reason === 'too_far') {
    const buyer = userById(t.buyer_id)!;
    const ten = tenantById(l.tenant_id);
    const m = t.cross_campus ? 45 : pickMeetingPoint(ten, buyer.housing, userById(l.seller_id)!.housing).best.b;
    const max = Math.max(3, m - 3);
    need.prefs.maxMinutes = max;
    upsert('maxMinutes', `Within ${max} min`, max, true);
  } else if (reason === 'wrong_edition') {
    const book = need.book_id ? db.books.find((b) => b.id === need.book_id) : null;
    if (book) upsert('isbn', `ISBN ${book.isbn}`, book.isbn, true);
    const ed = need.requirements.find((r) => r.key === 'edition');
    if (ed) { ed.must = true; ed.weight = 3; } else if (book?.edition) upsert('edition', `${book.edition}th edition`, book.edition, true);
  } else if (reason === 'price') {
    const cap = Math.round((t.price_cents ?? l.ask_cents) * 0.9);
    need.prefs.maxPriceCents = cap;
    upsert('maxPriceCents', `Under ${money(cap)}`, cap);
  } else if (reason === 'seller_slow') {
    need.prefs.minReliability = 0.75;
    upsert('minReliability', 'Reliable sellers', 0.75);
  }
  need.status = 'watching';
  save();
  return need;
}

/** Better-match alerts when a listing appears. */
export function alertMatches(l: Listing) {
  const ten = tenantById(l.tenant_id);
  for (const n of db.needs) {
    if (n.status !== 'watching' || n.kind !== l.kind || n.user_id === l.seller_id) continue;
    if (n.tenant_id !== l.tenant_id && l.visibility !== 'open') continue;
    const buyer = userById(n.user_id);
    if (!buyer) continue;
    const seller = userById(l.seller_id)!;
    const minutes = n.tenant_id !== l.tenant_id ? 45 : l.kind === 'ticket' ? 0 : pickMeetingPoint(ten, buyer.housing, seller.housing).best.b;
    const T = reliability(l.seller_id).T;
    const reqs = n.book_id ? n.requirements : n.requirements;
    const { F } = fitScore(reqs, l, { minutes, T });
    if (n.book_id) {
      const book = db.books.find((b) => b.id === n.book_id);
      if (book && l.details.isbn !== book.isbn && !(l.details.course && n.course_id)) continue;
    }
    const score = F * reach(minutes) * T;
    if (F >= 0.75 && score >= 0.3) {
      const hadMiss = db.trades.some((t) => t.need_id === n.id && db.outcomes.some((o) => o.trade_id === t.id && o.reason));
      notify(n.user_id, 'match', hadMiss ? `Better match: ${l.title}` : `New match: ${l.title}`, `${money(l.ask_cents)}, ${minutes} min away. Fit ${Math.round(F * 100)}%.`, `/listing/${l.id}?need=${n.id}`);
    }
  }
  void stampCount;
}

export function isActive(t: Trade) {
  return ['HELD', 'PRICED', 'BOOKED', 'DISPUTED'].includes(t.state);
}

export function needFor(t: Trade): Need | null {
  return t.need_id ? db.needs.find((n) => n.id === t.need_id) ?? null : null;
}
