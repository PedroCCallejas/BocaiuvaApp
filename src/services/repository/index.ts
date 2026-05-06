import { isFirebaseDataSource } from '@/config/firebase/client'

import { firebaseRepository } from '@/services/repository/firebase-repository'
import { mockRepository } from '@/services/repository/mock-repository'

const shouldUseFirebase = isFirebaseDataSource

export const repository = shouldUseFirebase
  ? firebaseRepository
  : mockRepository

export const isUsingFirebase = shouldUseFirebase
