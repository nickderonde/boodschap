// S-11 (sync-deel): duplicaten, herhaling, volgorde en replay van oude staten zijn onschadelijk; eigen echo's
// veranderen niets.
import { addDevice, makeWorld, names, shareAndJoin } from '../sim/hub';
import { canonicalList } from '../../src/core/canonical';

describe('S-11: replay en duplicaten (hub)', () => {
  it('S-11: berichten 1×, 3× en 10× in willekeurige volgorde aanbieden → zelfde staat als enkelvoudig', async () => {
    for (const dup of [1, 3, 10]) {
      const w = await makeWorld({ seed: dup });
      for (const r of w.hub.relays.values()) {
        r.faults.duplicate = dup;
        r.faults.reorder = true;
      }
      const a = await addDevice(w, 'A');
      const b = await addDevice(w, 'B');
      const ids = await shareAndJoin(w, a, [b]);
      for (let i = 0; i < 5; i++) a.app.addItem(ids.get(a)!, { text: `p${i}` });
      await w.settle(20_000);
      const c = await addDevice(w, 'C');
      const info = await a.app.shareInfo(ids.get(a)!);
      const j = await c.app.join(info.text);
      await w.settle(20_000);
      if (j.kind === 'error') throw new Error();
      expect(names(c, j.listId)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4']);
      expect(canonicalList(c.app.stateOf(j.listId))).toBe(canonicalList(a.app.stateOf(ids.get(a)!)));
    }
  });

  it('S-11: replay van een oude staat (oude snapshot op een extra relay) verandert niets', async () => {
    const w = await makeWorld();
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const ids = await shareAndJoin(w, a, [b]);
    const listA = ids.get(a)!;
    a.app.addItem(listA, { text: 'oud' });
    await w.settle(10_000);
    const oldMsgs = w.hub.relay('wss://r1.test').all().map((m) => ({ ...m }));
    const it = a.app.view(listA).sections[0].items[0];
    a.app.updateItem(listA, it.id, { name: 'nieuw' });
    a.app.addItem(listA, { text: 'later' });
    await w.settle(10_000);
    const ref = canonicalList(b.app.stateOf(ids.get(b)!));
    // Een "replay-relay" die alleen de oude staat heeft.
    const replay = w.hub.relay('wss://replay.test');
    for (const m of oldMsgs) replay.store.set(`${m.channel}|${m.slot}|${m.sender}`, m);
    await b.app.setRelays([...w.hub.relays.keys()]);
    const tb = b.transport()!;
    // nieuwe transport is pas na herstart actief; daarom herstarten met de extra relay
    void tb;
    await b.restart();
    await w.settle(10_000);
    expect(canonicalList(b.app.stateOf(ids.get(b)!))).toBe(ref);
    expect(names(b, ids.get(b)!)).toEqual(['later', 'nieuw']);
  });

  it('S-11: eigen echo\'s (eigen events terug van de relay) veranderen niets', async () => {
    const w = await makeWorld();
    const a = await addDevice(w, 'A');
    const b = await addDevice(w, 'B');
    const ids = await shareAndJoin(w, a, [b]);
    const listA = ids.get(a)!;
    a.app.addItem(listA, { text: 'echo' });
    await w.settle(10_000);
    const rev1 = (await a.app.readFlush(listA))!.stateRev;
    const sentBefore = (a.transport() as unknown as { sent: unknown[] }).sent.length;
    a.app.foreground(); // nieuwe REQ: de relays leveren A's eigen events opnieuw
    await w.settle(10_000);
    expect((await a.app.readFlush(listA))!.stateRev).toBe(rev1);
    expect((a.transport() as unknown as { sent: unknown[] }).sent.length).toBe(sentBefore); // geen herpublicatie
  });
});
