// Vangt boodschap://join#… en (oud) bootschap://join#… af (ST-10; in Expo Go opent zo'n link de app niet, §7).
// De code gaat via het geheugen naar /koppelen, niet via de URL-state.
import { setPendingJoin } from '../src/ui/pendingJoin';
import { URL_SCHEMES } from '../src/core/codec/sharecode';

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  const i = path.indexOf('join#');
  if (URL_SCHEMES.some((s) => path.startsWith(`${s}://join`)) || i >= 0) {
    setPendingJoin(i >= 0 ? path : null);
    return '/koppelen';
  }
  return path;
}
