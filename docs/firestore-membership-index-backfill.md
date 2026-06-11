# Firestore Membership Index Backfill

## Por que este backfill existe

As regras privadas novas do AppBoca passam a validar acesso com base em:

`teamMembershipIndex/{teamId}/members/{uid}`

Antes disso, a base já possuía `teamMembers`, mas não necessariamente o índice previsível exigido pelas rules endurecidas. Este backfill popula o índice de forma explícita, manual e idempotente antes da publicação das novas rules.

## Quando rodar

Rode este backfill:

1. Antes de publicar as novas `firestore.rules` em produção.
2. Sempre que existir dúvida sobre dados legados em `teamMembers`.
3. Depois de restaurar dados antigos ou importar base histórica que não tenha o índice preenchido.

Não rode este fluxo dentro do bootstrap, da leitura pública ou do carregamento normal do app.

## Credenciais necessárias

O script usa `firebase-admin`, então precisa de credencial administrativa válida.

Ordem de resolução:

1. `--credentials /caminho/service-account.json`
2. `FIREBASE_SERVICE_ACCOUNT_PATH`
3. `GOOGLE_APPLICATION_CREDENTIALS`
4. Application Default Credentials

O `projectId` pode vir de:

1. `--project-id`
2. `FIREBASE_PROJECT_ID`
3. `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
4. `GCLOUD_PROJECT`
5. `project_id` da service account

## Como rodar em dry-run

Windows PowerShell:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\caminho\service-account.json"
npm run backfill:membership-index:dry
```

Ou informando direto:

```powershell
npm run backfill:membership-index:dry -- --credentials "C:\caminho\service-account.json" --project-id "bocaiuva-app"
```

O dry-run:

- lê `teamMembers`;
- valida memberships ativas com `teamId` e `userId`;
- resolve duplicidades por `teamId + userId`;
- mostra o que seria criado ou atualizado;
- não grava nada no Firestore.

## Como rodar de verdade

Depois de revisar o dry-run:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\caminho\service-account.json"
npm run backfill:membership-index
```

Ou:

```powershell
npm run backfill:membership-index -- --credentials "C:\caminho\service-account.json" --project-id "bocaiuva-app"
```

O script usa `set(..., { merge: true })`, então pode ser executado mais de uma vez com segurança.

## O que o script grava

Para cada membership válida, o script cria ou atualiza:

`teamMembershipIndex/{teamId}/members/{userId}`

Campos principais:

- `teamId`
- `userId`
- `role`
- `roles`
- `status`
- `canManageTeam`
- `canManagePlayers`
- `playerId`
- `membershipId`
- `sourceTeamMemberId`
- `joinedAt`
- `createdAt`
- `updatedAt`

## Como validar depois

Validações recomendadas:

1. Conferir se um usuário real com membership ativa possui o documento em `teamMembershipIndex/{teamId}/members/{uid}`.
2. Conferir se memberships inativas não geraram índice ativo.
3. Rodar novamente o dry-run e verificar que `created/updated` caiu para `0` ou próximo disso.
4. Testar bootstrap de um admin e de um jogador em ambiente de staging.

## Quando publicar as rules

Publique as novas `firestore.rules` somente depois de:

1. `typecheck` ok;
2. testes ok;
3. dry-run revisado;
4. backfill real concluído;
5. validação pós-backfill concluída.

## Risco de publicar antes do backfill

Se as rules forem publicadas antes do índice existir:

- membros ativos podem perder leitura privada do próprio time;
- bootstrap pode cair em recuperação de acesso;
- jogadores podem ficar sem acesso a partidas, presença, notificações, ratings e estatísticas privadas;
- o problema não será visual, mas sim de autorização no Firestore.

## Ordem exata antes do deploy das rules

1. Garantir a service account administrativa.
2. Rodar `npm install` se necessário.
3. Rodar `npm run typecheck`.
4. Rodar `npm run test`.
5. Rodar `npm run backfill:membership-index:dry`.
6. Revisar o resumo e os itens que seriam escritos.
7. Rodar `npm run backfill:membership-index`.
8. Rodar novamente `npm run backfill:membership-index:dry`.
9. Validar documentos do índice no Firestore.
10. Publicar as novas `firestore.rules`.
