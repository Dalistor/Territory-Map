/**
 * @format
 */

// Must come before anything that reaches `uuid`: React Native has no global
// `crypto`, and `uuid` v14's RNG calls `crypto.getRandomValues` directly --
// without this, generating a work-log id throws at the moment the publisher
// confirms a visit. First import in the entrypoint, because the failure is a
// module-load-order one and any later import order would reintroduce it.
import 'react-native-get-random-values';
import { AppRegistry } from 'react-native';
import App from './src/presentation/App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
