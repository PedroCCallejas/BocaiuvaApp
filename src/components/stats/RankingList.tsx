import { StyleSheet, Text, View } from 'react-native';

import { fonts } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

export interface RankingItem {
  id: string;
  label: string;
  subtitle?: string;
  value: number;
}

interface RankingListProps {
  title: string;
  items: RankingItem[];
}

export function RankingList({ title, items }: RankingListProps) {
  const theme = useAppTheme();
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      {items.map((item, index) => (
        <View key={item.id} style={styles.row}>
          <View style={styles.rowHeader}>
            <Text style={[styles.rank, { color: theme.colors.secondary }]}>{index + 1}</Text>
            <View style={styles.rowCopy}>
              <Text style={[styles.name, { color: theme.colors.text }]}>{item.label}</Text>
              {item.subtitle ? (
                <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
                  {item.subtitle}
                </Text>
              ) : null}
            </View>
            <Text style={[styles.value, { color: theme.colors.text }]}>{item.value}</Text>
          </View>
          <View style={[styles.track, { backgroundColor: theme.colors.backgroundElevated }]}>
            <View
              style={[
                styles.bar,
                {
                  width: `${(item.value / max) * 100}%`,
                  backgroundColor:
                    index === 0
                      ? theme.colors.accent ?? theme.colors.secondary
                      : theme.colors.primary,
                },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 16,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 18,
    fontWeight: '800',
  },
  row: {
    gap: 8,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rank: {
    width: 18,
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: '800',
  },
  rowCopy: {
    flex: 1,
  },
  name: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: '700',
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 12,
  },
  value: {
    fontFamily: fonts.display,
    fontSize: 22,
    fontWeight: '900',
  },
  track: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: 999,
  },
});
