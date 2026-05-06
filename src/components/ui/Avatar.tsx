import { Image, StyleSheet, Text, View } from 'react-native';

import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

interface AvatarProps {
  name: string;
  photoUrl?: string | null;
  size?: number;
  accent?: string;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function Avatar({ name, photoUrl, size = 44, accent }: AvatarProps) {
  const theme = useAppTheme();
  const initials = getInitials(name);

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: accent ?? theme.colors.primarySoft,
          borderColor: theme.colors.border,
        },
      ]}>
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="cover"
        />
      ) : (
        <Text
          style={[
            styles.text,
            {
              fontSize: Math.max(12, size * 0.34),
              color: theme.colors.text,
            },
          ]}>
          {initials}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  text: {
    fontFamily: fonts.heading,
    fontWeight: '800',
  },
});
