import { statusText } from './statusText';
import type { SyncStatus } from '../sync/engine/status';

const s = (over: Partial<SyncStatus>): SyncStatus => ({ kind: 'gesynchroniseerd', pending: 0, relaysOpen: 3, relaysTotal: 3, fetching: false, ...over });

describe('UX-02: sync-status → tekst + icoon', () => {
  it('UX-02: elke status heeft een tekst én een icoon (niet alleen kleur)', () => {
    const cases: [SyncStatus, string, string][] = [
      [s({ kind: 'lokaal' }), 'Alleen op dit toestel', 'device'],
      [s({ kind: 'gesynchroniseerd' }), 'Gesynchroniseerd', 'check'],
      [s({ kind: 'bezig' }), 'Synchroniseren…', 'sync'],
      [s({ kind: 'bezig', fetching: true }), 'Ophalen…', 'sync'],
      [s({ kind: 'offline', pending: 0 }), 'Offline', 'offline'],
      [s({ kind: 'offline', pending: 1 }), 'Offline — 1 wijziging wacht', 'offline'],
      [s({ kind: 'offline', pending: 3 }), 'Offline — 3 wijzigingen wachten', 'offline'],
      [s({ kind: 'beperkt', relaysOpen: 2, relaysTotal: 3 }), 'Beperkt verbonden (2 van 3)', 'partial'],
      [s({ kind: 'fout', reason: 'geweigerd' }), 'Synchronisatiefout', 'warning'],
      [s({ kind: 'fout', reason: 'geen-antwoord' }), 'Synchronisatiefout', 'warning'],
      [s({ kind: 'fout', reason: 'nieuwere-versie' }), 'Werk de app bij om deze lijst te synchroniseren', 'warning'],
      [s({ kind: 'fout', reason: 'te-groot' }), 'Lijst te groot om te synchroniseren', 'warning'],
    ];
    for (const [st, text, icon] of cases) {
      const d = statusText(st);
      expect([st.kind, d.text, d.icon]).toEqual([st.kind, text, icon]);
    }
  });

  it('UX-02 / besluit PL: de fouttekst is rustig en zegt dat de wijzigingen veilig staan', () => {
    expect(statusText(s({ kind: 'fout', reason: 'geen-antwoord' })).sub).toMatch(/veilig op deze telefoon/);
  });

  it('UX-06: geen jargon (relay, HLC, Nostr) in statusteksten', () => {
    for (const kind of ['lokaal', 'gesynchroniseerd', 'bezig', 'offline', 'beperkt', 'fout'] as const) {
      const d = statusText(s({ kind }));
      expect(`${d.text} ${d.sub ?? ''}`).not.toMatch(/relay|hlc|nostr/i);
    }
  });
});
