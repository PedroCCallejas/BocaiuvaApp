/**
 * Isenção recorrente do rateio do campo.
 *
 * O time tem casos estáveis — o goleiro que nunca paga — e casos temporários
 * — quem voltou de lesão e ganha algumas semanas de cortesia. Sem isso, o
 * admin precisa marcar "Não paga" manualmente em toda partida.
 *
 * O prazo é uma **data**, não um contador de jogos. Um contador exigiria
 * estado mutável decrementado a cada partida, que sai do lugar quando um jogo
 * é cancelado, editado ou lançado fora de ordem. A data é imutável: uma
 * partida de julho lançada em setembro continua respondendo corretamente.
 */

import type { Player, PlayerFeeExemption } from '@/types/domain';

export type FeeExemptionMode = 'none' | 'always' | 'until';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidExemptionDate(value: string | null | undefined): value is string {
  return typeof value === 'string' && ISO_DATE.test(value.trim());
}

/**
 * A isenção vale para uma partida naquela data?
 *
 * Comparação em string ISO (`YYYY-MM-DD`) é segura e evita fuso horário:
 * `new Date('2026-08-12')` vira UTC e pode voltar um dia dependendo de onde
 * o app roda, que é justamente o tipo de erro difícil de reproduzir.
 */
export function isFeeExemptOnDate(
  exemption: PlayerFeeExemption | null | undefined,
  matchDate: string,
): boolean {
  if (!exemption) {
    return false;
  }

  if (exemption.mode === 'always') {
    return true;
  }

  if (exemption.mode !== 'until' || !isValidExemptionDate(exemption.until)) {
    return false;
  }

  if (!isValidExemptionDate(matchDate)) {
    return false;
  }

  // `until` é inclusive: a data escolhida ainda é dia de cortesia.
  return matchDate.trim() <= exemption.until.trim();
}

export function isPlayerFeeExemptOnDate(player: Player, matchDate: string): boolean {
  return isFeeExemptOnDate(player.feeExemption, matchDate);
}

/** Ids dos jogadores com isenção vigente na data da partida. */
export function getExemptPlayerIdsForDate(players: Player[], matchDate: string): string[] {
  return players
    .filter((player) => isPlayerFeeExemptOnDate(player, matchDate))
    .map((player) => player.id);
}

/** Texto curto para a ficha e para a lista da partida. */
export function describeFeeExemption(
  exemption: PlayerFeeExemption | null | undefined,
  today?: string,
): string {
  if (!exemption) {
    return 'Paga o rateio normalmente';
  }

  const reason = exemption.reason?.trim();
  const suffix = reason ? ` · ${reason}` : '';

  if (exemption.mode === 'always') {
    return `Nunca entra no rateio${suffix}`;
  }

  if (!isValidExemptionDate(exemption.until)) {
    return `Paga o rateio normalmente${suffix}`;
  }

  const [year, month, day] = exemption.until.split('-');
  const formatted = `${day}/${month}/${year}`;

  if (today && isValidExemptionDate(today) && today > exemption.until) {
    return `Cortesia encerrada em ${formatted}${suffix}`;
  }

  return `Isento até ${formatted}${suffix}`;
}

/**
 * Normaliza o que veio do formulário. Retorna `null` para "paga normal",
 * o que apaga a isenção no banco.
 */
export function buildPlayerFeeExemption(input: {
  mode: FeeExemptionMode;
  until?: string | null;
  reason?: string | null;
  updatedAt: string;
  updatedByUserId?: string | null;
}): PlayerFeeExemption | null {
  if (input.mode === 'none') {
    return null;
  }

  const reason = input.reason?.trim() || null;

  if (input.mode === 'always') {
    return {
      mode: 'always',
      until: null,
      reason,
      updatedAt: input.updatedAt,
      updatedByUserId: input.updatedByUserId ?? undefined,
    };
  }

  if (!isValidExemptionDate(input.until)) {
    throw new Error('Informe a data final da isenção no formato AAAA-MM-DD.');
  }

  return {
    mode: 'until',
    until: input.until.trim(),
    reason,
    updatedAt: input.updatedAt,
    updatedByUserId: input.updatedByUserId ?? undefined,
  };
}
