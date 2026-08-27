/**
 * Estado dos avisos no celular, na tela da conta.
 *
 * Diferente do `BotaoDeAvisos`, que some quando já está ligado: aqui o estado
 * ligado é justamente o que precisa aparecer. Sem isso não há onde conferir se
 * os avisos estão de pé — e "não recebi nada" fica indistinguível de "nunca
 * ativei".
 *
 * Mostra também de qual aparelho se trata. A inscrição é por navegador, não por
 * conta: ativar no computador não liga no celular, e quem não souber disso vai
 * achar que quebrou.
 */

import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import {
  ativarPush,
  desativarPush,
  pushConfigurado,
  sincronizarPush,
} from '@/services/notifications/push-subscriptions';
import {
  MENSAGEM_POR_MOTIVO,
  estaInstalado,
  motivoDeIndisponibilidade,
} from '@/services/notifications/web-push';

type Estado = 'carregando' | 'ativo' | 'pode-ativar' | 'indisponivel';

interface CartaoDeAvisosProps {
  userId: string | null;
}

export function CartaoDeAvisos({ userId }: CartaoDeAvisosProps) {
  const theme = useAppTheme();
  const [estado, setEstado] = useState<Estado>('carregando');
  const [recado, setRecado] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const conferir = useCallback(() => {
    if (!userId || !pushConfigurado()) {
      setEstado('indisponivel');
      setRecado(null);
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
      setRecado(null);
      void sincronizarPush(userId);
      return;
    }

    setEstado('pode-ativar');
    setRecado(null);
  }, [userId]);

  useEffect(conferir, [conferir]);

  const alternar = useCallback(async () => {
    if (!userId || ocupado) {
      return;
    }

    setOcupado(true);

    if (estado === 'ativo') {
      await desativarPush();
      setOcupado(false);
      // Permissão do navegador continua concedida — só a inscrição some. Por
      // isso o estado é forçado, e não relido: reler diria "ativo" de novo.
      setEstado('pode-ativar');
      return;
    }

    const resultado = await ativarPush(userId);
    setOcupado(false);

    if (resultado.ok) {
      setEstado('ativo');
      setRecado(null);
      return;
    }

    setEstado('indisponivel');
    setRecado(MENSAGEM_POR_MOTIVO[resultado.motivo]);
  }, [estado, ocupado, userId]);

  if (estado === 'carregando') {
    return null;
  }

  const ativo = estado === 'ativo';
  const corDoPonto = ativo ? theme.colors.success : theme.colors.textMuted;

  return (
    <View
      style={[
        styles.cartao,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}>
      <View style={styles.linha}>
        <View style={[styles.ponto, { backgroundColor: corDoPonto }]} />
        <View style={styles.texto}>
          <Text style={[styles.titulo, { color: theme.colors.text }]}>
            {ativo ? 'Avisos ativados neste aparelho' : 'Avisos desligados'}
          </Text>
          <Text style={[styles.descricao, { color: theme.colors.textMuted }]}>
            {recado ??
              (ativo
                ? // Dizer "neste aparelho" evita o mal-entendido de achar que
                  // ligou em todos os lugares de uma vez.
                  `Você recebe jogo marcado, escalação e votação de MVP${
                    estaInstalado() ? '' : ' enquanto o navegador estiver aberto'
                  }. Vale só para este aparelho.`
                : 'Receba no celular quando marcarem jogo, publicarem a escalação e abrir a votação de MVP.')}
          </Text>
        </View>
      </View>

      {estado !== 'indisponivel' ? (
        <AppButton
          fullWidth
          label={ativo ? 'Desligar avisos' : '🔔 Ativar avisos'}
          loading={ocupado}
          onPress={() => void alternar()}
          variant="secondary"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cartao: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    gap: 14,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  ponto: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  texto: {
    flex: 1,
    gap: 4,
  },
  titulo: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '800',
  },
  descricao: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
  },
});
