import type { ExpoConfig, ConfigContext } from 'expo/config';

const APP_ENV = process.env.APP_ENV ?? 'development';

const appName: Record<string, string> = {
  development: 'FreedomFire (dev)',
  preview: 'FreedomFire (staging)',
  production: 'FreedomFire',
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: appName[APP_ENV] ?? 'FreedomFire',
  slug: 'funance',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'freedomfire',
  userInterfaceStyle: 'dark',
  newArchEnabled: true,
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#0D0D0D',
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.freedomfire.app',
  },
  android: {
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0D0D0D',
    },
    edgeToEdgeEnabled: true,
    package: 'com.freedomfire.app',
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'freedomfire' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-document-picker',
    [
      '@sentry/react-native/expo',
      {
        url: 'https://sentry.io/',
        project: 'react-native',
        organization: 'freedomfire',
      },
    ],
    '@sentry/react-native',
    'expo-font',
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    appEnv: APP_ENV,
    eas: {
      projectId: 'a13922fa-de8a-4807-b2fe-00f106500b7b',
    },
  },
  owner: 'ganesh.reddy.22',
});
