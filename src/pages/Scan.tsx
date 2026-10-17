import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { api, ApiError, mutate, useApi } from '../api';
import { Icon } from '../components/Icon';
import { ErrorNote, PageHeader, Skeleton } from '../components/ui';
import { when } from '../format';
import { useMe } from '../me';

function getLocation(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(null), { timeout: 3000, maximumAge: 30000 });
  });
}

export function ScanPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { me } = useMe();
  const { data } = useApi<any>(`/trades/${id}`, { poll: 2000 });
  const [tok, setTok] = useState<any>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [tokErr, setTokErr] = useState<string | null>(null);
  const [mode, setMode] = useState<'show' | 'camera' | 'code'>('show');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const issue = useCallback(async () => {
    try {
      const t = await api(`/trades/${id}/token`, { body: {} });
      setTok({ ...t, fetched: Date.now() });
      setTokErr(null);
      setQr(await QRCode.toDataURL(t.token, { margin: 1, width: 300, errorCorrectionLevel: 'M', color: { dark: '#25262E', light: '#FFFFFF' } }));
    } catch (e: any) {
      setTok(null);
      setQr(null);
      setTokErr(e instanceof ApiError ? e.message : 'Could not get a code');
    }
  }, [id]);

  useEffect(() => { issue(); }, [issue]);
  useEffect(() => {
    if (!tok) return;
    const wait = Math.max(1000, tok.refresh_at - tok.server_now);
    const t = setTimeout(issue, wait);
    return () => clearTimeout(t);
  }, [tok, issue]);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, []);

  useEffect(() => {
    if (data?.trade.state === 'COMPLETE') nav(`/trade/${id}?stamped=1`, { replace: true });
    if (data?.trade.kind === 'service' && data?.trade.checked_in) nav(`/trade/${id}`, { replace: true });
  }, [data?.trade.state, data?.trade.checked_in]);

  const submit = async (body: any) => {
    setErr(null);
    const loc = await getLocation();
    try {
      const r = await mutate('/scan', { ...body, ...(loc ?? {}) });
      setMsg(r.complete ? 'Both scanned.' : 'Scanned. Now let them scan yours.');
      setMode('show');
      setCode('');
    } catch (e: any) { setErr(e.message); }
  };

  if (!data) return <Skeleton h={500} />;
  if (data.trade.state !== 'BOOKED') return <Navigate to={`/trade/${id}`} replace />;
  const isBuyer = data.role === 'buyer';
  const secs = tok ? Math.max(0, Math.ceil((tok.expires_at - tok.server_now - (Date.now() - tok.fetched)) / 1000)) : 0;
  const arrived = data.events.some((e: any) => e.type === 'arrive' && e.actor === me.handle);

  return (
    <div>
      <PageHeader title="Handoff scan" sub={data.slot?.label} back={() => nav(`/trade/${id}`)} />

      {isBuyer && data.trade.kind !== 'service' && (
        <div className="rounded-[24px] bg-butter p-4 mb-5 flex gap-3 font-extrabold"><Icon name="eye" className="shrink-0 text-butter-deep" />Check the item first. Scanning confirms you received it.</div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-5">
        <Status on={data.view.my_scan} label="You scanned them" />
        <Status on={data.view.their_scan} label={`@${data.counterpart.handle} scanned you`} />
      </div>

      <div className="grid grid-cols-3 gap-2 mb-5">
        {(['show', 'camera', 'code'] as const).map((m) => (
          <button key={m} data-on={mode === m} onClick={() => { setMode(m); setErr(null); }} className="tile t-lilac min-h-[48px] font-extrabold text-[14px]">
            {m === 'show' ? 'My code' : m === 'camera' ? 'Scan theirs' : 'Type code'}
          </button>
        ))}
      </div>

      {mode === 'show' && (
        <section className="rounded-[32px] bg-lilac p-6 text-center">
          {tokErr ? (
            <p className="font-extrabold py-10">{tokErr}{data.view.scan_window && <span className="block text-lilac-deep mt-1">Opens {when(data.view.scan_window.opens, data.server_now)}</span>}</p>
          ) : qr ? (
            <>
              <p className="font-extrabold mb-4">Let @{data.counterpart.handle} scan this</p>
              <img src={qr} alt="Your handoff QR code" className="mx-auto w-[260px] h-[260px] rounded-[20px] bg-white p-2" />
              <div className="display text-[34px] tracking-[0.25em] mt-4" aria-label="Six digit code">{tok.code}</div>
              <div className="mt-3 h-1.5 bg-surface/70 rounded-full overflow-hidden max-w-[260px] mx-auto"><div className="h-full bg-lilac-deep transition-all duration-1000 ease-linear" style={{ width: `${(secs / 60) * 100}%` }} /></div>
              <p className="text-[13px] font-bold text-lilac-deep mt-2">Valid {secs}s, refreshes every 30s. A screenshot is useless after that.</p>
            </>
          ) : <Skeleton h={340} />}
        </section>
      )}

      {mode === 'camera' && <Camera onToken={(t) => submit({ token: t })} />}

      {mode === 'code' && (
        <form className="card p-6" onSubmit={(e) => { e.preventDefault(); submit({ code, trade_id: id }); }}>
          <label className="label block mb-2" htmlFor="code">The 6 digits under their QR</label>
          <input id="code" className="input display !text-[28px] tracking-[0.3em] text-center" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
          <button className="btn-primary w-full mt-4" disabled={code.length !== 6}>Confirm handoff</button>
        </form>
      )}

      <ErrorNote>{err}</ErrorNote>
      {msg && <p className="font-extrabold text-sage-deep mt-3 text-center">{msg}</p>}

      <div className="mt-6 grid gap-3">
        <button className="btn-secondary" disabled={arrived} onClick={async () => { const loc = await getLocation(); try { await mutate(`/trades/${id}/event`, { event: 'arrive', payload: loc ?? {} }); setMsg('Marked as here. If they never show, you are covered.'); } catch (e: any) { setErr(e.message); } }}>
          <Icon name="pin" size={18} />I'm at the spot
        </button>
        <DemoBothScan tradeId={id!} />
      </div>
      <p className="text-[12px] text-ink-soft font-bold mt-4 leading-relaxed">
        Each code is signed by the server, tied to this trade and your account, and lives 60 seconds. You can only scan someone standing next to you.
        {data.slot?.zone && ` Location is checked against ${data.slot.zone.name} when your campus turns on geofencing.`}
      </p>
    </div>
  );
}

function Status({ on, label }: { on: boolean; label: string }) {
  return (
    <div className={`rounded-[20px] px-4 py-3 flex items-center gap-2 font-extrabold text-[14px] ${on ? 'bg-sage text-sage-deep' : 'bg-surface border border-line text-ink-soft'}`}>
      <span className={`w-6 h-6 rounded-full grid place-items-center shrink-0 ${on ? 'bg-sage-deep text-white' : 'border-2 border-dashed border-line'}`}>{on && <Icon name="check" size={13} stroke={3} />}</span>{label}
    </div>
  );
}

function DemoBothScan({ tradeId }: { tradeId: string }) {
  const { data } = useApi<any>('/status');
  const [err, setErr] = useState<string | null>(null);
  if (!data?.demo) return null;
  return (
    <div className="rounded-[20px] border border-dashed border-line p-4">
      <button className="btn-secondary w-full" onClick={async () => { try { await mutate('/demo/both-scan', { trade_id: tradeId }); } catch (e: any) { setErr(e.message); } }}>
        Demo: both at the spot
      </button>
      <p className="text-[12px] text-ink-soft font-bold mt-2">One device on stage? This fires both scans (and jumps the demo clock to the slot). Say it out loud. The real flow is two phones scanning each other.</p>
      <ErrorNote>{err}</ErrorNote>
    </div>
  );
}

function Camera({ onToken }: { onToken: (t: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const tick = () => {
          const v = video.current;
          if (!v || done.current) return;
          if (v.readyState === v.HAVE_ENOUGH_DATA) {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            ctx.drawImage(v, 0, 0);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const found = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            if (found?.data) {
              done.current = true;
              onToken(found.data);
              return;
            }
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setErr('Camera is not available. Use "Type code" instead.');
      }
    })();
    return () => { cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  return (
    <section className="rounded-[32px] bg-ink p-3 relative overflow-hidden">
      {err ? <p className="text-white font-extrabold text-center py-16 px-4">{err}</p> : (
        <>
          <video ref={video} className="w-full aspect-square object-cover rounded-[24px]" playsInline muted />
          <div className="absolute inset-10 border-4 border-white/80 rounded-[28px] pointer-events-none" />
          <p className="text-white/80 font-bold text-center text-[14px] py-2">Point at their screen</p>
        </>
      )}
    </section>
  );
}
