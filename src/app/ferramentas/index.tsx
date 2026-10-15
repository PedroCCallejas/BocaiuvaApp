import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ToolPageShell } from '@/components/tools/ToolPageShell';
import { ToolActionTile } from '@/components/tools/ToolActionTile';
import { AppButton } from '@/components/ui/AppButton';
import { baseTheme, fonts } from '@/constants/theme';
import { SafeAd } from '@/components/ads/SafeAd';
import { AD_PLACEMENTS } from '@/constants/ads';

const TOOLS = [
  { icon: 'shuffle-outline', title: 'Sortear times', description: 'Distribua os jogadores.', href: '/ferramentas/sorteador-de-times' },
  { icon: 'timer-outline', title: 'Cronômetro', description: 'Controle tempo e placar.', href: '/ferramentas/cronometro-pelada' },
  { icon: 'refresh-outline', title: 'Rodízio', description: 'Organize quem entra.', href: '/ferramentas/rodizio-de-times' },
  { icon: 'trophy-outline', title: 'Campeonato', description: 'Monte os confrontos.', href: '/ferramentas/campeonato-rapido' },
] as const;
export default function ToolsHubScreen() {
  const [help, setHelp] = useState(false);
  return <ToolPageShell title="Ferramentas" subtitle="Escolha uma ferramenta e comece.">
    <View style={styles.grid}>{TOOLS.map(tool => <ToolActionTile key={tool.href} {...tool} onPress={() => router.push(tool.href)} style={styles.tile} />)}</View>
    <SafeAd placement={AD_PLACEMENTS.TOOLS_HUB_AFTER_CARDS} hasContent />
    <View style={styles.help}><AppButton variant="ghost" label={help ? 'Fechar ajuda' : 'Como usar'} onPress={() => setHelp(!help)} />
      {help ? <Text style={styles.description}>Adicione os jogadores ou times, escolha a configuração e comece. Cronômetro e rodízio mantêm a pelada salva neste dispositivo para sua conta.</Text> : null}
    </View>
  </ToolPageShell>;
}
const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { flexGrow: 1, flexBasis: 260 },
  help: { alignItems: 'flex-start', gap: 12 },
  description: { color: baseTheme.colors.textMuted, fontFamily: fonts.body, fontSize: 15, lineHeight: 23 },
});
