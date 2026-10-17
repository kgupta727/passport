const BG: Record<string, string> = { item: '#FFD9C2', textbook: '#DCEBFB', ticket: '#FFEFB8', service: '#F1ECFB' };
const BOOK_COLORS: Record<string, [string, string]> = {
  stewart: ['#3F6A9C', '#FFEFB8'], 'stewart-old': ['#8A7A5B', '#F4E9CF'], mankiw: ['#B5603A', '#FFF4EC'],
  campbell: ['#4E9A6B', '#E3F3E8'], theysay: ['#25262E', '#FF9F7A'],
};

function Drawing({ k }: { k: string }) {
  const ink = '#25262E';
  if (BOOK_COLORS[k]) {
    const [c, band] = BOOK_COLORS[k];
    return (
      <g transform="rotate(-6 60 60)">
        <rect x="34" y="20" width="54" height="76" rx="6" fill={c} />
        <rect x="34" y="20" width="8" height="76" rx="3" fill="#000" opacity="0.15" />
        <rect x="48" y="34" width="32" height="10" rx="3" fill={band} />
        <rect x="48" y="50" width="22" height="4" rx="2" fill={band} opacity="0.7" />
        <circle cx="70" cy="76" r="9" fill="none" stroke={band} strokeWidth="3" opacity="0.8" />
        <rect x="88" y="23" width="4" height="70" rx="2" fill="#fff" opacity="0.8" />
      </g>
    );
  }
  switch (k) {
    case 'fridge':
      return (<g><rect x="36" y="18" width="48" height="86" rx="8" fill="#fff" stroke={ink} strokeWidth="3" /><path d="M36 50h48" stroke={ink} strokeWidth="3" /><rect x="74" y="28" width="4" height="14" rx="2" fill={ink} /><rect x="74" y="58" width="4" height="22" rx="2" fill={ink} /><rect x="40" y="104" width="8" height="4" rx="2" fill={ink} /><rect x="72" y="104" width="8" height="4" rx="2" fill={ink} /></g>);
    case 'calculator':
      return (<g><rect x="36" y="16" width="48" height="88" rx="10" fill="#3F6A9C" /><rect x="43" y="24" width="34" height="20" rx="4" fill="#DCEBFB" /><path d="M48 36h14" stroke="#3F6A9C" strokeWidth="3" strokeLinecap="round" />{[0, 1, 2, 3].map((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={44 + c * 12} y={52 + r * 12} width="8" height="7" rx="2" fill={r === 3 && c === 2 ? '#FF9F7A' : '#fff'} />))}</g>);
    case 'lamp':
      return (<g><path d="M40 98h40" stroke={ink} strokeWidth="5" strokeLinecap="round" /><path d="M60 98 50 62l22-22" stroke={ink} strokeWidth="4" strokeLinecap="round" fill="none" /><path d="M64 30l26 6-14 22-12-28Z" fill="#fff" stroke={ink} strokeWidth="3" strokeLinejoin="round" /><circle cx="82" cy="60" r="5" fill="#FFEFB8" /></g>);
    case 'futon':
      return (<g><rect x="18" y="44" width="84" height="30" rx="10" fill="#25262E" /><rect x="22" y="66" width="76" height="20" rx="8" fill="#3a3c47" /><rect x="22" y="86" width="5" height="12" rx="2" fill={ink} /><rect x="93" y="86" width="5" height="12" rx="2" fill={ink} /><rect x="30" y="52" width="22" height="14" rx="5" fill="#FF9F7A" /></g>);
    case 'bike':
      return (<g fill="none" stroke={ink} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><circle cx="34" cy="78" r="18" /><circle cx="88" cy="78" r="18" /><path d="M34 78 52 48h28l8 30M52 48l12 30h-30M64 78l16-30M48 40h10M76 40l4 8h8" stroke="#B5603A" /></g>);
    case 'topper':
      return (<g><rect x="18" y="66" width="84" height="18" rx="8" fill="#fff" stroke={ink} strokeWidth="3" /><rect x="22" y="52" width="76" height="16" rx="7" fill="#F1ECFB" stroke={ink} strokeWidth="3" /><path d="M30 60h8M46 60h8M62 60h8M78 60h8" stroke="#5A4BA8" strokeWidth="3" strokeLinecap="round" /></g>);
    case 'ticket':
      return (<g transform="rotate(-8 60 60)"><path d="M18 40a6 6 0 0 1 6-6h72a6 6 0 0 1 6 6v8a8 8 0 0 0 0 16v8a6 6 0 0 1-6 6H24a6 6 0 0 1-6-6v-8a8 8 0 0 0 0-16v-8Z" fill="#fff" stroke={ink} strokeWidth="3" /><path d="M78 36v44" stroke={ink} strokeWidth="3" strokeDasharray="4 5" /><rect x="30" y="46" width="36" height="7" rx="3" fill="#7A5B00" /><rect x="30" y="60" width="24" height="5" rx="2.5" fill="#7A5B00" opacity="0.5" /></g>);
    case 'tutor':
      return (<g><rect x="20" y="22" width="80" height="54" rx="8" fill="#fff" stroke={ink} strokeWidth="3" /><path d="M32 60c8-20 14-20 20-6s12 10 20-14 12-8 18-2" stroke="#5A4BA8" strokeWidth="3.5" fill="none" strokeLinecap="round" /><path d="M48 76 40 98M72 76l8 22" stroke={ink} strokeWidth="3" strokeLinecap="round" /></g>);
    case 'chair':
      return (<g><rect x="40" y="18" width="40" height="44" rx="12" fill="#25262E" /><rect x="34" y="62" width="52" height="12" rx="6" fill="#3a3c47" /><path d="M60 74v16M42 100l18-10 18 10" stroke={ink} strokeWidth="4" strokeLinecap="round" fill="none" /><circle cx="42" cy="102" r="3" fill={ink} /><circle cx="78" cy="102" r="3" fill={ink} /></g>);
    case 'microwave':
      return (<g><rect x="16" y="32" width="88" height="56" rx="8" fill="#fff" stroke={ink} strokeWidth="3" /><rect x="24" y="40" width="54" height="40" rx="5" fill="#DCEBFB" stroke={ink} strokeWidth="2.5" /><circle cx="92" cy="50" r="5" fill="none" stroke={ink} strokeWidth="2.5" /><path d="M88 64h8M88 72h8" stroke={ink} strokeWidth="2.5" strokeLinecap="round" /></g>);
    default:
      return (<g><path d="M30 46 60 30l30 16v32L60 94 30 78V46Z" fill="#fff" stroke={ink} strokeWidth="3" strokeLinejoin="round" /><path d="M30 46 60 62l30-16M60 62v32" stroke={ink} strokeWidth="3" fill="none" /></g>);
  }
}

const KIND_DEFAULT: Record<string, string> = { item: 'box', textbook: 'stewart', ticket: 'ticket', service: 'tutor' };

const isDrawing = (photo?: string | null) => !!photo && photo.startsWith('/seed/') && photo.endsWith('.svg');
export const isPhoto = (photo?: string | null) => !!photo && !isDrawing(photo);

export function Art({ photo, kind, className = '', rounded = 'rounded-[22px]', alt = '' }: { photo?: string | null; kind: string; className?: string; rounded?: string; alt?: string }) {
  if (isPhoto(photo)) {
    return <img src={photo!} alt={alt} className={`object-cover bg-line ${rounded} ${className}`} loading="lazy" draggable={false} />;
  }
  const key = isDrawing(photo) ? photo!.slice(6).replace('.svg', '') : KIND_DEFAULT[kind] ?? 'box';
  return (
    <svg viewBox="0 0 120 120" className={`${rounded} ${className}`} role="img" aria-label="">
      <rect width="120" height="120" fill={BG[kind] ?? '#ECEBE6'} />
      <Drawing k={key} />
    </svg>
  );
}
