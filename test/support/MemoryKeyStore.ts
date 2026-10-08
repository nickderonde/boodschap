// KeyStore in geheugen (tests). Overleeft kill/herstart, net als een echte Keychain (§9.4).
// `restoredCopy()` simuleert een iOS-back-up/migratie naar een ander toestel: deviceOnly-items gaan niet mee (§19).
import type { KeyOptions, KeyStore } from '../../src/storage/KeyStore';

export class MemoryKeyStore implements KeyStore {
  readonly data = new Map<string, string>();
  readonly deviceOnly = new Set<string>();

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async set(key: string, value: string, opts?: KeyOptions): Promise<void> {
    if (!/^[\w.-]+$/.test(key)) throw new Error('ongeldige sleutelnaam voor SecureStore');
    this.data.set(key, value);
    if (opts?.deviceOnly) this.deviceOnly.add(key);
    else this.deviceOnly.delete(key);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
    this.deviceOnly.delete(key);
  }

  /** De Keychain zoals die na herstel op een ander toestel staat: alles behalve de deviceOnly-items. */
  restoredCopy(): MemoryKeyStore {
    const k = new MemoryKeyStore();
    for (const [key, v] of this.data) if (!this.deviceOnly.has(key)) k.data.set(key, v);
    return k;
  }
}
