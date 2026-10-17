import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api, mutate, uploadImage, useApi } from '../api';
import { Icon, IconName, KIND_ICON } from './Icon';
import { Art } from './Art';
import { Chip, ErrorNote, Row, Sheet, Skeleton, Stepper } from './ui';
import { KIND_LABEL, money, toneBg, Tone, when, ago } from '../format';

export function StampBurst({ show, text, sub, tone = 'lilac', onDone }: { show: boolean; text: string; sub?: string; tone?: Tone; onDone?: () => void }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.button type="button" onClick={onDone} className="absolute inset-0 z-10 grid place-items-center bg-surface/70 rounded-[32px]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} aria-label="Dismiss">
          <motion.div initial={{ scale: 1.9, rotate: -24, opacity: 0 }} animate={{ scale: 1, rotate: -10, opacity: 1 }} transition={{ duration: 0.25, ease: 'easeOut' }}
            className={`px-7 py-4 rounded-[20px] border-[5px] ${tone === 'sage' ? 'border-sage-deep text-sage-deep' : tone === 'peach' ? 'border-peach-deep text-peach-deep' : 'border-lilac-deep text-lilac-deep'} bg-surface text-center`}>
            <div className="display text-[30px] uppercase tracking-wider leading-none">{text}</div>
            {sub && <div className="font-extrabold mt-1 text-[14px]">{sub}</div>}
          </motion.div>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

export function TradeFocus({ tradeId, compact }: { tradeId: string; compact?: boolean }) {
  const { data } = useApi<any>(`/trades/${tradeId}`, { poll: 3000 });
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [sheet, setSheet] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stamp, setStamp] = useState(false);
  const prev = useRef<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const s = data.trade.state;
    if (prev.current && prev.current !== s && s === 'COMPLETE') setStamp(true);
    prev.current = s;
  }, [data?.trade.state]);

  useEffect(() => {
    if (!compact && params.get('stamped') && data?.trade.state === 'COMPLETE') {
      setStamp(true);
      params.delete('stamped');
      setParams(params, { replace: true });
    }
    if (!compact && params.get('duel') && data?.trade.state === 'HELD') {
      setSheet('duel');
      params.delete('duel');
      setParams(params, { replace: true });
    }
  }, [data?.trade.state]);

  if (!data) return <Skeleton h={compact ? 300 : 420} />;
  const { trade, view, listing, counterpart, role } = data;

  const send = async (event: string, payload: any = {}) => {
    setBusy(true);
    setErr(null);
    try {
      await mutate(`/trades/${trade.id}/event`, { event, payload });
      setSheet(null);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const run = async (id: string) => {
    setErr(null);
    switch (id) {
      case 'accept_ask': case 'accept_offer': case 'decline_offer': case 'confirm_receipt':
        return send(id);
      case 'book':
        return send('book', { slot_key: data.slot_options[0]?.key });
      case 'scan':
        return nav(`/trade/${trade.id}/scan`);
      case 'checkin_tap':
        setBusy(true);
        try { await mutate(`/trades/${trade.id}/checkin`); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
        return;
      case 'open_video':
        return window.open(data.slot?.video_url || 'about:blank', '_blank', 'noopener');
      case 'change_slot': return setSheet('slot');
      default: return setSheet(id);
    }
  };

  const tone = view.tone as Tone;
  const actionIcon: Record<string, IconName> = { scan: 'qr', book: 'calendar', duel: 'hand', accept_ask: 'check', accept_offer: 'check', confirm_receipt: 'check', transfer_sent: 'upload', checkin_tap: 'check', verify: 'shield', rate: 'star', reason: 'flag' };

  return (
    <div>
      <div className={compact ? 'mb-4' : 'mb-5'}><Stepper steps={view.steps} current={view.step} failed={view.failed} /></div>

      <div className={`relative rounded-[32px] ${toneBg[tone]} ${compact ? 'p-5' : 'p-6'}`}>
        <StampBurst show={stamp} text="Stamped" sub={trade.pay_mode === 'reservation' ? (role === 'buyer' ? 'Handoff verified' : `Sold for ${money(trade.price_cents)}`) : role === 'buyer' ? 'Escrow released' : `Paid ${money(trade.price_cents)}`} onDone={() => setStamp(false)} />
        <div className="flex gap-4 items-center">
          <Link to={`/listing/${listing.id}`} className="shrink-0"><Art photo={listing.photo} kind={listing.kind} className={compact ? 'w-14 h-14' : 'w-[72px] h-[72px]'} rounded="rounded-[18px]" /></Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Chip tone="plain" icon={KIND_ICON[listing.kind]}>{KIND_LABEL[listing.kind as keyof typeof KIND_LABEL]}</Chip>
              <span className="text-[13px] font-extrabold text-ink-soft">{role === 'buyer' ? 'Buying' : role === 'seller' ? 'Selling' : role === 'carrier' ? 'Carrying' : 'Admin view'}</span>
            </div>
            <h2 className={`${compact ? 'text-[18px]' : 'text-[21px]'} leading-tight`}>{view.title}</h2>
          </div>
        </div>
        <p className={`mt-4 ${compact ? 'text-[15px]' : 'text-[17px]'} font-bold leading-snug`}>{view.sentence}</p>
        {view.facts.length > 0 && (
          <div className="mt-3 bg-surface/70 rounded-[20px] px-4 py-1">
            {view.facts.map((f: any) => <Row key={f.label} label={f.label} value={f.value} />)}
          </div>
        )}

        <div className="mt-5">
          {view.action && view.waiting && <WaitingLine text={view.waiting} />}
          {view.action ? (
            <button className="btn-primary w-full" disabled={busy || role === 'admin'} onClick={() => run(view.action.id)}>
              {actionIcon[view.action.id] && <Icon name={actionIcon[view.action.id]} size={20} stroke={2.4} />}
              {busy ? 'Working...' : view.action.label}
            </button>
          ) : (
            view.waiting && <WaitingLine text={view.waiting} big />
          )}
          <ErrorNote>{err}</ErrorNote>
        </div>

        {view.secondary.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-x-4">
            {view.secondary.map((s: any) => <button key={s.id} className={s.id === 'duel' ? 'btn-secondary !bg-peach !border-peach !min-h-[44px] !text-[14px] w-full mb-1' : 'btn-quiet text-[14px]'} onClick={() => run(s.id)} disabled={role === 'admin'}>{s.id === 'duel' && <Icon name="hand" size={18} />}{s.id === 'duel' ? 'Price Duel: play for the price' : s.label}</button>)}
          </div>
        )}
      </div>

      <p className="mt-3 px-2 text-[13px] text-ink-soft font-bold flex gap-2 items-start"><Icon name="shield" size={16} className="shrink-0 mt-px" />{view.safety}</p>
      <div className="mt-1 px-2 flex items-center justify-between">
        {counterpart && role !== 'admin' && (
          <button className="btn-quiet text-[14px] !px-0" onClick={() => setSheet('chat')}>
            Message @{counterpart.handle}{data.messages ? ` (${data.messages})` : ''}
          </button>
        )}
        {compact && <Link to={`/trade/${trade.id}`} className="btn-quiet text-[14px] !px-0">Open trade</Link>}
      </div>

      <OfferSheet open={sheet === 'offer'} onClose={() => setSheet(null)} ask={listing.ask_cents} busy={busy} err={err} onSubmit={(c) => send('offer', { cents: c })} />
      <SlotSheet open={sheet === 'slot'} onClose={() => setSheet(null)} data={data} busy={busy} err={err} onSubmit={(slot_key, safe_zone) => send('book', { slot_key, safe_zone })} />
      <TransferSheet open={sheet === 'transfer_sent'} onClose={() => setSheet(null)} busy={busy} err={err} onSubmit={(proof) => send('transfer_sent', { proof })} />
      <ReasonSheet open={sheet === 'reason'} onClose={() => setSheet(null)} tradeId={trade.id} reasons={data.reasons} />
      <VerifySheet open={sheet === 'verify'} onClose={() => setSheet(null)} tradeId={trade.id} onProblem={() => setSheet('problem')} />
      <RateSheet open={sheet === 'rate'} onClose={() => setSheet(null)} tradeId={trade.id} handle={counterpart?.handle} />
      <ProblemSheet open={sheet === 'problem'} onClose={() => setSheet(null)} busy={busy} err={err} onSubmit={(reason) => send('problem', { reason })} />
      <CancelSheet open={sheet === 'cancel'} onClose={() => setSheet(null)} data={data} busy={busy} err={err} onSubmit={() => send('cancel')} />
      <ChatSheet open={sheet === 'chat'} onClose={() => setSheet(null)} tradeId={trade.id} handle={counterpart?.handle} archived={view.chat_archived} />
      <Sheet open={sheet === 'duel'} onClose={() => setSheet(null)} title="Price Duel">
        {sheet === 'duel' && <Duel tradeId={trade.id} onDone={() => setSheet(null)} />}
      </Sheet>
    </div>
  );
}

function WaitingLine({ text, big }: { text: string; big?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${big ? 'bg-surface/80 rounded-[20px] px-4 py-4' : 'mb-3 px-1'}`}>
      <span className={`grid place-items-center rounded-full shrink-0 bg-butter text-butter-deep ${big ? 'w-10 h-10' : 'w-7 h-7'}`}><Icon name="clock" size={big ? 20 : 15} /></span>
      <span className={`font-extrabold ${big ? 'text-[15px]' : 'text-[14px] text-ink-soft'}`}>{text}</span>
    </div>
  );
}

/* ---------- Sheets ---------- */

function OfferSheet({ open, onClose, ask, busy, err, onSubmit }: { open: boolean; onClose: () => void; ask: number; busy: boolean; err: string | null; onSubmit: (c: number) => void }) {
  const [v, setV] = useState('');
  useEffect(() => { if (open) setV(String(Math.round((ask * 0.9) / 100))); }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title="Make an offer">
      <p className="text-ink-soft mb-4">Asking {money(ask)}. If your offer is at or above the seller's private floor it is accepted instantly. Otherwise they get one tap to accept.</p>
      <label className="label" htmlFor="offer">Your offer</label>
      <div className="relative mt-2">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 font-extrabold text-ink-soft">$</span>
        <input id="offer" className="input !pl-8 display !text-[22px]" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value.replace(/[^0-9.]/g, ''))} />
      </div>
      <ErrorNote>{err}</ErrorNote>
      <button className="btn-primary w-full mt-5" disabled={busy || !(Number(v) > 0)} onClick={() => onSubmit(Math.round(Number(v) * 100))}>Send offer</button>
    </Sheet>
  );
}

function SlotSheet({ open, onClose, data, busy, err, onSubmit }: { open: boolean; onClose: () => void; data: any; busy: boolean; err: string | null; onSubmit: (k: string, z?: string) => void }) {
  const opts: any[] = data.slot_options ?? [];
  const [key, setKey] = useState<string>('');
  const [zone, setZone] = useState<string>('');
  useEffect(() => { if (open) { setKey(opts[0]?.key ?? ''); setZone(opts[0]?.safe_zone ?? ''); } }, [open]);
  const sel = opts.find((o) => o.key === key);
  const canPickZone = sel && sel.mode === 'in_person' && !data.trade.cross_campus;
  return (
    <Sheet open={open} onClose={onClose} title="Pick a time and place">
      <p className="label mb-2">When</p>
      <div className="grid gap-2 mb-5">
        {opts.map((o) => (
          <button key={o.key} data-on={key === o.key} onClick={() => setKey(o.key)} className="tile t-sky text-left px-4 py-3 min-h-[56px]">
            <div className="font-extrabold">{when(o.starts_at, data.server_now)}</div>
            <div className="text-[13px] text-ink-soft font-bold">{o.mode === 'video' ? 'Campus video link' : o.carrier ? `Carried by @${o.carrier}, ${money(o.tip_cents)} tip` : `${o.zone_name}: ${o.b} min for you, ${o.s} for them`}</div>
          </button>
        ))}
      </div>
      {canPickZone && (
        <>
          <p className="label mb-2">Safe zone</p>
          <div className="grid grid-cols-2 gap-2 mb-2">
            {data.safe_zones.map((z: any) => (
              <button key={z.id} data-on={zone === z.id} onClick={() => setZone(z.id)} className="tile t-sage px-3 py-3 text-[14px] font-extrabold min-h-[52px]">
                {z.name}{z.id === sel.safe_zone && <div className="text-[12px] text-sage-deep">Fairest for both</div>}
              </button>
            ))}
          </div>
        </>
      )}
      <ErrorNote>{err}</ErrorNote>
      <button className="btn-primary w-full mt-4" disabled={busy || !key} onClick={() => onSubmit(key, canPickZone ? zone : undefined)}>{sel?.pay_mode === 'reservation' ? `Reserve, pay ${money(data.trade.price_cents + (sel?.tip_cents ?? 0))} in person` : `Book and fund escrow ${money(data.trade.price_cents + (sel?.tip_cents ?? 0))}`}</button>
      {sel?.pay_mode === 'reservation' && <p className="text-[13px] text-ink-soft font-bold mt-3">No money moves through Passport. You pay at the safe zone after checking it, and the two scans complete the trade.</p>}
    </Sheet>
  );
}

function TransferSheet({ open, onClose, busy, err, onSubmit }: { open: boolean; onClose: () => void; busy: boolean; err: string | null; onSubmit: (proof: string | null) => void }) {
  const [proof, setProof] = useState<string | null>(null);
  const [up, setUp] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title="Send the ticket">
      <ol className="space-y-2 mb-4 text-[15px] font-bold">
        <li className="flex gap-3"><span className="w-6 h-6 rounded-full bg-butter text-butter-deep grid place-items-center text-[13px] shrink-0">1</span>Open your ticketing app and transfer to the buyer's email.</li>
        <li className="flex gap-3"><span className="w-6 h-6 rounded-full bg-butter text-butter-deep grid place-items-center text-[13px] shrink-0">2</span>Screenshot the "transfer sent" confirmation and upload it here.</li>
      </ol>
      <label className="tile flex items-center justify-center gap-2 min-h-[64px] font-extrabold cursor-pointer">
        <Icon name="upload" />{up ? 'Uploading...' : proof ? 'Proof attached' : 'Upload transfer proof'}
        <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setUp(true); try { setProof(await uploadImage(f)); } finally { setUp(false); } }} />
      </label>
      {proof && <img src={proof} alt="Transfer proof" className="mt-3 rounded-[16px] max-h-48 mx-auto" />}
      <p className="text-[13px] text-ink-soft font-bold mt-3">Escrow releases when the buyer confirms, or automatically 24 hours after your proof if they stay silent.</p>
      <ErrorNote>{err}</ErrorNote>
      <button className="btn-primary w-full mt-4" disabled={busy || up} onClick={() => onSubmit(proof)}>I sent the ticket</button>
    </Sheet>
  );
}

function ReasonSheet({ open, onClose, tradeId, reasons }: { open: boolean; onClose: () => void; tradeId: string; reasons: Record<string, string> }) {
  const [done, setDone] = useState(false);
  const icons: Record<string, IconName> = { too_far: 'walk', wrong_edition: 'book', price: 'ticket', seller_slow: 'clock' };
  const pick = async (r: string) => { await mutate(`/trades/${tradeId}/reason`, { reason: r }); setDone(true); };
  return (
    <Sheet open={open} onClose={() => { setDone(false); onClose(); }} title={done ? 'Matching updated' : 'What got in the way?'}>
      {done ? (
        <>
          <p className="text-ink-soft mb-5">Your need now filters for that, and we will tell you as soon as a better match shows up.</p>
          <button className="btn-primary w-full" onClick={() => { setDone(false); onClose(); }}>Done</button>
        </>
      ) : (
        <>
          <p className="text-ink-soft mb-4">One tap. It stays private and tunes your next matches.</p>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(reasons).map(([k, label]) => (
              <button key={k} onClick={() => pick(k)} className="tile min-h-[88px] flex flex-col items-center justify-center gap-2 font-extrabold capitalize">
                <Icon name={icons[k] ?? 'flag'} size={24} />{label}
              </button>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

function VerifySheet({ open, onClose, tradeId, onProblem }: { open: boolean; onClose: () => void; tradeId: string; onProblem: () => void }) {
  const answer = async (matched: boolean) => {
    await mutate(`/trades/${tradeId}/verify`, { matched });
    if (matched) onClose(); else onProblem();
  };
  return (
    <Sheet open={open} onClose={onClose} title="Did it match the passport?">
      <p className="text-ink-soft mb-5">Your answer turns "seller says" into "verified" for the next owner.</p>
      <div className="grid grid-cols-2 gap-3">
        <button className="tile t-sage min-h-[64px] font-extrabold" onClick={() => answer(true)}>Yes, as described</button>
        <button className="tile min-h-[64px] font-extrabold" onClick={() => answer(false)}>Not really</button>
      </div>
    </Sheet>
  );
}

function RateSheet({ open, onClose, tradeId, handle }: { open: boolean; onClose: () => void; tradeId: string; handle?: string }) {
  const [stars, setStars] = useState(5);
  return (
    <Sheet open={open} onClose={onClose} title={`Rate @${handle}`}>
      <p className="text-ink-soft mb-4">Tutor ratings only come from completed, verified sessions like this one.</p>
      <div className="flex justify-center gap-2 mb-6">
        {[1, 2, 3, 4, 5].map((s) => (
          <button key={s} aria-label={`${s} stars`} onClick={() => setStars(s)} className={`w-12 h-12 grid place-items-center rounded-full ${s <= stars ? 'text-butter-deep bg-butter' : 'text-ink-soft bg-bg'}`}><Icon name="star" /></button>
        ))}
      </div>
      <button className="btn-primary w-full" onClick={async () => { await mutate(`/trades/${tradeId}/rate`, { stars }); onClose(); }}>Submit rating</button>
    </Sheet>
  );
}

function ProblemSheet({ open, onClose, busy, err, onSubmit }: { open: boolean; onClose: () => void; busy: boolean; err: string | null; onSubmit: (r: string) => void }) {
  const [r, setR] = useState('');
  return (
    <Sheet open={open} onClose={onClose} title="Report a problem">
      <p className="text-ink-soft mb-4">A campus admin reviews the dual-scan record, the passport and this note. Any money Passport holds stays frozen until then.</p>
      <textarea className="input" placeholder="What was different from the passport?" value={r} onChange={(e) => setR(e.target.value)} maxLength={300} />
      <ErrorNote>{err}</ErrorNote>
      <button className="btn-primary w-full mt-4" disabled={busy || r.trim().length < 5} onClick={() => onSubmit(r)}>Open a dispute</button>
    </Sheet>
  );
}

function CancelSheet({ open, onClose, data, busy, err, onSubmit }: { open: boolean; onClose: () => void; data: any; busy: boolean; err: string | null; onSubmit: () => void }) {
  const t = data.trade;
  const late = t.state === 'BOOKED' && data.slot && data.slot.starts_at - data.server_now < 2 * 3600_000;
  return (
    <Sheet open={open} onClose={onClose} title={t.state === 'HELD' && data.role === 'buyer' ? 'Release the hold?' : 'Cancel this trade?'}>
      <p className="text-ink-soft mb-5">
        {t.state !== 'BOOKED' ? 'No penalty: nothing is booked yet. The listing opens back up.' : late ? 'The handoff is less than 2 hours away, so cancelling now costs a small trust penalty. The buyer is refunded.' : 'No penalty: the slot is more than 2 hours away. The buyer is refunded in full.'}
      </p>
      <ErrorNote>{err}</ErrorNote>
      <div className="grid grid-cols-2 gap-3">
        <button className="btn-secondary" onClick={onClose}>Keep it</button>
        <button className="btn-primary !min-h-[46px]" disabled={busy} onClick={onSubmit}>{late ? 'Cancel anyway' : 'Yes, cancel'}</button>
      </div>
    </Sheet>
  );
}

function ChatSheet({ open, onClose, tradeId, handle, archived }: { open: boolean; onClose: () => void; tradeId: string; handle?: string; archived: boolean }) {
  const { data } = useApi<any>(open ? `/trades/${tradeId}/messages` : null, { poll: 3000 });
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [data?.messages?.length]);
  const sendMsg = async () => {
    setErr(null);
    try { await mutate(`/trades/${tradeId}/messages`, { body }); setBody(''); } catch (e: any) { setErr(e.message); }
  };
  return (
    <Sheet open={open} onClose={onClose} title={`Message @${handle}`}>
      <p className="text-[13px] text-ink-soft font-bold mb-3">A fallback only: buttons move the trade, not messages. Text only, no links or images. Archived 7 days after the trade ends.</p>
      <div className="bg-bg rounded-[20px] p-3 h-[280px] overflow-y-auto space-y-2">
        {(data?.archived || archived) && <p className="text-center text-ink-soft font-bold py-10">This chat was archived.</p>}
        {data?.messages?.length === 0 && <p className="text-center text-ink-soft font-bold py-10">No messages. Most trades finish without one.</p>}
        {data?.messages?.map((m: any) => (
          <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-[18px] px-3.5 py-2 ${m.mine ? 'bg-ink text-white' : 'bg-surface border border-line'}`}>
              <div className={m.reported ? 'italic opacity-60' : ''}>{m.body}</div>
              <div className={`text-[11px] mt-0.5 flex gap-2 ${m.mine ? 'text-white/60' : 'text-ink-soft'}`}>
                {ago(m.at)}
                {!m.mine && !m.reported && <button className="underline" onClick={() => mutate(`/messages/${m.id}/report`)}>Report</button>}
              </div>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      {!archived && (
        <form className="flex gap-2 mt-3" onSubmit={(e) => { e.preventDefault(); if (body.trim()) sendMsg(); }}>
          <input className="input flex-1" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type a message" maxLength={400} aria-label="Message" />
          <button className="btn-secondary !min-h-[50px]" disabled={!body.trim()}>Send</button>
        </form>
      )}
      <ErrorNote>{err}</ErrorNote>
    </Sheet>
  );
}

/* ---------- Price Duel ---------- */

const MOVES: { id: string; label: string; icon: IconName; tone: string }[] = [
  { id: 'rock', label: 'Rock', icon: 'rock', tone: 't-peach' },
  { id: 'paper', label: 'Paper', icon: 'paper', tone: 't-sky' },
  { id: 'scissors', label: 'Scissors', icon: 'scissors', tone: 't-lilac' },
];

export function Duel({ tradeId, onDone }: { tradeId: string; onDone: () => void }) {
  const [m, setM] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState(Date.now());
  const [tick, setTick] = useState(0);
  const [price, setPrice] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [stakes, setStakes] = useState<[number, number] | null>(null);

  useEffect(() => {
    let alive = true;
    api(`/trades/${tradeId}/duel`, { body: {} }).then((d) => { if (alive) { setM(d); setFetchedAt(Date.now()); } }).catch((e) => setErr(e.message));
    return () => { alive = false; };
  }, [tradeId]);

  useEffect(() => {
    if (!m || m.state === 'priced') return;
    const t = setInterval(async () => {
      try {
        const d = await api(`/duels/${m.id}`);
        setM(d);
        setFetchedAt(Date.now());
      } catch { /* keep last view */ }
    }, 1000);
    return () => clearInterval(t);
  }, [m?.id, m?.state]);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (m?.state === 'resolved' || (m?.state === 'priced' && m.winner_is_me != null && m.history.length)) setShowResult(true);
  }, [m?.state]);
  useEffect(() => {
    if (m?.state === 'proposed' && stakes == null) setStakes([m.stake_buyer, m.stake_seller]);
  }, [m?.state]);

  if (err) return <ErrorNote>{err}</ErrorNote>;
  if (!m) return <Skeleton h={260} />;

  const left = m.deadline ? Math.max(0, Math.ceil((m.deadline - m.server_now - (Date.now() - fetchedAt)) / 1000)) : null;
  void tick;
  const play = async (move: string) => {
    try { setM(await api(`/duels/${m.id}/move`, { body: { move } })); setFetchedAt(Date.now()); } catch (e: any) { setErr(e.message); }
  };
  const autoplay = async () => { setM(await api(`/duels/${m.id}/autoplay`, { body: {} })); setFetchedAt(Date.now()); };
  const pick = async () => {
    try { await mutate(`/duels/${m.id}/pick`, { cents: price }); onDone(); } catch (e: any) { setErr(e.message); }
  };
  const last = m.history.at(-1);
  void setPrice;

  if (m.state === 'proposed') {
    const [a, b] = stakes ?? [m.stake_buyer, m.stake_seller];
    const changed = a !== m.stake_buyer || b !== m.stake_seller;
    const call = async (path: string, body: any = {}) => {
      setErr(null);
      try { setM(await api(`/duels/${m.id}/${path}`, { body })); setFetchedAt(Date.now()); } catch (e: any) { setErr(e.message); }
    };
    const buyerLabel = m.i_am_buyer ? 'If you win, you pay' : `If @${m.opponent} wins, you get`;
    const sellerLabel = m.i_am_buyer ? `If @${m.opponent} wins, you pay` : 'If you win, you get';
    return (
      <div>
        <p className="font-bold mb-4">Rock paper scissors is a coin toss, so you both agree on the two possible prices first. Whoever wins, that price locks. No haggling after.</p>
        {([[buyerLabel, a, (v: number) => setStakes([Math.min(v, b), b])], [sellerLabel, b, (v: number) => setStakes([a, Math.max(v, a)])]] as const).map(([label, v, set]) => (
          <div key={label} className="bg-bg rounded-[20px] px-4 py-3 mb-3">
            <div className="flex items-center justify-between"><span className="font-extrabold text-[14px]">{label}</span><span className="display text-[24px]">{money(v)}</span></div>
            <input type="range" className="w-full accent-[var(--ink)]" min={m.range_low} max={m.range_high} step={100} value={v} onChange={(e) => set(Number(e.target.value))} aria-label={label} />
          </div>
        ))}
        <p className="text-[13px] font-bold text-ink-soft mb-4">Both prices stay between {money(m.range_low)} and {money(m.range_high)} (20% either side of the fair price).</p>
        {changed || (!m.i_accepted && !m.they_accepted) ? (
          <button className="btn-primary w-full" onClick={() => call('stakes', { buyer_wins: a, seller_wins: b })}>{m.they_accepted || m.i_accepted ? 'Propose these instead' : 'Propose these stakes'}</button>
        ) : m.i_accepted ? (
          <p className="font-extrabold text-center py-2">Waiting on @{m.opponent} to accept.</p>
        ) : (
          <button className="btn-primary w-full" onClick={() => call('accept')}>Accept and play</button>
        )}
        {m.i_accepted && !m.they_accepted && <div className="text-center mt-2"><button className="btn-quiet text-[13px]" onClick={autoplay}>Demo: accept for @{m.opponent}</button></div>}
        <ErrorNote>{err}</ErrorNote>
      </div>
    );
  }

  return (
    <div className="relative">
      <StampBurst show={showResult && (m.state === 'resolved' || m.state === 'priced')} text={m.winner_is_me ? 'You win' : 'They win'} sub={m.price != null ? `Price locked at ${money(m.price)}` : m.winner_is_me ? 'Pick your price' : `@${m.opponent} picks the price`} tone={m.winner_is_me ? 'sage' : 'peach'} onDone={() => setShowResult(false)} />
      <div className="flex items-center justify-between bg-bg rounded-[20px] px-4 py-3 mb-4">
        {m.stake_buyer != null
          ? <div><div className="label">Stakes</div><div className="font-extrabold text-[14px]">Buyer wins {money(m.stake_buyer)}, seller wins {money(m.stake_seller)}</div></div>
          : <div><div className="label">Price range</div><div className="display text-[20px]">{money(m.range_low)} to {money(m.range_high)}</div></div>}
        <div className="text-right"><div className="label">vs</div><div className="font-extrabold">@{m.opponent}</div></div>
      </div>
      {(m.state === 'resolved' || m.state === 'priced') && m.price != null ? (
        <div className="text-center py-4">
          <p className="font-bold">{m.winner_is_me ? 'You won' : `@${m.opponent} won`}{last ? ` (${m.winner_is_me ? last.mine : last.theirs} beats ${m.winner_is_me ? last.theirs : last.mine})` : ''}. The price is locked, as you both agreed.</p>
          <div className="display text-[40px] my-2">{money(m.price)}</div>
          <button className="btn-primary w-full mt-2" onClick={onDone}>Continue to booking</button>
        </div>
      ) : m.state === 'resolved' ? (
        m.winner_is_me ? (
          <div>
            <p className="font-bold mb-3">You won. Pick any price in the range. It is written to the passport as an Arena win.</p>
            <div className="display text-[40px] text-center my-2">{money(price)}</div>
            <input type="range" className="w-full accent-[var(--ink)]" min={m.range_low} max={m.range_high} step={50} value={price ?? m.range_low} onChange={(e) => setPrice(Number(e.target.value))} aria-label="Price" />
            <div className="flex justify-between text-[13px] font-bold text-ink-soft"><span>{money(m.range_low)}</span><span>{money(m.range_high)}</span></div>
            <button className="btn-primary w-full mt-5" onClick={pick}>Lock {money(price)}</button>
          </div>
        ) : (
          <p className="font-bold text-center py-6">@{m.opponent} won {last ? `(${last.theirs} beats ${last.mine})` : ''} and is picking a price inside the range.</p>
        )
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="font-extrabold">Round {m.round}{last?.result === 'tie' ? `: tie on ${last.mine}, replay` : ''}</span>
            {left != null ? <span className={`display text-[22px] ${left <= 5 ? 'text-peach-deep' : ''}`}>{left}s</span> : <span className="text-[13px] font-bold text-ink-soft">{m.they_opened ? '' : `Clock starts when @${m.opponent} opens it`}</span>}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {MOVES.map((mv) => (
              <button key={mv.id} data-on={m.my_move === mv.id} disabled={!!m.my_move} onClick={() => play(mv.id)} className={`tile ${mv.tone} min-h-[110px] flex flex-col items-center justify-center gap-2 font-extrabold disabled:opacity-60`}>
                <Icon name={mv.icon} size={34} />{mv.label}
              </button>
            ))}
          </div>
          <p className="text-[13px] text-ink-soft font-bold mt-4 text-center">
            {m.my_move ? (m.they_moved ? 'Both in. Resolving on the server.' : `Locked in. Waiting on @${m.opponent}.`) : 'Moves are sealed on the server, so it is pure luck. 20 seconds once you are both in; no move means a random one.'}
          </p>
          <div className="text-center mt-2"><button className="btn-quiet text-[13px]" onClick={autoplay}>Demo: play for @{m.opponent}</button></div>
        </>
      )}
      <ErrorNote>{err}</ErrorNote>
    </div>
  );
}
