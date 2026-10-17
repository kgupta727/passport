import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { mutate, useApi } from '../api';
import { useMe } from '../me';
import { Art, isPhoto } from '../components/Art';
import { Icon, KIND_ICON } from '../components/Icon';
import { Chip, Dots, ErrorNote, Ring, Sheet, Skeleton } from '../components/ui';
import { TrustChip } from '../components/Shell';
import { money, pct, plural, toneBg, ago } from '../format';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function Home() {
  const { me } = useMe();
  const { data, error } = useApi<any>('/home', { poll: 6000 });
  const [i, setI] = useState(0);
  const [notes, setNotes] = useState(false);

  return (
    <div>
      <header className="flex items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-[26px] leading-tight">{greeting()}, {me.name.split(' ')[0]}</h1>
          <div className="flex items-center gap-2 mt-2">
            <span className="flex items-center gap-1.5 text-[14px] font-extrabold text-ink-soft"><span className="w-2.5 h-2.5 rounded-full bg-sage-deep" />{me.tenant.short} verified</span>
            <TrustChip level={me.trust.level} />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button className="relative w-11 h-11 grid place-items-center rounded-full" aria-label="Notifications" onClick={() => { setNotes(true); if (data?.unread) mutate('/notifications/read'); }}>
            <Icon name="bell" />
            {data?.unread > 0 && <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-sell text-[11px] font-extrabold grid place-items-center">{data.unread}</span>}
          </button>
          <Link to="/me" className="w-11 h-11 rounded-full bg-sky text-sky-deep grid place-items-center font-extrabold md:hidden" aria-label="Profile">{me.handle[0].toUpperCase()}</Link>
        </div>
      </header>

      <section aria-label="Up next">
        <h2 className="label mb-3">Up next</h2>
        {!data ? (error ? <ErrorNote>{error}</ErrorNote> : <Skeleton h={300} />) : data.cards.length === 0 ? (
          <div className="rounded-[32px] bg-sage p-7">
            <h3 className="text-[22px]">You are all caught up</h3>
            <p className="font-bold mt-2">Nothing needs you right now. Add a need and Passport will watch for offers you can close.</p>
            <Link to="/needs/new" className="btn-primary w-full mt-5">Add a need</Link>
          </div>
        ) : (
          <>
            <motion.div drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.2}
              onDragEnd={(_, info) => { if (info.offset.x < -60) setI(Math.min(i + 1, data.cards.length - 1)); if (info.offset.x > 60) setI(Math.max(i - 1, 0)); }}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={i} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.18 }}>
                  <FocusCard card={data.cards[Math.min(i, data.cards.length - 1)]} />
                </motion.div>
              </AnimatePresence>
            </motion.div>
            <Dots count={data.cards.length} index={Math.min(i, data.cards.length - 1)} onPick={setI} />
          </>
        )}
      </section>

      {me.tenant.config.features.explore !== false && (
        <Link to="/explore" className="flex items-center gap-4 rounded-[28px] bg-lilac p-5 mt-2">
          <span className="w-12 h-12 rounded-full bg-surface grid place-items-center shrink-0 text-lilac-deep"><Icon name="pin" size={24} /></span>
          <div className="flex-1 min-w-0"><h3 className="text-[18px]">Explore deals near me</h3><p className="font-bold text-lilac-deep text-[14px]">A map of finds around you. Rare ones glow.</p></div>
          <Icon name="chevronRight" />
        </Link>
      )}

      {data && data.kit.count > 0 && (
        <Link to="/kit" className="block rounded-[28px] bg-surface border border-line p-5 mt-3">
          <div className="flex items-center gap-4">
            <Ring value={data.kit.sorted / data.kit.count} size={60}><span className="display text-[15px]">{data.kit.sorted}/{data.kit.count}</span></Ring>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[18px]">Course Kit</h3>
                <Icon name="chevronRight" className="text-ink-soft" />
              </div>
              <p className="font-bold text-ink-soft">{data.kit.sorted} of {data.kit.count} sorted, {money(data.kit.sorted_cents)} so far{data.kit.sorted < data.kit.count ? (data.kit.rest_cheapest_cents > 0 ? `. Cheapest for the rest: ${money(data.kit.rest_cheapest_cents)}` : '. The rest can be free') : ''}</p>
              <div className="h-2 rounded-full bg-line mt-2 overflow-hidden"><div className="h-full bg-sage-deep rounded-full transition-all" style={{ width: pct(data.kit.sorted / data.kit.count) }} /></div>
            </div>
          </div>
        </Link>
      )}
      {data && data.kit.count === 0 && (
        <Link to="/kit" className="flex items-center gap-4 rounded-[28px] bg-sky p-5 mt-2">
          <Icon name="kit" className="text-sky-deep" size={28} />
          <div className="flex-1"><h3 className="text-[18px]">Build your Course Kit</h3><p className="font-bold text-sky-deep">Add classes, see every book's cheapest legit option.</p></div>
          <Icon name="chevronRight" />
        </Link>
      )}

      <section className="mt-8" aria-label="Your needs">
        <div className="flex items-center justify-between mb-3">
          <h2 className="label">Your needs</h2>
          <Link to="/needs/new" className="btn-quiet text-[14px]">Add a need</Link>
        </div>
        <div className="card divide-y divide-line overflow-hidden">
          {data?.needs.filter((n: any) => !n.course_id).map((n: any) => <NeedRow key={n.id} n={n} />)}
          {data?.needs.filter((n: any) => n.course_id).length > 0 && (
            <div className="px-5 py-2 bg-bg/60 text-[13px] font-extrabold text-ink-soft">From your Course Kit</div>
          )}
          {data?.needs.filter((n: any) => n.course_id).map((n: any) => <NeedRow key={n.id} n={n} />)}
          <Link to="/needs/new" className="flex items-center gap-3 px-5 min-h-[60px] font-extrabold text-ink-soft">
            <span className="w-9 h-9 rounded-full border-2 border-dashed border-line grid place-items-center"><Icon name="plus" size={18} /></span>Add a need
          </Link>
        </div>
      </section>

      <Link to="/carriers" className="flex items-center gap-3 mt-6 px-2 text-ink-soft font-extrabold min-h-[44px]">
        <Icon name="car" size={20} />Cross-campus carrier board<Icon name="chevronRight" size={18} className="ml-auto" />
      </Link>

      <Sheet open={notes} onClose={() => setNotes(false)} title="Updates">
        {data?.notifications?.length ? (
          <div className="divide-y divide-line -mx-2">
            {data.notifications.map((n: any) => (
              <Link key={n.id} to={n.link} onClick={() => setNotes(false)} className="flex gap-3 px-2 py-3">
                <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.read ? 'bg-line' : 'bg-sell'}`} />
                <span className="flex-1 min-w-0"><span className="font-extrabold block">{n.title}</span><span className="text-ink-soft text-[14px] font-bold">{n.body}</span></span>
                <span className="text-[12px] text-ink-soft font-bold whitespace-nowrap">{ago(n.created_at)}</span>
              </Link>
            ))}
          </div>
        ) : <p className="text-ink-soft">Nothing yet.</p>}
      </Sheet>
    </div>
  );
}

function NeedRow({ n }: { n: any }) {
  const dot = n.status === 'sorted' ? 'bg-sage-deep' : n.status === 'in_trade' ? 'bg-lilac-deep' : 'bg-butter-deep';
  const sub = n.status === 'sorted' ? 'Sorted' : n.status === 'in_trade' ? 'In a trade' : n.ready ? `${plural(n.ready, 'offer')} ready now` : n.offers ? `Watching, ${plural(n.offers, 'offer')}` : 'Watching for offers';
  return (
    <Link to={n.trade_id ? `/trade/${n.trade_id}` : `/needs/${n.id}`} className="flex items-center gap-3 px-5 min-h-[64px] py-3">
      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} aria-hidden="true" />
      <Icon name={KIND_ICON[n.kind]} size={20} className="text-ink-soft shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="font-extrabold block truncate">{n.text}</span>
        <span className={`text-[13px] font-bold ${n.ready ? 'text-sage-deep' : 'text-ink-soft'}`}>{sub}</span>
      </span>
      <Icon name="chevronRight" size={18} className="text-ink-soft" />
    </Link>
  );
}

function FocusCard({ card }: { card: any }) {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(null);
    try { await fn(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (card.type === 'offer') {
    const o = card.offer, l = o.listing;
    return (
      <div className="rounded-[32px] bg-sky p-6 ready-glow">
        <div className="flex items-center gap-2 mb-4"><Chip tone="sage" icon="bolt">Ready now</Chip><span className="text-[13px] font-extrabold text-sky-deep truncate">for {card.need.text}</span></div>
        {isPhoto(l.photo) ? (
          <Link to={`/listing/${l.id}?need=${card.need.id}`} className="block">
            <Art photo={l.photo} kind={l.kind} alt={l.title} className="w-full aspect-[4/3] max-h-[260px]" rounded="rounded-[24px]" />
            <div className="flex items-start justify-between gap-3 mt-4">
              <h3 className="text-[21px] leading-tight min-w-0">{l.title}</h3>
              <div className="display text-[26px] whitespace-nowrap">{money(l.ask_cents)}</div>
            </div>
          </Link>
        ) : (
          <Link to={`/listing/${l.id}?need=${card.need.id}`} className="flex gap-4 items-center">
            <Art photo={l.photo} kind={l.kind} className="w-24 h-24 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-[21px] leading-tight">{l.title}</h3>
              <div className="display text-[26px] mt-1">{money(l.ask_cents)}</div>
            </div>
          </Link>
        )}
        <div className="flex flex-wrap gap-2 mt-4">
          <Chip tone="plain" icon="walk">{l.reach_label}</Chip>
          <Chip tone="plain" icon="check">Fit {pct(o.F)}</Chip>
          <Chip tone="plain" icon="shield">@{l.seller.handle}, trust {l.seller.trust_level}</Chip>
        </div>
        <p className="font-bold mt-3">{card.sentence}</p>
        <button className="btn-primary w-full mt-5" disabled={busy} onClick={() => go(async () => { const r = await mutate(`/listings/${l.id}/claim`, { need_id: card.need.id }); nav(`/trade/${r.trade_id}`); })}>
          Claim it, 30-minute hold
        </button>
        <ErrorNote>{err}</ErrorNote>
      </div>
    );
  }
  if (card.type === 'trade') {
    const quick = ['accept_ask', 'accept_offer', 'confirm_receipt'].includes(card.action.id);
    return (
      <div className={`rounded-[32px] ${toneBg[card.tone as 'sky']} p-6`}>
        <div className="flex items-center gap-2 mb-4"><Chip tone="ink" icon="trades">Trade, step {card.step + 1} of {card.steps.length}: {card.steps[card.step]}</Chip></div>
        <Link to={`/trade/${card.trade_id}`} className="flex gap-4 items-center">
          <Art photo={card.photo} kind={card.kind} className="w-20 h-20 shrink-0" />
          <h3 className="text-[21px] leading-tight min-w-0">{card.title}</h3>
        </Link>
        <p className="font-bold mt-4">{card.sentence}</p>
        <button className="btn-primary w-full mt-5" disabled={busy} onClick={() => quick ? go(async () => { await mutate(`/trades/${card.trade_id}/event`, { event: card.action.id }); }) : nav(`/trade/${card.trade_id}`)}>
          {card.action.label}
        </button>
        <ErrorNote>{err}</ErrorNote>
      </div>
    );
  }
  if (card.type === 'question') {
    return (
      <div className="rounded-[32px] bg-butter p-6">
        <div className="flex items-center gap-2 mb-4"><Chip tone="plain" icon="info">A buyer is checking fit</Chip></div>
        <div className="flex gap-4 items-center">
          <Art photo={card.photo} kind={card.kind} className="w-16 h-16 shrink-0" />
          <h3 className="text-[19px] leading-tight min-w-0">{card.title}</h3>
        </div>
        <p className="display text-[20px] mt-5">{card.question.prompt}</p>
        <p className="font-bold text-butter-deep text-[14px] mt-1">{card.sentence}</p>
        <div className="grid grid-cols-2 gap-2 mt-4">
          {card.question.options.map((o: string) => (
            <button key={o} className="tile t-ink min-h-[52px] font-extrabold" disabled={busy} onClick={() => go(async () => { await mutate(`/questions/${card.question.id}/answer`, { answer: o }); })}>{o}</button>
          ))}
        </div>
        <ErrorNote>{err}</ErrorNote>
      </div>
    );
  }
  if (card.type === 'kit') {
    return (
      <div className="rounded-[32px] bg-sage p-6">
        <Chip tone="plain" icon="kit">Course Kit</Chip>
        <h3 className="text-[22px] mt-4">{card.title}</h3>
        <p className="font-bold mt-2">{card.sentence}</p>
        <Link to="/kit" className="btn-primary w-full mt-5">Open Course Kit</Link>
      </div>
    );
  }
  if (card.type === 'relist') {
    return (
      <div className="rounded-[32px] bg-peach p-6">
        <Chip tone="plain" icon="refresh">Semester end</Chip>
        <div className="flex gap-4 items-center mt-4">
          <Art photo={card.photo} kind="textbook" className="w-16 h-16 shrink-0" />
          <h3 className="text-[21px] leading-tight">{card.title}</h3>
        </div>
        <p className="font-bold mt-3">{card.sentence}</p>
        <Link to={`/sell?from=${card.listing_id}`} className="btn-primary w-full mt-5">List it in one tap</Link>
      </div>
    );
  }
  return null;
}
