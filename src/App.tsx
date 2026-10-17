import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { session, useApi } from './api';
import { MeContext, Me } from './me';
import { Shell } from './components/Shell';
import { Login } from './pages/Login';
import { Verify } from './pages/Verify';
import { Home } from './pages/Home';
import { AddNeed } from './pages/AddNeed';
import { NeedPage } from './pages/Need';
import { Kit } from './pages/Kit';
import { Sell } from './pages/Sell';
import { ListingPage } from './pages/Listing';
import { Trades } from './pages/Trades';
import { TradePage } from './pages/Trade';
import { ScanPage } from './pages/Scan';
import { Carriers } from './pages/Carriers';
import { Admin } from './pages/Admin';
import { Profile } from './pages/Profile';
import { Explore } from './pages/Explore';
import { ResetPage } from './pages/Reset';
import { AdminCampuses } from './pages/AdminCampuses';
import { Skeleton } from './components/ui';

function Authed() {
  const { data: me, reload } = useApi<Me>('/me');
  if (!me) return <div className="p-6 max-w-[560px] mx-auto space-y-4"><Skeleton h={60} /><Skeleton h={260} /><Skeleton h={140} /></div>;
  return (
    <MeContext.Provider value={{ me, reloadMe: reload }}>
      <Routes>
        <Route path="explore" element={<Explore />} />
        <Route element={<Shell />}>
          <Route index element={<Home />} />
          <Route path="needs/new" element={<AddNeed />} />
          <Route path="needs/:id" element={<NeedPage />} />
          <Route path="kit" element={<Kit />} />
          <Route path="sell" element={<Sell />} />
          <Route path="listing/:id" element={<ListingPage />} />
          <Route path="trades" element={<Trades />} />
          <Route path="trade/:id" element={<TradePage />} />
          <Route path="trade/:id/scan" element={<ScanPage />} />
          <Route path="carriers" element={<Carriers />} />
          <Route path="admin" element={<Admin />} />
          <Route path="admin/campuses" element={<AdminCampuses />} />
          <Route path="me" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </MeContext.Provider>
  );
}

export function App() {
  const loc = useLocation();
  if (loc.pathname === '/auth/verify') return <Verify />;
  if (loc.pathname === '/admin/reset') return <ResetPage />;
  if (!session.token || loc.pathname === '/login') return <Login />;
  return <Authed />;
}
