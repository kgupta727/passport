import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

export function PhotoCarousel({ photos, alt, className = '' }: { photos: string[]; alt: string; className?: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setI(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const go = (n: number) => {
    const el = track.current;
    if (!el) return;
    const next = Math.max(0, Math.min(photos.length - 1, n));
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
    setI(next);
  };

  return (
    <div className={className}>
      <div className="relative">
        <div ref={track} className="flex overflow-x-auto snap-x snap-mandatory rounded-[24px] scrollbar-none" aria-label={`${photos.length} photos`}>
          {photos.map((p, n) => (
            <img key={p} src={p} alt={n === 0 ? alt : `${alt}, photo ${n + 1}`} className="w-full shrink-0 snap-center aspect-[4/3] object-cover bg-line" draggable={false} loading={n === 0 ? 'eager' : 'lazy'} />
          ))}
        </div>
        {photos.length > 1 && (
          <>
            <button onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous photo" className="hidden md:grid absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-surface/90 place-items-center disabled:opacity-0 transition-opacity"><Icon name="chevronLeft" /></button>
            <button onClick={() => go(i + 1)} disabled={i === photos.length - 1} aria-label="Next photo" className="hidden md:grid absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-surface/90 place-items-center disabled:opacity-0 transition-opacity"><Icon name="chevronRight" /></button>
            <div className="md:hidden absolute bottom-3 inset-x-0 flex justify-center gap-1.5">
              {photos.map((p, n) => <span key={p} className={`h-2 rounded-full transition-all ${n === i ? 'w-5 bg-surface' : 'w-2 bg-surface/60'}`} />)}
            </div>
          </>
        )}
      </div>
      {photos.length > 1 && (
        <div className="hidden md:flex gap-2 mt-2">
          {photos.map((p, n) => (
            <button key={p} onClick={() => go(n)} aria-label={`Show photo ${n + 1}`} className={`w-16 h-12 rounded-[12px] overflow-hidden border-2 ${n === i ? 'border-ink' : 'border-transparent opacity-70'}`}>
              <img src={p} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
