const RETURN_PATHS = new Set([
  '/ferramentas',
  '/ferramentas/cronometro-pelada',
  '/ferramentas/rodizio-de-times',
  '/ferramentas/sorteador-de-times',
  '/ferramentas/campeonato-rapido',
  '/account',
]);

export function getSafeReturnPath(value: string | string[] | undefined): string {
  return typeof value === 'string' && RETURN_PATHS.has(value) ? value : '/';
}
