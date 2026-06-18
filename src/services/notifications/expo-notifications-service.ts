import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

import { db, firebaseEnabled } from '@/config/firebase/client';
import { FIRESTORE_COLLECTIONS } from '@/types/firestore';
import type { FirestoreUserDocument } from '@/types/firestore';

const PUSH_TOKEN_STORAGE_KEY = 'appboca.currentPushToken';

let notificationHandlerConfigured = false;
let notificationListenersConfigured = false;

type LegacyPushTokenUserDocument = Partial<FirestoreUserDocument> & {
  notificationTokens?: string[] | null;
  pushTokens?: string[] | null;
};

function nowIso() {
  return new Date().toISOString();
}

function isExpoGo() {
  return Constants.appOwnership === 'expo';
}

function resolveExpoProjectId() {
  const expoConfigExtra = Constants.expoConfig?.extra as
    | { eas?: { projectId?: string } }
    | undefined;

  return (
    Constants.easConfig?.projectId ??
    expoConfigExtra?.eas?.projectId ??
    process.env.EXPO_PUBLIC_EXPO_PROJECT_ID?.trim() ??
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() ??
    ''
  );
}

async function getNotificationsModule() {
  return import('expo-notifications');
}

async function readStoredPushToken() {
  return AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
}

async function persistStoredPushToken(token: string | null) {
  if (!token) {
    await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
    return;
  }

  await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
}

function normalizeStoredPushTokens(user: LegacyPushTokenUserDocument) {
  return [
    ...new Set([
      ...(user.notificationTokens ?? []),
      ...(user.pushTokens ?? []),
    ]),
  ].filter((token): token is string => Boolean(token?.trim()));
}

function describePermissionStatus(
  permissions: {
    status: string;
    granted?: boolean;
    canAskAgain?: boolean;
    ios?: { status?: number };
  },
  Notifications: {
    IosAuthorizationStatus: {
      NOT_DETERMINED: number;
      DENIED: number;
      AUTHORIZED: number;
      PROVISIONAL: number;
      EPHEMERAL: number;
    };
  },
) {
  if (Platform.OS !== 'ios') {
    return {
      status: permissions.status,
      granted: permissions.granted === true,
      canAskAgain: permissions.canAskAgain ?? null,
    };
  }

  const iosStatus = permissions.ios?.status;
  const statusLabel =
    iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED
      ? 'authorized'
      : iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL
        ? 'provisional'
        : iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL
          ? 'ephemeral'
          : iosStatus === Notifications.IosAuthorizationStatus.DENIED
            ? 'denied'
            : iosStatus === Notifications.IosAuthorizationStatus.NOT_DETERMINED
              ? 'not-determined'
              : permissions.status;

  return {
    status: statusLabel,
    granted:
      permissions.granted === true ||
      iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED ||
      iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL ||
      iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL,
    canAskAgain: permissions.canAskAgain ?? null,
  };
}

async function ensureNotificationPermission(Notifications: Awaited<ReturnType<typeof getNotificationsModule>>) {
  const existingPermissions = await Notifications.getPermissionsAsync();
  const existingStatus = describePermissionStatus(existingPermissions, Notifications);

  if (__DEV__) {
    console.info('[push] permission status', {
      platform: Platform.OS,
      phase: 'current',
      ...existingStatus,
    });
  }

  if (existingStatus.granted) {
    return existingStatus;
  }

  const requestedPermissions = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });
  const requestedStatus = describePermissionStatus(requestedPermissions, Notifications);

  if (__DEV__) {
    console.info('[push] permission status', {
      platform: Platform.OS,
      phase: 'requested',
      ...requestedStatus,
    });
  }

  return requestedStatus;
}

async function ensureAndroidNotificationChannel() {
  if (Platform.OS !== 'android') {
    return;
  }

  const Notifications = await getNotificationsModule();
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Padrao',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#0E7A43',
  });
}

export async function setupNotificationHandler() {
  if (notificationHandlerConfigured || Platform.OS === 'web') {
    return;
  }

  const Notifications = await getNotificationsModule();
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  notificationHandlerConfigured = true;

  if (notificationListenersConfigured) {
    return;
  }

  Notifications.addNotificationReceivedListener((notification) => {
    if (__DEV__) {
      console.info('[push] notification received', {
        platform: Platform.OS,
        identifier: notification.request.identifier,
        title: notification.request.content.title ?? null,
        triggerType:
          typeof notification.request.trigger === 'object' &&
          notification.request.trigger &&
          'type' in notification.request.trigger
            ? notification.request.trigger.type
            : 'unknown',
      });
    }
  });

  Notifications.addNotificationResponseReceivedListener((response) => {
    if (__DEV__) {
      console.info('[push] notification response', {
        platform: Platform.OS,
        actionIdentifier: response.actionIdentifier,
        identifier: response.notification.request.identifier,
        title: response.notification.request.content.title ?? null,
      });
    }
  });

  Notifications.addNotificationsDroppedListener(() => {
    if (__DEV__) {
      console.warn('[push] notifications dropped', {
        platform: Platform.OS,
      });
    }
  });

  notificationListenersConfigured = true;
}

export const initializeNotifications = setupNotificationHandler;

export async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') {
    if (__DEV__) {
      console.info('[push] skipped push token registration', {
        platform: Platform.OS,
        reason: 'web-not-supported',
      });
    }
    return null;
  }

  if (isExpoGo()) {
    if (__DEV__) {
      console.info('[push] skipped push token registration', {
        platform: Platform.OS,
        reason: 'expo-go',
      });
    }
    return null;
  }

  await setupNotificationHandler();

  if (!Device.isDevice) {
    if (__DEV__) {
      console.info('[push] skipped push token registration', {
        platform: Platform.OS,
        reason: 'physical-device-required',
      });
    }
    return null;
  }

  await ensureAndroidNotificationChannel();

  const Notifications = await getNotificationsModule();
  const finalPermissions = await ensureNotificationPermission(Notifications);

  if (!finalPermissions.granted) {
    return null;
  }

  const projectId = resolveExpoProjectId();
  if (!projectId) {
    if (__DEV__) {
      console.warn('[push] missing Expo projectId for getExpoPushTokenAsync.', {
        platform: Platform.OS,
      });
    }
    return null;
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });

    if (__DEV__) {
      console.info('[push] expo token generated', {
        platform: Platform.OS,
        projectId,
      });
    }

    return token.data;
  } catch (error) {
    if (__DEV__) {
      console.warn('[push] failed to generate expo push token', {
        platform: Platform.OS,
        projectId,
        error: error instanceof Error ? error.message : error,
      });
    }
    throw error;
  }
}

export async function syncCurrentUserPushToken(userId: string) {
  if (isExpoGo()) {
    if (__DEV__) {
      console.info('[push] skipped push token sync', {
        platform: Platform.OS,
        userId,
        reason: 'expo-go',
      });
    }
    return null;
  }

  if (!firebaseEnabled || !db || !userId) {
    return null;
  }

  const token = await registerForPushNotificationsAsync();
  if (!token) {
    return null;
  }

  const userRef = doc(db, FIRESTORE_COLLECTIONS.users, userId);
  const userSnapshot = await getDoc(userRef);

  if (!userSnapshot.exists()) {
    return null;
  }

  const storedToken = await readStoredPushToken();
  const currentUser = userSnapshot.data() as LegacyPushTokenUserDocument;
  const currentTokens = normalizeStoredPushTokens(currentUser);
  const tokenAlreadyPresent = currentTokens.includes(token);
  const notificationTokens = tokenAlreadyPresent
    ? currentTokens
    : [...currentTokens, token];

  if (!tokenAlreadyPresent) {
    await setDoc(
      userRef,
      {
        notificationTokens,
        updatedAt: nowIso(),
      } as Partial<FirestoreUserDocument>,
      { merge: true },
    );
  }
  await persistStoredPushToken(token);

  if (__DEV__) {
    console.info('[push] token saved', {
      platform: Platform.OS,
      userId,
      tokenSaved: true,
      tokenAlreadyPresent,
      storedTokenChanged: storedToken !== token,
      totalTokens: notificationTokens.length,
    });
  }

  return token;
}

export async function clearCurrentUserPushToken(userId: string) {
  const storedToken = await readStoredPushToken();

  if (!storedToken) {
    if (__DEV__) {
      console.info('[push] skipped token removal', {
        platform: Platform.OS,
        userId,
        reason: 'no-stored-token',
      });
    }
    return;
  }

  if (!firebaseEnabled || !db || !userId) {
    await persistStoredPushToken(null);
    return;
  }

  const userRef = doc(db, FIRESTORE_COLLECTIONS.users, userId);
  const userSnapshot = await getDoc(userRef);

  if (!userSnapshot.exists()) {
    await persistStoredPushToken(null);
    return;
  }

  const currentUser = userSnapshot.data() as LegacyPushTokenUserDocument;
  const nextTokens = normalizeStoredPushTokens(currentUser).filter(
    (token) => token !== storedToken,
  );

  await setDoc(
    userRef,
    {
      notificationTokens: nextTokens,
      updatedAt: nowIso(),
    } as Partial<FirestoreUserDocument>,
    { merge: true },
  );
  await persistStoredPushToken(null);

  if (__DEV__) {
    console.info('[push] token removed', {
      platform: Platform.OS,
      userId,
      removedToken: storedToken,
      totalTokens: nextTokens.length,
    });
  }
}

export const removeCurrentUserPushToken = clearCurrentUserPushToken;
