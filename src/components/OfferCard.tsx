import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Art, isPhoto } from './Art';
import { Chip, HowWeFigured } from './ui';
import { Icon } from './Icon';
import { money, pct, plural } from '../format';

export function FitRows({ rows, plain }: { rows: any[]; plain?: boolean }) {
  if (!rows.length) return <p className="text-[14px] text-ink-soft font-bold">No specific requirements.</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.key + r.label} className="flex items-start gap-2 text-[14px]">
          <span className={`mt-0.5 w-5 h-5 rounded-full grid place-items-center shrink-0 ${r.status === 'met' ? 'bg-sage text-sage-deep' : r.status === 'miss' ? 'bg-peach text-peach-deep' : 'bg-butter text-butter-deep'}`}>
            <Icon name={r.status === 'met' ? 'check' : r.status === 'miss' ? 'x' : 'info'} size={12} stroke={3} />
          </span>
          <span className="flex-1"><span className="font-extrabold">{r.label}</span>{r.must && <span className="text-ink-soft font-bold"> (must)</span>}<span className="text-ink-soft font-bold">: {r.status === 'unknown' ? `${r.detail}, asked the seller` : r.detail}</span></span>
          {!plain && <span className="text-[12px] font-extrabold text-ink-soft">{r.status === 'met' ? '1' : r.status === 'miss' ? '0' : '0.5'} x{r.weight}</span>}
        </li>
      ))}
    </ul>
  );
}

export function ListingChips({ l }: { l: any }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {l.cross ? <Chip tone="butter" icon="car">{l.carrier?.own ? l.reach_label : 'Needs a carrier'}</Chip> : <Chip tone="plain" icon={l.minutes ? 'walk' : l.kind === 'ticket' ? 'ticket' : 'video'}>{l.reach_label}</Chip>}
      {l.stamps > 0 && <Chip tone="lilac" icon="stamp">{plural(l.stamps, 'stamp')}</Chip>}
      {l.condition_label && <Chip tone="plain">{l.condition_label}</Chip>}
      {l.arena_on && <Chip tone="peach" icon="hand">Duel</Chip>}
      {l.fresh === 'fading' && <Chip tone="plain" icon="clock">Fading</Chip>}
    </div>
  );
}

export function ListingTile({ l }: { l: any }) {
  return (
    <Link to={`/listing/${l.id}`} className="card p-4 flex gap-4">
      <Art photo={l.photo} kind={l.kind} className={`w-16 h-16 shrink-0 ${l.fresh === 'fading' ? 'faded' : ''}`} rounded="rounded-[16px]" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[15px] leading-snug">{l.title}</h3>
          <span className="display text-[16px] whitespace-nowrap">{money(l.ask_cents)}</span>
        </div>
        <div className="text-[13px] font-bold text-ink-soft mt-0.5">@{l.seller.handle}, {l.campus}</div>
        {l.carrier && <p className="text-[13px] font-bold text-butter-deep mt-1">{l.carrier.label}</p>}
      </div>
    </Link>
  );
}

export function OfferCard({ o, needId }: { o: any; needId?: string }) {
  const l = o.listing;
  return (
    <div className={`card p-4 ${o.ready ? 'ready-glow' : ''}`}>
      {isPhoto(l.photo) && (
        <Link to={`/listing/${l.id}${needId ? `?need=${needId}` : ''}`} className="block mb-4" tabIndex={-1} aria-hidden>
          <Art photo={l.photo} kind={l.kind} alt={l.title} className={`w-full aspect-[4/3] max-h-[240px] ${l.fresh === 'fading' ? 'faded' : ''}`} rounded="rounded-[24px]" />
        </Link>
      )}
      <Link to={`/listing/${l.id}${needId ? `?need=${needId}` : ''}`} className="flex gap-4">
        {!isPhoto(l.photo) && <Art photo={l.photo} kind={l.kind} className={`w-20 h-20 shrink-0 ${l.fresh === 'fading' ? 'faded' : ''}`} rounded="rounded-[18px]" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[16px] leading-snug">{l.title}</h3>
            <span className="display text-[18px] whitespace-nowrap">{money(l.ask_cents)}{l.kind === 'service' ? <span className="text-[12px] text-ink-soft">/hr</span> : ''}</span>
          </div>
          <div className="text-[13px] font-bold text-ink-soft mt-0.5">@{l.seller.handle}, trust {l.seller.trust_level}{l.cross ? `, ${l.campus}` : ''}</div>
          <div className="mt-2"><ListingChips l={l} /></div>
        </div>
      </Link>
      {l.cross && l.carrier && <p className="text-[13px] font-bold text-butter-deep mt-3 flex gap-2"><Icon name="car" size={16} />{l.carrier.label}</p>}
      <p className="text-[14px] font-bold mt-3">{o.explanation}</p>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {o.ready && <Chip tone="sage" icon="bolt">Ready now</Chip>}
        <span className="text-[13px] font-extrabold text-ink-soft">{o.score > 0.4 ? 'Very likely to close' : o.score > 0.25 ? 'Likely to close' : 'Less likely to close'}</span>
      </div>
      <Link to={`/listing/${l.id}${needId ? `?need=${needId}` : ''}`} className={`${o.ready ? 'btn-primary' : 'btn-secondary'} w-full mt-3 !min-h-[46px]`}>See it</Link>
      <HowWeFigured>
        <FitRows rows={o.rows} plain />
        <p className="display text-[15px] pt-2">Odds = F x R x T = {o.F.toFixed(2)} x {o.R.toFixed(2)} x {o.T.toFixed(2)} = {o.score.toFixed(2)}</p>
        <p><b>F</b> is the fit: sum(w x m) / sum(w) = {pct(o.F)}, where <b>w</b> is 3 for a must-have and 1 otherwise, and <b>m</b> is 1 if it has it, 0.5 if the seller has not said, 0 if not.</p>
        <p><b>R</b> is reach: 1 / (1 + minutes / 10), with your walk at {o.minutes} min{l.cross ? ' (including the trip between campuses)' : ''}.</p>
        <p><b>T</b> is reliability: {o.reliability.completed} of {o.reliability.claimed} booked trades completed{o.reliability.claimed < 3 ? ', counted as at least 0.5 for a new seller' : ''}.</p>
        <p>Odds above 0.40 on your own campus show as "Ready now".</p>
      </HowWeFigured>
    </div>
  );
}
