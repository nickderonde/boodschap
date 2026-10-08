// UI-tests bij de codereview M4/M5 (N3, K-1, K-2, K-3, K-4, K-5, K-7). Elk faalt zonder de fix.
import { memo, Profiler } from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import fs from 'node:fs';
import path from 'node:path';
import { useShareInfo, type ShareInfoSource } from './hooks/useShareInfo';
import { clearShareCodeFromClipboard, containsShareCode } from './clipboard';
import { createScanGate } from './scanGate';
import { monoFontFor } from './theme';
import { AppProvider } from './AppContext';
import { ItemRow } from './components/ItemRow';
import { toTextCode, toLink, shareText } from '../core/codec/sharecode';
import { materialize } from '../core/crdt/materialize';
import { createItemDelta, editItemDelta } from '../core/ops';
import { emptyList, mergeList } from '../core/crdt/list';
import { formatHlc, HlcClock } from '../core/hlc';
import type { BootschapApp } from '../service/BootschapApp';
import type { ItemView, ListState } from '../core/types';

const ROOT = path.resolve(__dirname, '../..');
const secret = new Uint8Array(32).map((_, i) => (i * 37 + 11) & 255);

describe('N3: deelscherm vraagt de deelinfo niet eindeloos opnieuw op', () => {
  it('N3: met ready=false blijft het bij een handvol shareInfo-aanroepen binnen 1 s', async () => {
    let calls = 0;
    const src: ShareInfoSource = {
      share: async () => ({ link: 'l', code: 'c', text: 't', ready: false }),
      shareInfo: async () => {
        calls++;
        return { link: 'l', code: 'c', text: 't', ready: false };
      },
    };
    const { result } = renderHook(() => useShareInfo(src, 'L', 'bezig:1:3'));
    await waitFor(() => expect(result.current).not.toBeNull());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1000));
    });
    expect(calls).toBeLessThanOrEqual(3);
  });

  it('N3: bij een statuswijziging wordt opnieuw gekeken, en "klaar" wordt opgepikt', async () => {
    let ready = false;
    const src: ShareInfoSource = {
      share: async () => ({ link: 'l', code: 'c', text: 't', ready: false }),
      shareInfo: async () => ({ link: 'l', code: 'c', text: 't', ready }),
    };
    const { result, rerender } = renderHook(({ k }: { k: string }) => useShareInfo(src, 'L', k), { initialProps: { k: 'bezig' } });
    await waitFor(() => expect(result.current).not.toBeNull());
    ready = true;
    rerender({ k: 'gesynchroniseerd' });
    await waitFor(() => expect(result.current?.ready).toBe(true));
  });
});

describe('K-1: klembord na koppelen', () => {
  it('K-1: een deelcode (tekstcode, link of hele deeltekst) wordt herkend en gewist; ander klembord blijft staan', async () => {
    const payload = { secret, relayHints: [] };
    for (const text of [toTextCode(payload), toLink(payload), shareText(payload, 'w')]) {
      expect(containsShareCode(text)).toBe(true);
      let clip = text;
      const cb = { getStringAsync: async () => clip, setStringAsync: async (s: string) => void (clip = s) };
      expect(await clearShareCodeFromClipboard(cb)).toBe(true);
      expect(clip).toBe('');
    }
    let other = 'boodschappen: melk, brood';
    const cb = { getStringAsync: async () => other, setStringAsync: async (s: string) => void (other = s) };
    expect(await clearShareCodeFromClipboard(cb)).toBe(false);
    expect(other).toBe('boodschappen: melk, brood');
  });

  it('K-1: het koppelscherm wist het klembord na een geslaagde koppeling', () => {
    const src = fs.readFileSync(path.join(ROOT, 'app/koppelen.tsx'), 'utf8');
    expect(src).toMatch(/clearShareCodeFromClipboard\(Clipboard\)/);
  });
});

describe('K-2: rijen hertekenen bij 1000 items', () => {
  it('K-2: na het afvinken van één item rendert precies één rij opnieuw', () => {
    const N = '0000000000000001';
    let l: ListState = emptyList();
    for (let i = 0; i < 1000; i++) {
      const id = `I${String(i).padStart(15, '0')}`;
      l = mergeList(l, createItemDelta(id, { name: `p${i}`, quantity: null, unit: null, note: null, category: 'overig', addedMs: 1 }, formatHlc(1_759_740_000_000 + i, 0, N)));
    }
    const renders = new Map<string, number>();
    const Counted = memo(function Counted(p: { item: ItemView; onToggle: (id: string) => void; onEdit: (id: string) => void }) {
      renders.set(p.item.id, (renders.get(p.item.id) ?? 0) + 1);
      return <ItemRow {...p} />;
    });
    const onToggle = () => {};
    const onEdit = () => {};
    const List = ({ view }: { view: ReturnType<typeof materialize> }) => (
      <>{view.sections.flatMap((s) => s.items).map((it) => <Counted key={it.id} item={it} onToggle={onToggle} onEdit={onEdit} />)}</>
    );
    const r = render(<List view={materialize(l)} />);
    const total = () => [...renders.values()].reduce((a, b) => a + b, 0);
    expect(total()).toBe(1000);
    l = mergeList(l, editItemDelta(l.items.get('I000000000000500')!, { x: true }, new HlcClock(N), 1_759_750_000_000));
    r.rerender(<List view={materialize(l)} />);
    expect(total()).toBe(1001);
    expect(renders.get('I000000000000500')).toBe(2);
  });
});

describe('K-3 / K-7: AppProvider', () => {
  const fakeApp = (shutdown: jest.Mock) =>
    ({
      init: async () => {},
      shutdown,
      lists: () => [],
      onChange: () => () => {},
      onSyncStatus: () => () => {},
      onError: () => () => {},
    }) as unknown as BootschapApp;
  const timers = { setTimeout: () => null, clearTimeout: () => {} };

  it('K-3: bij het opruimen (Fast Refresh/unmount) wordt de app afgesloten', async () => {
    const shutdown = jest.fn(async () => {});
    const deps = { create: async () => fakeApp(shutdown), alert: () => {}, timers };
    const r = render(
      <AppProvider deps={deps} fallback={() => <Text>laden</Text>}>
        <Text>klaar</Text>
      </AppProvider>,
    );
    await screen.findByText('klaar');
    r.unmount();
    expect(shutdown).toHaveBeenCalledTimes(1);
  });

  it('K-7: na een startfout start "Opnieuw proberen" de app opnieuw', async () => {
    const shutdown = jest.fn(async () => {});
    let attempts = 0;
    const deps = {
      create: async () => {
        attempts++;
        if (attempts === 1) throw new Error('kapot');
        return fakeApp(shutdown);
      },
      alert: () => {},
      timers,
    };
    render(
      <AppProvider deps={deps} fallback={(s, retry) => <Text onPress={retry}>{s}</Text>}>
        <Text>klaar</Text>
      </AppProvider>,
    );
    const err = await screen.findByText('error');
    fireEvent.press(err);
    await screen.findByText('klaar');
    expect(attempts).toBe(2);
  });
});

describe('K-4 / K-5', () => {
  it('K-4: na een mislukte koppeling wordt dezelfde QR pas na 2 s opnieuw verwerkt', () => {
    let now = 0;
    const gate = createScanGate({ nowMs: () => now }, 2000);
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(false); // zelfde scan, nog bezig
    gate.failed();
    now = 1000;
    expect(gate.tryAcquire()).toBe(false); // nog in de pauze
    now = 2001;
    expect(gate.tryAcquire()).toBe(true);
    gate.release();
    expect(gate.tryAcquire()).toBe(true);
  });

  it('K-5: monospace per platform; het deelscherm gebruikt geen vaste "Courier"', () => {
    expect(monoFontFor('ios')).toBe('Courier');
    expect(monoFontFor('android')).toBe('monospace');
    const src = fs.readFileSync(path.join(ROOT, 'app/lijst/[id]/delen.tsx'), 'utf8');
    expect(src).not.toMatch(/fontFamily:\s*'Courier'/);
    expect(src).toMatch(/fontFamily: monoFont/);
  });
});

void Profiler;
