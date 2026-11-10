import { ImageShareActions } from '@/components/ui/ImageShareActions';
import { pngDataUrlToFile } from '@/lib/image-sharing';
import { parseMatchPosterSettings } from '@/lib/match-poster-settings';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { useAppTheme } from '@/hooks/use-app-theme';
import { buildMatchPosterData, defaultPosterSettings, effectivePosterSettings, matchPosterLocalDate,
  POSTER_CREST, POSTER_HEIGHT, POSTER_WIDTH, renderMatchPoster } from '@/lib/match-poster';
import type { Match, MatchPosterSettings, Team } from '@/types/domain';

type Props = { team: Team; match: Match; canAdjust?: boolean; draftOwnerId?: string; onSaveSettings?: (settings: MatchPosterSettings) => Promise<void> };
const bound = (value: number) => Math.round(Math.max(-300, Math.min(300, value)));

export function MatchPoster({ team, match, canAdjust = false, draftOwnerId = 'preview', onSaveSettings }: Props) {
  const theme = useAppTheme();
  const [visible, setVisible] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ dataUrl: string; missingLogos: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [now, setNow] = useState(() => new Date());
  const data = useMemo(() => buildMatchPosterData(team, match, now), [team, match, now]);
  const incoming = useMemo(() => effectivePosterSettings(match.posterSettings, data.opponentLogoUrl), [match.posterSettings, data.opponentLogoUrl]);
  const [saved, setSaved] = useState(incoming);
  const [draft, setDraft] = useState(incoming);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [discardCloses, setDiscardCloses] = useState(false);
  const [recoverable, setRecoverable] = useState<MatchPosterSettings | null>(null);
  const [recoveryWarning, setRecoveryWarning] = useState(false);
  const recoveryKey = 'match-poster-draft:' + draftOwnerId + ':' + team.id + ':' + match.id;
  const clearRecovery = (expected?: MatchPosterSettings) => {
    setRecoverable(null);
    if (Platform.OS === 'web') { try { if (!expected || sessionStorage.getItem(recoveryKey) === JSON.stringify(expected)) sessionStorage.removeItem(recoveryKey); } catch { /* Storage may be disabled. */ } }
  };
  const drag = useRef<{ id: number; clientX: number; clientY: number; x: number; y: number; ratio: number } | null>(null);
  const preview = useRef<HTMLDivElement | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const settings = editing ? draft : saved;
  useEffect(() => { setSaved(incoming); }, [incoming]);
  useEffect(() => {
    setEditing(false); setDraft(defaultPosterSettings(data.opponentLogoUrl));
    setSaveError(null); setConfirmDiscard(false); drag.current = null;
  }, [data.opponentLogoUrl, canAdjust]);
  useEffect(() => {
    if (Platform.OS !== 'web' || !canAdjust) { setRecoverable(null); return; }
    try {
      const value = sessionStorage.getItem(recoveryKey);
      const recovered = value ? parseMatchPosterSettings(JSON.parse(value)) : null;
      if (recovered && recovered.logoUrl === data.opponentLogoUrl && JSON.stringify(recovered) !== JSON.stringify(incoming)) {
        setRecoverable(recovered);
      } else { setRecoverable(null); sessionStorage.removeItem(recoveryKey); }
    } catch { setRecoveryWarning(true); }
  }, [recoveryKey, data.opponentLogoUrl, canAdjust]);
  useEffect(() => {
    if (Platform.OS !== 'web' || !editing || !canAdjust) return;
    if (!dirty) { try { sessionStorage.removeItem(recoveryKey); } catch { /* No draft to preserve. */ } return; }
    try { sessionStorage.setItem(recoveryKey, JSON.stringify(draft)); } catch { setRecoveryWarning(true); }
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [draft, dirty, editing, canAdjust, recoveryKey]);
  const refreshDate = () => setNow((previous) => {
    const current = new Date();
    return matchPosterLocalDate(previous) === matchPosterLocalDate(current) ? previous : current;
  });

  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => { refreshDate(); timer = setTimeout(tick, 60000 - Date.now() % 60000 + 20); };
    tick(); window.addEventListener('focus', refreshDate);
    document.addEventListener('visibilitychange', refreshDate);
    return () => { clearTimeout(timer); window.removeEventListener('focus', refreshDate); document.removeEventListener('visibilitychange', refreshDate); };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setError(null); setFile(null); setBusy(true);
    if (Platform.OS !== 'web') {
      setError('Abra a versão web para gerar e baixar a arte da partida.'); setBusy(false); return;
    }
    // Keep the last preview on screen while a newer render is prepared, but never share stale output.
    renderMatchPoster(data, settings).then((value) => {
      if (active) { setResult(value); setFile(pngDataUrlToFile(value.dataUrl, data.filename)); setBusy(false); }
    }).catch((cause) => {
      if (active) { setError(cause instanceof Error ? cause.message : 'Não foi possível gerar a arte. Tente novamente.'); setBusy(false); }
    });
    return () => { active = false; };
  }, [visible, data, settings, attempt]);

  const endEditing = (close: boolean) => {
    if (editing) clearRecovery();
    setDraft(saved); setEditing(false); setConfirmDiscard(false); setSaveError(null); drag.current = null;
    if (close) { setVisible(false); setResult(null); setFile(null); }
  };
  const requestClose = (close = true) => {
    if (saving) return;
    if (editing && dirty) { setDiscardCloses(close); setConfirmDiscard(true); return; }
    endEditing(close);
  };
  const save = async () => {
    if (!canAdjust || !onSaveSettings || saving || busy || error) return;
    setSaving(true); setSaveError(null);
    try {
      await onSaveSettings(draft);
      clearRecovery(draft); setSaved(draft); setEditing(false); setNotice('Ajuste salvo para esta partida.'); setConfirmDiscard(false);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Não foi possível salvar. Seus ajustes continuam na prévia; tente novamente.');
    } finally { setSaving(false); }
  };
  const move = (x: number, y: number) => setDraft((current) => ({ ...current, x: bound(x), y: bound(y) }));
  const stopDrag = () => { drag.current = null; };
  const box = POSTER_CREST;
  const editable = editing && canAdjust && !saving && !confirmDiscard;

  return (
    <>
      <AppButton label="Arte da partida" variant="secondary" onPress={() => { refreshDate(); setNotice(null); setVisible(true); }} />
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => requestClose()}>
        <View style={styles.overlay}>
          <View style={[styles.panel, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.header}>
              <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.text }]}>{editing ? 'Ajustar arte' : 'Arte da partida'}</Text>
              <AppButton label="Fechar" variant="ghost" size="sm" disabled={saving} onPress={() => requestClose()} />
            </View>
              {confirmDiscard ? <View style={styles.feedback}>
                <Text accessibilityRole="alert" style={{ color: theme.colors.text }}>Descartar os ajustes que ainda não foram salvos?</Text>
                <View style={styles.row}>
                  <AppButton label="Continuar ajustando" onPress={() => setConfirmDiscard(false)} />
                  <AppButton label="Descartar ajustes" variant="secondary" onPress={() => endEditing(discardCloses)} />
                </View>
              </View> : null}
            <ScrollView contentContainerStyle={styles.content}>
              <Text style={{ color: theme.colors.textMuted }}>{editing ? 'Arraste o escudo e ajuste o tamanho. Os dados do jogo não serão alterados.' : 'Modelo 941 × 1672, pronto para Stories. Confira os dados antes de compartilhar.'}</Text>
              {!editing && canAdjust && recoverable ? <View style={styles.feedback}>
                <Text accessibilityRole="alert" style={{ color: theme.colors.text }}>Você tem um ajuste não salvo desta partida. Deseja retomar?</Text>
                <View style={styles.row}>
                  <AppButton label="Retomar rascunho" onPress={() => { setDraft(recoverable); setEditing(true); setSaveError(null); }} />
                  <AppButton label="Descartar rascunho" variant="secondary" onPress={() => clearRecovery()} />
                </View>
              </View> : null}
              {editing && recoveryWarning ? <Text style={{ color: theme.colors.textMuted }}>Este navegador não permite guardar o rascunho. Salve antes de sair da página.</Text> : null}
              {notice && !editing ? <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.text }}>{notice}</Text> : null}
              {error ? <View style={styles.feedback}>
                <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{error}</Text>
                <AppButton label="Tentar novamente" variant="secondary" onPress={() => setAttempt((value) => value + 1)} />
              </View> : null}
              {result ? <>
                {Platform.OS === 'web' ? <div ref={preview} style={{ position: 'relative', width: '100%', lineHeight: 0 }}>
                  <img src={result.dataUrl} alt={`${data.headline}: ${data.teamName} contra ${data.opponentName}, ${data.date}, ${data.time}, ${data.venue}`} draggable={false}
                    style={{ width: '100%', height: 'auto', display: 'block' }} />
                  {editable ? <div role="slider" tabIndex={0} aria-label="Posição do escudo. Arraste ou use as setas do teclado."
                    aria-valuemin={-300} aria-valuemax={300} aria-valuenow={draft.x} aria-valuetext={`Horizontal ${draft.x}, vertical ${draft.y}`}
                    onKeyDown={(event) => {
                      const step = event.shiftKey ? 10 : 2;
                      if (event.key === 'ArrowLeft') move(draft.x - step, draft.y);
                      else if (event.key === 'ArrowRight') move(draft.x + step, draft.y);
                      else if (event.key === 'ArrowUp') move(draft.x, draft.y - step);
                      else if (event.key === 'ArrowDown') move(draft.x, draft.y + step);
                      else return;
                      event.preventDefault();
                    }}
                    onPointerDown={(event) => {
                      if (!event.isPrimary || event.button !== 0 || !preview.current) return;
                      const ratio = POSTER_WIDTH / preview.current.getBoundingClientRect().width;
                      drag.current = { id: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: draft.x, y: draft.y, ratio };
                      event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault();
                    }}
                    onPointerMove={(event) => {
                      const start = drag.current;
                      if (!start || start.id !== event.pointerId) return;
                      move(start.x + (event.clientX - start.clientX) * start.ratio, start.y + (event.clientY - start.clientY) * start.ratio);
                    }}
                    onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={stopDrag}
                    style={{ position: 'absolute', cursor: 'move', touchAction: 'none', userSelect: 'none', border: '2px dashed #fff',
                      outline: '1px solid #041f65', borderRadius: 8, boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)',
                      left: `${100 * (box.x + draft.x + box.width * (1 - draft.scale) / 2) / POSTER_WIDTH}%`,
                      top: `${100 * (box.y + draft.y + box.height * (1 - draft.scale) / 2) / POSTER_HEIGHT}%`,
                      width: `${100 * box.width * draft.scale / POSTER_WIDTH}%`, height: `${100 * box.height * draft.scale / POSTER_HEIGHT}%` }} /> : null}
                </div> : <Image source={{ uri: result.dataUrl }} resizeMode="contain" style={styles.poster} />}
                {result.missingLogos.length > 0 ? <Text accessibilityRole="alert" style={{ color: theme.colors.textMuted }}>Escudo não disponível: {result.missingLogos.join(' e ')}. A arte usa as iniciais. Cadastre ou atualize o escudo e abra a arte novamente.</Text> : null}
              </> : busy ? <View style={styles.loading}><ActivityIndicator color={theme.colors.text} /><Text style={{ color: theme.colors.text }}>Preparando a arte e os escudos.</Text></View> : null}
              {editing && Platform.OS === 'web' ? <View style={styles.controls}>
                <label style={{ color: theme.colors.text, display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'inherit' }}>
                  Tamanho do escudo: {Math.round(draft.scale * 100)}%
                  <input type="range" min="0.5" max="2.5" step="0.01" value={draft.scale} disabled={!editable}
                    onChange={(event) => setDraft((current) => ({ ...current, scale: Number(event.target.value) }))}
                    style={{ width: '100%', minHeight: 36, accentColor: theme.colors.text }} />
                </label>
                <View style={styles.row}>
                  <AppButton label="Centralizar" variant="secondary" disabled={!editable} onPress={() => move(0, 0)} />
                  <AppButton label="Restaurar" variant="secondary" disabled={!editable} onPress={() => setDraft(defaultPosterSettings(data.opponentLogoUrl))} />
                </View>
                <label style={{ color: theme.colors.text, display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, fontFamily: 'inherit' }}>
                  <input type="checkbox" checked={draft.removeBackground} disabled={!editable || !data.opponentLogoUrl || !!result?.missingLogos.includes(data.opponentName)}
                    onChange={(event) => setDraft((current) => ({ ...current, removeBackground: event.target.checked }))} />
                  Remover fundo branco (prévia)
                </label>
                <Text style={{ color: theme.colors.textMuted }}>Funciona melhor com fundo branco liso. Pode apagar detalhes brancos ligados à borda. Confira a prévia; desmarque para comparar e manter o original. A imagem original não será alterada.</Text>
                {saveError ? <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>{saveError}</Text> : null}
                <View style={styles.row}>
                  <AppButton label="Salvar ajuste" loading={saving} disabled={!editable || busy || !!error || !dirty} onPress={() => void save()} />
                  <AppButton label="Cancelar" variant="secondary" disabled={saving} onPress={() => requestClose(false)} />
                </View>
              </View> : null}
              <View style={styles.footer}>
                {!editing && !recoverable && canAdjust && onSaveSettings && result && !error ? <AppButton label="Ajustar arte" variant="secondary" onPress={() => {
                  setDraft(saved); setEditing(true); setSaveError(null); setNotice(null);
                }} /> : null}
                {!editing && file && !busy && !error ? <ImageShareActions key={result?.dataUrl} file={file} title={data.headline} /> : null}
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
  controls: { gap: 12, paddingVertical: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  footer: { paddingVertical: 12, gap: 8 },
});
