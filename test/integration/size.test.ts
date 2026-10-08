// S-15: de staat past binnen de eventlimieten van relays (WS).
import { addWsDevice, makeWsWorld, names, waitFor, wsShareAndJoin, type WsWorld } from '../sim/ws';

let w: WsWorld;
afterEach(async () => {
  await w?.stop();
});

async function fill(d: Awaited<ReturnType<typeof addWsDevice>>, listId: string, n: number) {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = d.app.addItem(listId, { text: `artikel nummer ${i} met een redelijk lange naam` }, { force: true }).result;
    if (r.kind === 'added') ids.push(r.itemId);
  }
  // 30% tombstones
  for (let i = 0; i < n; i += 10) for (let j = 0; j < 3 && i + j < n; j++) d.app.deleteItem(listId, ids[i + j]);
  await d.app.flushWrites();
}

describe('S-15: eventgrootte (WS)', () => {
  it('S-15: 1000 items met 30% tombstones → elk event ≤ 48 KiB', async () => {
    w = await makeWsWorld(1);
    const a = await addWsDevice(w, 'A');
    const b = await addWsDevice(w, 'B');
    const listA = a.app.lists()[0].id;
    await fill(a, listA, 1000);
    const info = await a.app.share(listA);
    await waitFor(async () => (await a.app.readShards(listA))!.shards.size > 0 && a.app.syncStatus(listA).kind === 'gesynchroniseerd', 20_000);
    const events = w.relays[0].dumpEvents();
    expect(events.length).toBeGreaterThanOrEqual(1);
    for (const e of events) expect(Buffer.byteLength(JSON.stringify(e))).toBeLessThanOrEqual(49_152);
    const j = await b.app.join(info.text);
    if (j.kind === 'error') throw new Error();
    await waitFor(() => !b.app.syncStatus(j.listId).fetching, 15_000);
    expect(b.app.view(j.listId).total).toBe(700);
  }, 60_000);

  it('S-15: relay met limiet 16 KiB → S groeit en de sync convergeert via kleinere delen', async () => {
    w = await makeWsWorld(1);
    w.relays[0].maxEventBytes = 16_384;
    const a = await addWsDevice(w, 'A');
    const b = await addWsDevice(w, 'B');
    const ids = await wsShareAndJoin(a, [b]);
    await fill(a, ids.get(a)!, 400);
    await waitFor(() => names(b, ids.get(b)!).length === 280, 30_000);
    const S = (await a.app.readShards(ids.get(a)!))!.shardCount;
    expect(S).toBeGreaterThan(1);
    for (const e of w.relays[0].dumpEvents()) expect(Buffer.byteLength(JSON.stringify(e))).toBeLessThanOrEqual(16_384);
  }, 60_000);
});
