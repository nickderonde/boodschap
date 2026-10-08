// §19 / D-50 (review CR-03 R-2): een merkteken dat alleen op dít toestel bestaat en niet meegaat in een back-up of
// migratie (iOS: Library/Caches). Gebruikt om bij een KeyStore die de install_id niet kon opslaan (K-6) toch het
// verschil te zien tussen "het origineel" en "een kopie uit de back-up".
export interface DeviceMarker {
  /** De opgeslagen waarde, of null als er geen merkteken is. Gooit bij een leesfout. */
  read(): Promise<string | null>;
  /** Gooit bij een schrijffout. */
  write(value: string): Promise<void>;
}
