const authErrorMessages: Record<string, string> = {
  'auth/invalid-email': 'Informe um e-mail válido.',
  'auth/weak-password': 'Use uma senha mais forte com pelo menos 6 caracteres.',
  'auth/user-not-found': 'Não encontramos uma conta com este e-mail.',
  'auth/wrong-password': 'A senha informada está incorreta.',
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/email-already-in-use': 'Este e-mail já está cadastrado.',
  'auth/account-exists-with-different-credential':
    'Já existe uma conta com esse e-mail usando outro acesso.',
  'auth/network-request-failed': 'Verifique sua conexão com a internet e tente novamente.',
  'auth/too-many-requests': 'Muitas tentativas seguidas. Aguarde um pouco e tente novamente.',
  'auth/user-disabled': 'Esta conta foi desativada.',
  'auth/popup-closed-by-user': 'A entrada com Google foi cancelada antes da confirmação.',
  'auth/popup-blocked': 'Permita a abertura da janela do Google para continuar.',
  'auth/cancelled-popup-request': 'A entrada com Google foi interrompida antes da confirmação.',
  'auth/unauthorized-domain':
    'Este domínio ainda não foi autorizado no Firebase Authentication para entrar com Google.',
  'auth/operation-not-allowed':
    'O provedor de acesso solicitado ainda não foi habilitado para esta conta.',
  'auth/operation-not-supported-in-this-environment':
    'Este navegador bloqueou a autenticação do Google neste ambiente.',
};

type ErrorWithCode = Error & { code?: string };

function getFriendlyMessageFromAuthText(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes('redirect_uri_mismatch')) {
    return 'O retorno do login com Google não confere com o domínio configurado. Revise a URL da Vercel no Firebase Authentication e no cliente OAuth da web.';
  }

  if (
    normalizedMessage.includes('domain is not authorized') ||
    normalizedMessage.includes('unauthorized-domain')
  ) {
    return 'Este domínio ainda não foi autorizado no Firebase Authentication. Adicione a URL da Vercel em Authentication > Settings > Authorized domains.';
  }

  if (
    normalizedMessage.includes('popup blocked') ||
    normalizedMessage.includes('popup-blocked')
  ) {
    return 'Permita a abertura da janela do Google para continuar.';
  }

  if (
    normalizedMessage.includes('popup closed') ||
    normalizedMessage.includes('popup-closed-by-user')
  ) {
    return 'A entrada com Google foi cancelada antes da confirmação.';
  }

  if (normalizedMessage.includes('idpiframe_initialization_failed')) {
    return 'O navegador bloqueou recursos do Google necessários para entrar. Libere cookies de terceiros ou tente outro navegador.';
  }

  return null;
}

export function createAuthError(message: string, code = 'auth/custom-error') {
  const error = new Error(message) as ErrorWithCode;
  error.code = code;
  return error;
}

export function toFriendlyAuthError(
  error: unknown,
  fallbackMessage: string,
) {
  if (error instanceof Error) {
    const code = (error as ErrorWithCode).code;
    if (code && authErrorMessages[code]) {
      return createAuthError(authErrorMessages[code], code);
    }

    if (error.message) {
      const friendlyMessage = getFriendlyMessageFromAuthText(error.message);

      if (friendlyMessage) {
        return createAuthError(friendlyMessage, code);
      }

      return createAuthError(error.message, code);
    }
  }

  return createAuthError(fallbackMessage);
}
