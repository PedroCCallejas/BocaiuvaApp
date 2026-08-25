/**
 * Quais coleções o Firestore ainda precisa ler.
 *
 * Enquanto a migração acontece, o app monta a tela juntando os dois bancos. O
 * problema é que ele estava lendo os dois **inteiros**: o Firestore entregava
 * partidas, presenças, notas e votos, e a camada de cima jogava tudo fora e
 * punha o Postgres no lugar. Leitura paga, dado descartado — exatamente a carga
 * que motivou a migração, ainda intacta.
 *
 * Pior que o custo: como as escritas pararam de ir para o Firestore, o que ele
 * entrega envelhece a cada dia. Hoje é inofensivo porque a fatia sobrescreve.
 * Qualquer buraco na composição, porém, vira dado antigo na tela — que foi
 * exatamente o bug do "você não participa de nenhum time".
 *
 * Este arquivo é o bilhete que a composição deixa para o repositório do
 * Firestore. Ele não menciona o outro banco de propósito: o
 * `firebase-repository` sustenta o app inteiro e não deve saber que existe uma
 * migração em curso — há teste garantindo isso.
 *
 * O que NUNCA entra aqui: `users`, `teams` e `teamMembers`. Eles vêm do
 * bootstrap e são o que segura a tela em pé enquanto o Postgres responde. Sem
 * eles, o app conclui que a pessoa não tem time.
 */

const ignoradas = new Set<string>();

/**
 * Registra as coleções que outra fonte já entrega.
 *
 * Chamado uma vez, na montagem do repositório. Substitui a lista inteira em vez
 * de acrescentar: assim o estado não depende da ordem das chamadas.
 */
export function ignorarColecoesDoFirestore(nomes: readonly string[]): void {
  ignoradas.clear();

  for (const nome of nomes) {
    ignoradas.add(nome);
  }
}

export function colecaoIgnorada(nome: string): boolean {
  return ignoradas.has(nome);
}

/** Só para teste: devolve o módulo ao estado inicial entre casos. */
export function limparColecoesIgnoradas(): void {
  ignoradas.clear();
}
