import { AppButton } from '@/components/ui/AppButton';
import type { GestureResponderEvent } from 'react-native';

export function ToolPrimaryButton({ label, onPress, variant = 'primary', fullWidth }: {
  label: string; onPress: (event?: GestureResponderEvent) => void;
  variant?: 'primary' | 'secondary' | 'ghost'; fullWidth?: boolean;
}) {
  return <AppButton label={label} onPress={onPress} variant={variant} fullWidth={fullWidth} />;
}
