// OK-prefix (NIP-01) → PublishOutcome (§6.6). Relays formuleren redenen verschillend; daarom ruim matchen.
import type { PublishOutcome } from '../../Transport';

export function classifyOk(ok: boolean, message: string): PublishOutcome {
  const msg = (message ?? '').trim();
  const lower = msg.toLowerCase();
  if (ok) return lower.startsWith('duplicate:') ? { kind: 'accepted', duplicate: true } : { kind: 'accepted' };
  if (lower.startsWith('duplicate:')) return { kind: 'accepted', duplicate: true };
  if (lower.startsWith('rate-limited:')) return { kind: 'rejected', reason: 'rate-limited' };
  if (/^(blocked|restricted|auth-required|pow):/.test(lower)) return { kind: 'rejected', reason: 'refused' };
  if (/created[_ ]?at|timestamp/.test(lower)) {
    if (/too late|future|too far|ahead|too new|newer than/.test(lower)) return { kind: 'rejected', reason: 'clock-ahead' };
    if (/too early|too old|in the past|older than|behind|expired/.test(lower)) return { kind: 'rejected', reason: 'clock-behind' };
  }
  if (/too large|too big|too long|size|exceeds|max.*bytes/.test(lower)) return { kind: 'rejected', reason: 'too-large' };
  return { kind: 'rejected', reason: 'other' };
}
