// Jest-setup voor het node-project (NF-06, K-1).
// - fetch en XMLHttpRequest gooien: de app-code mag geen HTTP doen.
// - SimulatedCrash van zombie-instanties (KillSwitch) wordt niet als unhandled rejection gerapporteerd.

const g = globalThis as Record<string, unknown>;

g.fetch = () => {
  throw new Error('NF-06: fetch is niet toegestaan in Bootschap');
};
g.XMLHttpRequest = function XMLHttpRequestBlocked() {
  throw new Error('NF-06: XMLHttpRequest is niet toegestaan in Bootschap');
};

const FLAG = '__bootschapUnhandledHook';
if (!(process as unknown as Record<string, unknown>)[FLAG]) {
  (process as unknown as Record<string, unknown>)[FLAG] = true;
  process.on('unhandledRejection', (reason: unknown) => {
    if (reason && typeof reason === 'object' && (reason as { name?: string }).name === 'SimulatedCrash') return;
    // Andere unhandled rejections zijn echte fouten: zichtbaar maken.
    // eslint-disable-next-line no-console
    console.error('unhandledRejection', reason);
  });
}

// node:sqlite meldt een ExperimentalWarning; die ruis onderdrukken we in tests.
const origEmit = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  const msg = typeof warning === 'string' ? warning : warning?.message;
  if (msg && msg.includes('SQLite is an experimental feature')) return;
  return (origEmit as (...a: unknown[]) => void)(warning, ...rest);
}) as typeof process.emitWarning;
