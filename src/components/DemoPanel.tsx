import { useState } from 'react';
import { api, refreshAll, useApi } from '../api';
import { Icon } from './Icon';

export function DemoPanel({ compact }: { compact?: boolean }) {
  const { data, reload } = useApi<any>('/status', { poll: 10000 });
  const [open, setOpen] = useState(!compact);
  const [busy, setBusy] = useState(false);
  if (!data?.demo) return null;
  const offMin = Math.round(data.clock_offset_ms / 60000);
  const skip = async (minutes: number, reset = false) => {
    setBusy(true);
    try {
      await api('/demo/clock', { body: { minutes, reset } });
      await reload();
      refreshAll();
    } finally {
      setBusy(false);
    }
  };
  const setPayments = async (mode: string) => {
    setBusy(true);
    try {
      await api('/demo/payments', { body: { mode } });
      await reload();
      refreshAll();
    } finally {
      setBusy(false);
    }
  };
  const resetData = async () => {
    if (!confirm('Reset all demo data to the seed?')) return;
    await api('/demo/reset', { body: {} });
    window.location.href = '/';
  };
  const fmt = offMin === 0 ? 'real time' : `${offMin > 0 ? '+' : ''}${Math.abs(offMin) >= 120 ? `${Math.round(offMin / 60)} h` : `${offMin} min`}`;
  return (
    <div className="rounded-[20px] border border-dashed border-line bg-bg p-3">
      <button className="w-full flex items-center justify-between text-left min-h-[32px]" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="text-[13px] font-extrabold text-ink-soft flex items-center gap-1.5"><Icon name="clock" size={15} />Demo clock: {fmt}</span>
        <Icon name="chevronDown" size={16} className={`text-ink-soft transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-3 gap-1.5">
            {[[10, '+10m'], [31, '+31m'], [24 * 60, '+1 day']].map(([m, l]) => (
              <button key={l} disabled={busy} onClick={() => skip(m as number)} className="btn-secondary !min-h-[38px] !px-2 !text-[13px] !rounded-[12px]">{l}</button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <button disabled={busy || offMin === 0} onClick={() => skip(0, true)} className="btn-secondary flex-1 !min-h-[38px] !text-[13px] !rounded-[12px]">Real time</button>
            <button onClick={resetData} className="btn-secondary flex-1 !min-h-[38px] !text-[13px] !rounded-[12px]">Reset data</button>
          </div>
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Payments for new bookings">
            {[['reservation', 'Pay in person'], ['escrow', 'Test escrow']].map(([m, l]) => (
              <button key={m} disabled={busy} aria-pressed={data.payments === m} onClick={() => setPayments(m)} className={`btn-secondary !min-h-[38px] !px-2 !text-[13px] !rounded-[12px] ${data.payments === m ? '!bg-ink !text-white' : ''}`}>{l}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
