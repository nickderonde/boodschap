// NetInfo-adapter (§11): een overgang isConnected false → true leidt tot networkRestored (kick + flush, S-03).
// De netwerkstatus is alleen een hint; "offline" in de status komt uit de relayverbindingen.
import NetInfo from '@react-native-community/netinfo';

export function bindNetInfo(app: { networkRestored(): void }): () => void {
  let wasConnected: boolean | null = null;
  return NetInfo.addEventListener((s) => {
    const now = s.isConnected === true;
    if (wasConnected === false && now) app.networkRestored();
    wasConnected = now;
  });
}
