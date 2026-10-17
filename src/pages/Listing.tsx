import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { mutate, useApi } from '../api';
import { Art, isPhoto } from '../components/Art';
import { PhotoCarousel } from '../components/PhotoCarousel';
import { Icon, KIND_ICON } from '../components/Icon';
import { Chip, ConditionBar, Empty, ErrorNote, HowWeFigured, Provenance, Row, Skeleton, StampRow } from '../components/ui';
import { FitRows, ListingChips } from '../components/OfferCard';
import { AltOptions } from './Kit';
import { PriceHistory } from '../components/PriceHistory';
import { KIND_LABEL, money, pct, plural, ago, WEEKDAYS } from '../format';

const EVENT_LABEL: Record<string, string> = { listed: 'Listed', stamp: 'Verified handoff', price: 'Price changed', arena: 'Arena win', verified: 'Condition checked by buyer', confirmed: 'Seller re-confirmed', answer: 'Seller answered', owner: 'New owner' };

export function ListingPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const needId = params.get('need');
  const nav = useNavigate();
  const { data, error } = useApi<any>(`/listings/${id}${needId ? `?need=${needId}` : ''}`, { poll: 10000 });
  const [flipped, setFlipped] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (error) return <Empty icon="search" title="Listing not found" body={error} />;
  if (!data) return <div className="space-y-4"><Skeleton h={260} /><Skeleton h={200} /></div>;
  const l = data.listing;
  const physical = l.kind === 'item' || l.kind === 'textbook';
  const condFact = data.facts.find((f: any) => f.label === 'Condition');
  const canDuel = l.arena_on && physical && !l.is_mine;

  const claim = async (duel = false) => {
    setBusy(true); setErr(null);
    try {
      const r = await mutate(`/listings/${l.id}/claim`, { need_id: data.fit?.need.id ?? needId });
      nav(`/trade/${r.trade_id}${duel ? '?duel=1' : ''}`);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="pb-24 md:pb-0">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => nav(-1)} className="w-11 h-11 -ml-2 grid place-items-center rounded-full" aria-label="Back"><Icon name="chevronLeft" /></button>
        <Chip tone="plain" icon={KIND_ICON[l.kind]}>{KIND_LABEL[l.kind as keyof typeof KIND_LABEL]} passport</Chip>
      </div>

      {params.get('new') && (
        <div className="rounded-[24px] bg-sage p-4 mb-5 flex gap-3 items-center">
          <Icon name="check" className="text-sage-deep" />
          <p className="font-extrabold">Listed. You do nothing until someone claims it. We will ping you.</p>
        </div>
      )}

      {isPhoto(l.photos?.[0]) && <PhotoCarousel photos={l.photos} alt={l.title} className={`mb-4 ${l.fresh === 'fading' ? 'faded' : ''}`} />}
      <header className="flex gap-4 items-start mb-5">
        {!isPhoto(l.photos?.[0]) && <Art photo={l.photo} kind={l.kind} className={`w-28 h-28 md:w-36 md:h-36 shrink-0 ${l.fresh === 'fading' ? 'faded' : ''}`} />}
        <div className="min-w-0 flex-1">
          <h1 className="text-[23px] leading-tight">{l.title}</h1>
          {l.status === 'sold'
            ? <div className="display text-[22px] mt-1 text-ink-soft">Sold</div>
            : <div className="display text-[30px] mt-1">{money(l.ask_cents)}{l.kind === 'service' && <span className="text-[16px] text-ink-soft">/hour</span>}</div>}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {data.fit && <Chip tone={data.fit.F >= 0.8 ? 'sage' : data.fit.F >= 0.5 ? 'butter' : 'peach'} icon="check">Fit {pct(data.fit.F)}</Chip>}
            <ListingChips l={l} />
          </div>
        </div>
      </header>

      {l.fresh === 'fading' && (
        <div className="rounded-[20px] bg-butter p-4 mb-5 text-[14px] font-bold flex gap-2"><Icon name="clock" size={18} className="shrink-0" />Not re-confirmed in {plural(Math.floor((Date.now() - l.last_confirmed_at) / 86400000), 'day')}. It may be gone; it hides at 21 days.</div>
      )}

      <div style={{ perspective: 1200 }} className="mb-5">
        <motion.div animate={{ rotateY: flipped ? 180 : 0 }} transition={{ duration: 0.25 }} style={{ transformStyle: 'preserve-3d' }} className="relative">
          <section className="card p-5" style={{ backfaceVisibility: 'hidden' }} aria-hidden={flipped}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[18px]">Passport</h2>
              <button className="btn-secondary !min-h-[40px] !text-[14px]" onClick={() => setFlipped(true)}><Icon name="flip" size={16} />History and price</button>
            </div>
            {physical && condFact && <div className="mb-5"><ConditionBar value={l.condition} label={l.condition_label} verified={condFact.source === 'verified'} /></div>}
            {physical && <div className="mb-4"><StampRow count={l.stamps} /></div>}
            <div>
              {data.facts.filter((f: any) => f.label !== 'Condition').map((f: any) => (
                <div key={f.label} className="py-2.5 border-b border-line/80 last:border-0">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-ink-soft font-bold">{f.label}</span>
                    <span className="font-extrabold text-right">{f.value}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-0.5">
                    <Provenance verified={f.source === 'verified'} />
                    {f.note && <span className="text-[12px] text-ink-soft font-bold text-right">{f.note}</span>}
                  </div>
                </div>
              ))}
              {condFact?.note && <p className="text-[13px] text-ink-soft font-bold mt-2">{condFact.note}</p>}
            </div>
          </section>

          <section className="card p-5 absolute inset-0 overflow-y-auto" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }} aria-hidden={!flipped}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[18px]">History</h2>
              <button className="btn-secondary !min-h-[40px] !text-[14px]" onClick={() => setFlipped(false)}><Icon name="flip" size={16} />Passport</button>
            </div>
            <ol className="relative border-l-2 border-line ml-2 space-y-4">
              {data.history.map((h: any, i: number) => (
                <li key={i} className="ml-4">
                  <span className={`absolute -left-[7px] mt-1.5 w-3 h-3 rounded-full ${h.type === 'stamp' ? 'bg-lilac-deep' : h.type === 'arena' ? 'bg-peach-deep' : h.type === 'verified' ? 'bg-sage-deep' : 'bg-line'}`} />
                  <div className="font-extrabold">{EVENT_LABEL[h.type] ?? h.type}</div>
                  <div className="text-[13px] text-ink-soft font-bold">
                    {h.type === 'stamp' && `@${h.payload.from} to @${h.payload.to}, ${money(h.payload.cents)}, ${h.payload.where}`}
                    {h.type === 'listed' && `by @${h.payload.by} at ${money(h.payload.cents)}`}
                    {h.type === 'price' && `now ${money(h.payload.cents)}`}
                    {h.type === 'arena' && `Arena win at ${money(h.payload.cents)} by @${h.payload.winner}`}
                    {h.type === 'verified' && (h.payload.matched ? `@${h.payload.by}: matched the passport` : `@${h.payload.by}: did not match`)}
                    {h.type === 'answer' && `${h.payload.prompt} ${h.payload.answer}`}
                    {h.type === 'owner' && `@${h.payload.from} to @${h.payload.to}`}
                    {h.type === 'confirmed' && `still available`}
                    {' '}<span className="opacity-70">{ago(h.at)}</span>
                  </div>
                </li>
              ))}
            </ol>
            {data.price && (
              <div className="mt-5 bg-bg rounded-[18px] p-4">
                <p className="label mb-1">Fair price</p>
                <p className="display text-[26px]">{money(data.price.S_cents)}</p>
                <p className="font-bold mb-3">{priceVerdict(data.price.ask_cents, data.price.S_cents)}</p>
                {!l.is_mine && (data.my_trade_id
                  ? <Link to={`/trade/${data.my_trade_id}`} className="btn-primary w-full">Open your trade</Link>
                  : l.status === 'active' && <button className="btn-primary w-full" disabled={busy} onClick={() => claim()}><Icon name="lock" size={20} />Claim at {money(l.ask_cents)}</button>)}
                <HowWeFigured>
                  <p className="display text-[15px]">S = B x C x (1 + L) = {money(data.price.B_cents)} x {data.price.C} x {(1 + data.price.L).toFixed(2)} = {money(data.price.S_cents)}</p>
                  <p><b>S</b> is the fair price we suggest.</p>
                  <p><b>B</b> = {money(data.price.B_cents)}, the middle price of the last {plural(data.price.n, 'completed sale')} of this {l.kind === 'textbook' ? 'book' : 'kind of item'} on campus.</p>
                  <p><b>C</b> = {data.price.C}, for condition: Good 1.0, Worn 0.7, Damaged 0.4.</p>
                  <p><b>L</b> = {data.price.L.toFixed(2)}, a bonus of 0.05 for each verified handoff stamp ({plural(data.price.stamps, 'stamp')}), up to 0.25.</p>
                </HowWeFigured>
              </div>
            )}
          </section>
        </motion.div>
      </div>

      {data.fit && (
        <section className="card p-5 mb-5">
          <div className="flex items-center justify-between gap-3 mb-1">
            <h2 className="text-[18px]">Fit Check</h2>
            <span className="text-[13px] font-extrabold text-ink-soft truncate">for {data.fit.need.text}</span>
          </div>
          <p className="display text-[26px]">{pct(data.fit.F)} fit</p>
          <p className="font-bold mb-3">{data.fit.explanation}</p>
          <FitRows rows={data.fit.rows} plain />
          <Link to={`/needs/${data.fit.need.id}`} className="btn-secondary w-full mt-4">Change what you need</Link>
          <HowWeFigured>
            <p className="display text-[15px]">F = sum(w x m) / sum(w) = {data.fit.F.toFixed(2)}</p>
            {data.fit.rows.map((r: any) => (
              <p key={r.key + r.label}>{r.label}: m = {r.status === 'met' ? 1 : r.status === 'miss' ? 0 : 0.5}, w = {r.weight}</p>
            ))}
            <p><b>F</b> is the fit: how much of your list this matches, from 0 to 1.</p>
            <p><b>w</b> is a weight: 3 for a must-have, 1 for a nice-to-have.</p>
            <p><b>m</b> is the match: 1 if it has it, 0.5 if the seller has not said yet, 0 if it does not.</p>
            <p className="display text-[15px] pt-2">Odds = F x R x T = {data.fit.F.toFixed(2)} x {data.fit.R.toFixed(2)} x {data.fit.T.toFixed(2)} = {data.fit.score.toFixed(2)}</p>
            <p><b>R</b> is reach: 1 / (1 + minutes / 10), where minutes is your walk to the meeting spot ({plural(data.reach.minutes, 'minute')}).</p>
            <p><b>T</b> is reliability: the share of booked trades this seller completed. New sellers count as at least 0.5.</p>
            <p>Odds above 0.40 on your own campus show as "Ready now".</p>
          </HowWeFigured>
        </section>
      )}

      {physical && l.status !== 'sold' && <PriceHistory listingId={l.id} />}

      {data.questions.some((q: any) => q.answer) && (
        <section className="card p-5 mb-5">
          <h2 className="text-[18px] mb-2">Seller answers</h2>
          {data.questions.filter((q: any) => q.answer).map((q: any) => <Row key={q.id} label={q.prompt} value={q.answer} />)}
        </section>
      )}

      <section className="card p-5 mb-5">
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 rounded-full bg-sky text-sky-deep grid place-items-center font-extrabold text-[18px]">{data.seller.handle[0].toUpperCase()}</span>
          <div className="flex-1">
            <div className="font-extrabold">@{data.seller.handle}</div>
            <div className="text-[13px] text-ink-soft font-bold">{data.seller.tenant} verified, {plural(data.seller.handoffs, 'verified handoff')}</div>
          </div>
          <Chip tone="lilac" icon="shield">Trust {data.seller.trust.level}</Chip>
        </div>
        <div className="mt-3 text-[14px] font-bold text-ink-soft">
          Closes {data.seller.reliability.claimed ? `${data.seller.reliability.completed} of ${plural(data.seller.reliability.claimed, 'booked trade')}` : 'no trades yet'}{data.seller.reliability.claimed < 3 ? ' (new seller, counted as 0.5)' : ''}.
        </div>
        {data.tutor && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-[18px] bg-lilac p-3"><div className="display text-[22px]">{data.tutor.sessions}</div><div className="text-[13px] font-bold text-lilac-deep">{data.tutor.sessions === 1 ? 'session' : 'sessions'} completed</div></div>
            <div className="rounded-[18px] bg-butter p-3"><div className="display text-[22px]">{data.tutor.rating ?? 'New'}</div><div className="text-[13px] font-bold text-butter-deep">{data.tutor.ratings ? `from ${plural(data.tutor.ratings, 'verified session')}` : 'no ratings yet'}</div></div>
          </div>
        )}
        {l.kind === 'service' && l.details.bio && <p className="mt-3 font-bold">{l.details.bio}</p>}
      </section>

      {l.kind === 'service' && (
        <section className="card p-5 mb-5">
          <h2 className="text-[18px] mb-2">Open hours</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries((l.details.availability ?? []).reduce((a: any, w: any) => ((a[w.weekday] ??= []).push(w.hour), a), {})).map(([d, hs]: any) => (
              <Chip key={d} tone="lilac">{WEEKDAYS[d]} {Math.min(...hs) % 12 || 12}{Math.min(...hs) < 12 ? 'am' : 'pm'} to {(Math.max(...hs) + 1) % 12 || 12}{Math.max(...hs) + 1 < 12 ? 'am' : 'pm'}</Chip>
            ))}
          </div>
        </section>
      )}

      {data.meet && !l.is_mine && (
        <section className="card p-5 mb-5">
          <h2 className="text-[18px] mb-1">Where you would meet</h2>
          <p className="text-[14px] text-ink-soft font-bold mb-3">The safe zone where the longer of your two walks is shortest.</p>
          {data.meet.options.map((o: any, i: number) => (
            <div key={o.zone} className={`flex items-center gap-3 py-2 ${i === 0 ? '' : 'opacity-70'}`}>
              <Icon name="pin" size={18} className={i === 0 ? 'text-sage-deep' : 'text-ink-soft'} />
              <span className="flex-1 font-extrabold">{o.name}</span>
              <span className="text-[13px] font-bold text-ink-soft">you {o.b}, them {o.s}</span>
              <span className={`text-[13px] font-extrabold w-16 text-right ${i === 0 ? 'text-sage-deep' : ''}`}>max {o.worst}</span>
            </div>
          ))}
        </section>
      )}

      {l.cross && l.carrier && (
        <section className="rounded-[28px] bg-butter p-5 mb-5">
          <h2 className="text-[18px] flex items-center gap-2"><Icon name="car" />Needs a carrier</h2>
          <p className="font-bold mt-1">{l.carrier.label}.{l.carrier.tip_cents ? ` Carrier tip ${money(l.carrier.tip_cents)}, paid with the item.` : ''}</p>
          <Link to="/carriers" className="btn-quiet !px-0 text-[14px] !text-butter-deep">See the carrier board</Link>
        </section>
      )}

      {l.notes_for_buyer && (
        <section className="card p-5 mb-5"><p className="label mb-1">Notes from the seller</p><p className="font-bold">{l.notes_for_buyer}</p></section>
      )}

      {data.alternatives?.length > 0 && !l.is_mine && (
        <section className="mb-5">
          <h2 className="label mb-3">Other legit ways to get this book</h2>
          <AltOptions options={data.alternatives} />
        </section>
      )}

      <div className="fixed md:static left-0 right-0 bottom-[86px] z-30 px-4 md:px-0 pb-2 md:pb-0 bg-gradient-to-t from-bg via-bg/90 to-transparent md:bg-none pt-6 md:pt-0">
        <div className="max-w-[560px] mx-auto">
          <ErrorNote>{err}</ErrorNote>
          {l.is_mine ? <SellerControls l={l} /> : data.my_trade_id ? (
            <Link to={`/trade/${data.my_trade_id}`} className="btn-primary w-full">Open your trade</Link>
          ) : l.status !== 'active' ? (
            <button className="btn-primary w-full" disabled>{l.status === 'held' ? 'Someone is holding this' : 'No longer available'}</button>
          ) : (
            <div className={canDuel ? 'grid grid-cols-2 gap-3' : ''}>
              <button className="btn-primary w-full" disabled={busy} onClick={() => claim()}>
                <Icon name="lock" size={20} />{l.kind === 'service' ? 'Book a session' : canDuel ? `Claim at ${money(l.ask_cents)}` : 'Claim, 30-minute hold'}
              </button>
              {canDuel && <button className="btn-secondary w-full !bg-peach !border-peach" disabled={busy} onClick={() => claim(true)}><Icon name="hand" size={20} />Duel for the price</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SellerControls({ l }: { l: any }) {
  const nav = useNavigate();
  return (
    <div className="grid grid-cols-2 gap-3">
      <button className="btn-primary !min-h-[52px]" onClick={() => mutate(`/listings/${l.id}/confirm`)}>{l.fresh === 'fading' ? 'Still available' : 'Re-confirm'}</button>
      <button className="btn-secondary !min-h-[52px]" disabled={l.status === 'held'} onClick={async () => { await mutate(`/listings/${l.id}/withdraw`); nav('/trades'); }}>Take it down</button>
    </div>
  );
}

function priceVerdict(ask: number, fair: number) {
  const diff = ask - fair;
  if (Math.abs(diff) <= Math.max(100, fair * 0.03)) return `Asking ${money(ask)}, right at the fair price.`;
  return diff < 0 ? `Asking ${money(ask)}, ${money(-diff)} under the fair price.` : `Asking ${money(ask)}, ${money(diff)} over the fair price.`;
}
