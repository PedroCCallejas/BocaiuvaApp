import * as FirebaseAuth from 'firebase/auth'
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'

type FirebaseAuthModule = typeof FirebaseAuth & {
  browserLocalPersistence?: FirebaseAuth.Persistence
  browserPopupRedirectResolver?: FirebaseAuth.PopupRedirectResolver
}

const { browserLocalPersistence, browserPopupRedirectResolver, getAuth, initializeAuth } =
  FirebaseAuth as FirebaseAuthModule
type Auth = FirebaseAuth.Auth

export const isMockDataSource = process.env.EXPO_PUBLIC_DATA_SOURCE === 'mock'
export const isFirebaseAuthEnabled = !isMockDataSource
/** Legado: dados não são mais lidos do Firestore. */
export const isFirebaseDataSource = false

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
  isFirebaseAuthEnabled && missingFirebaseConfigKeys.length > 0
    ? 'A conta conectada ainda nao foi configurada corretamente para este app.'
    : null

export const firebaseEnabled =
  isFirebaseAuthEnabled && firebaseConfigError === null

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

function createAuthInstance(firebaseApp: FirebaseApp) {
  try {
    const canUseBrowserPopupResolver =
      typeof window !== 'undefined' && typeof document !== 'undefined'

    if (
      canUseBrowserPopupResolver &&
      browserLocalPersistence &&
      browserPopupRedirectResolver
    ) {
      return initializeAuth(firebaseApp, {
        persistence: browserLocalPersistence,
        popupRedirectResolver: browserPopupRedirectResolver,
      })
    }

    return getAuth(firebaseApp)
  } catch {
    return getAuth(firebaseApp)
  }
}

if (firebaseEnabled && firebaseConfig) {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()
  auth = createAuthInstance(app)
}

export { app, auth }
