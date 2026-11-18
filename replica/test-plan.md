# Plano e execução — 16/10/2026

## Ambientes

- Produção publicada, sessão do próprio usuário no Edge. Escritas limitadas
  à preferência de time ativo A → B → A, restaurada. Não houve cadastro,
  convite real, alteração esportiva, exclusão, exportação pessoal ou envio de e-mail.
- Responsividade em **viewport de desktop 390×844**, não aparelho físico.
- Demonstração local com seed fictício, para criação de time e estados vazios.
- PostgreSQL 17 isolado, sem rede, usando migrations reais e identidade JWT
  sintética de teste. Não é verificação dos tokens Firebase de produção.

## Casos

| ID | Jornada / critério | Método | Resultado e limite |
|---|---|---|---|
| F01-H1 | Login chega ao painel | Produção | Passou: usuário concluiu entrada e painel observado; provedor específico não distinguido |
| F01-H2 | Recarregar mantém sessão | Produção | Passou: painel restaurado sem novo clique em Entrar |
| F01-H3 | Endereço inicial entra automaticamente | Produção | Passou: loading → /home |
| F01-E1 | Fechar todo o navegador e reabrir | Manual | Não executado; não confundir reload com encerrar o navegador |
| F01-E2 | Sessão expirada / recuperação de senha | Manual/integração | Não executado; nenhum e-mail enviado |
| F02-H1 | Organizador sem vínculo entende opções | Demo | Passou: Meus times mostrou código e criar time |
| F02-H2 | Criar time e chegar ao painel | Demo | Passou: QA Gaps 16-10 criado, painel vazio e ações de gestão |
| F03-N1 | Convite vazio não entra | Demo | Passou: erro inline e sem vínculo |
| F03-N2 | Convite inexistente não entra | Demo | Parcial: alert nativo abriu; usuário fechou e pessoa continuou sem time; texto do alert não foi capturado |
| F03-H1 | Convite válido / idempotência / reentrada | SQL | Passou no banco reconstruído e restaurado; fluxo UI válido não exercitado nesta rodada |
| F04-H1 | Alternar A → B → A | Produção | Passou: dados e papel jogador/admin corresponderam aos dois times; original restaurado |
| F04-E1 | Conta/time mudam durante falha de leitura | Componente de cache | Parcial: cache A permanece aplicável ao falhar B; UI cruzada não comprovada |
| F04-E2 | Duas abas, resposta atrasada, offline | Integração | Não executado; precisa de cliente controlado e falhas sintéticas |
| F05-H1 | Ferramenta → Início | Produção | Passou: cronômetro abriu e retornou; B01 de título registrado |
| F06-H1 | Painel, elenco, stats e ranking em 390px | Produção | Passou: áreas carregadas e sem overflow horizontal observado |
| F06-E1 | Leitor de tela, teclado completo e aparelhos físicos | Manual | Não executado; inspeção AX não substitui testes assistivos |
| F07-N1 | Jogador abre Criar partida pelo histórico | Produção/local | B03 reproduzido em produção. Correção local passou: trocar admin por jogador, voltar no histórico, ver aviso e usar Ver partidas. Admin mantém formulário. Sem deploy |
| F08-H1 | Admin A não lê dados privados B | SQL | Passou: times, elenco e partidas filtrados |
| F08-N1 | Admin A não altera B nem cria jogador B | SQL | Passou: update sem linhas e insert negado |
| F08-N2 | Jogador sem gestão não cria partida | SQL | Passou: insert negado pela RLS |
| F08-N3 | Conta sem vínculo e anon não leem elenco privado | SQL | Passou: nenhuma linha privada do fixture |
| F08-N4 | RPC privilegiada não apura MVP de outro time | SQL | Passou: permissão insuficiente |
| F08-H2 | Buckets privados, views invoker e colunas sensíveis | Metadata remota | Passou para os objetos consultados; download assinado real não exercitado |
| F09-H1 | Reconstruir migrations e executar SQL | Docker | Passou: 27 migrations, cinco arquivos SQL |
| F09-H2 | Dump, restore, fingerprint e repetir SQL | Docker | Passou: dados sintéticos/policies/RLS iguais, cinco testes repetidos |
| F09-E1 | Backup externo real, Storage e identidade | Operação | Não comprovado; plano e procedimento em operacao-e-recuperacao.md |
| F10-H1 | Jogadores realizam tarefas sem ajuda | Piloto | Não executado; roteiro preparado para o time de ~20 jogadores |
| F11-H1 | Proposta por time com direitos separados | Documento | Parcial: proposta escrita; decisões comerciais e aprovação pendentes |

## Validações de código e build

- `npm run typecheck`: aprovado após a correção local.
- `npm run test`: 614 testes passaram após a correção.
- `npm run build:web`: aprovado, 87 rotas estáticas, sem deploy.
- `npm run test:postgres`: aprovado; runner repetível e job adicionado ao CI.
- `npm run audit:security`: aprovado com as duas exceções vigentes; 14 moderadas,
  21 altas, zero críticas. Não foram eliminadas as vulnerabilidades.
- `node --check scripts/verify-postgres.mjs` e `git diff --check`: aprovados.
- Novo job remoto do CI: não executado, sem commit/push nesta rodada.

O primeiro fixture novo foi recusado por `line_players_count=0`; o dado sintético
foi corrigido para 6, preservando a constraint. Não é bug da aplicação.

A primeira exportação da prévia reaproveitou cache do modo real. A prévia foi
reconstruída com `--clear`, `EXPO_PUBLIC_DATA_SOURCE=mock` e `EXPO_NO_DOTENV=1`
somente no processo de build; arquivos `.env` não foram alterados. O navegador
confirmou botões de demo antes de qualquer teste com dados fictícios. Evidência
local: `acesso-restrito-corrigido-mobile.png` e `criar-partida-admin-depois.png`.

## Repetir a checagem SQL

```powershell
npm run test:postgres
```

Requer Docker. O runner não usa credenciais ou dados reais e encerra apenas o
contêiner que criou. Não executar os fixtures em produção.

## Aceitação comercial

Não marcar todos os itens 1–4 como concluídos: ainda faltam recuperação real,
falhas de contexto/rede, aparelhos físicos, piloto de pessoas e decisões de
preço/operação. A proposta do item 4 é revisável, mas checkout não foi ativado.
