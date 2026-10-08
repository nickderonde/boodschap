// Sync-status → tekst + icoon (UX-02, S-17). Nooit alleen kleur: altijd tekst én icoon.
import type { SyncStatus } from '../sync/engine/status';
import { strings } from './strings.nl';

export type StatusIcon = 'device' | 'check' | 'sync' | 'offline' | 'partial' | 'warning';
export type StatusTone = 'neutral' | 'ok' | 'busy' | 'warn' | 'error';

export interface StatusDisplay {
  text: string;
  sub?: string;
  icon: StatusIcon;
  tone: StatusTone;
}

export function statusText(s: SyncStatus): StatusDisplay {
  switch (s.kind) {
    case 'lokaal':
      return { text: strings.status.lokaal, icon: 'device', tone: 'neutral' };
    case 'gesynchroniseerd':
      return { text: strings.status.gesynchroniseerd, icon: 'check', tone: 'ok' };
    case 'bezig':
      return { text: s.fetching ? strings.status.ophalen : strings.status.bezig, icon: 'sync', tone: 'busy' };
    case 'offline':
      return { text: strings.status.offline(s.pending), icon: 'offline', tone: 'warn' };
    case 'beperkt':
      return { text: strings.status.beperkt(s.relaysOpen, s.relaysTotal), icon: 'partial', tone: 'warn' };
    case 'fout':
      if (s.reason === 'nieuwere-versie') return { text: strings.status.nieuwereVersie, icon: 'warning', tone: 'error' };
      if (s.reason === 'te-groot') return { text: strings.status.teGroot, icon: 'warning', tone: 'error' };
      return { text: strings.status.fout, sub: strings.status.foutSub, icon: 'warning', tone: 'error' };
  }
}
