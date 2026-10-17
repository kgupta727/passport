import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { mutate, useApi } from '../api';
import { Chip, Empty, ErrorNote, PageHeader, Ring, Skeleton } from '../components/ui';
import { Icon, IconName } from '../components/Icon';
import { money, ordinal } from '../format';

const SRC_ICON: Record<string, IconName> = { library: 'book', open_access: 'globe', ebook: 'eye', campus: 'walk', rental: 'refresh', used_online: 'item', new: 'sparkle' };

export function AltOptions({ options }: { options: any[] }) {
  return (
    <div className="card divide-y divide-line overflow-hidden">
      {options.map((o) => (
        <div key={o.source} className="flex items-center gap-3 px-4 min-h-[60px] py-2.5">
          <Icon name={SRC_ICON[o.source] ?? 'info'} size={20} className="text-ink-soft shrink-0" />
          <div className="flex-1 min-w-0"><div className="font-extrabold">{o.label}</div><div className="text-[13px] text-ink-soft font-bold">{o.note}</div></div>
          <span className="display text-[16px]">{o.cents === 0 ? 'Free' : money(o.cents)}</span>
          {o.url && <a href={o.url} target="_blank" rel="noopener noreferrer" className="w-10 h-10 grid place-items-center text-ink-soft" aria-label={`Open ${o.label}`}><Icon name="arrowRight" size={18} /></a>}
        </div>
      ))}
    </div>
  );
}

export function Kit() {
  const nav = useNavigate();
  const { data } = useApi<any>('/kit');
  const [q, setQ] = useState('');
  const { data: results } = useApi<any[]>(q.trim().length >= 2 ? `/courses?q=${encodeURIComponent(q.trim())}` : null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (key: string, fn: () => Promise<any>) => {
    setBusy(key); setErr(null);
    try { await fn(); } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };

  if (!data) return <div className="space-y-4"><Skeleton h={120} /><Skeleton h={300} /></div>;
  const saved = data.new_cents - data.total_cents;

  return (
    <div>
      <PageHeader title="Course Kit" sub="Every required book, cheapest legit option first." back={() => nav(-1)} />

      <div className="form-2col">
        <div className="space-y-5">
          <div className="rounded-[28px] bg-sage p-5 flex items-center gap-5">
            <Ring value={data.count ? data.sorted / data.count : 0} size={76} stroke={8}><span className="display text-[18px]">{data.sorted}/{data.count}</span></Ring>
            <div>
              <div className="font-extrabold">{data.sorted} of {data.count} sorted</div>
              <div className="display text-[28px] leading-tight">{money(data.sorted_cents)} <span className="text-[14px] text-ink-soft font-body font-extrabold">sorted so far</span></div>
              {data.sorted < data.count && <div className="text-[14px] font-extrabold">{data.rest_cheapest_cents > 0 ? `+ ${money(data.rest_cheapest_cents)} if you take the cheapest option for the rest` : 'The rest can be free: library or open-access copies'}</div>}
              <div className="text-[13px] font-bold text-sage-deep">Estimated kit total {money(data.total_cents)}{saved > 0 ? `, ${money(saved)} less than all new` : ''}</div>
            </div>
          </div>

          <div className="card p-5">
            <label className="label block mb-2" htmlFor="course">Add a class</label>
            <div className="relative">
              <Icon name="search" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-soft" />
              <input id="course" className="input !pl-11" placeholder="Course code or name" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {results && q.trim().length >= 2 && (
              <div className="mt-3 divide-y divide-line">
                {results.length === 0 && <p className="text-ink-soft font-bold py-3">No class matches that code in this term's catalog.</p>}
                {results.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex-1"><div className="font-extrabold">{c.code}</div><div className="text-[13px] text-ink-soft font-bold">{c.title}</div></div>
                    {c.added ? <Chip tone="sage" icon="check">Added</Chip> : (
                      <button className="btn-secondary !min-h-[44px]" disabled={busy === c.id} onClick={() => act(c.id, async () => { await mutate('/kit/courses', { course_id: c.id }); setQ(''); })}>Add</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="text-[13px] text-ink-soft font-bold px-2 flex gap-2"><Icon name="shield" size={16} className="shrink-0" />Legit sources only: library, publisher, open-access, campus, rental, used, new. Never pirated PDFs.</p>
        </div>

        <div className="space-y-5">
          <ErrorNote>{err}</ErrorNote>
          {data.courses.length === 0 && <Empty icon="kit" title="No classes yet" body="Add your classes and we will line up every required book with its cheapest legit option." />}
          {data.courses.map(({ course, books }: any) => (
            <section key={course.id} className="card p-5">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div><h2 className="text-[19px]">{course.code}</h2><p className="text-ink-soft font-bold text-[14px]">{course.title}</p></div>
                <button className="btn-quiet text-[13px]" onClick={() => act(course.id, () => mutate(`/kit/courses/${course.id}`, {}, 'DELETE'))}>Remove</button>
              </div>
              {books.map((b: any) => (
                <div key={b.book.id} className="mt-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="font-extrabold">{b.book.title}{b.book.edition ? `, ${ordinal(b.book.edition)} ed.` : ''}</div>
                    {b.choice ? <Chip tone="sage" icon="check">Sorted</Chip> : b.trade_id ? <Chip tone="lilac">In a trade</Chip> : <Chip tone="butter">To sort</Chip>}
                  </div>
                  <div className="text-[13px] text-ink-soft font-bold mb-3">{b.book.author}, ISBN {b.book.isbn}</div>

                  {b.choice ? (
                    <div className="rounded-[20px] bg-sage p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-extrabold">{b.choice.label}{b.choice.cents ? `, ${money(b.choice.cents)}` : ', free'}</span>
                        {b.choice.source !== 'campus' && <button className="btn-quiet text-[13px] !text-sage-deep" onClick={() => act(b.book.id, () => mutate('/kit/choice', { book_id: b.book.id, source: b.choice.source, clear: true }))}>Undo</button>}
                      </div>
                      {b.relist_listing_id && (
                        <Link to={`/sell?from=${b.relist_listing_id}`} className="mt-3 flex items-center gap-2 font-extrabold text-sage-deep min-h-[44px]">
                          <Icon name="refresh" size={18} />Done with {course.code}? List your book in one tap<Icon name="chevronRight" size={16} className="ml-auto" />
                        </Link>
                      )}
                    </div>
                  ) : b.trade_id ? (
                    <Link to={`/trade/${b.trade_id}`} className="btn-secondary w-full">Open the trade</Link>
                  ) : (
                    <ol className="rounded-[20px] border border-line divide-y divide-line overflow-hidden">
                      {b.options.map((o: any, i: number) => (
                        <li key={o.source} className={`flex items-center gap-3 px-4 min-h-[64px] py-2.5 ${i === 0 ? 'bg-sky/50' : ''}`}>
                          <Icon name={SRC_ICON[o.source]} size={20} className="text-ink-soft shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-extrabold flex items-center gap-2">{o.label}{i === 0 && <span className="text-[11px] uppercase tracking-wider text-sky-deep">Cheapest</span>}</div>
                            <div className="text-[13px] text-ink-soft font-bold truncate">{o.url ? <a href={o.url} target="_blank" rel="noopener noreferrer" className="underline">{o.note}</a> : o.note}</div>
                          </div>
                          <span className="display text-[16px] w-14 text-right">{o.cents === 0 ? 'Free' : money(o.cents)}</span>
                          {o.source === 'campus' ? (
                            <button className="btn-primary !min-h-[44px] !px-4 !text-[14px]" disabled={busy === o.listing_id} onClick={() => act(o.listing_id, async () => { const r = await mutate(`/listings/${o.listing_id}/claim`, { need_id: b.need_id }); nav(`/trade/${r.trade_id}`); })}>Claim</button>
                          ) : (
                            <button className="btn-secondary !min-h-[44px] !px-3 !text-[14px]" disabled={busy === b.book.id + o.source} onClick={() => act(b.book.id + o.source, () => mutate('/kit/choice', { book_id: b.book.id, source: o.source }))}>Use</button>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
