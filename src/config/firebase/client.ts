import AsyncStorage from '@react-native-async-storage/async-storage'
import * as FirebaseAuth from 'firebase/auth'
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { Platform } from 'react-native'

type FirebaseAuthModule = typeof FirebaseAuth & {
  getReactNativePersistence?: (
    storage: typeof AsyncStorage
  ) => FirebaseAuth.Persistence
  browserLocalPersistence?: FirebaseAuth.Persistence
}

const { browserLocalPersistence, getAuth, initializeAuth } =
  FirebaseAuth as FirebaseAuthModule
const { getReactNativePersistence } = FirebaseAuth as FirebaseAuthModule

type Auth = FirebaseAuth.Auth

export const isFirebaseDataSource =
  process.env.EXPO_PUBLIC_DATA_SOURCE === 'firebase'

const firebaseEnv = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
}

const requiredFirebaseKeys = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
] as const

export const missingFirebaseConfigKeys = requiredFirebaseKeys.filter(
  (key) => !firebaseEnv[key]?.trim(),
)

export const firebaseConfigError =
  isFirebaseDataSource && missingFirebaseConfigKeys.length > 0
    ? 'A conta conectada ainda nao foi configurada corretamente para este app.'
    : null

export const firebaseEnabled =
  isFirebaseDataSource && firebaseConfigError === null

export const firebaseConfig = firebaseEnabled
  ? {
      apiKey: firebaseEnv.apiKey as string,
      authDomain: firebaseEnv.authDomain as string,
      projectId: firebaseEnv.projectId as string,
      storageBucket: firebaseEnv.storageBucket as string,
      messagingSenderId: firebaseEnv.messagingSenderId as string,
      appId: firebaseEnv.appId as string,
    }
  : null

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null

function createAuthInstance(firebaseApp: FirebaseApp) {
  if (Platform.OS === 'web') {
    try {
      if (browserLocalPersistence) {
        return initializeAuth(firebaseApp, {
          persistence: browserLocalPersistence,
        })
      }

      return getAuth(firebaseApp)
    } catch {
      return getAuth(firebaseApp)
    }
  }

  const reactNativePersistence =
    typeof getReactNativePersistence === 'function'
      ? getReactNativePersistence(AsyncStorage)
      : undefined

  try {
    if (reactNativePersistence) {
      return initializeAuth(firebaseApp, {
        persistence: reactNativePersistence,
      })
    }

    return initializeAuth(firebaseApp)
  } catch {
    return getAuth(firebaseApp)
  }
}

if (firebaseEnabled && firebaseConfig) {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()
  auth = createAuthInstance(app)
  db = getFirestore(app)
}

export { app, auth, db }
