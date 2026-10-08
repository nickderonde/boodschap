// Contracttests voor de Transport-interface (S-19). Dezelfde suite draait tegen MemoryTransport (hub) en
// NostrTransport + WsTestRelay. Dekt: publiceren → ontvangen, hoogste versie per slot (ook bij replay en na herstart),
// EOSE per generatie, uitkomsten (incl. not-connected), opnieuw verbinden en maxPayloadBytes.
import type { InboundMessage, PreparedMessage, PublishOutcome, Transport } from '../../src/sync/Transport';

export interface RelayControl {
  name: string;
  setDown(down: boolean): void;
  wipe(): void;
}

export interface ContractEnv {
  make(name: string): Transport;
  relays: RelayControl[];
  /** Laat (virtuele of echte) tijd lopen. */
  tick(ms: number): Promise<void>;
  teardown(): Promise<void>;
  secret(n: number): Uint8Array;
}

export interface ContractHarness {
  name: string;
  setup(): Promise<ContractEnv>;
}

function collect(t: Transport) {
  const messages: InboundMessage[] = [];
  const eose: [string, number][] = [];
  const outcomes: [string, string, PublishOutcome][] = [];
  const endpoints: [string, string][] = [];
  t.on('message', (m) => messages.push(m));
  t.on('endOfStored', (ep, g) => eose.push([ep, g]));
  t.on('outcome', (ep, id, o) => outcomes.push([ep, id, o]));
  t.on('endpoint', (ep, s) => endpoints.push([ep, s]));
  return { messages, eose, outcomes, endpoints };
}

async function until(env: ContractEnv, cond: () => boolean, maxMs = 10_000): Promise<void> {
  let waited = 0;
  while (!cond() && waited < maxMs) {
    await env.tick(50);
    waited += 50;
  }
}

export function defineTransportContract(h: ContractHarness): void {
  describe(`S-19: Transport-contract — ${h.name}`, () => {
    let env: ContractEnv;
    beforeEach(async () => {
      env = await h.setup();
    });
    afterEach(async () => {
      await env.teardown();
    });

    const CH = 'aa'.repeat(16);

    async function connected(name: string, subs = [{ channel: CH, knownSenders: [] as string[] }]) {
      const t = env.make(name);
      const c = collect(t);
      const g = t.setSubscriptions(subs);
      t.connect();
      await until(env, () => c.eose.filter(([, gg]) => gg === g).length >= env.relays.length);
      return { t, c, g };
    }

    async function publish(t: Transport, secretN: number, version: number, slot = 0, body = 'x'): Promise<PreparedMessage> {
      const identity = t.identityFromSecret(env.secret(secretN))!;
      const m = await t.prepare({ channel: CH, slot, identity, version, envelope: new TextEncoder().encode(body) });
      t.send(m, t.endpoints.filter((e) => t.isOpen(e)));
      return m;
    }

    it('S-19: publiceren → ontvangen (live), met uitkomst accepted per endpoint', async () => {
      const a = await connected('A');
      const b = await connected('B');
      const m = await publish(a.t, 1, 1_759_740_000);
      await until(env, () => b.c.messages.some((x) => x.id === m.id) && a.c.outcomes.filter(([, id]) => id === m.id).length >= env.relays.length);
      const got = b.c.messages.find((x) => x.id === m.id)!;
      expect(got).toMatchObject({ channel: CH, slot: 0, sender: m.sender, version: 1_759_740_000 });
      expect(new TextDecoder().decode(got.envelope)).toBe('x');
      expect(got.verify()).toBe(true);
      expect(a.c.outcomes.filter(([, id]) => id === m.id).every(([, , o]) => o.kind === 'accepted')).toBe(true);
    });

    it('S-19 / S-10b: de hoogste versie per slot wint, ook bij replay van een oud bericht en na een herstart', async () => {
      const a = await connected('A');
      const newer = await publish(a.t, 1, 1_759_740_010, 0, 'nieuw');
      await until(env, () => a.c.outcomes.filter(([, id]) => id === newer.id).length >= env.relays.length);
      // replay van een ouder bericht door een "herstarte" instantie met dezelfde identiteit
      const a2 = await connected('A2');
      const older = await publish(a2.t, 1, 1_759_740_005, 0, 'oud');
      await until(env, () => a2.c.outcomes.filter(([, id]) => id === older.id).length >= env.relays.length);
      const reader = await connected('R');
      const fromSlot = reader.c.messages.filter((x) => x.sender === newer.sender && x.slot === 0);
      expect(fromSlot.length).toBeGreaterThan(0);
      expect(fromSlot.every((x) => x.id === newer.id)).toBe(true);
    });

    it('S-19: EOSE per generatie; berichten dragen hun generatie', async () => {
      const a = await connected('A');
      await publish(a.t, 1, 1_759_740_000);
      await env.tick(500);
      const b = await connected('B');
      const g2 = b.t.setSubscriptions([{ channel: CH, knownSenders: [] }]);
      expect(g2).toBeGreaterThan(b.g);
      await until(env, () => b.c.eose.filter(([, g]) => g === g2).length >= env.relays.length);
      expect(b.c.eose.filter(([, g]) => g === g2)).toHaveLength(env.relays.length);
      expect(b.c.messages.some((m) => m.generation === g2)).toBe(true);
    });

    it('S-19: send naar een niet-open endpoint geeft not-connected; daarna opnieuw verbinden en EOSE', async () => {
      const a = await connected('A');
      const r = env.relays[0];
      r.setDown(true);
      await until(env, () => !a.t.isOpen(r.name));
      expect(a.t.isOpen(r.name)).toBe(false);
      const identity = a.t.identityFromSecret(env.secret(2))!;
      const m = await a.t.prepare({ channel: CH, slot: 1, identity, version: 1_759_740_001, envelope: new Uint8Array([1]) });
      a.t.send(m, [r.name]);
      await until(env, () => a.c.outcomes.some(([ep, id]) => ep === r.name && id === m.id));
      expect(a.c.outcomes.find(([ep, id]) => ep === r.name && id === m.id)?.[2]).toEqual({ kind: 'not-connected' });
      r.setDown(false);
      const before = a.c.eose.length;
      a.t.kick();
      await until(env, () => a.t.isOpen(r.name) && a.c.eose.length > before);
      expect(a.t.isOpen(r.name)).toBe(true);
    });

    it('S-19: identityFromSecret, maxPayloadBytes en een geldige id', async () => {
      const t = env.make('X');
      expect(t.identityFromSecret(new Uint8Array(32))).toBeNull();
      const id = t.identityFromSecret(env.secret(3))!;
      expect(id.id).toMatch(/^[0-9a-f]{64}$/);
      expect(t.maxPayloadBytes).toBeGreaterThan(30_000);
      expect(t.maxPayloadBytes).toBeLessThan(49_152);
      const m = await t.prepare({ channel: CH, slot: 3, identity: id, version: 5, envelope: new Uint8Array([9]) });
      expect(m).toMatchObject({ channel: CH, slot: 3, sender: id.id, version: 5 });
      expect(m.id).toMatch(/^[0-9a-f]{64}$/);
    });
  });
}
