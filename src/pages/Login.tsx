import { useState } from 'react';
import { api, session, useApi } from '../api';
import { Logo } from '../components/Shell';
import { ErrorNote } from '../components/ui';
import { Icon } from '../components/Icon';

export function Login() {
  const { data: tenants } = useApi<any[]>('/tenants');
  const [email, setEmail] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<{ campus: string; dev_link: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try { setSent(await api('/auth/start', { body: { email } })); } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  const demo = async (em: string) => {
    const r = await api('/auth/demo', { body: { email: em } });
    session.set(r.token);
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen px-5 py-10 md:py-16">
      <div className="max-w-[980px] mx-auto grid gap-10 md:grid-cols-[1.1fr_1fr] items-start">
        <div>
          <Logo />
          <h1 className="text-[38px] md:text-[48px] leading-[1.05] mt-10">The campus marketplace that finishes the trade for you.</h1>
          <p className="text-ink-soft text-[18px] mt-5 max-w-[460px]">Tell it what you need. Passport finds offers you can actually close, checks the fit, locks a fair price, books a safe spot, and releases payment when you both scan.</p>
          <div className="mt-8 grid grid-cols-2 gap-3 max-w-[460px]">
            {[
              ['shield', 'sage', 'Every handoff confirmed by two scans'],
              ['pin', 'sky', 'Safe zones, fair on walking time'],
              ['stamp', 'lilac', 'Every item carries a passport'],
              ['hand', 'peach', 'Optional 20-second Price Duel'],
            ].map(([i, t, s]) => (
              <div key={s} className={`rounded-[22px] p-4 bg-${t}`}>
                <Icon name={i as any} className={`text-${t}-deep`} />
                <div className="font-extrabold mt-2 leading-snug">{s}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6 md:p-8">
          {sent ? (
            <div>
              <div className="w-14 h-14 rounded-full bg-sage text-sage-deep grid place-items-center mb-4"><Icon name="check" size={28} /></div>
              <h2 className="text-[24px]">Check your {sent.campus} inbox</h2>
              <p className="text-ink-soft mt-2">We sent a sign-in link to {email}. It works for 15 minutes.</p>
              <a href={sent.dev_link} className="btn-primary w-full mt-6">Open the link (dev inbox)</a>
              <p className="text-[13px] text-ink-soft font-bold mt-3">No email provider is wired up in this build, so the link shows here instead.</p>
              <button className="btn-quiet mt-2" onClick={() => setSent(null)}>Use a different email</button>
            </div>
          ) : (
            <form onSubmit={start}>
              <h2 className="text-[24px]">Sign in with your school email</h2>
              <p className="text-ink-soft mt-1">Your .edu domain picks your campus. No passwords.</p>
              <label className="label block mt-6 mb-2" htmlFor="email">School email</label>
              <input id="email" className="input" type="email" autoComplete="email" placeholder="you@school.edu" value={email} onChange={(e) => setEmail(e.target.value)} />
              <ErrorNote>{err}</ErrorNote>
              <button className="btn-primary w-full mt-5" disabled={busy || !email}>Send magic link</button>
            </form>
          )}

          {tenants?.some((t) => t.demo.length) && (
            <div className="mt-8 pt-6 border-t border-line">
              <p className="label mb-3">Demo accounts</p>
              <div className="space-y-4">
                {tenants.map((t) => (
                  <div key={t.id}>
                    <div className="text-[13px] font-extrabold text-ink-soft mb-2">{t.name}</div>
                    <div className="flex flex-wrap gap-2">
                      {t.demo.map((d: any) => (
                        <button key={d.email} onClick={() => demo(d.email)} className="btn-secondary !min-h-[44px] !text-[14px]" title={d.email}>
                          {d.is_admin ? 'Admin' : `@${d.handle}`}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[13px] text-ink-soft font-bold mt-4">Try @jordan (buyer) and @marcus_t (seller) in two windows to run a real two-phone handoff.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
