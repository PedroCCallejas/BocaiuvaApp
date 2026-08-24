import { isFirebaseDataSource } from '@/config/firebase/client'

import { firebaseRepository } from '@/services/repository/firebase-repository'
import { mockRepository } from '@/services/repository/mock-repository'
import { comModulosNoSupabase } from '@/services/repository/supabase/composicao'
import type { AppRepository } from '@/services/repository/types'

const shouldUseFirebase = isFirebaseDataSource

const baseRepository: AppRepository = shouldUseFirebase
  ? firebaseRepository
  : mockRepository

/**
 * A migração para o Postgres acontece por módulo, empilhando camadas sobre o
 * repositório base.
 *
 * Cada camada substitui só os métodos do seu módulo; o resto continua vindo do
 * Firestore sem saber que algo mudou. É o que torna o rollback independente:
 * desligar um módulo em `EXPO_PUBLIC_SUPABASE_MODULES` não afeta os outros.
 *
 * O `mockRepository` fica de fora de propósito — ele existe para desenvolver
 * sem banco nenhum, e empilhar Supabase em cima dele misturaria dado de mentira
 * com dado real.
 */
export const repository: AppRepository = shouldUseFirebase
  ? comModulosNoSupabase(baseRepository)
  : baseRepository

export const isUsingFirebase = shouldUseFirebase
