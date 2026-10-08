// Een deelcode uit een geopende link (bootschap://join#…), alleen in het geheugen (niet in de URL-state, §7).
let pending: string | null = null;

export function setPendingJoin(code: string | null): void {
  pending = code;
}

export function takePendingJoin(): string | null {
  const p = pending;
  pending = null;
  return p;
}
