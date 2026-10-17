import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { mutate, useApi } from '../api';
import { Art, isPhoto } from '../components/Art';
import { Icon } from '../components/Icon';
import { Chip, ErrorNote } from '../components/ui';
import { money, plural } from '../format';

type Tier = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
const TIER_DOT: Record<Tier, string> = { common: 'bg-[#9A9CA8]', uncommon: 'bg-sage-deep', rare: 'bg-sky-deep', epic: 'bg-lilac-deep', legendary: 'bg-[#D9A400]' };
const TIER_CHIP: Record<Tier, 'plain' | 'sage' | 'sky' | 'lilac' | 'butter'> = { common: 'plain', uncommon: 'sage', rare: 'sky', epic: 'lilac', legendary: 'butter' };

export function Explore() {
  const nav = useNavigate();
  const [zone, setZone] = useState<string | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsNote, setGpsNote] = useState<string | null>(null);
  const [budget, setBudget] = useState(50);
  const [budgetQ, setBudgetQ] = useState(50);
  const [selected, setSelected] = useState<string | null>(null);
  const [why, setWhy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { const t = setTimeout(() => setBudgetQ(budget), 250); return () => clearTimeout(t); }, [budget]);

  const qs = new URLSearchParams({ budget: String(budgetQ * 100) });
  if (gps) { qs.set('lat', String(gps.lat)); qs.set('lng', String(gps.lng)); } else if (zone) qs.set('zone', zone);
  const { data, error } = useApi<any>(`/explore?${qs}`, { poll: 20000 });

  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<{ base: L.LayerGroup; pins: L.LayerGroup } | null>(null);
  const grown = useRef(false);

  useEffect(() => {
    if (!data || map.current || !mapEl.current) return;
    const m = L.map(mapEl.current, { zoomControl: false, attributionControl: false, maxBounds: L.latLngBounds(data.map.bounds).pad(0.6), minZoom: 14 })
      .setView(data.map.center, data.map.zoom);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(m);
    L.control.zoom({ position: 'topright' }).addTo(m);
    L.control.attribution({ position: 'topright', prefix: false }).addAttribution('&copy; OpenStreetMap contributors').addTo(m);
    layers.current = { base: L.layerGroup().addTo(m), pins: L.layerGroup().addTo(m) };
    m.on('click', () => setSelected(null));
    map.current = m;
    return undefined;
  }, [data]);

  useEffect(() => () => { map.current?.remove(); map.current = null; }, []);

  useEffect(() => {
    if (!data || !map.current || !layers.current) return;
    const { base, pins } = layers.current;
    base.clearLayers(); pins.clearLayers();
    const o: [number, number] = [data.origin.lat, data.origin.lng];
    const full = data.max_reveal_minutes * data.meters_per_minute;
    const circle = L.circle(o, { radius: grown.current ? full : 1, color: '#4E9A6B', weight: 2, fillColor: '#4E9A6B', fillOpacity: 0.08, interactive: false }).addTo(base);
    if (!grown.current) {
      grown.current = true;
      const t0 = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / 600);
        circle.setRadius(full * (1 - (1 - k) ** 3));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
    L.circle(o, { radius: 3 * data.meters_per_minute, color: '#4E9A6B', weight: 1.5, dashArray: '4 6', fill: false, interactive: false }).addTo(base);
    data.zones.forEach((z: any) => {
      L.marker([z.lat, z.lng], { interactive: false, icon: L.divIcon({ className: '', html: `<div class="xp-zone"><span></span>${escapeHtml(z.name)}</div>`, iconSize: [0, 0] }) }).addTo(base);
    });
    L.marker(o, { interactive: false, zIndexOffset: 1000, icon: L.divIcon({ className: '', html: '<div class="xp-me"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }) }).addTo(base);

    data.pins.forEach((p: any, i: number) => {
      const size = p.tier === 'legendary' ? 34 : p.tier === 'epic' ? 30 : 24;
      const html = `<button type="button" class="xp-pin xp-${p.tier}${p.faint ? ' xp-faint' : ''}${p.match ? ' xp-match' : ''}${p.id === selected ? ' xp-on' : ''}" style="animation-delay:${Math.min(i, 12) * 40}ms" aria-label="${escapeHtml(`${p.tier_label}: ${p.title}, ${money(p.ask_cents)}`)}"></button>`;
      L.marker([p.lat, p.lng], { icon: L.divIcon({ className: '', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }), zIndexOffset: p.tier === 'legendary' ? 900 : p.tier === 'epic' ? 800 : 0 })
        .on('click', (e) => { L.DomEvent.stopPropagation(e); setSelected(p.id); setWhy(false); })
        .addTo(pins);
    });
  }, [data, selected]);

  useEffect(() => {
    const m = map.current;
    if (!data || !m) return;
    m.invalidateSize();
    m.panTo([data.origin.lat, data.origin.lng], { animate: true });
  }, [data?.origin.lat, data?.origin.lng, !!map.current]);

  const pick = (v: string) => {
    setSelected(null);
    if (v !== 'gps') { setGps(null); setZone(v); setGpsNote(null); return; }
    if (!('geolocation' in navigator)) { setGpsNote('This browser cannot share location. Pick where you are.'); return; }
    setGpsNote('Asking for your location...');
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGpsNote(null); },
      () => { setGps(null); setGpsNote('Location is off. Pick where you are instead.'); },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const sel = useMemo(() => data?.pins.find((p: any) => p.id === selected) ?? null, [data, selected]);

  const claim = async (p: any) => {
    setBusy(true); setErr(null);
    try {
      const r = await mutate(`/listings/${p.id}/claim`, { need_id: p.match?.need_id });
      nav(`/trade/${r.trade_id}`);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const atValue = gps ? 'gps' : zone ?? data?.origin.zone_id ?? '';

  return (
    <div className="fixed inset-0 bg-bg">
      <div ref={mapEl} className="absolute inset-x-0 top-0 bottom-[36vh] md:bottom-0" aria-label="Map of finds near you" />

      <div className="absolute top-0 left-0 right-14 z-[500] p-3 md:p-5 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto max-w-[520px]">
          <Link to="/" className="w-11 h-11 rounded-full bg-surface shadow grid place-items-center shrink-0" aria-label="Back"><Icon name="chevronLeft" /></Link>
          <label className="flex-1 min-w-0 bg-surface shadow rounded-full flex items-center gap-2 pl-4 pr-2 h-11">
            <Icon name="pin" size={18} className="text-ink-soft shrink-0" />
            <span className="text-[14px] font-extrabold text-ink-soft shrink-0">I'm at</span>
            <select value={atValue} onChange={(e) => pick(e.target.value)} className="min-w-0 flex-1 bg-transparent font-extrabold text-[15px] h-full outline-none">
              <option value="gps">My location</option>
              {data?.zones.map((z: any) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </label>
        </div>
        {(gpsNote || data?.origin.note) && <p className="pointer-events-auto mt-2 inline-block bg-surface shadow rounded-full px-4 py-2 text-[13px] font-bold">{gpsNote ?? data.origin.note}</p>}
      </div>

      <section className="absolute z-[500] inset-x-0 bottom-0 md:inset-x-auto md:left-5 md:top-24 md:bottom-5 md:w-[380px] pointer-events-none flex flex-col justify-end md:justify-start">
        <div className="pointer-events-auto bg-surface rounded-t-[28px] md:rounded-[28px] shadow-[0_-8px_30px_-12px_rgba(37,38,46,0.3)] p-5 pb-[calc(20px+env(safe-area-inset-bottom))] min-h-[38vh] md:min-h-0 max-h-[44vh] md:max-h-full overflow-y-auto">
          {error && <ErrorNote>{error}</ErrorNote>}
          {!data && !error && <p className="font-bold text-ink-soft">Lighting up your radius...</p>}

          {data && sel && (
            <div>
              <div className="flex items-start gap-3">
                <Link to={`/listing/${sel.id}`} className="shrink-0">
                  <Art photo={sel.photo} kind={sel.kind} alt={sel.title} className={isPhoto(sel.photo) ? 'w-24 h-[72px]' : 'w-[72px] h-[72px]'} rounded="rounded-[16px]" />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-[17px] leading-snug">{sel.title}</h2>
                    <button onClick={() => setSelected(null)} className="w-9 h-9 -mt-1 -mr-1 grid place-items-center rounded-full shrink-0" aria-label="Close"><Icon name="x" size={18} /></button>
                  </div>
                  <div className="display text-[22px]">{money(sel.ask_cents)}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                <Chip tone={TIER_CHIP[sel.tier as Tier]} icon="sparkle">{sel.tier_label}</Chip>
                <Chip tone="plain" icon="walk">Near {sel.zone.name}, {sel.minutes} min</Chip>
                {sel.match && <Chip tone="sage" icon="check">Matches your need</Chip>}
              </div>
              <p className="text-[13px] font-bold text-ink-soft mt-2">@{sel.seller.handle}, trust {sel.seller.trust_level}. {sel.condition_label}, seller says.</p>
              <button className="btn-quiet !px-0 text-[14px]" onClick={() => setWhy(!why)} aria-expanded={why}>Why {sel.tier_label}?</button>
              {why && sel.inputs && (
                <div className="bg-bg rounded-[16px] p-3 text-[13px] font-bold space-y-1">
                  <p className="display text-[14px]">Score = 0.6 x C + 0.4 x (D / 0.5) = {sel.score.toFixed(2)}</p>
                  <p><b>C</b> {sel.inputs.C.toFixed(2)}: scarcity, 1 / (1 + n) with n = {plural(sel.inputs.n, 'other listing')} like it on campus.</p>
                  <p><b>D</b> {sel.inputs.D.toFixed(2)}: {sel.inputs.S_cents ? `asking ${money(sel.ask_cents)} vs suggested ${money(sel.inputs.S_cents)}` : 'no suggested price yet'}, capped at 0.5.</p>
                  {sel.capped && <p>Scores as higher, shown as Rare: only about 10% of finds on campus can show as Epic or Legendary at once.</p>}
                  <p className="text-ink-soft">Computed by Passport. Sellers cannot set rarity.</p>
                </div>
              )}
              <ErrorNote>{err}</ErrorNote>
              <button className="btn-primary w-full mt-4" disabled={busy} onClick={() => claim(sel)}>{busy ? 'Claiming...' : 'Claim it, 30-minute hold'}</button>
              <Link to={`/listing/${sel.id}`} className="btn-quiet w-full mt-1 text-[14px]">See the passport</Link>
            </div>
          )}

          {data && !sel && (
            <div>
              <label className="block" htmlFor="budget">
                <span className="flex items-baseline justify-between">
                  <span className="font-extrabold">I feel like spending up to</span>
                  <span className="display text-[22px]">${budget}</span>
                </span>
              </label>
              <input id="budget" type="range" min={5} max={250} step={5} value={budget} onChange={(e) => setBudget(Number(e.target.value))} className="xp-range w-full mt-2" />

              <p className="font-extrabold mt-3">
                {data.pins.length ? `${plural(data.pins.length, 'find')} within reach` : 'Nothing within reach yet'}
                <span className="text-ink-soft font-bold"> from {data.origin.label}</span>
              </p>
              {(data.counts.out_of_range > 0 || data.counts.over_budget > 0) && (
                <p className="text-[13px] font-bold text-ink-soft mt-1">
                  {data.out_of_range_by_tier.map((x: any) => `${x.count} ${x.label}`).join(', ')}{data.counts.out_of_range ? ' farther away. Common finds show up within 3 min, Legendary from 25. ' : ''}
                  {data.counts.over_budget ? `${data.counts.over_budget} above $${budget}.` : ''}
                </p>
              )}

              {data.pins.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {data.pins.slice(0, 6).map((p: any) => (
                    <li key={p.id}>
                      <button onClick={() => { setSelected(p.id); setWhy(false); map.current?.panTo([p.lat, p.lng]); }} className="w-full flex items-center gap-3 rounded-[16px] px-2 py-2 min-h-[52px] text-left hover:bg-bg">
                        <span className={`w-3 h-3 rounded-full shrink-0 ${TIER_DOT[p.tier as Tier]}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-extrabold text-[14px] truncate">{p.title}</span>
                          <span className="block text-[12px] font-bold text-ink-soft">{p.tier_label}, {p.minutes} min{p.match ? ', matches your need' : ''}</span>
                        </span>
                        <span className="display text-[15px]">{money(p.ask_cents)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-[12px] font-extrabold text-ink-soft">
                {data.tiers.slice().reverse().map((x: any) => (
                  <span key={x.tier} className="flex items-center gap-1.5 whitespace-nowrap"><span className={`w-2.5 h-2.5 rounded-full ${TIER_DOT[x.tier as Tier]}`} />{x.label} {x.reveal_minutes}m</span>
                ))}
              </div>
              <p className="text-[12px] font-bold text-ink-soft mt-3">Pins sit at the nearest safe zone, never at anyone's home. Rarity comes from scarcity and price, computed by Passport; sellers cannot set it.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
