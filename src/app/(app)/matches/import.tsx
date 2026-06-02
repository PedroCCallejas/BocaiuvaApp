import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Pill } from '@/components/ui/Pill';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { MATCH_TYPE_LABELS } from '@/constants/options';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatDateBR } from '@/lib/date';
import { parseLegacyMatchImportJson } from '@/lib/match-import';
import { useAppStore } from '@/store/app-store';
import { selectCanManageTeam } from '@/store/selectors';
import type {
  ImportedMatchPayloadItem,
  LegacyMatchImportPlayerPreview,
  LegacyMatchImportPreview,
} from '@/types/match-import';

const EXAMPLE_JSON = `[
  {
    "date": "2026-05-01",
    "time": "20:00",
    "opponentName": "Time X",
    "venue": "Campo Municipal",
    "matchType": "society",
    "teamScore": 3,
    "opponentScore": 2,
    "players": [
      {
        "email": "jogador@email.com",
        "jerseyNumber": 10,
        "name": "Pedro",
        "played": true,
        "started": true,
        "goals": 2,
        "assists": 1
      }
    ]
  }
]`;

const IMPORT_STATUS_LABELS = {
  ready: 'Pronto',
  duplicate: 'Duplicado',
  invalid: 'Inválido',
} as const;

export default function ImportLegacyMatchesScreen() {
  const theme = useAppTheme();
  const canManage = useAppStore(selectCanManageTeam);
  const previewLegacyMatchImport = useAppStore((state) => state.previewLegacyMatchImport);
  const importLegacyMatches = useAppStore((state) => state.importLegacyMatches);
  const [jsonText, setJsonText] = useState(EXAMPLE_JSON);
  const [parsedPayload, setParsedPayload] = useState<ImportedMatchPayloadItem[] | null>(null);
  const [preview, setPreview] = useState<LegacyMatchImportPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  if (!canManage) {
    return (
      <Screen>
        <EmptyState
          title="Acesso restrito"
          description="Somente quem administra o time pode importar jogos antigos."
        />
      </Screen>
    );
  }

  async function handlePreview() {
    try {
      const payload = parseLegacyMatchImportJson(jsonText);
      setPreviewLoading(true);
      const nextPreview = await previewLegacyMatchImport(payload);
      setParsedPayload(payload);
      setPreview(nextPreview);
    } catch (error) {
      Alert.alert(
        'Não foi possível gerar a prévia',
        error instanceof Error ? error.message : 'Revise o JSON e tente novamente.',
      );
    } finally {
      setPreviewLoading(false);
    }
  }

  async function confirmImport() {
    if (!parsedPayload || !preview) {
      return;
    }

    try {
      setImporting(true);
      const result = await importLegacyMatches(parsedPayload);
      Alert.alert(
        'Importação concluída',
        `${result.createdMatches} jogo(s) criado(s), ${result.skippedDuplicates} duplicado(s) pulado(s) e ${result.invalidMatches} item(ns) inválido(s).`,
      );
      router.replace('/matches');
    } catch (error) {
      Alert.alert(
        'Não foi possível importar',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    } finally {
      setImporting(false);
    }
  }

  function handleImportPress() {
    if (!preview || !parsedPayload) {
      return;
    }

    Alert.alert(
      'Confirmar importação',
      `Serão criados ${preview.summary.readyMatches} jogo(s). Os duplicados ou inválidos serão ignorados.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Importar', onPress: () => void confirmImport() },
      ],
    );
  }

  const canImport = (preview?.summary.readyMatches ?? 0) > 0;

  return (
    <Screen formMode>
      <View style={styles.hero}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Importar jogos antigos</Text>
        <Text style={[styles.description, { color: theme.colors.textMuted }]}>
          Cole um JSON, confira a prévia e confirme apenas quando os jogadores e estatísticas estiverem corretos.
        </Text>
      </View>

      <AppInput
        label="JSON da importação"
        multiline
        value={jsonText}
        onChangeText={(value) => {
          setJsonText(value);
          setPreview(null);
          setParsedPayload(null);
        }}
        style={styles.jsonInput}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={styles.buttonRow}>
        <AppButton
          label="Gerar prévia"
          onPress={() => void handlePreview()}
          loading={previewLoading}
        />
        <AppButton
          label="Importar jogos"
          variant="secondary"
          disabled={!canImport}
          loading={importing}
          onPress={handleImportPress}
        />
      </View>

      {preview ? (
        <>
          <SectionHeader
            title="Resumo da prévia"
            subtitle={`${preview.summary.totalMatches} jogo(s) lido(s) do JSON`}
          />

          <View style={styles.summaryGrid}>
            <SummaryCard label="Prontos" value={preview.summary.readyMatches} />
            <SummaryCard label="Duplicados" value={preview.summary.duplicateMatches} />
            <SummaryCard label="Inválidos" value={preview.summary.invalidMatches} />
            <SummaryCard label="Jogadores encontrados" value={preview.summary.matchedPlayers} />
            <SummaryCard label="Não encontrados" value={preview.summary.unresolvedPlayers} />
            <SummaryCard label="Conflitos" value={preview.summary.conflicts} />
          </View>

          {preview.items.map((item) => (
            <View
              key={`${item.sourceIndex}-${item.opponentName}`}
              style={[
                styles.previewCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}>
              <View style={styles.previewHeader}>
                <View style={styles.previewCopy}>
                  <Text style={[styles.previewTitle, { color: theme.colors.text }]}>
                    {item.opponentName}
                  </Text>
                  <Text style={[styles.previewSub, { color: theme.colors.textMuted }]}>
                    {formatDateBR(item.date)}
                    {item.time ? ` ${item.time}` : ''} - {MATCH_TYPE_LABELS[item.matchType]}
                  </Text>
                  <Text style={[styles.previewSub, { color: theme.colors.textMuted }]}>
                    Placar: {item.teamScore} feitos x {item.opponentScore} tomados - Local: {item.venue}
                  </Text>
                </View>
                <Pill
                  label={IMPORT_STATUS_LABELS[item.status]}
                  color={
                    item.status === 'ready'
                      ? theme.colors.secondary
                      : item.status === 'duplicate'
                        ? theme.colors.primary
                        : theme.colors.danger
                  }
                />
              </View>

              {item.warnings.map((warning) => (
                <Text key={`warning-${warning}`} style={[styles.warning, { color: theme.colors.secondary }]}>
                  Aviso: {warning}
                </Text>
              ))}
              {item.errors.map((error) => (
                <Text key={`error-${error}`} style={[styles.warning, { color: theme.colors.danger }]}>
                  Erro: {error}
                </Text>
              ))}

              <SectionHeader
                title="Jogadores"
                subtitle={`${item.matchedPlayerCount} encontrado(s), ${item.unresolvedPlayerCount} não encontrado(s), ${item.conflictCount} conflito(s)`}
              />
              {item.players.map((player) => (
                <PlayerPreviewLine key={`${item.sourceIndex}-${player.sourceIndex}-${player.lookupLabel}`} player={player} />
              ))}
            </View>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  const theme = useAppTheme();

  return (
    <View
      style={[
        styles.summaryCard,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}>
      <Text style={[styles.summaryLabel, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: theme.colors.text }]}>{value}</Text>
    </View>
  );
}

function PlayerPreviewLine({ player }: { player: LegacyMatchImportPlayerPreview }) {
  const theme = useAppTheme();
  const isMatched = player.status === 'matched';

  return (
    <View
      style={[
        styles.playerLine,
        {
          backgroundColor: theme.colors.surfaceMuted,
          borderColor: theme.colors.border,
        },
      ]}>
      <Text style={[styles.playerLineTitle, { color: theme.colors.text }]}>
        {player.lookupLabel}
      </Text>
      <Text style={[styles.playerLineSub, { color: theme.colors.textMuted }]}>
        {isMatched
          ? `${player.matchedPlayerName} ${player.matchedPlayerJerseyNumber != null ? `#${player.matchedPlayerJerseyNumber}` : ''} - ${player.goals}G ${player.assists}A - ${player.resolutionSource}`
          : player.message ?? 'Sem correspondência.'}
      </Text>
    </View>
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
  jsonInput: {
    minHeight: 240,
    textAlignVertical: 'top',
    paddingTop: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryCard: {
    minWidth: 140,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 6,
  },
  summaryLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
  },
  summaryValue: {
    fontFamily: fonts.display,
    fontSize: 26,
    fontWeight: '900',
  },
  previewCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 10,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  previewCopy: {
    flex: 1,
    gap: 4,
  },
  previewTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  previewSub: {
    fontFamily: fonts.body,
    fontSize: 13,
  },
  warning: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
  },
  playerLine: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    gap: 4,
  },
  playerLineTitle: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '800',
  },
  playerLineSub: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
});
