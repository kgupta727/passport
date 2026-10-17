import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mutate, useApi } from '../api';
import { useMe } from '../me';
import { Chip, Empty, ErrorNote, PageHeader, Segmented, Skeleton } from '../components/ui';
import { Icon } from '../components/Icon';
import { ListingTile } from '../components/OfferCard';
import { money, when, WEEKDAYS } from '../format';

export function Carriers() {
  const nav = useNavigate();
  const { me } = useMe();
  const { data } = useApi<any>('/carriers', { poll: 15000 });
  const [to, setTo] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('17:00');
  const [tip, setTip] = useState('3');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);

  if (!data) return <Skeleton h={300} />;
  const post = async () => {
    setErr(null);
    try {
      await mutate('/carriers', { to_tenant: to, travels_on: new Date(`${date}T${time}`).getTime(), tip_cents: Math.round(Number(tip) * 100), note });
      setPosted(true);
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <div>
      <PageHeader title="Carrier day board" sub="Students driving between campuses carry small items for a tip. No runners, no relays." back={() => nav(-1)} />

      <div className="form-2col">
        <div className="space-y-5">
          <section>
            <h2 className="label mb-3">Upcoming trips</h2>
            {data.trips.length === 0 && <Empty icon="car" title="No trips posted" body="Cross-campus listings show the real wait, so a posted trip turns them into closable offers." />}
            <div className="space-y-3">
              {data.trips.map((c: any) => (
                <div key={c.id} className="card p-4 flex items-center gap-4">
                  <div className="w-14 text-center shrink-0">
                    <div className="text-[12px] font-extrabold text-ink-soft uppercase">{WEEKDAYS[new Date(c.travels_on).getDay()]}</div>
                    <div className="display text-[24px] leading-none">{new Date(c.travels_on).getDate()}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold flex items-center gap-2">{c.from}<Icon name="arrowRight" size={16} />{c.to}</div>
                    <div className="text-[13px] text-ink-soft font-bold">@{c.carrier.handle}, {when(c.travels_on)}{c.note ? `. ${c.note}` : ''}</div>
                  </div>
                  <div className="text-right">
                    <Chip tone="butter">{money(c.tip_cents)} tip</Chip>
                    {c.mine && <button className="btn-quiet text-[12px] block ml-auto" onClick={() => mutate(`/carriers/${c.id}`, {}, 'DELETE')}>Remove</button>}
                  </div>
                </div>
              ))}
            </div>
            {data.shuttles.length > 0 && (
              <p className="text-[13px] text-ink-soft font-bold mt-3 flex gap-2"><Icon name="info" size={16} className="shrink-0" />{data.shuttles.map((s: any) => `${s.label} runs ${WEEKDAYS[s.weekday]}s`).join('. ')}.</p>
            )}
          </section>

          <section className="card p-5">
            <h2 className="text-[18px] mb-1">Going to another campus?</h2>
            <p className="text-[14px] text-ink-soft font-bold mb-4">Post your trip. Buyers pay your tip with the item; you scan at the safe zone like any handoff.</p>
            {posted ? (
              <p className="font-extrabold text-sage-deep">Posted. Cross-campus buyers now see your trip as their wait time, and that campus's listings are open to you on this page.</p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Campus you are driving to">
                  {data.campuses.map((c: any) => (
                    <button key={c.id} type="button" role="radio" aria-checked={to === c.id} onClick={() => setTo(c.id)}
                      className={`min-h-[48px] px-3 rounded-[16px] border-[1.5px] font-extrabold text-[14px] text-left leading-tight ${to === c.id ? 'bg-ink text-white border-ink' : 'bg-surface border-line'}`}>
                      To {c.short}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3">
                  <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
                  <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time" />
                </div>
                <div className="grid grid-cols-[100px_1fr] gap-3">
                  <input className="input" inputMode="decimal" value={tip} onChange={(e) => setTip(e.target.value.replace(/[^0-9.]/g, ''))} aria-label="Tip in dollars" />
                  <input className="input" placeholder="Trunk space for books" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" maxLength={120} />
                </div>
                <ErrorNote>{err}</ErrorNote>
                <button className="btn-primary w-full" disabled={!to || !date} onClick={post}>Post trip from {me.tenant.short}</button>
              </div>
            )}
          </section>
        </div>

        <section>
          {data.trip_shops.map((s: any) => (
            <div key={s.trip_id} className="mb-6">
              <h2 className="label mb-1">Shop {s.to} on your {WEEKDAYS[new Date(s.travels_on).getDay()]} trip</h2>
              <p className="text-[13px] text-ink-soft font-bold mb-3">Your trip opens {s.to_name}'s listings to you. Claim one and meet the seller at a {s.to} safe zone when you get there.</p>
              <div className="space-y-3">
                {s.listings.length === 0 ? <Empty icon="search" title={`Nothing listed at ${s.to} yet`} body="New listings show up here until your trip." /> : s.listings.map((l: any) => <ListingTile key={l.id} l={l} />)}
              </div>
            </div>
          ))}
          <h2 className="label mb-3">Open to {me.tenant.short} from other campuses</h2>
          <div className="space-y-3">
            {data.open_listings.length === 0 && <Empty icon="search" title="Nothing cross-campus right now" body="When a seller on another campus marks a listing visible to other campuses, it shows up here with the wait for the next trip." />}
            {data.open_listings.map((l: any) => <ListingTile key={l.id} l={l} />)}
          </div>
        </section>
      </div>
    </div>
  );
}
