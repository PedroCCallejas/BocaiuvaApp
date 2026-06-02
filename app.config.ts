import type { ExpoConfig } from 'expo/config';
import appJson from './app.json';
import {
  APP_DESCRIPTION,
  APP_NAME,
  APP_SHORT_NAME,
} from './src/constants/branding';

const baseConfig = appJson.expo as ExpoConfig;
const basePlugins = (baseConfig.plugins ?? []).filter((plugin) => {
  if (typeof plugin === 'string') {
    return (
      plugin !== 'react-native-google-mobile-ads' &&
      plugin !== 'expo-build-properties'
    );
  }

  return (
    plugin[0] !== 'react-native-google-mobile-ads' &&
    plugin[0] !== 'expo-build-properties'
  );
});

export default (): ExpoConfig => ({
  ...baseConfig,
  name: APP_NAME,
  description: APP_DESCRIPTION,
  web: {
    ...baseConfig.web,
    name: APP_NAME,
    shortName: APP_SHORT_NAME,
  },
  plugins: [
    ...basePlugins,
    [
      'react-native-google-mobile-ads',
      {
        androidAppId: process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID,
      },
    ],
    [
      'expo-build-properties',
      {
        ios: {
          useFrameworks: 'static',
        },
      },
    ],
  ],
});
