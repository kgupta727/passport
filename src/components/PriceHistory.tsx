import { useState } from 'react';
import { useApi } from '../api';
import { money } from '../format';
import { Icon } from './Icon';
import { Skeleton } from './ui';

/** Price history, timing and outside prices for one listing. All numbers come from /listings/:id/market. */
export function PriceHistory({ listingId, children }: { listingId: string; children?: React.ReactNode }) {
  const { data } = useApi<any>(`/listings/${listingId}/market`);
  if (!data) return <Skeleton h={320} />;
  if (!data.now_cents) return null;
  const tone = data.verdict === 'elsewhere' ? 'bg-butter' : data.verdict === 'wait' ? 'bg-sky' : 'bg-sage';

  return (
    <>
      <section className="card p-5 mb-5">
        <h2 className="text-[18px] mb-1">Price history</h2>
        <p className="text-[13px] font-bold text-ink-soft mb-3">Middle price of {data.sales_n} completed campus sales in this category, by month</p>
        <div className={`rounded-[18px] ${tone} p-4 mb-4 font-extrabold flex gap-2`}>
          <Icon name={data.verdict === 'elsewhere' ? 'info' : data.verdict === 'wait' ? 'clock' : 'check'} size={18} className="shrink-0 mt-0.5" />{data.advice}
        </div>
        <Chart data={data} />
        <div className="grid grid-cols-2 gap-2 mt-4">
          {data.best_past && (
            <div className="rounded-[18px] bg-bg p-3">
              <div className="text-[12px] font-extrabold text-ink-soft">Cheapest month, past year</div>
              <div className="display text-[20px]">{data.best_past.month.split(' ')[0]}, {money(data.best_past.cents)}</div>
            </div>
          )}
          {data.best_next && (
            <div className="rounded-[18px] bg-bg p-3">
              <div className="text-[12px] font-extrabold text-ink-soft">Predicted cheapest, next 8 months</div>
              <div className="display text-[20px]">{data.best_next.month.split(' ')[0]}, {money(data.best_next.cents)}</div>
            </div>
          )}
        </div>
        {children}
        <details className="mt-3 group">
          <summary className="font-extrabold text-[14px] text-ink-soft cursor-pointer min-h-[44px] flex items-center gap-1 list-none">
            <Icon name="chevronDown" size={16} className="transition-transform group-open:rotate-180" />How we figured this out
          </summary>
          <div className="bg-bg rounded-[16px] p-4 text-[13px] font-bold space-y-1">
            <p className="display text-[15px]">P(m) = N x I(m) / I(now)</p>
            <p><b>P(m)</b> is the predicted middle price in month m.</p>
            <p><b>N</b> = {money(data.now_cents)}, the middle price of campus sales this month.</p>
            <p><b>I(m)</b> is the season index: that month's middle price last year divided by the year's average. Below 1 means cheaper than usual.</p>
            <p className="pt-1">{data.season.map((s: any) => `${s.month.split(' ')[0]} ${s.index.toFixed(2)}`).join(', ')}</p>
            <p className="pt-1">Outside prices are seeded for this demo, not live from those sites. A cheaper outside price only counts as a better deal when it saves at least 10%.</p>
          </div>
        </details>
      </section>

      {data.outside.length > 0 && (
        <section className="card p-5 mb-5">
          <h2 className="text-[18px] mb-1">Compared with elsewhere</h2>
          <p className="text-[13px] font-bold text-ink-soft mb-3">Similar listings on other marketplaces, cheapest first. Off campus means no escrow and no safe zone.</p>
          <ul>
            <li className="flex items-center gap-3 py-2.5 border-b border-line/80">
              <span className="w-28 shrink-0 font-extrabold">Here</span>
              <span className="flex-1 text-[14px] font-bold text-ink-soft">This listing, escrow and a safe zone</span>
              <span className="display text-[16px]">{money(data.ask_cents)}</span>
            </li>
            {[...data.outside].sort((a: any, b: any) => a.total - b.total).map((o: any, i: number) => (
              <li key={i} className="flex items-center gap-3 py-2.5 border-b border-line/80 last:border-0">
                <span className="w-28 shrink-0 font-extrabold text-[14px]">{o.source}</span>
                <span className="flex-1 min-w-0 text-[13px] font-bold text-ink-soft">
                  <span className="block truncate">{o.title}</span>
                  {o.used ? 'Used' : 'New'}{o.ship ? `, ${money(o.cents)} + ${money(o.ship)} shipping` : ''}{o.miles ? `, ${o.miles} mi off campus` : ''}
                </span>
                <span className={`display text-[16px] ${o.total < data.ask_cents ? 'text-sage-deep' : ''}`}>{money(o.total)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

const W = 640, H = 220, L = 44, R = 16, T = 16, B = 28;

function Chart({ data }: { data: any }) {
  const [hover, setHover] = useState<number | null>(null);
  const pts = [
    ...data.history.map((h: any) => ({ month: h.month, v: h.median, n: h.n, kind: 'past' as const })),
    ...data.forecast.map((f: any) => ({ month: f.month, v: f.predicted, kind: 'next' as const })),
  ];
  const vals = [...pts.map((p) => p.v).filter((v): v is number => v != null), data.ask_cents];
  const lo = Math.min(...vals) * 0.9, hi = Math.max(...vals) * 1.05;
  const x = (i: number) => L + (i * (W - L - R)) / (pts.length - 1);
  const y = (v: number) => T + ((hi - v) * (H - T - B)) / (hi - lo);
  const nowI = data.history.length - 1;
  const path = (from: number, to: number) => pts.slice(from, to + 1).map((p, k) => (p.v == null ? '' : `${k ? 'L' : 'M'}${x(from + k).toFixed(1)},${y(p.v).toFixed(1)}`)).join(' ');
  const ticks = [lo, (lo + hi) / 2, hi].map((v) => Math.round(v / 100) * 100);
  const pastBest = pts.findIndex((p) => p.kind === 'past' && p.month === data.best_past?.month);
  const nextBest = pts.findIndex((p) => p.kind === 'next' && p.month === data.best_next?.month);
  const hp = hover != null ? pts[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Campus price by month. Now ${money(data.now_cents)}, asking ${money(data.ask_cents)}.`} onMouseLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
            <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fontWeight={700} fill="var(--ink-soft)">{money(v)}</text>
          </g>
        ))}
        <rect x={x(nowI)} y={T} width={W - R - x(nowI)} height={H - T - B} fill="var(--bg)" />
        <text x={x(nowI) + 6} y={T + 12} fontSize={11} fontWeight={800} fill="var(--ink-soft)">Predicted</text>
        <line x1={L} x2={W - R} y1={y(data.ask_cents)} y2={y(data.ask_cents)} stroke="var(--ink-soft)" strokeWidth={1.5} strokeDasharray="2 4" />
        <text x={L + 4} y={y(data.ask_cents) - 6} fontSize={11} fontWeight={800} fill="var(--ink)">Asking {money(data.ask_cents)}</text>
        <path d={path(0, nowI)} fill="none" stroke="var(--sky-deep)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <path d={path(nowI, pts.length - 1)} fill="none" stroke="var(--sky-deep)" strokeWidth={2} strokeDasharray="6 5" strokeLinecap="round" />
        {pastBest >= 0 && <circle cx={x(pastBest)} cy={y(pts[pastBest].v!)} r={5} fill="var(--sage-deep)" stroke="var(--surface)" strokeWidth={2} />}
        {nextBest >= 0 && <circle cx={x(nextBest)} cy={y(pts[nextBest].v!)} r={5} fill="var(--surface)" stroke="var(--sage-deep)" strokeWidth={2.5} />}
        <circle cx={x(nowI)} cy={y(pts[nowI].v ?? data.now_cents)} r={4.5} fill="var(--sky-deep)" stroke="var(--surface)" strokeWidth={2} />
        {pts.map((p, i) => i % 3 === nowI % 3 && (
          <text key={p.month} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--ink-soft)">{i === nowI ? 'Now' : p.month.split(' ')[0]}</text>
        ))}
        {hp && hp.v != null && <line x1={x(hover!)} x2={x(hover!)} y1={T} y2={H - B} stroke="var(--ink-soft)" strokeWidth={1} />}
        {hp && hp.v != null && <circle cx={x(hover!)} cy={y(hp.v)} r={4} fill="var(--ink)" />}
        {pts.map((p, i) => (
          <rect key={i} x={x(i) - (W - L - R) / (pts.length - 1) / 2} y={T} width={(W - L - R) / (pts.length - 1)} height={H - T - B} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
        ))}
      </svg>
      {hp && hp.v != null && (
        <div className="absolute top-0 pointer-events-none rounded-[12px] bg-ink text-white px-3 py-2 text-[12px] font-bold shadow" style={{ left: `${(x(hover!) / W) * 100}%`, transform: `translateX(${hover! > pts.length / 2 ? '-105%' : '5%'})` }}>
          <div className="font-extrabold">{hp.month}</div>
          {hp.kind === 'past' ? `${money(hp.v)} middle price, ${hp.n} ${hp.n === 1 ? 'sale' : 'sales'}` : `${money(hp.v)} predicted`}
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[12px] font-bold text-ink-soft">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-sage-deep" />Cheapest last year</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border-2 border-sage-deep" />Predicted cheapest</span>
        <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-sky-deep" />Forecast</span>
      </div>
    </div>
  );
}
