import { mockRepository } from '@/services/repository/mock-repository'
import { supabaseBaseRepository } from '@/services/repository/supabase/base'
import { criarRepositorioSupabase } from '@/services/repository/supabase/composicao'
import type { AppRepository } from '@/services/repository/types'

const shouldUseMock = process.env.EXPO_PUBLIC_DATA_SOURCE === 'mock'

/**
 * O Supabase é a única fonte de dados da aplicação real. O Firebase permanece
 * isolado no serviço de autenticação; o repositório mock continua disponível
 * para desenvolvimento sem serviços externos.
 */
export const repository: AppRepository = shouldUseMock
  ? mockRepository
  : criarRepositorioSupabase(supabaseBaseRepository)

export const isUsingSupabase = !shouldUseMock
