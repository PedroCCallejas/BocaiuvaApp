import type { ExpoConfig } from 'expo/config';

const APP_NAME = 'Professô FC';
const APP_DESCRIPTION =
  'Organize seu time, monte escalações, acompanhe estatísticas e marque amistosos.';

export default (): ExpoConfig => ({
  name: APP_NAME,
  slug: 'appboca',
  description: APP_DESCRIPTION,
  version: '1.0.0',
  web: {
    output: 'static',
    bundler: 'metro',
    favicon: './assets/images/favicon.png',
    name: APP_NAME,
    shortName: APP_NAME,
    themeColor: '#051108',
    backgroundColor: '#051108',
  },
  plugins: ['expo-router'],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: { router: {} },
});
