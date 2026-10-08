// Sleutelopslag (§9.4, NF-04). Implementaties: ExpoSecureKeyStore (app) en MemoryKeyStore (tests).

export interface KeyOptions {
  /**
   * §19 (review CR-03 C-2): alleen op dít toestel bewaren; gaat niet mee met een back-up of migratie naar een ander
   * toestel (iOS: `…_THIS_DEVICE_ONLY`). Gebruikt voor de `install_id`.
   */
  deviceOnly?: boolean;
}

export interface KeyStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: KeyOptions): Promise<void>;
  delete(key: string): Promise<void>;
}

export const keyNames = {
  /** §19: installatie-ID, alleen op dit toestel (deviceOnly). */
  installId: 'bs.install_id',
  secret: (localListId: string) => `bs.list.${localListId}.secret`,
  nostr: (localListId: string) => `bs.list.${localListId}.nostr`,
};
