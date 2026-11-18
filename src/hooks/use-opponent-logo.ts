import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { pickImage, uploadImage, type ImagePickerSource, type SelectedImageAsset } from '@/lib/uploadImage';
import { buildOpponentLogoStoragePath, validateOpponentLogo } from '@/lib/opponent-logo';

export function useOpponentLogo(identity: string) {
  const [pending, setPending] = useState<SelectedImageAsset | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const uploaded = useRef<{ asset: SelectedImageAsset; url: string } | null>(null);
  useEffect(() => { setPending(null); uploaded.current = null; }, [identity]);
  async function pick(source: ImagePickerSource) {
    setPicking(true);
    try {
      const asset = await pickImage(source);
      if (!asset) return;
      // Check the actual selected bytes as well as picker metadata before upload.
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const checked = { ...asset, fileSize: blob.size, mimeType: blob.type || asset.mimeType };
      validateOpponentLogo(checked);
      setPending(checked);
      uploaded.current = null;
    } catch (error) {
      Alert.alert('Não foi possível selecionar o escudo', error instanceof Error ? error.message : 'Tente novamente.');
    } finally { setPicking(false); }
  }
  async function resolve(teamId: string, existingUrl: string | null) {
    if (!pending) return existingUrl;
    if (uploaded.current?.asset === pending) return uploaded.current.url;
    validateOpponentLogo(pending);
    try {
      setProgress(0);
      const result = await uploadImage({ asset: pending,
        storagePath: buildOpponentLogoStoragePath(teamId, crypto.randomUUID()),
        format: 'png', maxDimension: 1024, onProgress: setProgress });
      uploaded.current = { asset: pending, url: result.downloadUrl };
      return result.downloadUrl;
    } finally { setProgress(null); }
  }
  return { pending, progress, picking, pick, resolve, cancel: () => { setPending(null); uploaded.current = null; } };
}
