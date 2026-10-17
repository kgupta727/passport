import { db, DAY, Listing, now, tenantById } from './db.js';
import { conditionStep, median, money } from './logic.js';
import { modelKey } from './rarity.js';

/*
 * Price history and outside prices for one listing. Everything here is plain code over seeded data:
 * campus sales come from db.sales, outside prices from the OUTSIDE table below (demo data, no live APIs).
 *
 *   History:   monthly median of completed campus sales in the listing's category, last 12 months.
 *   Season:    I(m) = median of month m / average of the 12 monthly medians.
 *   Forecast:  P(m) = this month's median x I(m) / I(this month).
 */

export type Source = 'Amazon' | 'eBay' | 'Facebook Marketplace' | 'Craigslist';
interface Outside { source: Source; title: string; used: boolean; cents: number; ship?: number; miles?: number }

/** Seeded outside listings, keyed by rarity model (item:lamp), ISBN category or plain category. */
const OUTSIDE: Record<string, Outside[]> = {
  'item:lamp': [
    { source: 'Amazon', title: 'LED desk lamp, dimmable, USB port', used: false, cents: 3599 },
    { source: 'eBay', title: 'Dimmable desk lamp, used', used: true, cents: 1900, ship: 850 },
    { source: 'Facebook Marketplace', title: 'Desk lamp, works great', used: true, cents: 2500, miles: 3.8 },
    { source: 'Craigslist', title: 'Black desk lamp (no dimmer)', used: true, cents: 2200, miles: 6.5 },
  ],
  'item:calculator': [
    { source: 'Amazon', title: 'TI-84 Plus CE, new', used: false, cents: 12999 },
    { source: 'eBay', title: 'TI-84 Plus CE, pre-owned', used: true, cents: 7200, ship: 600 },
    { source: 'Facebook Marketplace', title: 'TI-84 Plus CE graphing calculator', used: true, cents: 8000, miles: 4.1 },
    { source: 'Craigslist', title: 'TI 84 plus CE w/ charger', used: true, cents: 6500, miles: 9.2 },
  ],
  'item:fridge': [
    { source: 'Amazon', title: 'Compact fridge 3.1 cu ft, new', used: false, cents: 16900 },
    { source: 'Facebook Marketplace', title: 'Mini fridge, dorm size', used: true, cents: 6000, miles: 2.9 },
    { source: 'Craigslist', title: 'Mini fridge, cold, must go', used: true, cents: 5000, miles: 7.4 },
  ],
  'item:microwave': [
    { source: 'Amazon', title: '700W countertop microwave, new', used: false, cents: 7499 },
    { source: 'Facebook Marketplace', title: 'Microwave, works', used: true, cents: 4500, miles: 3.3 },
    { source: 'Craigslist', title: 'Small microwave', used: true, cents: 4000, miles: 8.1 },
  ],
  'item:futon': [
    { source: 'Amazon', title: 'Futon sofa bed, new', used: false, cents: 18900 },
    { source: 'Facebook Marketplace', title: 'Futon, you haul', used: true, cents: 5500, miles: 5.0 },
    { source: 'Craigslist', title: 'Blue futon', used: true, cents: 4500, miles: 11.2 },
  ],
  'item:chair': [
    { source: 'Amazon', title: 'Upholstered accent chair, new', used: false, cents: 12900 },
    { source: 'Facebook Marketplace', title: 'Gray accent chair', used: true, cents: 5000, miles: 4.4 },
    { source: 'Craigslist', title: 'Comfy chair', used: true, cents: 4000, miles: 6.9 },
  ],
  'item:bedding': [
    { source: 'Amazon', title: 'Twin XL memory foam topper, 2 in., new', used: false, cents: 3999 },
    { source: 'eBay', title: 'Twin XL topper, lightly used', used: true, cents: 2200, ship: 1200 },
  ],
  'item:tv': [
    { source: 'Amazon', title: '24 in. 1080p monitor, new', used: false, cents: 11999 },
    { source: 'eBay', title: '24 in. monitor, refurbished', used: true, cents: 6400, ship: 1500 },
    { source: 'Facebook Marketplace', title: '24" monitor', used: true, cents: 5500, miles: 3.1 },
    { source: 'Craigslist', title: '32 in. TV with remote', used: true, cents: 7000, miles: 8.8 },
  ],
  'item:desk': [
    { source: 'Amazon', title: 'Small writing desk, new', used: false, cents: 8999 },
    { source: 'Facebook Marketplace', title: 'Wood desk', used: true, cents: 3500, miles: 4.7 },
  ],
  'item:bike': [
    { source: 'Amazon', title: 'Hybrid bike, new', used: false, cents: 42900 },
    { source: 'Facebook Marketplace', title: 'Trek hybrid, medium', used: true, cents: 22000, miles: 5.6 },
    { source: 'Craigslist', title: 'City bike, needs tune-up', used: true, cents: 15000, miles: 10.3 },
  ],
};

/** Typical outside price relative to the campus median, for anything without a curated entry. */
const FALLBACK: { source: Source; used: boolean; k: number; ship?: number; miles?: number }[] = [
  { source: 'Amazon', used: false, k: 1.9 },
  { source: 'eBay', used: true, k: 0.9, ship: 900 },
  { source: 'Facebook Marketplace', used: true, k: 1.05, miles: 4.2 },
  { source: 'Craigslist', used: true, k: 0.95, miles: 8.6 },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthIndex = (ms: number) => { const d = new Date(ms); return d.getFullYear() * 12 + d.getMonth(); };
const monthLabel = (mi: number) => `${MONTHS[mi % 12]} ${String(Math.floor(mi / 12)).slice(2)}`;

function outsideFor(l: Listing, campusMedian: number | null): Outside[] {
  if (l.kind === 'textbook') {
    const b = db.books.find((x) => x.isbn === l.details.isbn);
    if (!b) return [];
    const p = b.prices;
    const out: Outside[] = [];
    if (p.new) out.push({ source: 'Amazon', title: `${b.title}, new`, used: false, cents: p.new });
    if (p.used_online) out.push({ source: 'Amazon', title: `${b.title}, used`, used: true, cents: p.used_online });
    if (p.rental) out.push({ source: 'Amazon', title: `${b.title}, semester rental`, used: true, cents: p.rental });
    if (p.used_online) out.push({ source: 'eBay', title: `${b.title}, used`, used: true, cents: Math.round(p.used_online * 0.85), ship: 450 });
    return out;
  }
  const curated = OUTSIDE[modelKey(l, tenantById(l.tenant_id))];
  if (curated) return curated;
  if (!campusMedian) return [];
  return FALLBACK.map((f) => ({ source: f.source, used: f.used, ship: f.ship, miles: f.miles, title: `Similar to "${l.title}"${f.used ? ', used' : ', new'}`, cents: Math.round((campusMedian * f.k) / 100) * 100 }));
}

export function marketView(l: Listing) {
  const T = now();
  const sales = db.sales.filter((s) => s.tenant_id === l.tenant_id && s.category === l.category && s.at > T - 366 * DAY);
  const thisMonth = monthIndex(T);

  const history = Array.from({ length: 12 }, (_, i) => thisMonth - 11 + i).map((mi) => {
    const xs = sales.filter((s) => monthIndex(s.at) === mi).map((s) => s.cents);
    return { month: monthLabel(mi), mi, median: xs.length ? Math.round(median(xs)!) : null, n: xs.length };
  });
  const known = history.filter((h) => h.median != null) as { month: string; mi: number; median: number; n: number }[];
  const avg = known.length ? known.reduce((a, h) => a + h.median, 0) / known.length : null;
  const season = (mi: number) => {
    const h = known.find((x) => x.mi % 12 === mi % 12);
    return h && avg ? h.median / avg : 1;
  };
  const now$ = known.at(-1)?.median ?? null;

  const forecast = now$ == null ? [] : Array.from({ length: 8 }, (_, i) => thisMonth + 1 + i).map((mi) => ({
    month: monthLabel(mi), mi, predicted: Math.round((now$ * season(mi)) / season(thisMonth)),
  }));
  const bestPast = known.length ? known.reduce((a, b) => (b.median < a.median ? b : a)) : null;
  const bestNext = forecast.length ? forecast.reduce((a, b) => (b.predicted < a.predicted ? b : a)) : null;

  const outside = outsideFor(l, now$).map((o) => ({ ...o, total: o.cents + (o.ship ?? 0) }));
  const usedOnes = outside.filter((o) => o.used).sort((a, b) => a.total - b.total);
  const cheapest = usedOnes[0] ?? null;
  const newPrice = outside.filter((o) => !o.used).sort((a, b) => a.total - b.total)[0] ?? null;
  // Only call it a better deal when it saves at least 10%: a few dollars is not worth an off-campus meetup.
  const elsewhere = cheapest && cheapest.total <= l.ask_cents * 0.9 ? cheapest : null;

  // Timing tip only looks three months out: nobody waits until May for a lamp.
  const soon = forecast.slice(0, 3);
  const bestSoon = soon.length ? soon.reduce((a, b) => (b.predicted < a.predicted ? b : a)) : null;
  const dip = bestSoon && now$ ? 1 - bestSoon.predicted / now$ : 0;
  let verdict: 'elsewhere' | 'wait' | 'buy';
  let advice: string;
  if (elsewhere) {
    verdict = 'elsewhere';
    advice = `${elsewhere.source} has one for ${money(elsewhere.total)}${elsewhere.miles ? `, ${elsewhere.miles} mi off campus` : ' with shipping'}: ${money(l.ask_cents - elsewhere.total)} less than here.`;
  } else if (bestSoon && dip >= 0.1 && now$ && l.ask_cents >= now$ * 0.95) {
    verdict = 'wait';
    advice = `Fair price today. If you can wait, campus prices usually dip about ${Math.round(dip * 100)}% by ${bestSoon.month.split(' ')[0]}.`;
  } else {
    verdict = 'buy';
    advice = 'This is the best price we found. Buying now is a good call.';
  }

  return {
    category: l.category, condition: conditionStep(l.condition), ask_cents: l.ask_cents,
    history, forecast, now_cents: now$, sales_n: sales.length,
    best_past: bestPast ? { month: bestPast.month, cents: bestPast.median } : null,
    best_next: bestNext ? { month: bestNext.month, cents: bestNext.predicted } : null,
    season: known.map((h) => ({ month: h.month, index: Math.round(season(h.mi) * 100) / 100 })),
    outside, cheapest_used: cheapest, new_price: newPrice, elsewhere, verdict, advice,
    best_soon: bestSoon ? { month: bestSoon.month, cents: bestSoon.predicted } : null,
  };
}
