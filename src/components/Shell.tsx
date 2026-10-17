import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useContext, useState } from 'react';
import { Icon, IconName } from './Icon';
import { MeContext, useMe } from '../me';
import { useApi } from '../api';
import { TradeFocus } from './TradeFocus';
import { DemoPanel } from './DemoPanel';
import { Chip } from './ui';

export function Logo({ small }: { small?: boolean }) {
  const ctx = useContext(MeContext);
  const brand = ctx?.me.tenant.config.brand;
  return (
    <div className="flex items-center gap-2.5">
      <svg width={small ? 30 : 36} height={small ? 30 : 36} viewBox="0 0 512 512" aria-hidden="true">
        <rect x="96" y="56" width="320" height="400" rx="64" fill="#25262E" />
        <circle cx="256" cy="220" r="78" fill="none" stroke="#FFEFB8" strokeWidth="24" />
        <path d="M178 220h156M256 142c-28 28-28 128 0 156M256 142c28 28 28 128 0 156" fill="none" stroke="#FFEFB8" strokeWidth="16" strokeLinecap="round" />
        <rect x="190" y="350" width="132" height="24" rx="12" fill="#FF9F7A" />
      </svg>
      <span className="display text-[20px]">Passport</span>
      {brand && <span className="rounded-full px-2.5 py-0.5 text-[12px] font-extrabold text-white" style={{ background: brand.color }}>{ctx!.me.tenant.short}</span>}
    </div>
  );
}

export function TrustChip({ level }: { level: number }) {
  return <Chip tone="lilac" icon="shield">Trust {level}</Chip>;
}

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Needs', icon: 'needs' },
  { to: '/sell', label: 'Sell', icon: 'plus' },
  { to: '/trades', label: 'Trades', icon: 'trades' },
];

function isOn(path: string, to: string) {
  if (to === '/') return path === '/' || path.startsWith('/needs') || path.startsWith('/listing') || path.startsWith('/kit');
  if (to === '/trades') return path.startsWith('/trade');
  return path.startsWith(to);
}

function TabBar({ badge }: { badge: number }) {
  const loc = useLocation();
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map((t) =>
        t.to === '/sell' ? (
          <NavLink key={t.to} to={t.to} className="-mt-7 flex flex-col items-center gap-1" aria-label="Sell">
            <span className="w-[64px] h-[64px] rounded-full grid place-items-center text-ink" style={{ background: 'var(--sell)', boxShadow: '0 4px 0 var(--peach-deep)' }}>
              <Icon name="plus" size={30} stroke={2.6} />
            </span>
            <span className={`text-[12px] font-extrabold ${isOn(loc.pathname, t.to) ? 'text-ink' : 'text-ink-soft'}`}>Sell</span>
          </NavLink>
        ) : (
          <NavLink key={t.to} to={t.to} className={`relative flex flex-col items-center gap-1 min-w-[72px] min-h-[48px] pt-1 ${isOn(loc.pathname, t.to) ? 'text-ink' : 'text-ink-soft'}`}>
            <Icon name={t.icon} size={24} stroke={isOn(loc.pathname, t.to) ? 2.4 : 2} />
            <span className="text-[12px] font-extrabold">{t.label}</span>
            {t.to === '/trades' && badge > 0 && <span className="absolute top-0 right-4 min-w-[18px] h-[18px] px-1 rounded-full bg-sell text-ink text-[11px] font-extrabold grid place-items-center">{badge}</span>}
          </NavLink>
        ),
      )}
    </nav>
  );
}

function TopBar({ badge }: { badge: number }) {
  const loc = useLocation();
  const { me } = useMe();
  return (
    <header className="topbar sticky top-0 z-30 items-center justify-between gap-4 px-6 h-[72px] bg-bg/95 backdrop-blur border-b border-line">
      <NavLink to="/"><Logo small /></NavLink>
      <nav className="flex items-center gap-1 bg-surface border border-line rounded-full p-1" aria-label="Main">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} className={`relative px-5 h-11 rounded-full grid place-items-center font-extrabold ${isOn(loc.pathname, t.to) ? (t.to === '/sell' ? 'bg-sell text-ink' : 'bg-ink text-white') : 'text-ink-soft'}`}>
            <span className="flex items-center gap-2"><Icon name={t.icon} size={18} />{t.label}{t.to === '/trades' && badge > 0 && <span className="ml-1 min-w-[18px] h-[18px] px-1 rounded-full bg-sell text-ink text-[11px] grid place-items-center">{badge}</span>}</span>
          </NavLink>
        ))}
      </nav>
      <NavLink to="/me" className="flex items-center gap-2"><TrustChip level={me.trust.level} /><span className="w-10 h-10 rounded-full bg-sky text-sky-deep grid place-items-center font-extrabold">{me.handle[0].toUpperCase()}</span></NavLink>
    </header>
  );
}

function Rail({ badge }: { badge: number }) {
  const loc = useLocation();
  const { me } = useMe();
  const items: { to: string; label: string; icon: IconName; on: boolean }[] = [
    { to: '/', label: 'Needs', icon: 'needs', on: loc.pathname === '/' || loc.pathname.startsWith('/needs') || loc.pathname.startsWith('/listing') },
    { to: '/sell', label: 'Sell', icon: 'plus', on: loc.pathname.startsWith('/sell') },
    { to: '/trades', label: 'Trades', icon: 'trades', on: loc.pathname.startsWith('/trade') },
    { to: '/kit', label: 'Course Kit', icon: 'kit', on: loc.pathname.startsWith('/kit') },
  ];
  return (
    <aside className="shell-rail flex-col justify-between border-r border-line px-5 py-7">
      <div>
        <NavLink to="/" className="block px-2 mb-8"><Logo /></NavLink>
        <nav className="flex flex-col gap-1.5" aria-label="Main">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} className={`flex items-center gap-3 h-12 px-4 rounded-[18px] font-extrabold ${i.on ? (i.to === '/sell' ? 'bg-sell text-ink' : 'bg-ink text-white') : 'text-ink-soft hover:bg-surface'}`}>
              <Icon name={i.icon} size={20} />{i.label}
              {i.to === '/trades' && badge > 0 && <span className="ml-auto min-w-[20px] h-[20px] px-1 rounded-full bg-sell text-ink text-[12px] grid place-items-center">{badge}</span>}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="space-y-3">
        <DemoPanel compact />
        <NavLink to="/me" className="flex items-center gap-3 p-3 rounded-[20px] bg-surface border border-line">
          <span className="w-10 h-10 rounded-full bg-sky text-sky-deep grid place-items-center font-extrabold">{me.handle[0].toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <div className="font-extrabold truncate">@{me.handle}</div>
            <div className="text-[13px] text-ink-soft flex items-center gap-1 mb-1"><span className="w-2 h-2 rounded-full bg-sage-deep" />{me.tenant.short} verified</div>
            <TrustChip level={me.trust.level} />
          </div>
        </NavLink>
      </div>
    </aside>
  );
}

const ASIDE_KEY = 'passport.aside.closed';

function Aside({ trades, closed, onToggle }: { trades: any; closed: boolean; onToggle: () => void }) {
  const loc = useLocation();
  const nav = useNavigate();
  const [pick, setPick] = useState<string | null>(null);
  const active: any[] = trades?.active ?? [];
  const routeTrade = loc.pathname.match(/^\/trade\/([^/]+)/)?.[1];
  const candidates = active.filter((t) => t.id !== routeTrade);
  const chosen = candidates.find((t) => t.id === pick) ?? candidates.find((t) => t.action) ?? candidates[0];
  const needsYou = active.filter((t) => t.action).length;
  if (closed) {
    return (
      <aside className="shell-aside" aria-label="Active trade">
        <button onClick={onToggle} className="w-12 mx-auto flex flex-col items-center gap-2 py-3 rounded-[16px] hover:bg-surface" aria-label="Open the active trade panel" title="Open the active trade panel">
          <Icon name="chevronLeft" size={18} />
          <Icon name="trades" size={20} />
          {active.length > 0 && <span className={`min-w-[22px] h-[22px] px-1 rounded-full text-[12px] font-extrabold grid place-items-center ${needsYou ? 'bg-sell text-ink' : 'bg-line text-ink-soft'}`}>{active.length}</span>}
        </button>
      </aside>
    );
  }
  return (
    <aside className="shell-aside" aria-label="Active trade">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="text-[18px]">Active trade</h2>
        <div className="flex items-center gap-1">
          {active.length > 0 && <button className="btn-quiet text-[14px]" onClick={() => nav('/trades')}>All {active.length}</button>}
          <button onClick={onToggle} className="w-10 h-10 grid place-items-center rounded-full hover:bg-surface" aria-label="Close the active trade panel" title="Close the active trade panel"><Icon name="x" size={18} /></button>
        </div>
      </div>
      {chosen ? (
        <>
          {candidates.length > 1 && (
            <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-none">
              {candidates.map((t) => (
                <button key={t.id} onClick={() => setPick(t.id)} data-on={t.id === chosen.id} className="tile t-ink shrink-0 px-3 h-10 text-[13px] font-extrabold max-w-[150px] truncate">{t.title}</button>
              ))}
            </div>
          )}
          <TradeFocus tradeId={chosen.id} compact />
        </>
      ) : routeTrade ? (
        <p className="text-ink-soft">This trade is open in the middle column.</p>
      ) : (
        <div className="card p-6 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-sage text-sage-deep grid place-items-center mb-3"><Icon name="check" /></div>
          <p className="font-extrabold">Nothing in flight</p>
          <p className="text-ink-soft text-[14px] mt-1">When you claim something, its next step stays pinned here while you browse.</p>
        </div>
      )}
    </aside>
  );
}

export function Shell() {
  const { data: trades } = useApi<any>('/trades', { poll: 5000 });
  const badge = (trades?.active ?? []).filter((t: any) => t.action).length + (trades?.questions?.length ?? 0);
  const [asideClosed, setAsideClosed] = useState(() => { try { return localStorage.getItem(ASIDE_KEY) === '1'; } catch { return false; } });
  const toggleAside = () => {
    setAsideClosed((c) => { try { localStorage.setItem(ASIDE_KEY, c ? '0' : '1'); } catch { /* storage blocked */ } return !c; });
  };
  return (
    <div className={`shell ${asideClosed ? 'aside-closed' : ''}`}>
      <Rail badge={badge} />
      <div className="min-w-0">
        <TopBar badge={badge} />
        <main className="shell-main">
          <Outlet />
        </main>
      </div>
      <Aside trades={trades} closed={asideClosed} onToggle={toggleAside} />
      <TabBar badge={badge} />
    </div>
  );
}
