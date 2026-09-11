import { authService } from '@/services/auth';
import {
  buscarContextoDaSessao,
} from '@/services/repository/supabase/elenco';
import { criarErroDoRepositorio } from '@/services/repository/supabase/erros';
import {
  buscarPerfilPublico,
  listarTimesPublicos,
} from '@/services/repository/supabase/publico';
import { emptySnapshot, type AppRepository } from '@/services/repository/types';

async function usuarioDaSessao() {
  const contexto = await buscarContextoDaSessao();

  if (!contexto.user) {
    throw criarErroDoRepositorio('Não foi possível abrir os dados da sua conta.', 'not-found');
  }

  return contexto.user;
}

/**
 * Infraestrutura mínima do repositório Supabase.
 *
 * Os métodos de domínio são aplicados pelas camadas em `composicao/`. O cast é
 * intencional e fica restrito a este ponto: os testes de contrato garantem que
 * a composição final oferece todos os métodos de `AppRepository`.
 */
export const supabaseBaseRepository = {
  getMode() {
    return 'supabase' as const;
  },

  async getInitialSnapshot() {
    return { ...emptySnapshot };
  },

  async getSnapshot() {
    return { ...emptySnapshot };
  },

  async listPublicTeams() {
    return await listarTimesPublicos();
  },

  async getPublicTeamProfile(teamId: string) {
    return await buscarPerfilPublico(teamId);
  },

  async login(input: Parameters<AppRepository['login']>[0]) {
    await authService.login(input);
    return await usuarioDaSessao();
  },

  async loginWithGoogle(input: Parameters<AppRepository['loginWithGoogle']>[0]) {
    await authService.loginWithGoogle(input);
    return await usuarioDaSessao();
  },

  async register(input: Parameters<AppRepository['register']>[0]) {
    await authService.register(input);
    return await usuarioDaSessao();
  },

  async resetPassword(email: string) {
    await authService.resetPassword(email);
  },
} as AppRepository;
