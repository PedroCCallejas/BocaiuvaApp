/**
 * Normalização de texto para busca dentro do app.
 *
 * Remove acento e caixa para que "jose" encontre "José" e "sao" encontre
 * "São". Usado nos campos de busca de jogadores, partidas e despesas.
 */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** True quando todos os termos digitados aparecem no texto do item. */
export function matchesSearchQuery(haystack: string, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return true;
  }

  const normalizedHaystack = normalizeSearchText(haystack);

  // Termos separados por espaço buscam em conjunto: "supremo 03" acha
  // "20/03/2025 · Supremo FC" mesmo com a data antes do adversário.
  return normalizedQuery
    .split(/\s+/)
    .every((term) => normalizedHaystack.includes(term));
}
