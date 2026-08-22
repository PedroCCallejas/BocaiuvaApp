/**
 * Erro do Postgres → mensagem que o time entende.
 *
 * O equivalente ao que `toFriendlyFirestoreError` faz do lado do Firestore.
 * Sem isto o app mostraria `new row violates row-level security policy for
 * table "expenses"` — que não diz nada para quem só queria lançar uma cerveja.
 *
 * A tradução preserva o `code` original no erro, para o log continuar útil
 * quando a mensagem amigável esconder a causa técnica.
 */

export type CodigoDeErro =
  | 'permission-denied'
  | 'failed-precondition'
  | 'not-found'
  | 'already-exists'
  | 'unavailable'
  | 'unknown';

export interface ErroDoRepositorio extends Error {
  code: CodigoDeErro;
  causaTecnica?: string;
}

/** O formato que o supabase-js devolve em `{ data, error }`. */
export interface ErroDoPostgrest {
  message?: string | null;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
}

/**
 * Códigos do Postgres que importam aqui.
 *
 * `42501` é o mais relevante: é o que a RLS devolve quando a policy recusa a
 * linha. Confundir isso com erro genérico foi o que nos custou dias no
 * Firestore — a mensagem errada manda investigar o lugar errado.
 */
const POR_CODIGO: Record<string, { codigo: CodigoDeErro; mensagem: string }> = {
  '42501': {
    codigo: 'permission-denied',
    mensagem: 'Você não tem permissão para concluir esta ação.',
  },
  '23505': {
    codigo: 'already-exists',
    mensagem: 'Esse registro já existe.',
  },
  '23503': {
    codigo: 'failed-precondition',
    mensagem: 'Um dos itens escolhidos não existe mais. Recarregue e tente de novo.',
  },
  '23514': {
    codigo: 'failed-precondition',
    mensagem: 'Algum valor está fora do permitido. Revise os campos.',
  },
  '22023': {
    codigo: 'failed-precondition',
    mensagem: 'Revise os dados informados.',
  },
  '23502': {
    codigo: 'failed-precondition',
    mensagem: 'Falta preencher um campo obrigatório.',
  },
  // PostgREST: nenhuma linha quando `.single()` exigia uma.
  PGRST116: {
    codigo: 'not-found',
    mensagem: 'Registro não encontrado.',
  },
  // PostgREST: a policy escondeu a linha, então "não existe" para quem pediu.
  PGRST301: {
    codigo: 'permission-denied',
    mensagem: 'Você não tem permissão para ver este conteúdo.',
  },
};

export function criarErroDoRepositorio(
  mensagem: string,
  code: CodigoDeErro = 'unknown',
  causaTecnica?: string,
): ErroDoRepositorio {
  const erro = new Error(mensagem) as ErroDoRepositorio;
  erro.code = code;

  if (causaTecnica) {
    erro.causaTecnica = causaTecnica;
  }

  return erro;
}

/**
 * `fetch failed` e afins.
 *
 * Vale distinguir de erro de permissão: mandar a pessoa "pedir acesso ao
 * admin" quando o problema é o 4G dela é pior do que não dizer nada.
 */
function pareceQuedaDeRede(mensagem: string) {
  return /fetch failed|network|timeout|ECONNRESET|ENOTFOUND/i.test(mensagem);
}

export function traduzirErroDoPostgres(
  erro: ErroDoPostgrest | null | undefined,
  mensagemPadrao: string,
): ErroDoRepositorio {
  const bruto = erro?.message?.trim() ?? '';
  const codigoBruto = erro?.code?.trim() ?? '';
  const detalhe = [bruto, erro?.details, erro?.hint].filter(Boolean).join(' | ');

  const conhecido = POR_CODIGO[codigoBruto];

  if (conhecido) {
    return criarErroDoRepositorio(conhecido.mensagem, conhecido.codigo, detalhe);
  }

  // A RLS nem sempre chega com código: em alguns caminhos vem só no texto.
  if (/row-level security|violates row-level/i.test(bruto)) {
    return criarErroDoRepositorio(
      'Você não tem permissão para concluir esta ação.',
      'permission-denied',
      detalhe,
    );
  }

  if (pareceQuedaDeRede(bruto)) {
    return criarErroDoRepositorio(
      'Sem conexão com o servidor agora. Tente de novo em instantes.',
      'unavailable',
      detalhe,
    );
  }

  return criarErroDoRepositorio(mensagemPadrao, 'unknown', detalhe || undefined);
}
