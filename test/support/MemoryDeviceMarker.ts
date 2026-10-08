// DeviceMarker in geheugen (tests, D-50). Overleeft kill/herstart van de app, maar gaat NIET mee in een back-up:
// een kopie uit de back-up krijgt een nieuwe, lege MemoryDeviceMarker. `purge()` simuleert dat iOS de cache opruimt.
import type { DeviceMarker } from '../../src/storage/DeviceMarker';

export class MemoryDeviceMarker implements DeviceMarker {
  value: string | null = null;
  failing = false;
  async read(): Promise<string | null> {
    return this.value;
  }
  async write(v: string): Promise<void> {
    if (this.failing) throw new Error('schijf vol');
    this.value = v;
  }
  purge(): void {
    this.value = null;
  }
}
