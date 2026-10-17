import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, mutate, uploadImage, useApi } from '../api';
import { useMe } from '../me';
import { Icon, KIND_ICON } from '../components/Icon';
import { Art, isPhoto } from '../components/Art';
import { Chip, ErrorNote, PageHeader, Segmented } from '../components/ui';
import { Kind, listOf, money, plural, WEEKDAYS } from '../format';

const KINDS: { kind: Kind; label: string; sub: string; tone: string }[] = [
  { kind: 'item', label: 'Item', sub: 'Fridge, bike, lamp', tone: 't-peach' },
  { kind: 'textbook', label: 'Textbook', sub: 'Tied to a course', tone: 't-sky' },
  { kind: 'ticket', label: 'Ticket', sub: 'Games, shows', tone: 't-butter' },
  { kind: 'service', label: 'Tutoring', sub: 'By the hour', tone: 't-lilac' },
];
const CATEGORIES = ['Appliances', 'Electronics', 'Furniture', 'Dorm and decor', 'Bikes', 'Clothing', 'Other'];
const CONDITIONS = [
  { value: 'good', label: 'Good', blurb: 'Works perfectly, light signs of use at most.' },
  { value: 'worn', label: 'Worn', blurb: 'Clearly used: scuffs or wear, nothing broken.' },
  { value: 'damaged', label: 'Damaged', blurb: 'Something is off: a crack, stain or missing part.' },
] as const;
const BLOCKS = [
  { id: 'morning', label: 'Morning', hours: [9, 10, 11] },
  { id: 'afternoon', label: 'Afternoon', hours: [12, 13, 14, 15, 16] },
  { id: 'evening', label: 'Evening', hours: [17, 18, 19, 20] },
];

type Cond = (typeof CONDITIONS)[number]['value'];
const MAX_PHOTOS = 5;

export function Sell() {
  const { me } = useMe();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const from = params.get('from');
  const { data: draft } = useApi<any>(from ? `/listings/${from}/relist-draft` : null);

  const [kind, setKind] = useState<Kind | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Other');
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [cond, setCond] = useState<Cond>('good');
  const [isbn, setIsbn] = useState('');
  const [book, setBook] = useState<any>(null);
  const [course, setCourse] = useState('');
  const [highlights, setHighlights] = useState<'none' | 'some' | 'heavy'>('none');
  const [ask, setAsk] = useState('');
  const [askTouched, setAskTouched] = useState(false);
  const [floor, setFloor] = useState('');
  const [arena, setArena] = useState(true);
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [blocks, setBlocks] = useState<Set<string>>(() => new Set(['1:afternoon', '2:afternoon', '3:afternoon', '4:afternoon', '5:afternoon', '1:evening', '2:evening', '3:evening', '4:evening']));
  const [t, setT] = useState({ event: '', date: '', section: '', row: '', quantity: '2', face: '', transfer: 'App transfer', proof: '' });
  const [s, setS] = useState({ course: '', skills: '', rate: '', discount: '0', mode: 'in_person', video: '', bio: '' });
  const [why, setWhy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lineage, setLineage] = useState<{ id: string; stamps: number } | null>(null);

  useEffect(() => {
    if (!draft) return;
    setKind(draft.kind);
    setTitle(draft.title);
    setCategory(draft.category);
    setPhotos((draft.photos ?? []).filter(isPhoto));
    setCond(draft.condition >= 80 ? 'good' : draft.condition >= 50 ? 'worn' : 'damaged');
    if (draft.details.isbn) setIsbn(draft.details.isbn);
    if (draft.details.course) setCourse(draft.details.course);
    if (draft.details.highlights) setHighlights(draft.details.highlights);
    setLineage({ id: draft.lineage_from, stamps: draft.stamps });
  }, [draft]);

  useEffect(() => {
    const clean = isbn.replace(/[^0-9xX]/g, '');
    if (clean.length < 10) { setBook(null); return; }
    api(`/books?isbn=${clean}`).then((r) => {
      setBook(r.book);
      if (r.book && !title) setTitle(`${r.book.title}${r.book.edition ? `, ${r.book.edition}th ed.` : ''}`.replace('2th', '2nd').replace('3th', '3rd').replace('1th', '1st'));
      if (r.book?.courses?.[0] && !course) setCourse(r.book.courses[0]);
    });
  }, [isbn]);

  const priceCategory = kind === 'textbook' ? (isbn.replace(/[^0-9xX]/g, '').length >= 10 ? `isbn:${isbn.replace(/[^0-9xX]/g, '')}` : 'textbook') : category;
  const condScore = cond === 'good' ? 90 : cond === 'worn' ? 65 : 35;
  const [sp, setSp] = useState<any>(null);
  useEffect(() => {
    if (kind !== 'item' && kind !== 'textbook') { setSp(null); return; }
    api('/listings/suggest-price', { body: { category: priceCategory, condition: condScore, lineage_from: lineage?.id } }).then((r) => {
      setSp(r);
      if (!askTouched && r.S_cents) setAsk(String(Math.round(r.S_cents / 100)));
    });
  }, [kind, priceCategory, condScore, lineage?.id]);

  const windows = useMemo(() => {
    const out: { weekday: number; hour: number }[] = [];
    blocks.forEach((k) => {
      const [d, b] = k.split(':');
      BLOCKS.find((x) => x.id === b)!.hours.forEach((h) => out.push({ weekday: Number(d), hour: h }));
    });
    return out;
  }, [blocks]);

  const cap = me.tenant.config.ticketPriceCap;
  const faceCents = Math.round(Number(t.face) * 100);
  const maxTicket = faceCents ? Math.floor(faceCents * cap) : null;

  const submit = async () => {
    setErr(null);
    setBusy(true);
    try {
      const body: any = { kind, title, category, photos, ask_cents: Math.round(Number(ask) * 100), floor_cents: floor ? Math.round(Number(floor) * 100) : null, arena_on: arena, visibility: open ? 'open' : 'campus', notes_for_buyer: notes, free_windows: windows, lineage_from: lineage?.id };
      if (kind === 'item' || kind === 'textbook') body.condition_step = cond;
      if (kind === 'textbook') body.details = { isbn, course, highlights };
      if (kind === 'ticket') body.details = { event: t.event, date: t.date, section: t.section, row: t.row, quantity: Number(t.quantity), face_value_cents: faceCents, transfer_method: t.transfer, proof: t.proof || null };
      if (kind === 'service') {
        body.details = { course: s.course, skills: s.skills.split(',').map((x) => x.trim()).filter(Boolean), hourly_cents: Math.round(Number(s.rate) * 100), first_discount_pct: Number(s.discount), mode: s.mode, video_url: s.video, bio: s.bio, availability: windows };
        body.ask_cents = Math.round(Number(s.rate) * 100);
      }
      const r = await mutate('/listings', body);
      nav(`/listing/${r.id}?new=1`, { replace: true });
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const onPhotos = async (files: FileList | null, replaceAt?: number) => {
    if (!files?.length) return;
    setUploading(true); setErr(null);
    try {
      const picked = Array.from(files).slice(0, replaceAt != null ? 1 : MAX_PHOTOS - photos.length);
      const urls: string[] = [];
      for (const f of picked) urls.push(await uploadImage(f));
      setPhotos((cur) => {
        if (replaceAt == null) return [...cur, ...urls].slice(0, MAX_PHOTOS);
        const next = [...cur]; next[replaceAt] = urls[0]; return next;
      });
    } catch (e: any) { setErr(e.message); } finally { setUploading(false); }
  };

  if (!kind) {
    return (
      <div>
        <PageHeader title="Sell something" sub="About 30 seconds. Then you do nothing until someone claims it." />
        <div className="grid grid-cols-2 gap-3">
          {KINDS.map((k) => (
            <button key={k.kind} onClick={() => setKind(k.kind)} className={`tile ${k.tone} min-h-[150px] p-5 text-left flex flex-col justify-between`} data-on="false">
              <Icon name={KIND_ICON[k.kind]} size={30} />
              <div><div className="display text-[20px]">{k.label}</div><div className="text-[14px] text-ink-soft font-bold">{k.sub}</div></div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const physical = kind === 'item' || kind === 'textbook';
  const k = KINDS.find((x) => x.kind === kind)!;

  return (
    <div>
      <PageHeader title={lineage ? 'List it again' : `Sell: ${k.label}`} sub={lineage ? `Its passport comes with it: ${plural(lineage.stamps, 'stamp')}.` : undefined} back={() => (from ? nav(-1) : setKind(null))} />

      <div className="form-2col">
        <div className="space-y-6">
          {physical && (
            <section>
              <div className="flex items-baseline justify-between mb-2">
                <p className="label">Photos</p>
                <span className="text-[13px] font-bold text-ink-soft">{photos.length} of {MAX_PHOTOS}</span>
              </div>
              {photos.length ? (
                <div className="relative">
                  <Art photo={photos[0]} kind={kind} alt="Cover photo" className="w-full aspect-[4/3]" rounded="rounded-[24px]" />
                  <label className="absolute right-3 bottom-3 btn-secondary !min-h-[44px] !px-4 text-[14px] cursor-pointer bg-surface">
                    <Icon name="camera" size={18} />Retake
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onPhotos(e.target.files, 0); e.target.value = ''; }} />
                  </label>
                </div>
              ) : (
                <label className="block cursor-pointer">
                  <div className="tile aspect-[4/3] grid place-items-center text-ink-soft font-extrabold">
                    <span className="flex flex-col items-center gap-2 text-center px-6"><Icon name="camera" size={32} />{uploading ? 'Uploading...' : 'Take or pick a photo'}
                      <span className="text-[13px] font-bold">{kind === 'textbook' ? 'The cover, then a few inside pages' : 'Required. Real photos only, no stock images.'}</span>
                    </span>
                  </div>
                  <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => { onPhotos(e.target.files); e.target.value = ''; }} />
                </label>
              )}
              {photos.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {photos.map((p, n) => (
                    <div key={p} className="relative w-[72px] h-[54px]">
                      <img src={p} alt={`Photo ${n + 1}`} className="w-full h-full object-cover rounded-[12px]" />
                      <button type="button" onClick={() => setPhotos(photos.filter((x) => x !== p))} aria-label={`Remove photo ${n + 1}`} className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-ink text-white grid place-items-center"><Icon name="x" size={14} stroke={3} /></button>
                    </div>
                  ))}
                  {photos.length < MAX_PHOTOS && (
                    <label className="w-[72px] h-[54px] rounded-[12px] border-2 border-dashed border-line grid place-items-center text-ink-soft cursor-pointer" aria-label="Add another photo">
                      {uploading ? <span className="text-[11px] font-extrabold">...</span> : <Icon name="plus" size={20} />}
                      <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { onPhotos(e.target.files); e.target.value = ''; }} />
                    </label>
                  )}
                </div>
              )}
              {kind === 'textbook' && photos.length === 1 && <p className="text-[13px] font-bold text-ink-soft mt-2">Tip: add a photo of a few inside pages so buyers can see the highlighting.</p>}
            </section>
          )}

          {kind === 'item' && (
            <section className="space-y-3">
              <div>
                <label className="label block mb-2" htmlFor="title">What is it?</label>
                <input id="title" className="input" placeholder="Mini fridge, 3.1 cu ft" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
              </div>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => <button key={c} type="button" data-on={category === c} onClick={() => setCategory(c)} className="tile t-peach h-10 px-3.5 text-[14px] font-extrabold">{c}</button>)}
              </div>
            </section>
          )}

          {kind === 'textbook' && (
            <section className="space-y-3">
              <div>
                <label className="label block mb-2" htmlFor="isbn">ISBN (back cover)</label>
                <input id="isbn" className="input" inputMode="numeric" placeholder="978..." value={isbn} onChange={(e) => setIsbn(e.target.value)} />
                {book && <p className="mt-2 text-[14px] font-extrabold text-sage-deep flex items-center gap-1.5"><Icon name="shield" size={16} />Matches the catalog: {book.title}, edition {book.edition}{book.courses.length ? ` (used in ${book.courses.join(', ')})` : ''}</p>}
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <div>
                  <label className="label block mb-2" htmlFor="btitle">Title</label>
                  <input id="btitle" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Calculus: Early Transcendentals" />
                </div>
                <div className="w-28">
                  <label className="label block mb-2" htmlFor="bcourse">Course</label>
                  <input id="bcourse" className="input" value={course} onChange={(e) => setCourse(e.target.value)} placeholder="Course code" />
                </div>
              </div>
              <div>
                <p className="label mb-2">Notes or highlights</p>
                <Segmented value={highlights} onChange={setHighlights} tone="sky" options={[{ value: 'none', label: 'None' }, { value: 'some', label: 'Some' }, { value: 'heavy', label: 'Heavy' }]} />
              </div>
            </section>
          )}

          {kind === 'ticket' && (
            <section className="space-y-3">
              <div><label className="label block mb-2" htmlFor="ev">Event</label><input id="ev" className="input" placeholder={me.tenant.config.examples?.event ?? 'Home game vs rival'} value={t.event} onChange={(e) => setT({ ...t, event: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label block mb-2" htmlFor="dt">Date</label><input id="dt" type="date" className="input" value={t.date} onChange={(e) => setT({ ...t, date: e.target.value })} /></div>
                <div><label className="label block mb-2" htmlFor="qty">How many</label><input id="qty" className="input" inputMode="numeric" value={t.quantity} onChange={(e) => setT({ ...t, quantity: e.target.value.replace(/\D/g, '') })} /></div>
                <div><label className="label block mb-2" htmlFor="sec">Section</label><input id="sec" className="input" value={t.section} onChange={(e) => setT({ ...t, section: e.target.value })} /></div>
                <div><label className="label block mb-2" htmlFor="row">Row</label><input id="row" className="input" value={t.row} onChange={(e) => setT({ ...t, row: e.target.value })} /></div>
              </div>
              <div><label className="label block mb-2" htmlFor="face">Face value (all tickets)</label><input id="face" className="input" inputMode="decimal" placeholder="$180" value={t.face} onChange={(e) => setT({ ...t, face: e.target.value.replace(/[^0-9.]/g, '') })} /></div>
              <div>
                <p className="label mb-2">Transfer method</p>
                <Segmented value={t.transfer} onChange={(v) => setT({ ...t, transfer: v })} tone="butter" options={[{ value: 'App transfer', label: 'App' }, { value: 'PDF', label: 'PDF' }, { value: 'QR screenshot', label: 'QR' }]} />
              </div>
              <label className="tile flex items-center justify-center gap-2 min-h-[56px] font-extrabold cursor-pointer">
                <Icon name="upload" />{t.proof ? 'Proof of purchase attached' : 'Upload proof of purchase'}
                <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setT({ ...t, proof: await uploadImage(f) }); }} />
              </label>
            </section>
          )}

          {kind === 'service' && (
            <section className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label block mb-2" htmlFor="sc">Course</label><input id="sc" className="input" placeholder="Course code" value={s.course} onChange={(e) => setS({ ...s, course: e.target.value })} /></div>
                <div><label className="label block mb-2" htmlFor="sr">Per hour</label><input id="sr" className="input" inputMode="decimal" placeholder="$25" value={s.rate} onChange={(e) => setS({ ...s, rate: e.target.value.replace(/[^0-9.]/g, '') })} /></div>
              </div>
              <div><label className="label block mb-2" htmlFor="sk">Skills, comma separated</label><input id="sk" className="input" placeholder="Limits, derivatives, exam prep" value={s.skills} onChange={(e) => setS({ ...s, skills: e.target.value })} /></div>
              <div>
                <p className="label mb-2">First-session discount</p>
                <Segmented value={s.discount} onChange={(v) => setS({ ...s, discount: v })} tone="lilac" options={[{ value: '0', label: 'None' }, { value: '10', label: '10%' }, { value: '20', label: '20%' }, { value: '25', label: '25%' }]} />
              </div>
              <div>
                <p className="label mb-2">Where</p>
                <Segmented value={s.mode} onChange={(v) => setS({ ...s, mode: v })} tone="lilac" options={[{ value: 'in_person', label: 'Library table' }, { value: 'video', label: 'Video link' }]} />
              </div>
              {s.mode === 'video' && <input className="input" placeholder="Campus video link (Zoom or Teams)" value={s.video} onChange={(e) => setS({ ...s, video: e.target.value })} aria-label="Video link" />}
              <p className="text-[13px] text-ink-soft font-bold">Price is fixed per hour, no Duel. Your rating comes only from completed, verified sessions.</p>
            </section>
          )}
        </div>

        <div className="space-y-6">
          {physical && (
            <section>
              <p className="label mb-2">Condition</p>
              <Segmented value={cond} onChange={setCond} tone={cond === 'good' ? 'sage' : cond === 'worn' ? 'butter' : 'peach'} options={CONDITIONS.map((c) => ({ value: c.value, label: c.label }))} />
              <p className="font-bold mt-2 text-[15px]">{CONDITIONS.find((c) => c.value === cond)!.blurb}</p>
              <p className="text-[13px] text-ink-soft font-bold">Shown as "seller says" until a buyer confirms it at the handoff.</p>
            </section>
          )}

          {kind !== 'service' && (
            <section className="card p-5">
              <div className="flex items-end justify-between gap-3">
                <div className="flex-1">
                  <label className="label block mb-2" htmlFor="ask">Price</label>
                  <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 font-extrabold text-ink-soft">$</span>
                    <input id="ask" className="input !pl-8 display !text-[22px]" inputMode="decimal" value={ask} onChange={(e) => { setAsk(e.target.value.replace(/[^0-9.]/g, '')); setAskTouched(true); }} /></div>
                </div>
                {sp?.S_cents != null && <Chip tone="sky" icon="sparkle" className="mb-3">Suggested {money(sp.S_cents)}</Chip>}
              </div>
              {kind === 'ticket' && maxTicket != null && (
                <p className={`text-[14px] font-extrabold mt-2 ${Number(ask) * 100 > maxTicket ? 'text-error' : 'text-ink-soft'}`}>Cap on this campus: face value x {cap} = {money(maxTicket)}</p>
              )}
              {sp?.S_cents != null && (
                <>
                  <button type="button" className="btn-quiet text-[14px] !px-0 mt-1" onClick={() => setWhy(!why)} aria-expanded={why}>Why this price</button>
                  {why && (
                    <div className="bg-bg rounded-[18px] p-4 mt-1 text-[14px] font-bold space-y-1">
                      <p className="display text-[16px]">S = B x C x (1 + L) = {money(sp.B_cents)} x {sp.C} x {(1 + sp.L).toFixed(2)} = {money(sp.S_cents)}</p>
                      <p><b>B</b> {money(sp.B_cents)}: median of the last {plural(sp.n, 'completed campus sale')} in {kind === 'textbook' ? 'this ISBN' : category}.</p>
                      <p><b>C</b> {sp.C}: condition multiplier (Good 1.0, Worn 0.7, Damaged 0.4).</p>
                      <p><b>L</b> {sp.L.toFixed(2)}: lineage bonus, +0.05 per passport stamp ({plural(sp.stamps, 'stamp')}), capped at 0.25.</p>
                    </div>
                  )}
                </>
              )}
              <div className="mt-4">
                <label className="label block mb-2" htmlFor="floor">Lowest you will take (optional, private)</label>
                <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 font-extrabold text-ink-soft">$</span>
                  <input id="floor" className="input !pl-8" inputMode="decimal" placeholder="Auto-accept offers at or above" value={floor} onChange={(e) => setFloor(e.target.value.replace(/[^0-9.]/g, ''))} /></div>
              </div>
              {physical && me.tenant.config.features.arena && (
                <ToggleRow on={arena} onChange={setArena} title="Allow Price Duel" body={sp?.S_cents ? `Buyer can challenge you to 20 seconds of rock paper scissors. Winner picks a price from ${money(Math.round(sp.S_cents * 0.8))} to ${money(Math.round(sp.S_cents * 1.2))}.` : 'Buyer can challenge you to 20 seconds of rock paper scissors. Winner picks a price within 20% of the suggestion.'} />
              )}
              {me.tenant.config.features.crossCampus && me.tenant.others.length > 0 && (
                <ToggleRow on={open} onChange={setOpen} title="Visible to other campuses" body={`Also shown at ${listOf(me.tenant.others)} with a 'needs a carrier' tag and the real wait for the next trip.`} />
              )}
            </section>
          )}

          {kind !== 'ticket' && (
            <section>
              <p className="label mb-2">{kind === 'service' ? 'When you can tutor' : 'When you are usually free for a handoff'}</p>
              <div className="card p-3 overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead><tr><th />{WEEKDAYS.map((d) => <th key={d} className="font-extrabold text-ink-soft py-1">{d}</th>)}</tr></thead>
                  <tbody>
                    {BLOCKS.map((b) => (
                      <tr key={b.id}>
                        <td className="font-extrabold text-ink-soft pr-2 whitespace-nowrap">{b.label}</td>
                        {WEEKDAYS.map((_, d) => {
                          const key = `${d}:${b.id}`, on = blocks.has(key);
                          return (
                            <td key={d} className="p-0.5">
                              <button type="button" aria-label={`${WEEKDAYS[d]} ${b.label}`} aria-pressed={on} onClick={() => { const nb = new Set(blocks); on ? nb.delete(key) : nb.add(key); setBlocks(nb); }}
                                className={`w-full min-w-[36px] h-11 rounded-[12px] transition-colors ${on ? 'bg-sage-deep' : 'bg-bg border border-line'}`} />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[13px] text-ink-soft font-bold mt-2">Buyers book one of these. We pick the safe zone that is fairest on walking time for both of you.</p>
            </section>
          )}

          {kind !== 'service' && (
            <section>
              <label className="label block mb-2" htmlFor="notes">Notes for buyer (optional)</label>
              <textarea id="notes" className="input" maxLength={200} placeholder="Name written inside the cover" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </section>
          )}

          <ErrorNote>{err}</ErrorNote>
          {physical && !photos.length && <p className="text-[14px] font-bold text-ink-soft">Add at least one photo to list it.</p>}
          <button className="btn-primary w-full" disabled={busy || uploading || (physical && !photos.length)} onClick={submit}>{busy ? 'Listing...' : 'Done, list it'}</button>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ on, onChange, title, body }: { on: boolean; onChange: (v: boolean) => void; title: string; body: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="w-full flex items-start gap-3 text-left mt-4 min-h-[44px]" aria-pressed={on}>
      <span className={`mt-0.5 w-12 h-7 rounded-full p-1 shrink-0 transition-colors ${on ? 'bg-sage-deep' : 'bg-line'}`}>
        <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : ''}`} />
      </span>
      <span><span className="font-extrabold block">{title}</span><span className="text-[13px] text-ink-soft font-bold">{body}</span></span>
    </button>
  );
}
