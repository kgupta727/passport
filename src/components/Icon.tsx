const P: Record<string, string> = {
  needs: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm3.5 5.5-2 5-5 2 2-5 5-2Z',
  plus: 'M12 5v14M5 12h14',
  trades: 'M7 7h11l-3-3M17 17H6l3 3',
  kit: 'M4 5.5A1.5 1.5 0 0 1 5.5 4H10v16H5.5A1.5 1.5 0 0 1 4 18.5v-13ZM10 4h4v16h-4M14 6l4-1.2 2.4 13.6-4 1.2L14 6Z',
  book: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5v-15ZM5 19.5A1.5 1.5 0 0 0 6.5 21H19M9 7h6',
  item: 'M3.5 8 12 3.5 20.5 8v8L12 20.5 3.5 16V8ZM3.5 8 12 12.5 20.5 8M12 12.5v8',
  ticket: 'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V7ZM14 5v12',
  service: 'M12 4 2.5 9 12 14l9.5-5L12 4ZM6 11v4.5c0 1.5 2.7 3 6 3s6-1.5 6-3V11M21.5 9v5',
  chevronRight: 'm9 6 6 6-6 6',
  chevronLeft: 'm15 6-6 6 6 6',
  chevronDown: 'm6 9 6 6 6-6',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3 2',
  pin: 'M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12ZM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  shield: 'M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3ZM9 12l2 2 4-4',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6 6 18',
  qr: 'M4 4h6v6H4V4ZM14 4h6v6h-6V4ZM4 14h6v6H4v-6ZM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2zM16 16h2v2h-2z',
  camera: 'M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8ZM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  message: 'M5 5h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4 3.5V6a1 1 0 0 1 1-1Z',
  star: 'm12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z',
  stamp: 'M9 4h6l-1 6h3a2 2 0 0 1 2 2v3H5v-3a2 2 0 0 1 2-2h3L9 4ZM5 19h14',
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18',
  car: 'M5 16V11l2-5h10l2 5v5M3 16h18v2H3zM7.5 16a1.5 1.5 0 1 0 0 3M16.5 16a1.5 1.5 0 1 0 0 3M5 11h14',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 11v5M12 8h.01',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-4-4',
  trash: 'M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  calendar: 'M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1ZM4 10h16M8 4v4M16 4v4',
  bolt: 'M13 3 5 14h6l-1 7 8-11h-6l1-7Z',
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16ZM10 20a2 2 0 0 0 4 0',
  walk: 'M13 4.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM10 21l2-6-2.5-2.5 1-5L14 9l2 3M9.5 7.5 7 10v3M12 15l3 6',
  video: 'M4 7h11a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1ZM16 10.5 21 8v8l-5-2.5',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z',
  logout: 'M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3M10 8l-4 4 4 4M6 12h10',
  flip: 'M4 9a8 8 0 0 1 14-3l2 2M20 15a8 8 0 0 1-14 3l-2-2M20 4v4h-4M4 20v-4h4',
  hand: 'M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11.5V5a1.5 1.5 0 0 1 3 0v6.5M14 11.5V6.5a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6 7-2.5 0-4-1.2-5.5-3.5L4 14a1.5 1.5 0 0 1 2.5-1.5L8 14',
  rock: 'M6 10c0-3 2.5-5 6-5s6 2 6 5v4c0 3-2.7 5-6 5s-6-2-6-5v-4ZM6 11h12M9 5.5v5.5M12 5v6M15 5.5V11',
  paper: 'M7 3h7l4 4v14H7V3ZM14 3v4h4M10 11h5M10 14h5M10 17h3',
  scissors: 'M7 7a2.5 2.5 0 1 0 0 .01M7 17a2.5 2.5 0 1 0 0 .01M8.8 8.8 20 18M8.8 15.2 20 6',
  lock: 'M6 11h12v9H6v-9ZM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  home: 'M4 11 12 4l8 7v9h-5v-6H9v6H4v-9Z',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  eye: 'M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 22, stroke = 2, className = '' }: { name: IconName; size?: number; stroke?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={P[name]} />
    </svg>
  );
}

export const KIND_ICON: Record<string, IconName> = { item: 'item', textbook: 'book', ticket: 'ticket', service: 'service' };
