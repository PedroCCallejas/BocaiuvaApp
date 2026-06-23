import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  destructive?: boolean;
}

export function ConfirmModal({
  visible,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  loading,
  destructive,
}: ConfirmModalProps) {
  const theme = useAppTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={loading ? undefined : onCancel}>
        <Pressable
          style={[
            styles.card,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
          onPress={() => {}}>
          <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
          <Text style={[styles.description, { color: theme.colors.textMuted }]}>{description}</Text>
          <View style={styles.buttons}>
            <AppButton
              label={cancelLabel}
              variant="ghost"
              disabled={loading}
              onPress={onCancel}
            />
            <AppButton
              label={confirmLabel}
              variant={destructive ? 'danger' : 'primary'}
              loading={loading}
              onPress={onConfirm}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    gap: 16,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '700',
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 22,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
});
