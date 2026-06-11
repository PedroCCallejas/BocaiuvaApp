import * as ImagePicker from 'expo-image-picker';
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';

import {
  supabase,
  supabaseConfigError,
  supabaseConfigSummary,
  supabaseEnabled,
} from '@/config/supabase/client';
import { appendCacheBustParam } from '@/lib/storage-url';

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
  cacheBustKey?: string | number | null;
  onProgress?: (progress: number) => void;
}

interface UploadImageResult {
  downloadUrl: string;
  storagePath: string;
  usedLocalFallback: boolean;
}

export interface SupabaseUploadDebugResult {
  url: string | null;
  bucket: string;
  path: string;
  contentType: string;
  responseData: unknown | null;
  error: Record<string, unknown> | null;
  publicUrl: string | null;
}

function isMockDataSource() {
  return process.env.EXPO_PUBLIC_DATA_SOURCE === 'mock';
}

function serializeUploadError(error: unknown) {
  if (error instanceof Error) {
    const serialized: Record<string, unknown> = {
      name: error.name,
      message: error.message,
    };
    const errorRecord = error as unknown as Record<string, unknown>;

    for (const key of Object.getOwnPropertyNames(error)) {
      serialized[key] = errorRecord[key];
    }

    return serialized;
  }

  if (typeof error === 'object' && error !== null) {
    return { ...(error as Record<string, unknown>) };
  }

  return { value: error };
}

function logUploadDebug(
  prefix: string,
  payload: Record<string, unknown>,
  level: 'log' | 'error' = 'log',
) {
  if (!__DEV__) {
    return;
  }

  if (level === 'error') {
    console.error(prefix, payload);
    return;
  }

  console.log(prefix, payload);
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

function getResolvedUploadContentType() {
  return 'image/jpeg';
}

async function uploadToSupabaseStorage(input: {
  bucket: string;
  objectPath: string;
  body: ArrayBuffer;
  contentType: string;
}) {
  logUploadDebug('[upload-image] supabase-config', {
    hasUrl: supabaseConfigSummary.hasUrl,
    url: supabaseConfigSummary.normalizedUrl,
    hasAnonKey: supabaseConfigSummary.hasAnonKey,
    anonKeyPreview: supabaseConfigSummary.anonKeyPreview,
    keySource: supabaseConfigSummary.keySource,
    enabled: supabaseEnabled,
    configError: supabaseConfigError,
  });
  logUploadDebug('[upload-image] bucket', { bucket: input.bucket });
  logUploadDebug('[upload-image] path', { path: input.objectPath });
  logUploadDebug('[upload-image] contentType', { contentType: input.contentType });

  if (!supabaseEnabled || !supabase) {
    const configError = new Error(
      supabaseConfigError ??
        'O upload de imagens ainda não foi configurado no Supabase Storage.',
    );
    logUploadDebug(
      '[upload-image] upload-error',
      {
        bucket: input.bucket,
        path: input.objectPath,
        contentType: input.contentType,
        error: serializeUploadError(configError),
      },
      'error',
    );
    throw configError;
  }

  const { data, error } = await supabase.storage.from(input.bucket).upload(
    input.objectPath,
    input.body,
    {
      cacheControl: '3600',
      contentType: input.contentType,
      upsert: true,
    },
  );

  if (error) {
    logUploadDebug(
      '[upload-image] upload-error',
      {
        bucket: input.bucket,
        path: input.objectPath,
        contentType: input.contentType,
        error: serializeUploadError(error),
      },
      'error',
    );
    throw error;
  }

  logUploadDebug('[upload-image] upload-success', {
    bucket: input.bucket,
    path: input.objectPath,
    contentType: input.contentType,
    data,
  });

  const { data: publicUrlData } = supabase.storage
    .from(input.bucket)
    .getPublicUrl(input.objectPath);
  const publicUrl = publicUrlData.publicUrl;

  logUploadDebug('[upload-image] public-url', {
    bucket: input.bucket,
    path: input.objectPath,
    publicUrl,
  });

  return {
    data,
    publicUrl,
  };
}

function createTestUploadBody() {
  // Minimal binary payload for storage diagnostics in React Native.
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]).buffer;
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
  cacheBustKey,
  onProgress,
}: UploadImageInput): Promise<UploadImageResult> {
  try {
    onProgress?.(0);
    logUploadDebug('[upload-image] selected-file', {
      fileName: asset.fileName ?? null,
      fileSize: asset.fileSize ?? null,
      uri: asset.uri,
      width: asset.width,
      height: asset.height,
      mimeType: asset.mimeType ?? null,
      storagePath,
    });

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

    const { bucket, objectPath } = splitStoragePath(storagePath);
    const contentType = getResolvedUploadContentType();

    logUploadDebug('[upload-image] upload-start', {
      bucket,
      path: objectPath,
      storagePath,
      preparedUri: preparedImage.uri,
      preparedWidth: preparedImage.width,
      preparedHeight: preparedImage.height,
    });

    const body = await createUploadBody(preparedImage.uri);
    onProgress?.(0.65);

    const { publicUrl } = await uploadToSupabaseStorage({
      bucket,
      objectPath,
      body,
      contentType,
    });
    const downloadUrl = appendCacheBustParam(publicUrl, cacheBustKey);
    onProgress?.(normalizeProgress(1));
    onProgress?.(1);

    return {
      downloadUrl,
      storagePath,
      usedLocalFallback: false,
    };
  } catch (error) {
    logUploadDebug(
      '[upload-image] upload-error',
      {
        storagePath,
        error: serializeUploadError(error),
      },
      'error',
    );
    throw error;
  }
}

export async function testSupabaseUpload(): Promise<SupabaseUploadDebugResult> {
  const bucket = 'team-logos';
  const path = 'test-upload.jpg';
  const contentType = 'image/jpeg';
  const url = supabaseConfigSummary.normalizedUrl;

  logUploadDebug('[upload-image] upload-start', {
    mode: 'testSupabaseUpload',
    bucket,
    path,
    contentType,
  });

  try {
    const { data, publicUrl } = await uploadToSupabaseStorage({
      bucket,
      objectPath: path,
      body: createTestUploadBody(),
      contentType,
    });

    return {
      url,
      bucket,
      path,
      contentType,
      responseData: data,
      error: null,
      publicUrl,
    };
  } catch (error) {
    const serializedError = serializeUploadError(error);
    logUploadDebug(
      '[upload-image] upload-error',
      {
        mode: 'testSupabaseUpload',
        bucket,
        path,
        contentType,
        error: serializedError,
      },
      'error',
    );

    return {
      url,
      bucket,
      path,
      contentType,
      responseData: null,
      error: serializedError,
      publicUrl: null,
    };
  }
}
