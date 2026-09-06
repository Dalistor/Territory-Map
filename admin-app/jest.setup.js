/* eslint-env jest */
// Every mock here stands in for a native module: none of them has a JS
// implementation that works outside a device, and all of them are reached
// from more than one test file, so mocking globally beats repeating the same
// `jest.mock` in each one.

// react-native-safe-area-context ships its own Jest mock (plain Views, zero
// insets), which its documentation prescribes. Global because both the screens
// (SafeAreaView) and React Navigation's internals (SafeAreaProvider) touch it.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

// The Android keystore. Tests that exercise the credentials store drive this
// mock's return values themselves; the default here just keeps any other test
// from hitting a missing native module.
jest.mock('react-native-keychain', () => ({
  setGenericPassword: jest.fn(async () => true),
  getGenericPassword: jest.fn(async () => false),
  resetGenericPassword: jest.fn(async () => true),
  ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WhenUnlockedThisDeviceOnly' },
}));

// react-native-config reads values baked in at build time from `.env`; there
// is no `.env` under Jest, and the native module would be undefined. The
// placeholder values are deliberately obvious fakes -- no test may depend on
// the real ones.
jest.mock('react-native-config', () => ({
  __esModule: true,
  default: {
    API_BASE_URL: 'http://localhost:8000',
    APP_KEY: 'test-app-key',
  },
}));

// MapLibre draws through a native view; under Jest it is replaced by plain
// host components so a screen that renders the map still mounts. The map view
// itself is not covered by automated tests (see "Testes" in the root
// AGENTS.md) -- this mock only keeps the screens around it testable.
//
// The names are the v11 surface `presentation/map/AssignmentsMapView.tsx`
// actually imports (`Map`, `Layer`, `GeoJSONSource`, `Marker`,
// `TransformRequestManager`), not the v10 one: a component missing from here
// renders as `undefined` and takes the whole screen down with it.
jest.mock('@maplibre/maplibre-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  // `forwardRef` because the map view holds a `ref` on the camera and calls
  // `fitBounds` on it; a plain function component would both warn and leave
  // that ref null.
  const passthrough = (name, handle) => {
    const Component = React.forwardRef(({ children }, ref) => {
      React.useImperativeHandle(ref, () => handle ?? {}, []);
      return React.createElement(View, null, children);
    });
    Component.displayName = name;
    return Component;
  };
  return {
    Map: passthrough('Map'),
    MapView: passthrough('MapView'),
    Camera: passthrough('Camera', { fitBounds: jest.fn(), setCamera: jest.fn() }),
    Marker: passthrough('Marker'),
    GeoJSONSource: passthrough('GeoJSONSource'),
    RasterSource: passthrough('RasterSource'),
    Layer: passthrough('Layer'),
    UserLocation: passthrough('UserLocation'),
    TransformRequestManager: { addHeader: jest.fn(), removeHeader: jest.fn() },
    setAccessToken: jest.fn(),
  };
});
