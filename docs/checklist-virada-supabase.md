# Checklist de virada Firestore → Supabase

Data de preparação: 21/08/2026.

Este roteiro não autoriza deploy. Ele define a ordem segura e os critérios de
parada para a virada.

## 1. Antes da janela

- Confirmar no Supabase Dashboard que Firebase Third-Party Auth aponta para o
  projeto Firebase correto.
- Conferir que a URL e a publishable/anon key usadas pelo app são do projeto
  `BocaApp`. Não alterar `.env` sem revisar o destino.
- Aplicar, em ordem, as migrations locais ainda ausentes no remoto:
  - `20260819170000_0012_permissoes_do_papel_authenticated.sql`
  - `20260821071359_seguranca_pre_migracao.sql`
- Rodar Security e Performance Advisors depois das migrations.
- Rodar `npm run auth:claim:dry`. O resultado aceitável é
  `precisavam: 0`.
- Rodar `npm run migrar:preflight`. O resultado aceitável é
  `descartadasInesperadas: 0` em todas as tabelas.

## 2. O que o preflight atual considera legado

As avaliações, votos e outros documentos descartados no dump atual apontam
para `team_id` que já não existe na coleção `teams`. Esses documentos não fazem
parte dos dois times migráveis.

O importador agora aborta se encontrar referência quebrada de um time que ainda
existe. Assim, jogador, partida, presença ou avaliação ativa não desaparece em
silêncio.

## 3. Janela de importação

1. Reduzir ao mínimo as novas escritas no app durante a janela.
2. Gerar um dump fresco uma única vez:

   ```bash
   npm run migrar:baixar
   ```

3. Repetir o preflight usando o dump salvo:

   ```bash
   npm run migrar:preflight
   ```

4. Com `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` definidos somente no
   ambiente do terminal, importar do dump:

   ```bash
   npm run migrar:postgres -- --ler-de=dados-firestore
   ```

O importador faz `upsert` idempotente e, após cada lote, relê os IDs gravados.
ID ausente interrompe o processo com erro.

## 4. Smoke tests obrigatórios

Testar com contas diferentes:

- público sem login: galeria e perfil público, sem código de convite;
- jogador: abrir time, confirmar presença, votar e avaliar;
- admin: criar/editar partida, presença de terceiros, elenco e mídia;
- usuário de outro time: não pode ler nem alterar dados privados;
- código inválido: não cria membership;
- upload sem login: deve ser recusado;
- upload do próprio jogador/admin: deve funcionar no caminho autorizado.

## 5. Critério de corte

Não mudar todas as leituras de uma vez. A migration do banco não significa que
o app já possui um repositório Supabase completo.

Ativar por módulo, com rollback independente:

1. financeiro;
2. estatísticas e rankings;
3. partidas e presença;
4. elenco e time;
5. notificações/realtime.

## 6. Rollback

- Manter Firestore intacto como fonte de leitura durante a validação.
- Se um smoke test falhar, não apagar dados do Supabase: voltar a leitura do
  módulo para Firestore e corrigir a integração.
- Não desligar listeners, regras ou Auth do Firebase na mesma janela da primeira
  importação.

## 7. Pendência conhecida de novas contas

O cliente força a atualização do JWT na primeira chamada ao Supabase, mas não
pode criar custom claims. Até existir uma Cloud Function/Blocking Function para
atribuir `role: authenticated` no cadastro, `npm run auth:claim:dry` continua
sendo um bloqueio operacional antes de liberar usuários novos no banco.
