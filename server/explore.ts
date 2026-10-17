import crypto from 'node:crypto';
import { db, scoped, tenantById, userById, User, SafeZone, Tenant } from './db.js';
import { CONDITION_STEPS, conditionStep, fitScore, publicUser, reliability, walkMinutes } from './logic.js';
import { candidateFor, photosOf } from './views.js';
import { TIERS, MAX_REVEAL_MINUTES, HIGH_TIER_SHARE, displayTiers, exploreEligible, tierInfo } from './rarity.js';

/** Straight-line meters to walking minutes: 80 m/min at a 1.25 path detour. */
export const METERS_PER_MINUTE = 64;

function meters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const walk = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => Math.max(1, Math.ceil(meters(a, b) / METERS_PER_MINUTE));

/** The safe zone closest to where someone lives. Pins sit here, never at a home. */
export function homeZone(t: Tenant, housing: string): SafeZone {
  return [...t.config.safeZones].sort((a, b) => walkMinutes(t, housing, a.id) - walkMinutes(t, housing, b.id))[0];
}

function inBounds(t: Tenant, lat: number, lng: number) {
  const [[s, w], [n, e]] = t.config.map.bounds;
  const pad = 0.01;
  return lat >= s - pad && lat <= n + pad && lng >= w - pad && lng <= e + pad;
}

/** Spread pins at the same zone on a small ring so they never stack. Deterministic per listing. */
function jitter(zone: SafeZone, listingId: string, slot: number) {
  const h = crypto.createHash('sha1').update(listingId).digest();
  const angle = ((h[0] / 255) * 360 + slot * 67) * (Math.PI / 180);
  const r = 95 + (slot % 3) * 35;
  return {
    lat: zone.lat + (r * Math.cos(angle)) / 111_320,
    lng: zone.lng + (r * Math.sin(angle)) / (111_320 * Math.cos(zone.lat * (Math.PI / 180))),
  };
}

export function exploreView(viewer: User, q: { zone?: string; lat?: number; lng?: number; budget?: number }) {
  const t = tenantById(viewer.tenant_id);
  const zones = t.config.safeZones;
  const fallback = homeZone(t, viewer.housing);

  let origin: { lat: number; lng: number; label: string; source: 'gps' | 'zone'; zone_id: string | null; note?: string };
  const hasGps = Number.isFinite(q.lat) && Number.isFinite(q.lng);
  if (hasGps && inBounds(t, q.lat!, q.lng!)) {
    origin = { lat: q.lat!, lng: q.lng!, label: 'Your location', source: 'gps', zone_id: null };
  } else {
    const z = zones.find((x) => x.id === q.zone) ?? fallback;
    origin = { lat: z.lat, lng: z.lng, label: z.name, source: 'zone', zone_id: z.id };
    if (hasGps) origin.note = `You look off campus, so this is from ${z.name}.`;
  }

  const pool = scoped(db.listings, t.id).filter((l) => l.seller_id !== viewer.id && exploreEligible(l));
  const shown = displayTiers(pool);
  const needs = db.needs.filter((n) => n.user_id === viewer.id && n.status === 'watching');
  const budget = q.budget != null && q.budget > 0 ? q.budget : null;
  const perZone = new Map<string, number>();

  const finds = pool.map((l) => {
    const seller = userById(l.seller_id)!;
    const zone = homeZone(t, seller.housing);
    const slot = perZone.get(zone.id) ?? 0;
    perZone.set(zone.id, slot + 1);
    const minutes = walk(origin, zone);
    const tier = shown.get(l.id)!;
    const info = tierInfo(tier);
    const capped = tier !== l.rarity_tier;
    const rel = reliability(l.seller_id);
    const match = needs.find((n) => {
      if (!candidateFor(n, l)) return false;
      const fit = fitScore(n.requirements, l, { minutes, T: rel.T });
      return fit.F >= 0.7 && !fit.rows.some((r) => r.must && r.status === 'miss');
    });
    return {
      id: l.id, kind: l.kind, title: l.title, ask_cents: l.ask_cents, photo: photosOf(l)[0] ?? null,
      condition_label: CONDITION_STEPS[conditionStep(l.condition)].label,
      seller: publicUser(seller),
      tier, tier_label: info.label, reveal_minutes: info.revealMinutes, capped,
      score: l.rarity_score ?? 0, inputs: l.rarity_inputs ?? null,
      zone: { id: zone.id, name: zone.name }, ...jitter(zone, l.id, slot), minutes,
      revealed: minutes <= info.revealMinutes,
      faint: minutes > info.revealMinutes * 0.6,
      over_budget: budget != null && l.ask_cents > budget,
      match: match ? { need_id: match.id, text: match.free_text } : null,
    };
  });

  const pins = finds.filter((f) => f.revealed && !f.over_budget)
    .sort((a, b) => Number(!!b.match) - Number(!!a.match) || b.score - a.score || a.minutes - b.minutes);
  const unrevealed = finds.filter((f) => !f.revealed && !f.over_budget);
  const hiddenByTier = TIERS.map((x) => ({ tier: x.tier, label: x.label, count: unrevealed.filter((f) => f.tier === x.tier).length })).filter((x) => x.count);

  return {
    campus: t.short,
    map: t.config.map,
    zones: zones.map((z) => ({ id: z.id, name: z.name, lat: z.lat, lng: z.lng })),
    home_zone_id: fallback.id,
    origin,
    meters_per_minute: METERS_PER_MINUTE,
    max_reveal_minutes: MAX_REVEAL_MINUTES,
    tiers: TIERS.map((x) => ({ tier: x.tier, label: x.label, min: x.min, reveal_minutes: x.revealMinutes })),
    high_tier_share: HIGH_TIER_SHARE,
    budget_cents: budget,
    pins,
    counts: { total: finds.length, shown: pins.length, over_budget: finds.filter((f) => f.over_budget).length, out_of_range: unrevealed.length },
    out_of_range_by_tier: hiddenByTier,
  };
}
