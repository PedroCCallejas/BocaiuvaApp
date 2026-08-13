import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import {
  buildPlayerFeeExemption,
  describeFeeExemption,
  type FeeExemptionMode,
} from '@/lib/fee-exemption';
import type { Player, PlayerFeeExemption } from '@/types/domain';

interface FeeExemptionCardProps {
  player: Player;
  onSave: (exemption: PlayerFeeExemption | null) => Promise<void>;
}

const MODE_OPTIONS: Array<{ key: FeeExemptionMode; label: string; helper: string }> = [
  { key: 'none', label: 'Paga normal', helper: 'Entra no rateio de todas as partidas.' },
  { key: 'always', label: 'Nunca paga', helper: 'Fica fora do rateio em qualquer partida.' },
  { key: 'until', label: 'Isento até', helper: 'Cortesia com prazo. Depois volta a pagar.' },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Configuração de isenção do rateio, na ficha do jogador.
 *
 * Fica separado do formulário de perfil de propósito: é uma regra financeira
 * do time, não um dado do atleta, e só quem administra pode mexer.
 */
export function FeeExemptionCard({ player, onSave }: FeeExemptionCardProps) {
  const theme = useAppTheme();
  const exemption = player.feeExemption ?? null;

  const [mode, setMode] = useState<FeeExemptionMode>(exemption?.mode ?? 'none');
  const [until, setUntil] = useState(exemption?.until ?? '');
  const [reason, setReason] = useState(exemption?.reason ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Trocar de jogador precisa recarregar o formulário, não manter o rascunho.
  useEffect(() => {
    setMode(player.feeExemption?.mode ?? 'none');
    setUntil(player.feeExemption?.until ?? '');
    setReason(player.feeExemption?.reason ?? '');
    setError(null);
  }, [player.id, player.feeExemption]);

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);

      const next = buildPlayerFeeExemption({
        mode,
        until: until.trim() || null,
        reason: reason.trim() || null,
        updatedAt: new Date().toISOString(),
      });

      await onSave(next);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Não foi possível salvar a isenção.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}>
      <SectionHeader
        title="Isenção do rateio"
        subtitle={describeFeeExemption(exemption, todayIso())}
      />

      <View style={styles.modeRow}>
        {MODE_OPTIONS.map((option) => {
          const selected = mode === option.key;

          return (
            <Pressable
              key={option.key}
              onPress={() => {
                setMode(option.key);
                setError(null);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[
                styles.modeChip,
                {
                  backgroundColor: selected ? theme.colors.action : theme.colors.surfaceMuted,
                  borderColor: selected ? theme.colors.action : theme.colors.border,
                },
              ]}>
              <Text
                style={[
                  styles.modeLabel,
                  { color: selected ? theme.colors.actionText : theme.colors.textMuted },
                ]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.helper, { color: theme.colors.textSubtle }]}>
        {MODE_OPTIONS.find((option) => option.key === mode)?.helper}
      </Text>

      {mode === 'until' ? (
        <AppInput
          label="Isento até (AAAA-MM-DD)"
          value={until}
          onChangeText={setUntil}
          placeholder={todayIso()}
          autoCapitalize="none"
        />
      ) : null}

      {mode !== 'none' ? (
        <AppInput
          label="Motivo (opcional)"
          value={reason}
          onChangeText={setReason}
          placeholder="Goleiro, voltando de lesão, cortesia..."
        />
      ) : null}

      {error ? (
        <Text style={[styles.error, { color: theme.colors.danger }]}>{error}</Text>
      ) : null}

      <AppButton
        label="Salvar isenção"
        loading={saving}
        onPress={() => void handleSave()}
      />

      <Text style={[styles.helper, { color: theme.colors.textSubtle }]}>
        Nas partidas dentro do período, ele já aparece como &quot;Não paga&quot;. O admin
        pode desfazer em qualquer jogo específico.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    gap: 12,
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modeChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  modeLabel: {
    fontFamily: fonts.heading,
    fontSize: 13,
    fontWeight: '700',
  },
  helper: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 18,
  },
  error: {
    fontFamily: fonts.body,
    fontSize: 13,
  },
});
