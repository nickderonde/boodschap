// KeyStore op expo-secure-store (Keychain/Keystore, NF-04). AFTER_FIRST_UNLOCK (§6.1); de installatie-ID met
// AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY, zodat die niet meegaat bij een iOS-back-up of -migratie (§19, D-44).
import * as SecureStore from 'expo-secure-store';
import type { KeyStore } from './KeyStore';

const OPTS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
const DEVICE_ONLY: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

export const expoSecureKeyStore: KeyStore = {
  get: (key) => SecureStore.getItemAsync(key, OPTS),
  set: (key, value, opts) => SecureStore.setItemAsync(key, value, opts?.deviceOnly ? DEVICE_ONLY : OPTS),
  delete: (key) => SecureStore.deleteItemAsync(key, OPTS),
};
