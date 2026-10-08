// S-17: sync-status als testbaar model — pure functie én engine (hub).
import { deriveSyncStatus, type StatusInput } from '../../src/sync/engine/status';
import { addDevice, makeWorld, shareAndJoin } from '../sim/hub';

const base: StatusInput = {
  shared: true, joinedPending: false, relaysTotal: 3, relaysOpen: 3, relaysConnectingFirstAttempt: false, pendingCount: 0,
  initialFetchDone: true, inFlight: false, failingSinceMs: null, futureSchema: false, tooLarge: false, nowMs: 100_000,
};

describe('S-17: deriveSyncStatus (pure functie)', () => {
  it('S-17: elke status en de voorrang lokaal > offline > fout > bezig > beperkt > gesynchroniseerd', () => {
    expect(deriveSyncStatus({ ...base, shared: false, relaysOpen: 0 }).kind).toBe('lokaal');
    expect(deriveSyncStatus({ ...base, relaysOpen: 0, pendingCount: 2, futureSchema: true })).toMatchObject({ kind: 'offline', pending: 2 });
    expect(deriveSyncStatus({ ...base, futureSchema: true, pendingCount: 1 })).toMatchObject({ kind: 'fout', reason: 'nieuwere-versie' });
    expect(deriveSyncStatus({ ...base, tooLarge: true })).toMatchObject({ kind: 'fout', reason: 'te-groot' });
    expect(deriveSyncStatus({ ...base, pendingCount: 1, failingSinceMs: 100_000 - 30_000 })).toMatchObject({ kind: 'fout', reason: 'geweigerd' });
    expect(deriveSyncStatus({ ...base, pendingCount: 1, failingSinceMs: 100_000 - 29_999 }).kind).toBe('bezig');
    expect(deriveSyncStatus({ ...base, inFlight: true, relaysOpen: 1 }).kind).toBe('bezig');
    expect(deriveSyncStatus({ ...base, initialFetchDone: false }).kind).toBe('bezig');
    expect(deriveSyncStatus({ ...base, relaysOpen: 2 })).toMatchObject({ kind: 'beperkt', relaysOpen: 2, relaysTotal: 3 });
    expect(deriveSyncStatus(base).kind).toBe('gesynchroniseerd');
  });

  it('E-20: eerste verbindingspoging telt als bezig, niet als offline', () => {
    expect(deriveSyncStatus({ ...base, relaysOpen: 0, relaysConnectingFirstAttempt: true }).kind).toBe('bezig');
  });

  it('F-14: joinedPending → bezig met fetching ("Ophalen…")', () => {
    expect(deriveSyncStatus({ ...base, joinedPending: true })).toMatchObject({ kind: 'bezig', fetching: true });
  });

  it('besluit PL: geen fout zonder wachtende wijzigingen of zonder open relay', () => {
    expect(deriveSyncStatus({ ...base, pendingCount: 0, failingSinceMs: 0 }).kind).toBe('gesynchroniseerd');
    expect(deriveSyncStatus({ ...base, pendingCount: 2, relaysOpen: 0, failingSinceMs: 0 }).kind).toBe('offline');
  });
});

describe('S-17: status vanuit de engine (hub)', () => {
  it('S-17: lokaal → bezig → gesynchroniseerd; offline met aantal wachtende wijzigingen; beperkt; terug naar gesynchroniseerd', async () => {
    const w = await makeWorld();
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const listA = a.app.lists()[0].id;
    expect(a.app.syncStatus(listA).kind).toBe('lokaal');
    const seen: string[] = [];
    a.app.onSyncStatus((id, s) => id === listA && seen.push(s.kind));
    for (const r of w.hub.relays.values()) r.faults.latencyMs = 600; // zodat 'bezig' waarneembaar is (throttle 250 ms)
    const ids = await shareAndJoin(w, a, [b]);
    for (const r of w.hub.relays.values()) r.faults.latencyMs = 0;
    await w.settle(5_000);
    expect(a.app.syncStatus(listA).kind).toBe('gesynchroniseerd');
    expect(seen).toContain('bezig');
    expect(seen[seen.length - 1]).toBe('gesynchroniseerd');
    // offline met 3 wachtende wijzigingen
    a.net.online(false);
    await w.settle(1_000);
    for (let i = 0; i < 3; i++) a.app.addItem(listA, { text: `x${i}` });
    await w.settle(2_000);
    expect(a.app.syncStatus(listA)).toMatchObject({ kind: 'offline', pending: 3 });
    a.net.online(true);
    await w.settle(20_000);
    expect(a.app.syncStatus(listA)).toMatchObject({ kind: 'gesynchroniseerd', pending: 0 });
    // één van de drie relays weg → beperkt (2 van 3)
    w.hub.relay('wss://r3.test').setDown(true);
    await w.settle(5_000);
    expect(a.app.syncStatus(listA)).toMatchObject({ kind: 'beperkt', relaysOpen: 2, relaysTotal: 3 });
    w.hub.relay('wss://r3.test').setDown(false);
    a.app.foreground();
    await w.settle(5_000);
    expect(a.app.syncStatus(listA).kind).toBe('gesynchroniseerd');
    expect(b.app.syncStatus(ids.get(b)!).kind).toBe('gesynchroniseerd');
  });

  it('besluit PL: alleen time-outs + pendingCount > 0 + ≥ 1 open relay → na 30 s fout; een ack → gesynchroniseerd', async () => {
    const w = await makeWorld({ relays: ['wss://s1.test', 'wss://s2.test'] });
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const ids = await shareAndJoin(w, a, [b]);
    const listA = ids.get(a)!;
    for (const r of w.hub.relays.values()) r.faults.silentDrop = true;
    a.app.addItem(listA, { text: 'a' });
    a.app.addItem(listA, { text: 'b' });
    await w.sched.advance(1_500 + 8_000 + 29_000);
    expect(a.app.syncStatus(listA)).toMatchObject({ kind: 'bezig', pending: 2 });
    await w.sched.advance(2_000);
    // Review bevinding 13: alleen time-outs → reden 'geen-antwoord' (niet 'geweigerd').
    expect(a.app.syncStatus(listA)).toMatchObject({ kind: 'fout', reason: 'geen-antwoord' });
    for (const r of w.hub.relays.values()) r.faults.silentDrop = false;
    await w.settle(60_000);
    expect(a.app.syncStatus(listA)).toMatchObject({ kind: 'gesynchroniseerd', pending: 0 });
  });

  it('S-17: expliciete weigering door alle relays (blocked:) → fout na 30 s', async () => {
    const w = await makeWorld({ relays: ['wss://s1.test'] });
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const ids = await shareAndJoin(w, a, [b]);
    const listA = ids.get(a)!;
    w.hub.relay('wss://s1.test').faults.refuse = 'blocked:';
    a.app.addItem(listA, { text: 'a' });
    await w.sched.advance(35_000);
    expect(a.app.syncStatus(listA)).toMatchObject({ kind: 'fout', reason: 'geweigerd' });
  });
});
