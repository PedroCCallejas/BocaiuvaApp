import { useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { AppButton } from '@/components/ui/AppButton';
import { useAppTheme } from '@/hooks/use-app-theme';
import { downloadPreparedImage, sharePreparedImage } from '@/lib/image-sharing';

export function ImageShareActions({ file, title, disabled = false }: { file: File; title: string; disabled?: boolean }) {
  const theme = useAppTheme();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const busyRef = useRef(false);
  async function share(target: string) {
    if (busyRef.current || disabled || Platform.OS !== 'web') return;
    busyRef.current = true; setBusy(true);
    // No capture/fetch/await before navigator.share: preserve browser user activation.
    const pending = sharePreparedImage(file, title, navigator);
    setNotice(`Selecione ${target} na lista de aplicativos, se disponível.`);
    const result = await pending;
    setNotice(result === 'shared' ? 'Imagem entregue ao menu de compartilhamento. Conclua no aplicativo escolhido.'
      : result === 'canceled' ? 'Compartilhamento cancelado. Nada mais foi iniciado.'
      : 'Este navegador não compartilhou o arquivo. Use Baixar PNG e anexe a imagem manualmente no aplicativo.');
    busyRef.current = false; setBusy(false);
  }
  return <View style={{ gap: 8 }}>
    <Text style={{ color: theme.colors.textMuted }}>
      Instagram e WhatsApp: escolha o aplicativo no menu do celular. A disponibilidade depende do navegador e dos apps instalados. No computador, baixe e anexe o PNG. Nada é publicado automaticamente.
    </Text>
    {notice ? <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.textMuted }}>{notice}</Text> : null}
    <AppButton label="Compartilhar no Instagram" variant="secondary" disabled={disabled || busy} onPress={() => void share('Instagram')} />
    <AppButton label="Compartilhar no WhatsApp" variant="secondary" disabled={disabled || busy} onPress={() => void share('WhatsApp')} />
    <AppButton label="Baixar PNG" disabled={disabled || busy} onPress={() => {
      downloadPreparedImage(file); setNotice('Download solicitado. Confira os downloads e anexe o PNG no aplicativo desejado.');
    }} />
  </View>;
}
