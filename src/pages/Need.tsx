import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { mutate, useApi } from '../api';
import { Chip, Empty, ErrorNote, PageHeader, Skeleton } from '../components/ui';
import { OfferCard } from '../components/OfferCard';
import { Icon, KIND_ICON } from '../components/Icon';
import { KIND_LABEL } from '../format';
import { AltOptions } from './Kit';

export function NeedPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, error } = useApi<any>(`/needs/${id}`, { poll: 8000 });
  const [err, setErr] = useState<string | null>(null);
  if (error) return <Empty icon="search" title="Need not found" body={error} />;
  if (!data) return <div className="space-y-4"><Skeleton h={80} /><Skeleton h={160} /><Skeleton h={160} /></div>;
  const n = data.need;

  const toggle = async (key: string) => {
    setErr(null);
    try {
      await mutate(`/needs/${n.id}`, { requirements: n.requirements.map((r: any) => (r.key === key ? { ...r, must: !r.must } : r)) }, 'PATCH');
    } catch (e: any) { setErr(e.message); }
  };
  const remove = async (key: string) => {
    await mutate(`/needs/${n.id}`, { requirements: n.requirements.filter((r: any) => r.key !== key) }, 'PATCH');
  };

  const ready = data.offers.filter((o: any) => o.ready);
  const rest = data.offers.filter((o: any) => !o.ready);

  return (
    <div>
      <PageHeader
        title={n.free_text}
        sub={<span className="flex items-center gap-2 flex-wrap"><Chip tone="plain" icon={KIND_ICON[n.kind]}>{KIND_LABEL[n.kind as keyof typeof KIND_LABEL]}</Chip>{data.course && <Chip tone="sky" icon="kit">{data.course.code}</Chip>}<Chip tone={n.status === 'sorted' ? 'sage' : 'butter'}>{n.status === 'sorted' ? 'Sorted' : 'Watching'}</Chip></span>}
        back={() => nav(-1)}
      />

      {data.trade_id && (
        <Link to={`/trade/${data.trade_id}`} className="flex items-center gap-3 rounded-[24px] bg-lilac p-4 mb-5 font-extrabold">
          <Icon name="trades" className="text-lilac-deep" />You have a trade going for this.<Icon name="chevronRight" className="ml-auto" />
        </Link>
      )}

      <section className="card p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[17px]">What it needs to have</h2>
          <span className="text-[12px] font-extrabold text-ink-soft">{n.parsed_by === 'llm' ? 'Read by the language model' : 'Read by rules'}, scored by plain code</span>
        </div>
        {n.requirements.length === 0 && <p className="text-ink-soft font-bold">Nothing specific. Offers are ranked by distance and seller reliability.</p>}
        <div className="flex flex-wrap gap-2">
          {n.requirements.map((r: any) => (
            <span key={r.key} className={`inline-flex items-center rounded-full border-[1.5px] ${r.must ? 'bg-ink text-white border-ink' : 'bg-surface border-line'}`}>
              <button onClick={() => toggle(r.key)} className="pl-3.5 pr-2 min-h-[40px] font-extrabold text-[14px]" title={r.must ? 'Must have (weight 3). Tap to make it nice to have.' : 'Nice to have (weight 1). Tap to make it a must.'}>
                {r.label}{r.must ? ' (must)' : ''}
              </button>
              <button onClick={() => remove(r.key)} className="pr-2.5 min-h-[40px] opacity-60" aria-label={`Remove ${r.label}`}><Icon name="x" size={14} stroke={2.6} /></button>
            </span>
          ))}
        </div>
        <ErrorNote>{err}</ErrorNote>
        <p className="text-[13px] text-ink-soft font-bold mt-3">Tap a requirement to switch must-have (weight 3) and nice-to-have (weight 1).</p>
      </section>

      {ready.length > 0 && (
        <section className="mb-6">
          <h2 className="label mb-3">Ready now</h2>
          <div className="space-y-3">{ready.map((o: any) => <OfferCard key={o.listing.id} o={o} needId={n.id} />)}</div>
        </section>
      )}
      <section className="mb-6">
        <h2 className="label mb-3">{ready.length ? 'Other offers' : 'Offers, ranked by odds of closing'}</h2>
        {rest.length === 0 && ready.length === 0 ? (
          <Empty icon="search" title="Nothing yet" body="Passport is watching. You will get an update the moment a matching listing appears on your campus." />
        ) : (
          <div className="space-y-3">{rest.map((o: any) => <OfferCard key={o.listing.id} o={o} needId={n.id} />)}</div>
        )}
      </section>

      {data.alternatives?.length > 0 && (
        <section className="mb-6">
          <h2 className="label mb-3">Other legit ways to get it</h2>
          <AltOptions options={data.alternatives} />
        </section>
      )}

      <button className="btn-quiet w-full" onClick={async () => { await mutate(`/needs/${n.id}`, {}, 'DELETE'); nav('/'); }}>I don't need this anymore</button>
    </div>
  );
}
