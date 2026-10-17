import { ReactNode, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon, IconName } from './Icon';
import { Tone, toneBg, toneText, plural } from '../format';

export function Chip({ tone = 'sky', icon, children, className = '' }: { tone?: Tone | 'plain' | 'ink'; icon?: IconName; children: ReactNode; className?: string }) {
  const cls = tone === 'plain' ? 'bg-surface border border-line text-ink-soft' : tone === 'ink' ? 'bg-ink text-white' : `${toneBg[tone]} ${toneText[tone]}`;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-extrabold whitespace-nowrap ${cls} ${className}`}>
      {icon && <Icon name={icon} size={14} stroke={2.4} />}
      {children}
    </span>
  );
}

export function Stepper({ steps, current, failed }: { steps: string[]; current: number; failed?: boolean }) {
  return (
    <div className="flex items-start gap-1" aria-label={`Step ${current + 1} of ${steps.length}`}>
      {steps.map((s, i) => {
        const done = i < current || (i === current && current === steps.length - 1 && !failed);
        const on = i === current && !done;
        return (
          <div key={s} className="flex-1 flex flex-col items-center gap-1.5">
            <div className="w-full flex items-center">
              <div className={`h-[3px] flex-1 rounded-full ${i === 0 ? 'opacity-0' : i <= current ? 'bg-ink' : 'bg-line'}`} />
              <motion.div
                layout
                className={`grid place-items-center rounded-full shrink-0 ${done ? 'bg-sage-deep text-white' : on ? (failed ? 'bg-peach-deep text-white' : 'bg-ink text-white') : 'bg-line text-ink-soft'}`}
                animate={{ width: on ? 28 : 22, height: on ? 28 : 22 }}
                transition={{ duration: 0.2 }}
              >
                {done ? <Icon name="check" size={13} stroke={3} /> : failed && on ? <Icon name="x" size={13} stroke={3} /> : <span className="text-[11px] font-extrabold">{i + 1}</span>}
              </motion.div>
              <div className={`h-[3px] flex-1 rounded-full ${i === steps.length - 1 ? 'opacity-0' : i < current ? 'bg-ink' : 'bg-line'}`} />
            </div>
            <span className={`text-[12px] font-extrabold ${on ? 'text-ink' : 'text-ink-soft'}`}>{s}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ConditionBar({ value, label, verified }: { value: number; label: string; verified?: boolean }) {
  const tone = value >= 80 ? 'var(--sage-deep)' : value >= 50 ? 'var(--butter-deep)' : 'var(--peach-deep)';
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="display text-[28px] leading-none">{value}<span className="text-ink-soft text-[15px] font-body font-bold">/100</span></span>
        <span className="font-extrabold" style={{ color: tone }}>{label}</span>
      </div>
      <div className="h-3 rounded-full bg-line overflow-hidden flex gap-[3px]">
        {Array.from({ length: 10 }).map((_, i) => (
          <motion.div key={i} className="h-full flex-1 rounded-[3px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02, duration: 0.15 }}
            style={{ background: i < Math.round(value / 10) ? tone : 'transparent' }} />
        ))}
      </div>
      <div className="mt-2"><Provenance verified={!!verified} /></div>
    </div>
  );
}

export function Provenance({ verified }: { verified: boolean }) {
  return verified
    ? <span className="inline-flex items-center gap-1 text-[12px] font-extrabold text-sage-deep"><Icon name="shield" size={13} stroke={2.4} />Verified</span>
    : <span className="inline-flex items-center gap-1 text-[12px] font-extrabold text-ink-soft"><Icon name="user" size={13} stroke={2.4} />Seller says</span>;
}

export function StampRow({ count, max = 5 }: { count: number; max?: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={plural(count, 'stamp')}>
      {Array.from({ length: Math.max(max, count) }).slice(0, 8).map((_, i) => (
        <div key={i} className={`grid place-items-center w-8 h-8 rounded-full border-2 ${i < count ? 'border-lilac-deep text-lilac-deep bg-lilac rotate-[-8deg]' : 'border-dashed border-line text-line'}`}>
          <Icon name="stamp" size={15} stroke={2.2} />
        </div>
      ))}
      <span className="ml-1 text-[13px] font-extrabold text-ink-soft">{plural(count, 'stamp')}</span>
    </div>
  );
}

export function Dots({ count, index, onPick }: { count: number; index: number; onPick?: (i: number) => void }) {
  if (count < 2) return null;
  return (
    <div className="flex justify-center gap-1.5 py-3">
      {Array.from({ length: count }).map((_, i) => (
        <button key={i} aria-label={`Card ${i + 1}`} onClick={() => onPick?.(i)} className="p-1.5 -m-0.5">
          <span className={`block h-2 rounded-full transition-all duration-200 ${i === index ? 'w-5 bg-ink' : 'w-2 bg-line'}`} />
        </button>
      ))}
    </div>
  );
}

export function Ring({ value, size = 56, stroke = 7, tone = 'var(--sage-deep)', children }: { value: number; size?: number; stroke?: number; tone?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 absolute inset-0">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--line)" strokeWidth={stroke} fill="none" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} stroke={tone} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.max(0, Math.min(1, value))) }} transition={{ duration: 0.25 }} />
      </svg>
      <div className="relative text-center">{children}</div>
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <div className="absolute inset-0 bg-ink/30" onClick={onClose} />
          <motion.div role="dialog" aria-label={title}
            className="relative w-full md:max-w-[480px] max-h-[88vh] overflow-y-auto bg-surface rounded-t-[32px] md:rounded-[32px] p-6 pb-[calc(24px+env(safe-area-inset-bottom))]"
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ duration: 0.2 }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[20px]">{title}</h2>
              <button className="w-11 h-11 -mr-2 grid place-items-center rounded-full text-ink-soft" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function PageHeader({ title, sub, back, right }: { title: string; sub?: ReactNode; back?: () => void; right?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      {back && (
        <button onClick={back} className="w-11 h-11 -ml-2 grid place-items-center rounded-full shrink-0" aria-label="Back"><Icon name="chevronLeft" /></button>
      )}
      <div className="flex-1 min-w-0 pt-1">
        <h1 className="text-[26px] leading-tight">{title}</h1>
        {sub && <div className="text-ink-soft mt-1">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

export function Empty({ icon = 'sparkle', title, body, children }: { icon?: IconName; title: string; body?: string; children?: ReactNode }) {
  return (
    <div className="card p-8 text-center flex flex-col items-center gap-2">
      <div className="w-14 h-14 rounded-full bg-sky text-sky-deep grid place-items-center mb-1"><Icon name={icon} size={26} /></div>
      <h3 className="text-[18px]">{title}</h3>
      {body && <p className="text-ink-soft max-w-[320px]">{body}</p>}
      {children}
    </div>
  );
}

export function Skeleton({ h = 120, className = '' }: { h?: number; className?: string }) {
  return <div className={`rounded-[28px] bg-line/60 ${className}`} style={{ height: h }} />;
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p role="alert" className="text-error font-bold text-[14px] mt-2">{children}</p>;
}

export function Segmented<T extends string>({ value, options, onChange, tone = 'ink' }: { value: T; options: { value: T; label: string; sub?: string }[]; onChange: (v: T) => void; tone?: string }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button key={o.value} type="button" data-on={value === o.value} onClick={() => onChange(o.value)} className={`tile t-${tone} min-h-[52px] px-3 py-2 font-extrabold text-[15px]`}>
          {o.label}
          {o.sub && <div className="text-[12px] font-bold opacity-70">{o.sub}</div>}
        </button>
      ))}
    </div>
  );
}

export function Row({ label, value, icon }: { label: string; value: ReactNode; icon?: IconName }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-line/80 last:border-0">
      <span className="text-ink-soft font-bold flex items-center gap-2">{icon && <Icon name={icon} size={17} />}{label}</span>
      <span className="font-extrabold text-right">{value}</span>
    </div>
  );
}

/** Formulas live here, closed by default, so the result reads first. */
export function HowWeFigured({ children }: { children: React.ReactNode }) {
  return (
    <details className="mt-3 group">
      <summary className="font-extrabold text-[14px] text-ink-soft cursor-pointer min-h-[44px] flex items-center gap-1 list-none">
        <Icon name="chevronDown" size={16} className="transition-transform group-open:rotate-180" />How we figured this out
      </summary>
      <div className="bg-bg rounded-[16px] p-4 text-[13px] font-bold space-y-1">{children}</div>
    </details>
  );
}
