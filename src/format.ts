export const money = (c: number | null | undefined) => (c == null ? '' : `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`);
export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
export const listOf = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
export const pct = (x: number) => `${Math.round(x * 100)}%`;

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function when(ms: number, nowMs = Date.now()) {
  const d = new Date(ms);
  const dayDiff = Math.round((new Date(ms).setHours(0, 0, 0, 0) - new Date(nowMs).setHours(0, 0, 0, 0)) / 86400000);
  const tm = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (dayDiff === 0) return `Today ${tm}`;
  if (dayDiff === 1) return `Tomorrow ${tm}`;
  if (dayDiff === -1) return `Yesterday ${tm}`;
  if (Math.abs(dayDiff) < 7) return `${d.toLocaleDateString('en-US', { weekday: 'long' })} ${tm}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: dayDiff < -300 ? 'numeric' : undefined });
}

export function ago(ms: number, nowMs = Date.now()) {
  const s = Math.max(0, (nowMs - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return plural(Math.floor(s / 3600), 'hour') + ' ago';
  const d = Math.floor(s / 86400);
  if (d < 60) return plural(d, 'day') + ' ago';
  if (d < 365) return plural(Math.round(d / 30), 'month') + ' ago';
  return plural(Math.round(d / 365), 'year') + ' ago';
}

export const KIND_LABEL = { item: 'Item', textbook: 'Textbook', ticket: 'Ticket', service: 'Tutoring' } as const;
export const KIND_TONE = { item: 'peach', textbook: 'sky', ticket: 'butter', service: 'lilac' } as const;
export type Kind = keyof typeof KIND_LABEL;
export type Tone = 'sage' | 'sky' | 'butter' | 'peach' | 'lilac';

export const toneBg: Record<Tone, string> = { sage: 'bg-sage', sky: 'bg-sky', butter: 'bg-butter', peach: 'bg-peach', lilac: 'bg-lilac' };
export const toneText: Record<Tone, string> = { sage: 'text-sage-deep', sky: 'text-sky-deep', butter: 'text-butter-deep', peach: 'text-peach-deep', lilac: 'text-lilac-deep' };
