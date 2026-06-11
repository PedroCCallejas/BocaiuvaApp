import type { ExpoConfig } from 'expo/config';

const APP_NAME = 'Professô FC';
const APP_DESCRIPTION =
  'Organize seu time, monte escalações, acompanhe estatísticas e marque amistosos.';

type GoogleMobileAdsPluginConfig = {
  androidAppId?: string;
  iosAppId?: string;
};

function readStringEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function readBooleanEnv(name: string) {
  return process.env[name]?.trim().toLowerCase() === 'true';
}

const adsEnabled = readBooleanEnv('EXPO_PUBLIC_ADS_ENABLED');
const mobileAdsEnabled = adsEnabled && readBooleanEnv('EXPO_PUBLIC_ADS_MOBILE_ENABLED');
const buildPlatform = readStringEnv('EAS_BUILD_PLATFORM') ?? readStringEnv('EXPO_OS');
const androidAdMobAppId = readStringEnv('EXPO_PUBLIC_ADMOB_ANDROID_APP_ID');
const iosAdMobAppId = readStringEnv('EXPO_PUBLIC_ADMOB_IOS_APP_ID');
const googleMobileAdsPluginConfig: GoogleMobileAdsPluginConfig = {
  ...((!buildPlatform || buildPlatform === 'android') && androidAdMobAppId
    ? { androidAppId: androidAdMobAppId }
    : {}),
  ...((!buildPlatform || buildPlatform === 'ios') && iosAdMobAppId
    ? { iosAppId: iosAdMobAppId }
    : {}),
};

const googleMobileAdsPlugin =
  mobileAdsEnabled && Object.keys(googleMobileAdsPluginConfig).length > 0
    ? ([
        'react-native-google-mobile-ads',
        googleMobileAdsPluginConfig,
      ] as [string, GoogleMobileAdsPluginConfig])
    : null;

export default (): ExpoConfig => ({
  name: APP_NAME,
  slug: 'appboca',
  description: APP_DESCRIPTION,
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'appboca',
  userInterfaceStyle: 'automatic',
  ios: {
    icon: './assets/expo.icon',
    bundleIdentifier: 'com.seuapp.bocaiuva',
    supportsTablet: false,
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    package: 'com.seuapp.bocaiuva',
    googleServicesFile: './google-services.json',
    predictiveBackGestureEnabled: false,
    softwareKeyboardLayoutMode: 'resize',
  },
  web: {
    output: 'static',
    bundler: 'metro',
    favicon: './assets/images/favicon.png',
    name: APP_NAME,
    shortName: APP_NAME,
    themeColor: '#051108',
    backgroundColor: '#051108',
  },
  plugins: [
    'expo-router',
    [
      'expo-image-picker',
      {
        photosPermission:
          'O app precisa acessar suas fotos para enviar imagens de jogadores e do time.',
        cameraPermission:
          'O app precisa usar a câmera para tirar fotos de jogadores e do time.',
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/images/android-icon-monochrome.png',
        color: '#0E7A43',
        defaultChannel: 'default',
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#208AEF',
        android: {
          image: './assets/images/splash-icon.png',
          imageWidth: 76,
        },
      },
    ],
    'expo-web-browser',
    ...(googleMobileAdsPlugin ? [googleMobileAdsPlugin] : []),
    [
      'expo-build-properties',
      {
        ios: {
          useFrameworks: 'static',
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: 'ba99f492-9047-44f6-a2b6-682dbd19d998',
    },
  },
});
