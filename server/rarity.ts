import { db, beforeSave, Listing, RarityTier, Tenant, tenantById } from './db.js';
import { freshness, suggestPrice } from './logic.js';

/*
 * Explore rarity. Computed here, never set by a seller.
 *   C = 1 / (1 + n)                n = other active listings on this campus of the same model
 *   D = clamp((S - A) / S, 0, 0.5) S = passport suggested price, A = asking price
 *   Score = 0.6 C + 0.4 (D / 0.5)
 */

export const TIERS: { tier: RarityTier; min: number; label: string; revealMinutes: number }[] = [
  { tier: 'legendary', min: 0.85, label: 'Legendary', revealMinutes: 25 },
  { tier: 'epic', min: 0.65, label: 'Epic', revealMinutes: 18 },
  { tier: 'rare', min: 0.45, label: 'Rare', revealMinutes: 12 },
  { tier: 'uncommon', min: 0.25, label: 'Uncommon', revealMinutes: 6 },
  { tier: 'common', min: 0, label: 'Common', revealMinutes: 3 },
];
export const MAX_REVEAL_MINUTES = TIERS[0].revealMinutes;
/** No more than this share of a campus's finds show as Epic or Legendary at once. */
export const HIGH_TIER_SHARE = 0.1;

const DEFAULT_MODELS: { key: string; match: string[] }[] = [
  { key: 'fridge', match: ['fridge', 'refrigerator', 'minifridge'] },
  { key: 'microwave', match: ['microwave'] },
  { key: 'calculator', match: ['calculator', 'ti-84', 'ti 84', 'ti-83'] },
  { key: 'lamp', match: ['lamp'] },
  { key: 'futon', match: ['futon', 'couch', 'sofa', 'loveseat'] },
  { key: 'chair', match: ['chair'] },
  { key: 'desk', match: ['desk'] },
  { key: 'bike', match: ['bike', 'bicycle', 'scooter'] },
  { key: 'bedding', match: ['topper', 'mattress', 'comforter', 'bedding'] },
  { key: 'tv', match: ['tv', 'television', 'monitor'] },
];

export const tierOf = (score: number): RarityTier => TIERS.find((t) => score >= t.min)!.tier;
export const tierInfo = (tier: RarityTier) => TIERS.find((t) => t.tier === tier)!;

export function exploreEligible(l: Listing) {
  return (l.kind === 'item' || l.kind === 'textbook') && l.status === 'active' && freshness(l) === 'fresh';
}

export function modelKey(l: Listing, tenant: Tenant): string {
  if (l.kind === 'textbook') return l.category;
  const title = l.title.toLowerCase();
  const models = tenant.config.rarityModels ?? DEFAULT_MODELS;
  const hit = models.find((m) => m.match.some((w) => title.includes(w)));
  return hit ? `item:${hit.key}` : `cat:${l.category}`;
}

export function refreshRarity() {
  const groups = new Map<string, Listing[]>();
  for (const l of db.listings) {
    if (!exploreEligible(l)) continue;
    const key = `${l.tenant_id}|${modelKey(l, tenantById(l.tenant_id))}`;
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  for (const [key, ls] of groups) {
    const model = key.split('|')[1];
    for (const l of ls) {
      const n = ls.length - 1;
      const C = 1 / (1 + n);
      const S = l.suggested_cents ?? suggestPrice(l.tenant_id, l.category, l.condition, 0).S_cents;
      const D = S ? Math.max(0, Math.min(0.5, (S - l.ask_cents) / S)) : 0;
      const score = Math.round((0.6 * C + 0.4 * (D / 0.5)) * 1000) / 1000;
      l.rarity_score = score;
      l.rarity_tier = tierOf(score);
      l.rarity_inputs = { model, n, C: Math.round(C * 1000) / 1000, D: Math.round(D * 1000) / 1000, S_cents: S ?? null };
    }
  }
}

/**
 * Display tiers for one campus: the stored tier, except that only the top HIGH_TIER_SHARE of finds
 * (at least one) may show as Epic or Legendary. The rest show as Rare. Thin marketplaces make
 * everything look scarce; this keeps the top tiers meaningful.
 */
export function displayTiers(listings: Listing[]): Map<string, RarityTier> {
  const allowed = Math.max(1, Math.floor(listings.length * HIGH_TIER_SHARE));
  const high = listings.filter((l) => l.rarity_tier === 'epic' || l.rarity_tier === 'legendary')
    .sort((a, b) => (b.rarity_score ?? 0) - (a.rarity_score ?? 0) || a.created_at - b.created_at);
  const out = new Map<string, RarityTier>();
  for (const l of listings) out.set(l.id, l.rarity_tier ?? 'common');
  high.slice(allowed).forEach((l) => out.set(l.id, 'rare'));
  return out;
}

beforeSave(refreshRarity);
