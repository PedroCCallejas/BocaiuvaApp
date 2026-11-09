import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { useAppTheme } from '@/hooks/use-app-theme';
import { buildMatchPosterData, renderMatchPoster } from '@/lib/match-poster';
import type { Match, Team } from '@/types/domain';

export function MatchPoster({ team, match }: { team: Team; match: Match }) {
  const theme = useAppTheme();
  const [visible, setVisible] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ dataUrl: string; missingLogos: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const data = useMemo(() => buildMatchPosterData(team, match), [team, match]);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setResult(null); setError(null); setSaved(false);
    if (Platform.OS !== 'web') {
      setError('Abra a versão web para gerar e baixar a arte da partida.');
      return;
    }
    renderMatchPoster(data).then((value) => { if (active) setResult(value); }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível gerar a arte. Tente novamente.');
    });
    return () => { active = false; };
  }, [visible, data, attempt]);

  function download() {
    if (!result || Platform.OS !== 'web') return;
    const anchor = document.createElement('a');
    anchor.href = result.dataUrl; anchor.download = data.filename;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setSaved(true);
  }

  return (
    <>
      <AppButton label="Arte da partida" variant="secondary" onPress={() => setVisible(true)} />
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.overlay}>
          <View style={[styles.panel, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.header}>
              <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.text }]}>Arte da partida</Text>
              <AppButton label="Fechar" variant="ghost" size="sm" onPress={() => setVisible(false)} />
            </View>
            <ScrollView contentContainerStyle={styles.content}>
              <Text style={{ color: theme.colors.textMuted }}>Imagem vertical 1080 × 1350. Baixe o PNG e publique manualmente no Instagram, ou tire um print da arte.</Text>
              {error ? (
                <View style={styles.feedback}>
                  <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error}</Text>
                  <AppButton label="Tentar novamente" variant="secondary" onPress={() => setAttempt((value) => value + 1)} />
                </View>
              ) : result ? (
                <>
                  <Image accessibilityLabel={`${data.headline}: ${data.teamName} contra ${data.opponentName}, ${data.date}, ${data.time}, ${data.venue}`} source={{ uri: result.dataUrl }} resizeMode="contain" style={styles.poster} />
                  {result.missingLogos.length > 0 ? <Text accessibilityRole="alert" style={{ color: theme.colors.textMuted }}>Escudo não disponível: {result.missingLogos.join(' e ')}. A arte usa as iniciais. Cadastre ou atualize o escudo e abra a arte novamente.</Text> : null}
                </>
              ) : <View style={styles.loading}><ActivityIndicator color={theme.colors.text} /><Text style={{ color: theme.colors.text }}>Preparando a arte e os escudos…</Text></View>}
            </ScrollView>
            <View style={styles.footer}>
              {saved ? <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.textMuted }}>Download solicitado. Confira os downloads do navegador.</Text> : null}
              <AppButton label="Baixar PNG" disabled={!result} onPress={download} fullWidth />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 12 },
  panel: { width: '100%', maxWidth: 600, maxHeight: '95%', borderRadius: 20, overflow: 'hidden', flexShrink: 1 },
  header: { padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { fontSize: 20, fontWeight: '700', flexShrink: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  poster: { width: '100%', aspectRatio: 1080 / 1350 },
  loading: { paddingVertical: 60, alignItems: 'center', gap: 14 },
  feedback: { gap: 12, paddingVertical: 20 },
  footer: { padding: 12, gap: 8 },
});
