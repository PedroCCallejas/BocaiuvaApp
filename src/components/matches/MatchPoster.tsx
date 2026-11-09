import { ImageShareActions } from '@/components/ui/ImageShareActions';
import { pngDataUrlToFile } from '@/lib/image-sharing';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { useAppTheme } from '@/hooks/use-app-theme';
import { buildMatchPosterData, matchPosterLocalDate, renderMatchPoster } from '@/lib/match-poster';
import type { Match, Team } from '@/types/domain';

export function MatchPoster({ team, match }: { team: Team; match: Match }) {
  const theme = useAppTheme();
  const [visible, setVisible] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ dataUrl: string; missingLogos: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [now, setNow] = useState(() => new Date());
  const refreshDate = () => setNow((previous) => {
    const current = new Date();
    return matchPosterLocalDate(previous) === matchPosterLocalDate(current) ? previous : current;
  });
  const data = useMemo(() => buildMatchPosterData(team, match, now), [team, match, now]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    // Check at minute boundaries only while open; regenerate only when the local day changes.
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      refreshDate();
      timer = setTimeout(tick, 60000 - Date.now() % 60000 + 20);
    };
    tick();
    window.addEventListener('focus', refreshDate);
    document.addEventListener('visibilitychange', refreshDate);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', refreshDate);
      document.removeEventListener('visibilitychange', refreshDate);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setResult(null); setError(null); setFile(null);
    if (Platform.OS !== 'web') {
      setError('Abra a versão web para gerar e baixar a arte da partida.');
      return;
    }
    renderMatchPoster(data).then((value) => { if (active) { setResult(value); setFile(pngDataUrlToFile(value.dataUrl, data.filename)); } }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível gerar a arte. Tente novamente.');
    });
    return () => { active = false; };
  }, [visible, data, attempt]);

  return (
    <>
      <AppButton label="Arte da partida" variant="secondary" onPress={() => { refreshDate(); setVisible(true); }} />
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.overlay}>
          <View style={[styles.panel, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.header}>
              <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.text }]}>Arte da partida</Text>
              <AppButton label="Fechar" variant="ghost" size="sm" onPress={() => setVisible(false)} />
            </View>
            <ScrollView contentContainerStyle={styles.content}>
              <Text style={{ color: theme.colors.textMuted }}>Modelo original 941 × 1672, pronto para Stories. Confira os dados antes de compartilhar.</Text>
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
            <View style={styles.footer}>
              {file ? <ImageShareActions key={result?.dataUrl} file={file} title={data.headline} /> : null}
            </View>
            </ScrollView>
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
  poster: { width: '100%', aspectRatio: 941 / 1672 },
  loading: { paddingVertical: 60, alignItems: 'center', gap: 14 },
  feedback: { gap: 12, paddingVertical: 20 },
  footer: { padding: 12, gap: 8 },
});
