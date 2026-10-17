import { createContext, useContext } from 'react';

export interface Me {
  id: string; handle: string; name: string; email: string; is_admin: boolean; housing: string; trust_level: number;
  trust: { level: number; credit: number; next: number | null; toNext: number; handoffs: number; no_shows: number; late_cancels: number };
  tenant: {
    id: string; slug: string; name: string; short: string;
    config: {
      safeZones: { id: string; name: string; lat: number; lng: number }[]; housing: { id: string; name: string }[];
      ticketPriceCap: number; features: Record<string, boolean>; library: { name: string; url: string }; geofenceRequired: boolean;
      examples?: { event?: string; needs?: string[] }; brand?: { color: string } | null; payments?: string;
    };
    others: string[];
  };
  platform_admin: boolean;
}

export const MeContext = createContext<{ me: Me; reloadMe: () => void } | null>(null);
export const useMe = () => useContext(MeContext)!;
