import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import {
  MAX_ACTIVE_RATING_CRITERIA,
  MIN_ACTIVE_RATING_CRITERIA,
  countRatingCriterionUsage,
} from '@/lib/rating-criteria';
import { useAppStore } from '@/store/app-store';
import {
  selectCanManageTeam,
  selectCurrentTeam,
  selectCurrentTeamRatingCriteria,
} from '@/store/selectors';
import type { TeamRatingCriterion } from '@/types/domain';

type CriterionTypeValue = TeamRatingCriterion['type'];

function TypeChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.typeChip,
        {
          backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surfaceMuted,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
        },
      ]}>
      <Text style={[styles.typeChipLabel, { color: theme.colors.text }]}>{label}</Text>
    </Pressable>
  );
}

function emptyFormState() {
  return {
    label: '',
    description: '',
    type: 'positive' as CriterionTypeValue,
    weight: '1',
    active: true,
  };
}

export default function TeamRatingCriteriaScreen() {
  const theme = useAppTheme();
  const team = useAppStore(selectCurrentTeam);
  const canManageTeam = useAppStore(selectCanManageTeam);
  const snapshot = useAppStore((state) => state.snapshot);
  const criteria = useAppStore(selectCurrentTeamRatingCriteria);
  const createRatingCriterion = useAppStore((state) => state.createRatingCriterion);
  const updateRatingCriterion = useAppStore((state) => state.updateRatingCriterion);
  const deleteRatingCriterion = useAppStore((state) => state.deleteRatingCriterion);
  const [editingCriterionId, setEditingCriterionId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyFormState);
  const [busyCriterionId, setBusyCriterionId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const usageByCriterionId = useMemo(
    () =>
      criteria.reduce<Record<string, number>>((acc, criterion) => {
        acc[criterion.id] = countRatingCriterionUsage(snapshot.playerRatings, criterion.id);
        return acc;
      }, {}),
    [criteria, snapshot.playerRatings],
  );
  const activeCriteria = criteria.filter((criterion) => criterion.active);

  if (!team || !canManageTeam) {
    return (
      <Screen>
        <EmptyState
          title="Acesso restrito"
          description="Somente quem administra o time pode configurar os criterios de avaliacao."
        />
      </Screen>
    );
  }

  function resetForm() {
    setEditingCriterionId(null);
    setForm(emptyFormState());
  }

  function startEditing(criterion: TeamRatingCriterion) {
    setEditingCriterionId(criterion.id);
    setForm({
      label: criterion.label,
      description: criterion.description ?? '',
      type: criterion.type,
      weight: String(criterion.weight),
      active: criterion.active,
    });
  }

  async function handleSubmit() {
    const label = form.label.trim();
    const weight = Number(form.weight.replace(',', '.'));

    if (!label) {
      Alert.alert('Nome obrigatorio', 'Informe um nome curto para o criterio.');
      return;
    }

    if (!Number.isFinite(weight) || weight <= 0) {
      Alert.alert('Peso invalido', 'Use um peso maior que zero.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (editingCriterionId) {
        await updateRatingCriterion(editingCriterionId, {
          label,
          description: form.description.trim() || null,
          type: form.type,
          weight,
          active: form.active,
        });
      } else {
        await createRatingCriterion({
          label,
          description: form.description.trim() || null,
          type: form.type,
          weight,
          active: form.active,
        });
      }

      resetForm();
    } catch (error) {
      Alert.alert(
        'Nao foi possivel salvar',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggleActive(criterion: TeamRatingCriterion) {
    setBusyCriterionId(criterion.id);

    try {
      await updateRatingCriterion(criterion.id, { active: !criterion.active });
    } catch (error) {
      Alert.alert(
        'Nao foi possivel atualizar',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    } finally {
      setBusyCriterionId(null);
    }
  }

  async function handleMoveCriterion(criterion: TeamRatingCriterion, direction: -1 | 1) {
    const currentIndex = criteria.findIndex((item) => item.id === criterion.id);
    const targetCriterion = criteria[currentIndex + direction];

    if (!targetCriterion) {
      return;
    }

    setBusyCriterionId(criterion.id);

    try {
      await updateRatingCriterion(targetCriterion.id, { order: criterion.order });
      await updateRatingCriterion(criterion.id, { order: targetCriterion.order });
    } catch (error) {
      Alert.alert(
        'Nao foi possivel reordenar',
        error instanceof Error ? error.message : 'Tente novamente.',
      );
    } finally {
      setBusyCriterionId(null);
    }
  }

  async function handleDeleteCriterion(criterion: TeamRatingCriterion) {
    const usageCount = usageByCriterionId[criterion.id] ?? 0;
    const actionLabel = usageCount > 0 ? 'Inativar criterio' : 'Excluir criterio';
    const message =
      usageCount > 0
        ? 'Este criterio ja aparece em avaliacoes antigas. Vamos apenas inativa-lo para preservar o historico.'
        : 'Este criterio ainda nao foi usado e sera removido do time.';

    Alert.alert('Gerenciar criterio', message, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: actionLabel,
        style: usageCount > 0 ? 'default' : 'destructive',
        onPress: () => {
          void (async () => {
            setBusyCriterionId(criterion.id);
            try {
              await deleteRatingCriterion(criterion.id);
              if (editingCriterionId === criterion.id) {
                resetForm();
              }
            } catch (error) {
              Alert.alert(
                'Nao foi possivel concluir',
                error instanceof Error ? error.message : 'Tente novamente.',
              );
            } finally {
              setBusyCriterionId(null);
            }
          })();
        },
      },
    ]);
  }

  return (
    <Screen formMode>
      <SectionHeader
        title="Criterios de avaliacao"
        subtitle="Defina como o elenco avalia os jogadores deste time."
      />

      <View
        style={[
          styles.summaryCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}>
        <Text style={[styles.summaryTitle, { color: theme.colors.text }]}>Regras do time</Text>
        <Text style={[styles.summaryText, { color: theme.colors.textMuted }]}>
          Mantenha entre {MIN_ACTIVE_RATING_CRITERIA} e {MAX_ACTIVE_RATING_CRITERIA} criterios
          ativos. Criticos positivos entram na nota geral normalmente. Criticos negativos entram
          na composicao como alerta: nota alta pesa contra o jogador.
        </Text>
        <Text style={[styles.summaryCount, { color: theme.colors.secondary }]}>
          {activeCriteria.length} ativo(s) de {criteria.length} criterio(s)
        </Text>
      </View>

      <View style={styles.criteriaList}>
        {criteria.map((criterion, index) => {
          const usageCount = usageByCriterionId[criterion.id] ?? 0;
          const canMoveUp = index > 0;
          const canMoveDown = index < criteria.length - 1;

          return (
            <View
              key={criterion.id}
              style={[
                styles.criterionCard,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}>
              <View style={styles.criterionHeader}>
                <View style={styles.criterionCopy}>
                  <Text style={[styles.criterionLabel, { color: theme.colors.text }]}>
                    {criterion.label}
                  </Text>
                  <Text style={[styles.criterionMeta, { color: theme.colors.textMuted }]}>
                    {criterion.type === 'positive' ? 'Positivo' : 'Negativo'} • peso {criterion.weight}
                  </Text>
                  <Text style={[styles.criterionMeta, { color: theme.colors.textMuted }]}>
                    {criterion.active ? 'Ativo' : 'Inativo'} • {usageCount} avaliacao(oes)
                  </Text>
                  {criterion.description ? (
                    <Text style={[styles.criterionDescription, { color: theme.colors.textMuted }]}>
                      {criterion.description}
                    </Text>
                  ) : null}
                </View>
                <Switch
                  value={criterion.active}
                  onValueChange={() => void handleToggleActive(criterion)}
                  disabled={busyCriterionId === criterion.id}
                />
              </View>

              <View style={styles.cardActions}>
                <AppButton
                  label="Editar"
                  variant="secondary"
                  onPress={() => startEditing(criterion)}
                />
                <AppButton
                  label="Subir"
                  variant="ghost"
                  disabled={!canMoveUp || busyCriterionId === criterion.id}
                  onPress={() => void handleMoveCriterion(criterion, -1)}
                />
                <AppButton
                  label="Descer"
                  variant="ghost"
                  disabled={!canMoveDown || busyCriterionId === criterion.id}
                  onPress={() => void handleMoveCriterion(criterion, 1)}
                />
                <AppButton
                  label={usageCount > 0 ? 'Inativar' : 'Excluir'}
                  variant={usageCount > 0 ? 'secondary' : 'danger'}
                  disabled={busyCriterionId === criterion.id}
                  onPress={() => void handleDeleteCriterion(criterion)}
                />
              </View>
            </View>
          );
        })}
      </View>

      <View
        style={[
          styles.formCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}>
        <Text style={[styles.formTitle, { color: theme.colors.text }]}>
          {editingCriterionId ? 'Editar criterio' : 'Novo criterio'}
        </Text>
        <AppInput
          label="Nome"
          value={form.label}
          onChangeText={(value) => setForm((current) => ({ ...current, label: value }))}
          placeholder="Ex.: Marcacao"
        />
        <AppInput
          label="Descricao opcional"
          value={form.description}
          multiline
          onChangeText={(value) => setForm((current) => ({ ...current, description: value }))}
          placeholder="Ajuda o elenco a entender o que avaliar."
          style={styles.multilineInput}
        />
        <View style={styles.formRow}>
          <View style={styles.formField}>
            <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>Tipo</Text>
            <View style={styles.typeRow}>
              <TypeChip
                label="Positivo"
                selected={form.type === 'positive'}
                onPress={() => setForm((current) => ({ ...current, type: 'positive' }))}
              />
              <TypeChip
                label="Negativo"
                selected={form.type === 'negative'}
                onPress={() => setForm((current) => ({ ...current, type: 'negative' }))}
              />
            </View>
          </View>
          <View style={styles.weightField}>
            <AppInput
              label="Peso"
              keyboardType="decimal-pad"
              value={form.weight}
              onChangeText={(value) => setForm((current) => ({ ...current, weight: value }))}
              placeholder="1"
            />
          </View>
        </View>

        <View style={styles.formRow}>
          <View style={styles.toggleCopy}>
            <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>Ativo agora</Text>
            <Text style={[styles.toggleHelper, { color: theme.colors.textMuted }]}>
              Criticos ativos aparecem na tela de avaliacao.
            </Text>
          </View>
          <Switch
            value={form.active}
            onValueChange={(value) => setForm((current) => ({ ...current, active: value }))}
          />
        </View>

        <View style={styles.cardActions}>
          <AppButton
            label={editingCriterionId ? 'Salvar criterio' : 'Criar criterio'}
            onPress={() => void handleSubmit()}
            loading={isSubmitting}
          />
          {editingCriterionId ? (
            <AppButton label="Cancelar edicao" variant="ghost" onPress={resetForm} />
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summaryCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 10,
  },
  summaryTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  summaryText: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
  },
  summaryCount: {
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: '900',
  },
  criteriaList: {
    gap: 12,
  },
  criterionCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 16,
    gap: 14,
  },
  criterionHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  criterionCopy: {
    flex: 1,
    gap: 4,
  },
  criterionLabel: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  criterionMeta: {
    fontFamily: fonts.body,
    fontSize: 13,
  },
  criterionDescription: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  formCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 14,
  },
  formTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  multilineInput: {
    minHeight: 96,
    textAlignVertical: 'top',
    paddingTop: 16,
  },
  formRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
  },
  formField: {
    flex: 1,
    minWidth: 180,
    gap: 8,
  },
  weightField: {
    minWidth: 120,
    flex: 1,
  },
  fieldLabel: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  typeChip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  typeChipLabel: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
  toggleCopy: {
    flex: 1,
    gap: 4,
  },
  toggleHelper: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
  },
});
