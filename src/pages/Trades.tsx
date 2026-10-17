import { useState } from 'react';
import { Link } from 'react-router-dom';
import { mutate, useApi } from '../api';
import { Art } from '../components/Art';
import { Chip, Empty, PageHeader, Segmented, Skeleton } from '../components/ui';
import { Icon } from '../components/Icon';
import { ListingChips } from '../components/OfferCard';
import { money, ago, plural } from '../format';

const STATE_LABEL: Record<string, string> = { COMPLETE: 'Completed', RESOLVED: 'Resolved', EXPIRED: 'Hold expired', CANCELLED: 'Cancelled', NO_SHOW: 'No-show', REFUNDED: 'Refunded', DISPUTED: 'In dispute' };

export function Trades() {
  const { data } = useApi<any>('/trades', { poll: 4000 });
  const { data: mine } = useApi<any[]>('/listings?mine=1', { poll: 15000 });
  const [tab, setTab] = useState<'active' | 'listings' | 'past'>('active');

  return (
    <div>
      <PageHeader title="Trades" sub="Every trade shows one next step. If it is not yours, we say who it is waiting on." />
      <div className="mb-5">
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'active', label: `Active${data?.active.length ? ` (${data.active.length})` : ''}` },
          { value: 'listings', label: `Selling${mine?.length ? ` (${mine.length})` : ''}` },
          { value: 'past', label: 'Past' },
        ]} />
      </div>

      {!data ? <Skeleton h={200} /> : tab === 'active' ? (
        <div className="space-y-3">
          {data.questions.map((q: any) => <QuestionCard key={q.id} q={q} />)}
          {data.active.length === 0 && data.questions.length === 0 && (
            <Empty icon="trades" title="No trades in flight" body="Claim something from your Needs, or list something to sell. Trades show up here with one clear next step.">
              <div className="flex gap-2 mt-3"><Link to="/" className="btn-secondary">Find something</Link><Link to="/sell" className="btn-secondary">Sell</Link></div>
            </Empty>
          )}
          {data.active.map((t: any) => <ActiveTrade key={t.id} t={t} />)}
        </div>
      ) : tab === 'listings' ? (
        <div className="space-y-3">
          {mine?.length === 0 && <Empty icon="plus" title="Nothing listed" body="Quick-list takes about 30 seconds."><Link to="/sell" className="btn-secondary mt-3">Sell something</Link></Empty>}
          {mine?.map((l: any) => <MyListing key={l.id} l={l} />)}
        </div>
      ) : (
        <div className="space-y-3">
          {data.past.length === 0 && <Empty icon="clock" title="No history yet" body="Finished trades and their outcomes land here." />}
          {data.past.map((t: any) => <TradeRow key={t.id} t={t} past />)}
        </div>
      )}
    </div>
  );
}

/** Which active trades are open. Per device only: a convenience, so it fails quietly. */
const OPEN_KEY = 'passport.trades.open';
function readOpen(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(OPEN_KEY) ?? '{}'); } catch { return {}; }
}

/** An active trade that expands to show its next step and closes back to one line. Trades that need you start open. */
function ActiveTrade({ t }: { t: any }) {
  const [open, setOpen] = useState<boolean>(() => readOpen()[t.id] ?? !!t.action);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(OPEN_KEY, JSON.stringify({ ...readOpen(), [t.id]: next })); } catch { /* storage blocked */ }
  };
  return (
    <div className={`card overflow-hidden ${t.action ? 'border-ink border-[1.5px]' : ''}`}>
      <button type="button" onClick={toggle} aria-expanded={open} className="w-full p-4 flex gap-4 items-center text-left">
        <Art photo={t.photo} kind={t.kind} className={`${open ? 'w-16 h-16' : 'w-12 h-12'} shrink-0 transition-all`} rounded="rounded-[16px]" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-extrabold truncate">{t.title}</span>
            <span className="display text-[15px] whitespace-nowrap">{money(t.price_cents ?? t.ask_cents)}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex gap-1">{t.steps.map((s: string, i: number) => <span key={s} className={`h-1.5 w-5 rounded-full ${i < t.step ? 'bg-sage-deep' : i === t.step ? 'bg-ink' : 'bg-line'}`} />)}</div>
            <span className={`text-[13px] font-extrabold truncate ${t.action ? 'text-ink' : 'text-ink-soft'}`}>{t.action ? t.action.label : t.waiting}</span>
          </div>
        </div>
        <Icon name="chevronDown" size={18} className={`text-ink-soft shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 -mt-1">
          <div className="text-[13px] font-bold text-ink-soft mb-1">{t.role === 'buyer' ? 'From' : t.role === 'seller' ? 'To' : 'Carrying for'} @{t.counterpart?.handle}, started {ago(t.created_at)}</div>
          <p className="font-bold mb-3">{t.sentence}</p>
          {t.waiting && t.action && <p className="text-[13px] font-bold text-ink-soft mb-3">{t.waiting}</p>}
          <div className="flex gap-2">
            <Link to={`/trade/${t.id}`} className={`${t.action ? 'btn-primary' : 'btn-secondary'} flex-1 !min-h-[46px]`}>{t.action ? t.action.label : 'Open trade'}</Link>
            <button type="button" onClick={toggle} className="btn-quiet !min-h-[46px] text-[14px]">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TradeRow({ t, past }: { t: any; past?: boolean }) {
  return (
    <Link to={`/trade/${t.id}`} className={`card p-4 flex gap-4 items-center ${t.action && !past ? 'border-ink border-[1.5px]' : ''}`}>
      <Art photo={t.photo} kind={t.kind} className="w-16 h-16 shrink-0" rounded="rounded-[16px]" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-extrabold truncate">{t.title}</span>
          <span className="display text-[15px] whitespace-nowrap">{money(t.price_cents ?? t.ask_cents)}</span>
        </div>
        <div className="text-[13px] font-bold text-ink-soft">{t.role === 'buyer' ? 'From' : t.role === 'seller' ? 'To' : 'Carrying for'} @{t.counterpart?.handle}{past ? `, ${ago(t.ended_at ?? t.created_at)}` : ''}</div>
        {past ? (
          <div className="mt-1.5"><Chip tone={t.state === 'COMPLETE' || t.state === 'RESOLVED' ? 'sage' : 'peach'}>{STATE_LABEL[t.state] ?? t.state}</Chip></div>
        ) : (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex gap-1">{t.steps.map((s: string, i: number) => <span key={s} className={`h-1.5 w-5 rounded-full ${i < t.step ? 'bg-sage-deep' : i === t.step ? 'bg-ink' : 'bg-line'}`} />)}</div>
            <span className={`text-[13px] font-extrabold truncate ${t.action ? 'text-ink' : 'text-ink-soft'}`}>{t.action ? t.action.label : t.waiting}</span>
          </div>
        )}
      </div>
      <Icon name="chevronRight" size={18} className="text-ink-soft shrink-0" />
    </Link>
  );
}

function QuestionCard({ q }: { q: any }) {
  return (
    <div className="rounded-[28px] bg-butter p-5">
      <div className="text-[13px] font-extrabold text-butter-deep mb-1">A buyer's Fit Check needs this: {q.listing_title}</div>
      <div className="display text-[18px]">{q.prompt}</div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        {q.options.map((o: string) => <button key={o} className="tile t-ink min-h-[48px] font-extrabold" onClick={() => mutate(`/questions/${q.id}/answer`, { answer: o })}>{o}</button>)}
      </div>
    </div>
  );
}

function MyListing({ l }: { l: any }) {
  const days = Math.floor((Date.now() - l.last_confirmed_at) / 86400000);
  return (
    <div className={`card p-4 ${l.fresh !== 'fresh' ? 'bg-bg' : ''}`}>
      <Link to={`/listing/${l.id}`} className="flex gap-4 items-center">
        <Art photo={l.photo} kind={l.kind} className={`w-16 h-16 shrink-0 ${l.fresh !== 'fresh' ? 'faded' : ''}`} rounded="rounded-[16px]" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2"><span className="font-extrabold truncate">{l.title}</span><span className="display text-[15px]">{money(l.ask_cents)}</span></div>
          <div className="mt-1.5"><ListingChips l={l} /></div>
        </div>
      </Link>
      {(l.fresh !== 'fresh' || l.status === 'hidden') && l.kind !== 'service' && (
        <div className="mt-3 flex items-center gap-3">
          <p className="flex-1 text-[13px] font-bold text-ink-soft">{l.status === 'hidden' ? 'Hidden from buyers.' : `Fading: not confirmed in ${plural(days, 'day')}. Hides at 21.`}</p>
          <button className="btn-primary !min-h-[44px] !px-4 !text-[14px]" onClick={() => mutate(`/listings/${l.id}/confirm`)}>Still available</button>
        </div>
      )}
      {l.status === 'held' && <p className="mt-3 text-[13px] font-extrabold text-lilac-deep">Held by a buyer right now.</p>}
      {l.questions > 0 && <p className="mt-2 text-[13px] font-extrabold text-butter-deep">{plural(l.questions, 'buyer question')} waiting.</p>}
    </div>
  );
}
