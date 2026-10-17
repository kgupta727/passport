import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { mutate, useApi } from '../api';
import { useMe } from '../me';
import { Empty, PageHeader, Row, Skeleton } from '../components/ui';
import { money, when } from '../format';

export function Admin() {
  const nav = useNavigate();
  const { me } = useMe();
  const { data, error } = useApi<any[]>(me.is_admin ? '/admin/disputes' : null, { poll: 8000 });
  if (!me.is_admin) return <Empty icon="lock" title="Admins only" body="Campus staff resolve disputes here." />;
  if (error) return <Empty icon="info" title="Could not load" body={error} />;
  if (!data) return <Skeleton h={300} />;
  return (
    <div>
      <PageHeader title={`${me.tenant.short} disputes`} sub="The dual-scan record and the passport decide. Nothing here needs moderating chat." back={() => nav(-1)} />
      {me.platform_admin && (
        <Link to="/admin/campuses" className="card p-4 mb-5 flex items-center gap-3 font-extrabold">
          <Icon name="pin" className="text-sky-deep" />Campuses: add one, run the isolation check<Icon name="chevronRight" className="ml-auto shrink-0" />
        </Link>
      )}
      {data.length === 0 && <Empty icon="check" title="No open disputes" body="Problems reported within 24 hours of a handoff land here." />}
      <div className="space-y-5">
        {data.map((d) => (
          <section key={d.id} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="text-[18px]">{d.title}</h2><p className="text-ink-soft font-bold text-[14px]">@{d.buyer.handle} bought from @{d.seller.handle}, {money(d.price_cents)}</p></div>
            </div>
            {d.reason && <p className="mt-3 rounded-[16px] bg-butter p-3 font-bold">"{d.reason}"</p>}
            <div className="mt-3">
              <Row label="Slot" value={d.slot || 'Digital'} />
              <Row label="Scans" value={d.scans.length ? d.scans.map((s: any) => `@${s.handle} ${s.method} ${when(s.at)}`).join(', ') : 'None'} />
              <Row label="Passport events" value={d.passport.length} />
              <Row label="Trade messages" value={d.messages.length} />
            </div>
            {d.transfer_proof && <img src={d.transfer_proof} alt="Transfer proof" className="mt-3 max-h-48 rounded-[16px]" />}
            <details className="mt-3">
              <summary className="font-extrabold text-ink-soft cursor-pointer min-h-[44px] flex items-center">Full record</summary>
              <ol className="text-[13px] font-bold space-y-1 mt-2">
                {d.events.map((e: any, i: number) => <li key={i}>{when(e.at)}: {e.type} by {e.actor}</li>)}
                {d.messages.map((m: any, i: number) => <li key={'m' + i} className="text-ink-soft">@{m.handle}: {m.body}{m.reported ? ' (reported)' : ''}</li>)}
              </ol>
            </details>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <button className="btn-secondary" onClick={() => mutate(`/admin/disputes/${d.id}/resolve`, { decision: 'refund' })}>Refund buyer</button>
              <button className="btn-primary !min-h-[46px]" onClick={() => mutate(`/admin/disputes/${d.id}/resolve`, { decision: 'release' })}>Release to seller</button>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
