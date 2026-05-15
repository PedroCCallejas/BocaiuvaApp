import * as ImagePicker from 'expo-image-picker';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';

import { supabase, supabaseConfigError, supabaseEnabled } from '@/config/supabase/client';

const DEFAULT_MAX_DIMENSION = 1600;
const DEFAULT_COMPRESSION = 0.72;

export type ImagePickerSource = 'camera' | 'library';

export interface SelectedImageAsset {
  uri: string;
  width: number;
  height: number;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
}

interface UploadImageInput {
  asset: SelectedImageAsset;
  storagePath: string;
  maxDimension?: number;
  compress?: number;
  onProgress?: (progress: number) => void;
}

interface UploadImageResult {
  downloadUrl: string;
  storagePath: string;
  usedLocalFallback: boolean;
}

function isMockDataSource() {
  return process.env.EXPO_PUBLIC_DATA_SOURCE === 'mock';
}

function toSelection(asset: ImagePicker.ImagePickerAsset): SelectedImageAsset {
  return {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    mimeType: asset.mimeType ?? null,
    fileName: asset.fileName ?? null,
    fileSize: asset.fileSize ?? null,
  };
}

async function ensurePickerPermission(source: ImagePickerSource) {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      throw new Error('Permita o acesso a camera para tirar uma foto.');
    }
    return;
  }

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Permita o acesso a galeria para escolher uma imagem.');
  }
}

export async function pickImage(source: ImagePickerSource) {
  await ensurePickerPermission(source);

  const commonOptions = {
    allowsEditing: true,
    mediaTypes: ['images'] as ImagePicker.MediaType[],
    quality: 1,
  };

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(commonOptions)
      : await ImagePicker.launchImageLibraryAsync(commonOptions);

  if (result.canceled) {
    return null;
  }

  const asset = result.assets?.[0];
  if (!asset) {
    return null;
  }

  return toSelection(asset);
}

async function prepareImage(
  asset: SelectedImageAsset,
  {
    maxDimension = DEFAULT_MAX_DIMENSION,
    compress = DEFAULT_COMPRESSION,
  }: Pick<UploadImageInput, 'maxDimension' | 'compress'>,
) {
  const largestSide = Math.max(asset.width || 0, asset.height || 0);
  const shouldResize = largestSide > maxDimension;
  const resizeAction = shouldResize
    ? asset.width >= asset.height
      ? [{ resize: { width: maxDimension } }]
      : [{ resize: { height: maxDimension } }]
    : [];

  return manipulateAsync(asset.uri, resizeAction, {
    compress,
    format: SaveFormat.JPEG,
  });
}

function normalizeProgress(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function splitStoragePath(storagePath: string) {
  const [bucket, ...objectParts] = storagePath.split('/').filter(Boolean);
  if (!bucket || objectParts.length === 0) {
    throw new Error('O caminho de upload da imagem esta invalido.');
  }

  return {
    bucket,
    objectPath: objectParts.join('/'),
  };
}

async function createUploadBody(uri: string) {
  const response = await fetch(uri);
  const buffer = await response.arrayBuffer();
  return buffer;
}

export function buildPlayerPhotoStoragePath(teamId: string, playerId: string) {
  return `player-photos/${teamId}/${playerId}.jpg`;
}

export function buildTeamLogoStoragePath(teamId: string) {
  return `team-logos/${teamId}/logo.jpg`;
}

export function buildTeamBannerStoragePath(teamId: string) {
  return `team-banners/${teamId}/banner.jpg`;
}

export async function uploadImage({
  asset,
  storagePath,
  maxDimension,
  compress,
  onProgress,
}: UploadImageInput): Promise<UploadImageResult> {
  onProgress?.(0);
  const preparedImage = await prepareImage(asset, {
    maxDimension,
    compress,
  });
  onProgress?.(0.35);

  if (isMockDataSource()) {
    onProgress?.(1);
    return {
      downloadUrl: preparedImage.uri,
      storagePath,
      usedLocalFallback: true,
    };
  }

  if (!supabaseEnabled || !supabase) {
    throw new Error(
      supabaseConfigError ??
        'O upload de imagens ainda nao foi configurado no Supabase Storage.',
    );
  }

  const { bucket, objectPath } = splitStoragePath(storagePath);
  const body = await createUploadBody(preparedImage.uri);
  onProgress?.(0.65);

  const { error: uploadError } = await supabase.storage.from(bucket).upload(objectPath, body, {
    cacheControl: '3600',
    contentType: asset.mimeType ?? 'image/jpeg',
    upsert: true,
  });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  const downloadUrl = data.publicUrl;
  onProgress?.(normalizeProgress(1));
  onProgress?.(1);

  return {
    downloadUrl,
    storagePath,
    usedLocalFallback: false,
  };
}
