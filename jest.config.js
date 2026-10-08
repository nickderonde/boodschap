const esm = ['@noble', '@scure', 'nostr-tools', 'nostr-wasm', 'fflate'].join('|');
module.exports = {
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      roots: ['<rootDir>/src/core', '<rootDir>/src/storage', '<rootDir>/src/sync', '<rootDir>/src/service', '<rootDir>/test'],
      testMatch: ['**/*.test.ts'],
      transform: { '^.+\\.[jt]sx?$': 'babel-jest' },
      transformIgnorePatterns: [`/node_modules/(?!(${esm})/)`],
      setupFiles: ['<rootDir>/test/setup-node.ts'],
    },
    {
      displayName: 'ui',
      preset: 'jest-expo',
      roots: ['<rootDir>/src/ui', '<rootDir>/app', '<rootDir>/test/acceptance/ui'],
      // UX-15/UX-16: swipe-rijen (react-native-gesture-handler + reanimated) in de testomgeving.
      setupFiles: ['react-native-gesture-handler/jestSetup.js', '<rootDir>/test/setup-ui.ts'],
      testMatch: ['**/*.test.ts?(x)'],
      transformIgnorePatterns: [
        `/node_modules/(?!(${esm}|(jest-)?react-native|@react-native|expo(nent)?|@expo|expo-.*|react-navigation|@react-navigation|react-native-svg|react-native-qrcode-svg|react-native-gesture-handler|react-native-reanimated|react-native-worklets)/)`,
      ],
    },
  ],
};
