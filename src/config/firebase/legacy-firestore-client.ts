/**
 * Cliente preservado apenas para ferramentas e código histórico de migração.
 * A aplicação web ativa não importa este módulo.
 */
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

import { app, firebaseEnabled } from '@/config/firebase/client';

let db: Firestore | null = null;

if (firebaseEnabled && app) {
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    db = getFirestore(app);
  }
}

export { db };
