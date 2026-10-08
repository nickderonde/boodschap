// AppState-adapter (§11): active → foreground (kick + flush), background → background (flush, kort wachten, sluiten).
// `inactive` (bv. het bedieningspaneel) wordt genegeerd.
import { AppState, type AppStateStatus } from 'react-native';

export function bindAppState(app: { foreground(): void; background(): Promise<void> }): () => void {
  let last: AppStateStatus = AppState.currentState;
  const sub = AppState.addEventListener('change', (next) => {
    if (next === 'active' && last !== 'active') app.foreground();
    if (next === 'background') void app.background().catch(() => {});
    last = next;
  });
  return () => sub.remove();
}
