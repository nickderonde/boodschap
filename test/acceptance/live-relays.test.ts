// Rooktest tegen ECHTE publieke relays (A-01). Standaard overgeslagen; draait alleen met LIVE_RELAYS=1:
//   LIVE_RELAYS=1 npx jest test/acceptance/live-relays
// Twee gesimuleerde apparaten syncen via de standaardrelays. Bewust klein: 2 items in totaal (een paar kleine events),
// geen herhaling, geen lussen. De lijst is willekeurig en versleuteld; er staat geen leesbare inhoud op de relays.
import { addWsDevice, makeWsWorld, names, sleep, waitFor, type WsWorld } from '../sim/ws';
import { DEFAULT_CONFIG } from '../../src/config';

const live = process.env.LIVE_RELAYS === '1';
const maybe = live ? describe : describe.skip;

let w: WsWorld;
afterEach(async () => {
  await w?.stop();
});

maybe('LIVE: rooktest met de standaardrelays (alleen met LIVE_RELAYS=1)', () => {
  it('ET-LIVE-1: twee apparaten koppelen en syncen via de echte relays; aankomsttijden worden gerapporteerd', async () => {
    w = await makeWsWorld(0);
    const prod = { localWindowMs: DEFAULT_CONFIG.localWindowMs, remoteWindowMs: DEFAULT_CONFIG.remoteWindowMs, minFlushGapMs: DEFAULT_CONFIG.minFlushGapMs, statusThrottleMs: DEFAULT_CONFIG.statusThrottleMs };
    const endpoints = DEFAULT_CONFIG.defaultRelays;
    const a = await addWsDevice(w, 'LiveA', { endpoints, config: prod });
    const b = await addWsDevice(w, 'LiveB', { endpoints, config: prod });
    const la = a.app.lists()[0].id;
    const tag = Date.now().toString(36);
    const t0 = Date.now();
    a.app.addItem(la, { text: `rooktest-${tag}-a` });
    const info = await a.app.share(la);
    const readyMs = await waitFor(async () => (await a.app.shareInfo(la)).ready, 60_000, 100);
    const st = a.app.syncStatus(la);
    const j = await b.app.join(info.text);
    if (j.kind === 'error') throw new Error('join: ' + j.code);
    const lb = j.listId;
    const joinMs = await waitFor(() => names(b, lb).includes(`rooktest-${tag}-a`), 60_000, 50);
    const t1 = Date.now();
    b.app.addItem(lb, { text: `rooktest-${tag}-b` });
    const backMs = await waitFor(() => names(a, la).includes(`rooktest-${tag}-b`), 60_000, 50).then((ms) => ms);
    // eslint-disable-next-line no-console
    console.log(`LIVE-RESULTAAT: relays open bij A: ${st.relaysOpen}/${st.relaysTotal}; klaar-om-te-koppelen na ${readyMs} ms; B ziet A's item ${joinMs} ms na koppelen; A ziet B's item ${backMs} ms na toevoegen (totaal ${Date.now() - t0} ms, ${Date.now() - t1} ms vanaf B's wijziging)`);
    await sleep(500);
    expect(names(a, la)).toEqual(names(b, lb));
    expect(backMs).toBeLessThanOrEqual(15_000); // ruime ondergrens voor de echte wereld; eis S-12 is mediaan <= 5 s over 10 handmetingen
  }, 150_000);
});
