/* eslint-env jest */
// react-native-safe-area-context is a native module; in Jest it is replaced
// by the mock the library itself ships (plain Views, zero insets), as its
// documentation prescribes. Global rather than per-test because both the
// screens (SafeAreaView) and React Navigation's own internals
// (SafeAreaProvider, via App.tsx) touch it.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
