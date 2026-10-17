import { useState } from 'react';
import { api, refreshAll } from '../api';
import { ErrorNote } from '../components/ui';

/** Hidden stage control at /admin/reset: restores seed data so the demo can run twice. */
export function ResetPage() {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const reset = async () => {
    setState('busy'); setErr(null);
    try {
      await api('/demo/reset', { body: {} });
      refreshAll();
      setState('done');
    } catch (e: any) { setErr(e.message); setState('idle'); }
  };
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="card p-7 max-w-[420px] w-full">
        <h1 className="text-[24px]">Reset demo data</h1>
        <p className="font-bold text-ink-soft mt-2">Restores every campus to the seed: listings, needs, trades, stamps and the demo clock. Uploaded photos stay on disk.</p>
        <ErrorNote>{err}</ErrorNote>
        {state === 'done' ? (
          <>
            <p className="font-extrabold text-sage-deep mt-5">Done. Seed data is back.</p>
            <a href="/" className="btn-primary w-full mt-4">Open Passport</a>
          </>
        ) : (
          <button className="btn-primary w-full mt-6" disabled={state === 'busy'} onClick={reset}>{state === 'busy' ? 'Resetting...' : 'Reset now'}</button>
        )}
      </div>
    </div>
  );
}
