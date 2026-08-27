/**
 * Liga os avisos no celular.
 *
 * Aparece em dois lugares e em dois tamanhos: compacto ao lado de "Ver todas",
 * e largo abaixo de "Atualizar dados". Mesmo comportamento nos dois.
 *
 * Regras da plataforma que moldam este componente:
 *
 * - **Precisa ser um toque.** O Safari só concede permissão a partir de gesto da
 *   pessoa. Pedir no carregamento da tela é recusado em silêncio — por isso
 *   isto é um botão, e não algo automático.
 * - **No iPhone só funciona instalado.** Em vez de esconder o botão, ele explica
 *   o que fazer: sumir com a opção deixaria a pessoa achando que o app não tem
 *   avisos.
 * - **Some quando já está ligado.** Botão que não faz nada é ruído.
 */

import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import {
  ativarPush,
  pushConfigurado,
  sincronizarPush,
} from '@/services/notifications/push-subscriptions';
import {
  MENSAGEM_POR_MOTIVO,
  motivoDeIndisponibilidade,
} from '@/services/notifications/web-push';

type Estado = 'carregando' | 'pode-ativar' | 'ativo' | 'indisponivel';

interface BotaoDeAvisosProps {
  userId: string | null;
  /** `compacto` fica ao lado de outro botão; `largo` ocupa a linha. */
  variante?: 'compacto' | 'largo';
}

export function BotaoDeAvisos({ userId, variante = 'compacto' }: BotaoDeAvisosProps) {
  const theme = useAppTheme();
  const [estado, setEstado] = useState<Estado>('carregando');
  const [recado, setRecado] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!userId || !pushConfigurado()) {
      setEstado('indisponivel');
      return;
    }

    const motivo = motivoDeIndisponibilidade();

    if (motivo) {
      setEstado('indisponivel');
      setRecado(MENSAGEM_POR_MOTIVO[motivo]);
      return;
    }

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      setEstado('ativo');
      // Reconfere a inscrição: o navegador troca o endpoint sozinho, e sem isso
      // a pessoa pararia de receber sem ninguém perceber.
      void sincronizarPush(userId);
      return;
    }

    setEstado('pode-ativar');
  }, [userId]);

  const ativar = useCallback(async () => {
    if (!userId || ocupado) {
      return;
    }

    setOcupado(true);
    const resultado = await ativarPush(userId);
    setOcupado(false);

    if (resultado.ok) {
      setEstado('ativo');
      setRecado(null);
      return;
    }

    setEstado('indisponivel');
    setRecado(MENSAGEM_POR_MOTIVO[resultado.motivo]);
  }, [ocupado, userId]);

  // Já ligado não vira botão: quem ativou não precisa de lembrete.
  if (estado === 'ativo' || estado === 'carregando') {
    return null;
  }

  if (estado === 'indisponivel') {
    // Sem recado não há o que dizer — some em silêncio (ex: rodando nativo).
    if (!recado) {
      return null;
    }

    return (
      <Text
        style={[
          styles.recado,
          variante === 'largo' ? styles.recadoLargo : styles.recadoCompacto,
          { color: theme.colors.textMuted },
        ]}>
        {recado}
      </Text>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Ativar avisos no celular"
      disabled={ocupado}
      onPress={ativar}
      style={({ pressed }) => [
        styles.botao,
        variante === 'largo' && styles.botaoLargo,
        {
          backgroundColor: pressed ? theme.colors.backgroundElevated : 'transparent',
          borderColor: theme.colors.action,
          opacity: ocupado ? 0.6 : 1,
        },
      ]}>
      <Text
        numberOfLines={1}
        style={[
          styles.rotulo,
          variante === 'largo' && styles.rotuloLargo,
          { color: theme.colors.action },
        ]}>
        {ocupado ? 'Ativando…' : '🔔 Ativar avisos'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  botao: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoLargo: {
    width: '100%',
    paddingVertical: 12,
  },
  rotulo: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '800',
  },
  rotuloLargo: {
    fontSize: 14,
  },
  recado: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
  },
  recadoCompacto: {
    maxWidth: 220,
    textAlign: 'right',
  },
  recadoLargo: {
    textAlign: 'center',
  },
});
