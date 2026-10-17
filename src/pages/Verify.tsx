import { useEffect, useState } from 'react';
import { api, session } from '../api';
import { Logo } from '../components/Shell';
import { ErrorNote } from '../components/ui';

export function Verify() {
  const [err, setErr] = useState<string | null>(null);
  const [onboard, setOnboard] = useState<any>(null);
  const [housing, setHousing] = useState('');

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    api('/auth/verify', { body: { token } })
      .then((r) => {
        session.set(r.token);
        if (r.is_new) setOnboard(r.user);
        else window.location.replace('/');
      })
      .catch((e) => setErr(e.message));
  }, []);

  const finish = async () => {
    await api('/me', { method: 'PATCH', body: { housing } });
    window.location.replace('/');
  };

  return (
    <div className="min-h-screen grid place-items-center px-5">
      <div className="card p-8 w-full max-w-[460px]">
        <Logo />
        {err && (
          <>
            <h1 className="text-[24px] mt-6">That link did not work</h1>
            <ErrorNote>{err}</ErrorNote>
            <a href="/login" className="btn-primary w-full mt-6">Back to sign in</a>
          </>
        )}
        {!err && !onboard && <p className="mt-6 font-bold text-ink-soft">Signing you in...</p>}
        {onboard && (
          <>
            <h1 className="text-[24px] mt-6">Welcome to {onboard.tenant.short}</h1>
            <p className="text-ink-soft mt-1">Where do you live? We use it to measure walking minutes to safe zones. Nobody else sees it.</p>
            <div className="grid gap-2 mt-5">
              {onboard.tenant.config.housing.map((h: any) => (
                <button key={h.id} data-on={housing === h.id} onClick={() => setHousing(h.id)} className="tile t-sky min-h-[52px] px-4 text-left font-extrabold">{h.name}</button>
              ))}
            </div>
            <button className="btn-primary w-full mt-6" disabled={!housing} onClick={finish}>Start</button>
          </>
        )}
      </div>
    </div>
  );
}
