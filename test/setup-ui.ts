// Testomgeving voor de UI (jest-expo): reanimated en worklets zonder native runtime (UX-15/UX-16 swipe-rijen).
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/lib/module/mock'));
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));

// Alleen in de testomgeving: met de worklets-mock herkent gesture-handler de callbacks van ReanimatedSwipeable niet als
// worklets en logt het bij elke render dezelfde waarschuwing. In de app (babel-plugin van worklets) speelt dit niet.
// Alleen precies die melding wordt weggefilterd; alle andere console.error-meldingen blijven zichtbaar.
const originalError = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('[react-native-gesture-handler] Some of the callbacks in the gesture are worklets')) return;
  originalError(...args);
};
