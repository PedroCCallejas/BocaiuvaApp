# Resultado da rodada — 16/10/2026

**Continuação autorizada:** [PR #4](https://github.com/PedroCCallejas/BocaiuvaApp/pull/4),
CI do cache aprovado para `9f05b0c` ([execução](https://github.com/PedroCCallejas/BocaiuvaApp/actions/runs/38857660326)),
618 testes locais e build web aprovados; [cópia real dos registros restaurada](../docs/backup-real-2026-10-16.md).
[Monetização/court](../docs/monetizacao-2026-10-16/README.md) e
[SEO/descoberta por IA](../docs/seo-descoberta-ia-2026-10-16.md) preparados.
Cobrança continua desativada. Sem merge/deploy de produção nesta continuação.
O restante deste documento preserva a primeira rodada e seus limites originais.

**Avanço pelos quatro itens com evidência e limites; cobrança não ativada.**
O produto publicado passou pelas jornadas saudáveis executadas. Há uma correção
local revisável e novos testes de banco/recuperação, mas faltam condições para
declarar operação comercial pronta.

| Frente pedida | Entrega | O que permanece aberto |
|---|---|---|
| 1. Jornada no celular | Sessão real, reload, entrada automática, navegação em 390×844, troca de dois times/papéis e retorno das ferramentas. Corrigida tela vazia de acesso sem permissão. | Aparelhos físicos, Safari, rede ruim e sessão expirada; título de aba B01 |
| 2. Proteção e recuperação | Metadata de RLS/buckets/views, testes de isolamento SQL, reconstrução de 27 migrations e restauração sintética; job de CI configurado. | Backup externo real, mídias/identidade, cache sob falhas, monitoramento, execução remota do novo job |
| 3. Teste com usuários | Plano de piloto para organizador e elenco; pesquisa exploratória com nove relatos públicos em três plataformas. | Sessões dos ~20 jogadores não realizadas; não há compradores de outros times entrevistados |
| 4. Cobrança por time | Proposta com unidade, pagador, estados e critérios de aceitação no servidor. | Preço, termos e detalhes não aprovados; pagamento/webhooks/direitos não implementados |

## Correção pequena entregue

Jogador que abria `/matches/create` recebia uma tela vazia porque o guard retornava
`null`. Agora o mesmo guard mostra Acesso restrito e Ver partidas. A prévia
confirmou formulário para admin, restrição para jogador e retorno funcionando,
inclusive após trocar de conta e voltar pelo histórico. Sem mudança de autorização.

## Validação

- TypeScript aprovado; 614 testes passaram após a correção.
- Build web com 87 rotas aprovado; prévia fictícia reconstruída com cache limpo.
- PostgreSQL: 27 migrations, cinco arquivos de teste SQL e os cinco repetidos
  após `pg_dump/pg_restore`; fingerprint de dados sintéticos/RLS/policies igual.
- Auditoria de dependências aprovada com as exceções existentes; 14 moderadas,
  21 altas, zero críticas. Prazo 12/11/2026 preservado.
- Sintaxe do novo runner e verificação de whitespace aprovadas.
- CI remoto não executado, pois não houve commit/push. Nenhum deploy.

## Decisão recomendada

Usar o time atual como piloto e concluir recuperação real e cache por contexto
antes de ativar cobrança. Manter a proposta de uma assinatura por time, com
jogadores convidados sem cobrança individual. Teste de 30 dias e carência de
7 dias são apenas propostas, não regras aprovadas ou implementadas.

O plano Free do Supabase foi confirmado; não se comprovou cópia externa ou
restauração real. [Backup de banco não inclui os objetos de Storage](https://supabase.com/docs/guides/platform/backups).
O ensaio sintético não substitui essa operação.

## Arquivos principais

- `src/app/(app)/matches/create.tsx`: correção da tela vazia.
- `scripts/verify-postgres.mjs`, `tests/postgres/`, `supabase/tests/tenant_isolation.sql`:
  runner, fixtures e novos casos de isolamento.
- `package.json`, `.github/workflows/ci.yml`, `README.md`, `CLAUDE.md`:
  comando, job e documentação da verificação.
- `replica/`: inventário de 41 rotas, casos de teste, achados, pesquisa, piloto,
  matriz e proposta comercial. A nota de cobertura da matriz não certifica o app.

Logs e capturas privadas permanecem em `.expo/validacao-gaps-2026-10-16/`,
ignorados pelo Git. Nenhum vídeo novo. Auth, RLS, secrets e SDKs preservados.
