// NF-10 (logica): toevoegen < 100 ms; view() van 500 items < 50 ms; koude init() + view() van 500 items < 200 ms (M2).
import { singleDevice, tmpDbFile } from '../support/single';

describe('NF-10: prestaties (Node)', () => {
  it('NF-10: koude init() + view() van 500 items < 200 ms; view < 50 ms; toevoegen < 100 ms', async () => {
    const file = tmpDbFile();
    const d = await singleDevice({ file });
    const listId = d.app.lists()[0].id;
    for (let i = 0; i < 500; i++) d.app.addItem(listId, { text: `product nummer ${i}` });
    await d.app.flushWrites();
    const t0 = performance.now();
    const cold = await d.restart();
    const v = cold.app.view(listId);
    const coldMs = performance.now() - t0;
    expect(v.total).toBe(500);
    expect(coldMs).toBeLessThan(200);
    const t1 = performance.now();
    cold.app.addItem(listId, { text: 'nog een' });
    expect(performance.now() - t1).toBeLessThan(100);
    const t2 = performance.now();
    cold.app.view(listId);
    expect(performance.now() - t2).toBeLessThan(50);
  });
});
