import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import {
  MATCH_DIARY_CONTENT_MAX_LENGTH,
  MATCH_DIARY_MOOD_OPTIONS,
  MATCH_DIARY_TITLE_MAX_LENGTH,
} from '@/lib/match-diary';
import { useAppStore } from '@/store/app-store';
import {
  findMatchById,
  findMatchDiaryEntryById,
  selectCanManageTeam,
  selectTeamPlayers,
} from '@/store/selectors';

export default function MatchDiaryEntryScreen() {
  const params = useLocalSearchParams<{ matchId?: string | string[]; entryId?: string | string[] }>();
  const theme = useAppTheme();
  const matchId = typeof params.matchId === 'string' ? params.matchId : params.matchId?.[0] ?? '';
  const entryId = typeof params.entryId === 'string' ? params.entryId : params.entryId?.[0] ?? '';
  const canManageTeam = useAppStore(selectCanManageTeam);
  const teamPlayers = useAppStore(selectTeamPlayers);
  const match = useAppStore((state) => findMatchById(state, matchId));
  const entry = useAppStore((state) => (entryId ? findMatchDiaryEntryById(state, entryId) : null));
  const createMatchDiaryEntry = useAppStore((state) => state.createMatchDiaryEntry);
  const updateMatchDiaryEntry = useAppStore((state) => state.updateMatchDiaryEntry);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mood, setMood] = useState<(typeof MATCH_DIARY_MOOD_OPTIONS)[number]['value']>('highlight');
  const [mentionedPlayerIds, setMentionedPlayerIds] = useState<string[]>([]);
  const [notifyTeam, setNotifyTeam] = useState(true);
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  const editableEntry = useMemo(() => {
    if (!entryId) {
      return null;
    }

    if (!entry || entry.matchId !== matchId) {
      return null;
    }

    return entry;
  }, [entry, entryId, matchId]);

  useEffect(() => {
    if (!editableEntry) {
      if (!entryId) {
        setTitle('');
        setContent('');
        setMood('highlight');
        setMentionedPlayerIds([]);
        setNotifyTeam(true);
        setPinned(false);
      }
      return;
    }

    setTitle(editableEntry.title ?? '');
    setContent(editableEntry.content);
    setMood(editableEntry.mood ?? 'highlight');
    setMentionedPlayerIds(editableEntry.mentionedPlayerIds);
    setNotifyTeam(false);
    setPinned(Boolean(editableEntry.pinned));
  }, [editableEntry, entryId]);

  if (!match) {
    return (
      <Screen>
        <EmptyState
          title="Partida não encontrada"
          description="A resenha precisa estar vinculada a uma partida valida."
          actionLabel="Voltar"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  if (!canManageTeam) {
    return (
      <Screen>
        <EmptyState
          title="Acesso restrito"
          description="Apenas quem administra o time pode publicar ou editar a resenha da partida."
          actionLabel="Voltar"
          onAction={() => router.replace(`/matches/${match.id}`)}
        />
      </Screen>
    );
  }

  const currentMatch = match;

  if (entryId && !editableEntry) {
    return (
      <Screen>
        <EmptyState
          title="Resenha não encontrada"
          description="A entrada que você tentou editar não pertence a esta partida."
          actionLabel="Voltar"
          onAction={() => router.replace(`/matches/${currentMatch.id}`)}
        />
      </Screen>
    );
  }

  function toggleMention(playerId: string) {
    setMentionedPlayerIds((current) =>
      current.includes(playerId)
        ? current.filter((item) => item !== playerId)
        : [...current, playerId],
    );
  }

  async function handleSubmit() {
    try {
      setSaving(true);

      if (editableEntry) {
        await updateMatchDiaryEntry(editableEntry.id, {
          title,
          content,
          mood,
          mentionedPlayerIds,
          notifyTeam,
          pinned,
        });
      } else {
        await createMatchDiaryEntry({
          matchId: currentMatch.id,
          title,
          content,
          mood,
          mentionedPlayerIds,
          notifyTeam,
          pinned,
        });
      }

      router.replace(`/matches/${currentMatch.id}`);
    } catch (error) {
      Alert.alert(
        'Não foi possível salvar a resenha',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen formMode>
      <View style={styles.hero}>
        <Text style={[styles.title, { color: theme.colors.text }]}>
          {editableEntry ? 'Editar resenha' : 'Nova resenha'}
        </Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          Conte a historia de {currentMatch.opponentName} para o elenco, destaque jogadores e publique a resenha no diario da partida.
        </Text>
      </View>

      <AppInput
        label={`Titulo opcional (${title.length}/${MATCH_DIARY_TITLE_MAX_LENGTH})`}
        placeholder="Ex.: CRAQUE?!"
        value={title}
        maxLength={MATCH_DIARY_TITLE_MAX_LENGTH}
        onChangeText={setTitle}
      />

      <AppInput
        label={`Texto (${content.length}/${MATCH_DIARY_CONTENT_MAX_LENGTH})`}
        placeholder="Escreva a resenha pos-jogo..."
        value={content}
        maxLength={MATCH_DIARY_CONTENT_MAX_LENGTH}
        multiline
        textAlignVertical="top"
        style={styles.contentInput}
        onChangeText={setContent}
      />

      <View style={styles.section}>
        <SectionHeader title="Humor da resenha" subtitle="Escolha o tom que vai aparecer no card" />
        <View style={styles.chipsWrap}>
          {MATCH_DIARY_MOOD_OPTIONS.map((option) => {
            const selected = mood === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setMood(option.value)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surface,
                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                  },
                ]}>
                <Text style={[styles.chipText, { color: theme.colors.text }]}>
                  {option.emoji} {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader
          title="Jogadores mencionados"
          subtitle="Selecione os nomes que vao aparecer como destaque clicavel"
        />
        <View style={styles.chipsWrap}>
          {teamPlayers.map((player) => {
            const selected = mentionedPlayerIds.includes(player.id);
            return (
              <Pressable
                key={player.id}
                onPress={() => toggleMention(player.id)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? theme.colors.secondarySoft : theme.colors.surface,
                    borderColor: selected ? theme.colors.secondary : theme.colors.border,
                  },
                ]}>
                <Text style={[styles.chipText, { color: theme.colors.text }]}>
                  #{player.jerseyNumber} {player.nickname}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View
        style={[
          styles.switchCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}>
        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <Text style={[styles.switchTitle, { color: theme.colors.text }]}>
              Notificar elenco ao publicar
            </Text>
            <Text style={[styles.switchDescription, { color: theme.colors.textMuted }]}>
              Cria notificacoes internas para o time e destaca quem foi mencionado.
            </Text>
          </View>
          <Switch
            value={notifyTeam}
            trackColor={{
              false: theme.colors.border,
              true: theme.colors.primary,
            }}
            thumbColor={theme.colors.surface}
            onValueChange={setNotifyTeam}
          />
        </View>

        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <Text style={[styles.switchTitle, { color: theme.colors.text }]}>
              Fixar no topo
            </Text>
            <Text style={[styles.switchDescription, { color: theme.colors.textMuted }]}>
              Mantem esta resenha em destaque na lista do diario da partida.
            </Text>
          </View>
          <Switch
            value={pinned}
            trackColor={{
              false: theme.colors.border,
              true: theme.colors.secondary,
            }}
            thumbColor={theme.colors.surface}
            onValueChange={setPinned}
          />
        </View>
      </View>

      <View style={styles.buttonRow}>
        <AppButton
          label={editableEntry ? 'Salvar resenha' : 'Publicar resenha'}
          loading={saving}
          onPress={() => void handleSubmit()}
        />
        <AppButton
          label="Cancelar"
          variant="ghost"
          disabled={saving}
          onPress={() => router.back()}
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
  contentInput: {
    minHeight: 180,
    paddingTop: 16,
  },
  section: {
    gap: 12,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
  switchCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 18,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  switchCopy: {
    flex: 1,
    gap: 4,
  },
  switchTitle: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '800',
  },
  switchDescription: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
});
