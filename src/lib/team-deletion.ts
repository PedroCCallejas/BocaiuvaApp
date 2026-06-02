export const TEAM_STORAGE_CLEANUP_WARNING_CODE = 'team-deletion-storage-warning';
export const TEAM_STORAGE_CLEANUP_WARNING_MESSAGE =
  'O time foi excluído, mas alguns arquivos podem precisar de limpeza manual.';
export const TEAM_DELETION_SUCCESS_MESSAGE = 'Time excluído com sucesso.';

type ErrorWithCode = {
  code?: string;
};

export function isTeamStorageCleanupWarning(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as ErrorWithCode).code === TEAM_STORAGE_CLEANUP_WARNING_CODE
  );
}
