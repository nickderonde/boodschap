// Deelinformatie voor het deelscherm (review N3): de lijst eenmaal delen, daarna alleen opnieuw opvragen als de
// sync-status verandert, en stoppen zodra de lijst "klaar om te koppelen" is. Geen effect dat afhangt van het
// (steeds nieuwe) info-object, dus geen eindeloze lus.
import { useEffect, useRef, useState } from 'react';
import type { ShareInfo } from '../../service/types';

export interface ShareInfoSource {
  share(listId: string): Promise<ShareInfo | null>;
  shareInfo(listId: string): Promise<ShareInfo>;
}

export function useShareInfo(src: ShareInfoSource, listId: string, statusKey: string): ShareInfo | null {
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const ready = info?.ready ?? false;
  const loaded = info !== null;
  const srcRef = useRef(src);
  srcRef.current = src;

  useEffect(() => {
    let alive = true;
    void srcRef.current.share(listId).then((i) => alive && setInfo(i));
    return () => {
      alive = false;
    };
  }, [listId]);

  useEffect(() => {
    if (!loaded || ready) return;
    let alive = true;
    void srcRef.current
      .shareInfo(listId)
      .then((i) => {
        // Alleen bijwerken als "klaar" verandert: anders geen nieuwe render en geen nieuwe ronde.
        if (alive && i.ready) setInfo(i);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [listId, statusKey, loaded, ready]);

  return info;
}
