// Zelftest bij het opstarten (§4.2): één HKDF-, AEAD- en sign/verify-ronde. Hulpmiddel voor de M4-rooktest.
import { finalizeEvent, getPublicKey, verifyEvent } from 'nostr-tools/pure';
import { buildAad, open, seal } from './core/crypto/aead';
import { deriveListKeys } from './core/crypto/kdf';
import { fromUtf8, utf8 } from './core/bytes';
import type { Logger, Random } from './core/types';

export function runSelfTest(random: Random, log: Logger): boolean {
  try {
    const { listTag, encKey } = deriveListKeys(random.bytes(32));
    const aad = buildAad('selftest', listTag, 0);
    const back = fromUtf8(open(encKey, aad, seal(encKey, aad, utf8('zelftest'), random)));
    const sk = random.bytes(32);
    const pk = getPublicKey(sk);
    const ev = finalizeEvent({ kind: 30078, created_at: 1, tags: [['d', `${listTag}:0`]], content: 'x' }, sk);
    const ok = back === 'zelftest' && pk.length === 64 && verifyEvent(ev) && typeof globalThis.crypto?.getRandomValues === 'function';
    log.info(ok ? 'selftest.ok' : 'selftest.fail');
    return ok;
  } catch (e) {
    log.error('selftest.fail', { reason: e instanceof Error ? e.name : 'unknown' });
    return false;
  }
}
