import { Link, useNavigate } from 'react-router-dom';
import { api, session } from '../api';
import { useMe } from '../me';
import { Chip, PageHeader, Ring, Row } from '../components/ui';
import { Icon } from '../components/Icon';
import { DemoPanel } from '../components/DemoPanel';
import { plural } from '../format';

export function Profile() {
  const { me, reloadMe } = useMe();
  const nav = useNavigate();
  const t = me.trust;
  const span = t.next == null ? 1 : t.next - [0, 0, 3, 10, 25][t.level];
  const into = t.next == null ? 1 : (Math.max(0, t.credit) - [0, 0, 3, 10, 25][t.level]) / span;

  return (
    <div>
      <PageHeader title={`@${me.handle}`} sub={<span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-sage-deep" />{me.email}, {me.tenant.name}</span>} back={() => nav(-1)} />

      <section className="rounded-[28px] bg-lilac p-5 flex items-center gap-5 mb-5">
        <Ring value={into} size={84} stroke={8} tone="var(--lilac-deep)"><div className="display text-[26px] leading-none">{t.level}</div><div className="text-[11px] font-extrabold text-lilac-deep">LEVEL</div></Ring>
        <div>
          <h2 className="text-[19px]">Trust level {t.level}</h2>
          <p className="font-bold text-lilac-deep">{t.next == null ? 'Top level.' : `${t.toNext} more verified ${t.toNext === 1 ? 'handoff' : 'handoffs'} to level ${t.level + 1}.`}</p>
          <p className="text-[13px] font-bold mt-1">{plural(t.handoffs, 'verified handoff')}, credit {t.credit}{t.no_shows ? `, ${plural(t.no_shows, 'no-show')} (minus 2 each)` : ''}</p>
        </div>
      </section>
      <p className="text-[13px] text-ink-soft font-bold mb-6 px-1">Levels: 0 to 2 handoffs is 1, 3 to 9 is 2, 10 to 24 is 3, 25+ is 4. Repeat trades with the same person count 1/N. A no-show costs 2.</p>

      <section className="card p-5 mb-5">
        <label className="label block mb-2" htmlFor="housing">Where you live (for walking minutes)</label>
        <select id="housing" className="input" value={me.housing} onChange={async (e) => { await api('/me', { method: 'PATCH', body: { housing: e.target.value } }); reloadMe(); }}>
          {me.tenant.config.housing.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
        <div className="mt-4">
          <p className="label mb-2">{me.tenant.short} safe zones</p>
          <div className="flex flex-wrap gap-2">{me.tenant.config.safeZones.map((z) => <Chip key={z.id} tone="sage" icon="pin">{z.name}</Chip>)}</div>
        </div>
      </section>

      <section className="card px-5 py-2 mb-5">
        <Link to="/kit"><Row label="Course Kit" value={<Icon name="chevronRight" size={18} />} icon="kit" /></Link>
        <Link to="/carriers"><Row label="Carrier day board" value={<Icon name="chevronRight" size={18} />} icon="car" /></Link>
        {me.is_admin && <Link to="/admin"><Row label="Disputes (admin)" value={<Icon name="chevronRight" size={18} />} icon="flag" /></Link>}
      </section>

      <div className="mb-5 min-[1200px]:hidden"><DemoPanel /></div>

      <button className="btn-secondary w-full" onClick={() => { session.clear(); window.location.href = '/login'; }}><Icon name="logout" size={18} />Sign out</button>
    </div>
  );
}
