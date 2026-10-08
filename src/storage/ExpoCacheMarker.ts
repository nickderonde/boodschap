// DeviceMarker op expo-file-system (SDK 57, nieuwe API): een bestand in Paths.cache (iOS: Library/Caches). Die map gaat
// niet mee in een iCloud-/computerback-up of migratie; het systeem kan hem wel opruimen bij weinig opslag. Dat laatste
// geeft hooguit één onnodige (veilige) rotatie (D-50). Op Android staat back-up uit (allowBackup: false).
import { File, Paths } from 'expo-file-system';
import type { DeviceMarker } from './DeviceMarker';

const NAME = 'bs.install-marker';

export const expoCacheMarker: DeviceMarker = {
  async read() {
    const f = new File(Paths.cache, NAME);
    if (!f.exists) return null;
    return (await f.text()).trim() || null;
  },
  async write(value) {
    const f = new File(Paths.cache, NAME);
    if (!f.exists) f.create();
    f.write(value);
  },
};
