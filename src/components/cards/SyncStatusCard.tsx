import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

import { AppButton } from '../ui/AppButton';

interface SyncStatusCardProps {
  message: string;
  hint: string;
  loading: boolean;
  onRefresh: () => void;
}

export function SyncStatusCard({
  message,
  hint,
  loading,
  onRefresh,
}: SyncStatusCardProps) {
  const theme = useAppTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}>
      <View style={styles.copyRow}>
        {loading ? (
          <ActivityIndicator color={theme.colors.action} size="small" />
        ) : (
          <View style={[styles.dot, { backgroundColor: theme.colors.action }]} />
        )}
        <View style={styles.copy}>
          <Text style={[styles.title, { color: theme.colors.text }]}>{message}</Text>
          <Text style={[styles.description, { color: theme.colors.textMuted }]}>{hint}</Text>
        </View>
      </View>

      <AppButton
        fullWidth
        label="Atualizar dados"
        loading={loading}
        onPress={onRefresh}
        variant="secondary"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    gap: 14,
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '800',
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
  },
});
