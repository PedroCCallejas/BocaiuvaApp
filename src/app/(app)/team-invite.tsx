import { useState } from 'react';
import { Alert, Clipboard, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAppStore } from '@/store/app-store';
import { selectCanManageTeam, selectCurrentTeam } from '@/store/selectors';

export default function TeamInviteScreen() {
  const theme = useAppTheme();
  const team = useAppStore(selectCurrentTeam);
  const canManage = useAppStore(selectCanManageTeam);
  const regenerateTeamInviteCode = useAppStore((state) => state.regenerateTeamInviteCode);
  const [regenerating, setRegenerating] = useState(false);

  if (!team || !canManage) {
    return (
      <Screen>
        <EmptyState
          title="Acesso restrito"
          description="Somente quem administra o time pode convidar novos jogadores."
        />
      </Screen>
    );
  }

  const currentTeam = team;

  async function handleCopyInviteCode() {
    Clipboard.setString(currentTeam.inviteCode);
    Alert.alert('Codigo copiado', 'O codigo do time foi copiado para a area de transferencia.');
  }

  async function handleCopyInviteMessage() {
    Clipboard.setString(
      `Entre no time ${currentTeam.name} usando o codigo ${currentTeam.inviteCode}.`,
    );
    Alert.alert('Mensagem copiada', 'O texto do convite foi copiado para voce enviar ao jogador.');
  }

  async function handleRegenerateInviteCode() {
    setRegenerating(true);

    try {
      const nextInviteCode = await regenerateTeamInviteCode(currentTeam.id);
      Clipboard.setString(nextInviteCode);
      Alert.alert(
        'Novo codigo gerado',
        'O codigo antigo foi trocado e o novo codigo ja foi copiado.',
      );
    } catch (error) {
      Alert.alert(
        'Nao foi possivel gerar um novo codigo',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Convidar jogadores</Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          Compartilhe o codigo do time com o elenco. Se o e-mail do jogador ja estiver reservado, a conta sera vinculada automaticamente.
        </Text>
      </View>

      <View
        style={[
          styles.codeCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}>
        <Text style={[styles.codeLabel, { color: theme.colors.textMuted }]}>Codigo do time</Text>
        <Text style={[styles.codeValue, { color: theme.colors.text }]}>{currentTeam.inviteCode}</Text>
        <Text style={[styles.codeHint, { color: theme.colors.textMuted }]}>
          Use esse codigo para colocar novos jogadores dentro de {currentTeam.name}.
        </Text>
      </View>

      <View style={styles.buttonGroup}>
        <AppButton label="Copiar codigo" onPress={handleCopyInviteCode} fullWidth />
        <AppButton
          label="Copiar mensagem"
          variant="secondary"
          onPress={handleCopyInviteMessage}
          fullWidth
        />
        <AppButton
          label="Gerar novo codigo"
          variant="ghost"
          onPress={handleRegenerateInviteCode}
          loading={regenerating}
          fullWidth
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: 8,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 32,
    fontWeight: '900',
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
  },
  codeCard: {
    borderWidth: 1,
    borderRadius: 28,
    padding: 22,
    gap: 10,
    alignItems: 'flex-start',
  },
  codeLabel: {
    fontFamily: fonts.heading,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  codeValue: {
    fontFamily: fonts.display,
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: 2,
  },
  codeHint: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
  },
  buttonGroup: {
    gap: 10,
  },
});
