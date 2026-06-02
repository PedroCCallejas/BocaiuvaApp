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
  'auth/operation-not-allowed':
    'O acesso por e-mail e senha ainda não foi habilitado para esta conta.',
};

type ErrorWithCode = Error & { code?: string };

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
      return createAuthError(error.message, code);
    }
  }

  return createAuthError(fallbackMessage);
}
