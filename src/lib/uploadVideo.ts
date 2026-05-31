import * as ImagePicker from 'expo-image-picker';

import {
  supabase,
  supabaseConfigError,
  supabaseEnabled,
} from '@/config/supabase/client';

export interface SelectedVideoAsset {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  duration?: number | null;
  width?: number;
  height?: number;
}

interface UploadVideoInput {
  asset: SelectedVideoAsset;
  storagePath: string;
  onProgress?: (progress: number) => void;
}

interface UploadVideoResult {
  downloadUrl: string;
  storagePath: string;
  usedLocalFallback: boolean;
}

function isMockDataSource() {
  return process.env.EXPO_PUBLIC_DATA_SOURCE === 'mock';
}

function splitStoragePath(storagePath: string) {
  const [bucket, ...objectParts] = storagePath.split('/').filter(Boolean);
  if (!bucket || objectParts.length === 0) {
    throw new Error('O caminho de upload do vídeo está inválido.');
  }

  return {
    bucket,
    objectPath: objectParts.join('/'),
  };
}

function isMp4Asset(asset: SelectedVideoAsset) {
  const mimeType = asset.mimeType?.toLowerCase() ?? '';
  const fileName = asset.fileName?.toLowerCase() ?? '';
  return mimeType === 'video/mp4' || fileName.endsWith('.mp4');
}

function toSelection(asset: ImagePicker.ImagePickerAsset): SelectedVideoAsset {
  return {
    uri: asset.uri,
    mimeType: asset.mimeType ?? null,
    fileName: asset.fileName ?? null,
    fileSize: asset.fileSize ?? null,
    duration: asset.duration ?? null,
    width: asset.width,
    height: asset.height,
  };
}

async function createUploadBody(uri: string) {
  const response = await fetch(uri);
  return response.arrayBuffer();
}

async function ensureVideoPickerPermission() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Permita o acesso à galeria para escolher um vídeo.');
  }
}

async function uploadToSupabaseStorage(input: {
  bucket: string;
  objectPath: string;
  body: ArrayBuffer;
}) {
  if (!supabaseEnabled || !supabase) {
    throw new Error(
      supabaseConfigError ??
        'O upload de vídeos ainda não foi configurado no Supabase Storage.',
    );
  }

  const { error } = await supabase.storage.from(input.bucket).upload(
    input.objectPath,
    input.body,
    {
      cacheControl: '3600',
      contentType: 'video/mp4',
      upsert: true,
    },
  );

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from(input.bucket).getPublicUrl(input.objectPath);
  return data.publicUrl;
}

export async function pickVideo() {
  await ensureVideoPickerPermission();

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'] as ImagePicker.MediaType[],
    allowsEditing: false,
    quality: 1,
  });

  if (result.canceled) {
    return null;
  }

  const asset = result.assets?.[0];
  if (!asset) {
    return null;
  }

  const selected = toSelection(asset);
  if (!isMp4Asset(selected)) {
    throw new Error('Selecione um arquivo em MP4 para continuar.');
  }

  return selected;
}

export function buildTeamPresentationVideoStoragePath(teamId: string) {
  return `team-videos/${teamId}/presentation.mp4`;
}

export function buildPlayerPresentationVideoStoragePath(teamId: string, playerId: string) {
  return `player-videos/${teamId}/${playerId}/presentation.mp4`;
}

export async function uploadVideo({
  asset,
  storagePath,
  onProgress,
}: UploadVideoInput): Promise<UploadVideoResult> {
  if (!isMp4Asset(asset)) {
    throw new Error('Selecione um vídeo em MP4 para continuar.');
  }

  onProgress?.(0);

  if (isMockDataSource()) {
    onProgress?.(1);
    return {
      downloadUrl: asset.uri,
      storagePath,
      usedLocalFallback: true,
    };
  }

  const { bucket, objectPath } = splitStoragePath(storagePath);
  onProgress?.(0.35);
  const body = await createUploadBody(asset.uri);
  onProgress?.(0.72);
  const publicUrl = await uploadToSupabaseStorage({
    bucket,
    objectPath,
    body,
  });
  onProgress?.(1);

  return {
    downloadUrl: publicUrl,
    storagePath,
    usedLocalFallback: false,
  };
}
