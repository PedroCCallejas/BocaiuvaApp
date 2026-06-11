type ErrorWithCode = Error & {
  code?: string;
  status?: number;
  statusCode?: number;
};

function extractErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return '';
}

export function extractErrorCode(error: unknown) {
  if (!(error instanceof Error)) {
    return null;
  }

  return ((error as ErrorWithCode).code ?? '').replace(/^firestore\//, '') || null;
}

export function isPermissionDeniedError(error: unknown) {
  return extractErrorCode(error) === 'permission-denied';
}

export function getProfilePhotoUploadErrorMessage(error: unknown) {
  const message = extractErrorMessage(error);
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes('row-level security') ||
    normalizedMessage.includes('policy') ||
    normalizedMessage.includes('not allowed') ||
    normalizedMessage.includes('permission')
  ) {
    return 'O Storage recusou o envio da foto. Revise as policies do bucket player-photos e tente novamente.';
  }

  if (normalizedMessage.includes('bucket') && normalizedMessage.includes('not found')) {
    return 'O bucket player-photos não foi encontrado no Supabase Storage.';
  }

  if (
    normalizedMessage.includes('network') ||
    normalizedMessage.includes('fetch failed') ||
    normalizedMessage.includes('timeout') ||
    normalizedMessage.includes('offline')
  ) {
    return 'Não foi possível enviar a foto agora. Confira sua conexão e tente novamente.';
  }

  if (message) {
    return message;
  }

  return 'O upload da foto falhou. Tente novamente.';
}

export function getProfilePhotoSaveErrorMessage(error: unknown) {
  if (isPermissionDeniedError(error)) {
    return 'Sua conta não tem permissão para salvar a foto neste perfil. Confirme se o membership ativo está vinculado ao seu jogador ou peça ao admin para revisar o vínculo.';
  }

  const message = extractErrorMessage(error);
  return message || 'Não foi possível salvar a foto no perfil agora.';
}
