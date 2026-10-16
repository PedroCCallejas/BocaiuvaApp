# Operação, isolamento e recuperação — 16/10/2026

## AS-IS observado em consultas somente de leitura

- Supabase `BocaApp`, região `sa-east-1`, estado `ACTIVE_HEALTHY`, PostgreSQL 17.
- Organização no plano **Free**, confirmado pelo conector; não foi alterado o plano.
- As 20 tabelas públicas consultadas têm RLS ativada.
- `player-photos` e `player-videos` são privados. Materiais institucionais do time
  permanecem públicos conforme a arquitetura.
- As duas views públicas têm `security_invoker=true` e `security_barrier=true`.
- O papel `anon` não tem SELECT em `teams.invite_code` e `teams.admin_user_id`.
- As 27 versões de migration locais correspondem às versões listadas no remoto.
  Isso não constitui comparação integral de schema nem detecta toda edição manual.
- Nenhuma tabela de negócio ou arquivo pessoal foi exportado pela inspeção.

## Advisors: triagem, não correção automática

Security Advisor retornou três avisos sobre execução autenticada de funções
`SECURITY DEFINER`: criação de time, entrada por convite e apuração de MVP.
As permissões consultadas negam execução a `anon` e possuem `search_path` fixo.
As migrations contêm autenticação, associação ao time e/ou limites explícitos;
o novo teste local nega apuração de MVP de outro time. Esses avisos não são,
isoladamente, prova de vulnerabilidade ou justificativa para trocar o modo da função.

Referência: [linter 0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Performance Advisor: 20 referências de FKs sem índice de cobertura, 29 índices
sem uso na janela observada e 12 casos de policies permissivas múltiplas. Medir
planos de execução e volume antes de criar/remover índices ou alterar acesso.
Não interpretar índice sem uso como índice inútil em um projeto pequeno.

Referências: [FKs](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys),
[policies múltiplas](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies).

## Ensaio executado

```powershell
npm run test:postgres
```

O runner `scripts/verify-postgres.mjs` usa imagem PostgreSQL 17 já disponível
localmente. O contêiner tem rede desativada, nenhuma porta publicada, mounts de
leitura, filesystem de imagem somente leitura, tmpfs, 1 CPU, 1 GB RAM e 128 PIDs.
Não usa `.env`, tokens, credenciais ou dados reais. Remove somente o contêiner
que ele próprio criou, ao final.

Resultado local: 27 migrations, cinco arquivos SQL aprovados, backup custom
com `pg_dump`, restauração em segunda base e fingerprint idêntico dos registros
públicos sintéticos, RLS e policies. Os cinco testes passaram novamente na base
restaurada. Há casos de admin A versus B, jogador sem gestão, conta sem vínculo
e visitante, além de convite idempotente e reentrada.

O job `validar_postgres` foi adicionado ao workflow, **ainda sem execução remota
nesta rodada**. Não houve commit/push/deploy.

## O que isso não prova

- Não é um backup da produção nem restauração de um backup de produção.
- O bootstrap mínimo em `tests/postgres/` fornece apenas os objetos necessários
  às migrations. Não executa os serviços completos Firebase/Supabase Auth,
  Storage, PostgREST, entrega de push ou Realtime.
- O fingerprint cobre dados sintéticos públicos, RLS e policies; os testes
  adicionais verificam parte do schema. Não certifica igualdade de todo objeto,
  segredo, grant, provider de identidade ou arquivo de mídia.
- As consultas remotas de metadata não exercitaram ataques nem trocaram a
  identidade/claims de usuários de produção.

## Gap bloqueante antes de cobrar: recuperação da produção

No plano Free, não presumir um backup gerenciado diário recuperável. A
[documentação oficial](https://supabase.com/docs/guides/platform/backups) recomenda
exportações regulares e cópias externas para projetos Free. Backups do banco
**não incluem os objetos do Storage**. O login deste app é Firebase e precisa
de planejamento próprio de identidade/configuração.

Nenhuma execução agendada, cópia externa criptografada, retenção ou restauração
real foi comprovada nesta rodada. Não registrar o item como resolvido.

### Procedimento a aprovar e executar em tarefa própria

1. Definir objetivo de recuperação: proposta inicial RPO de 24 h e RTO de 4 h,
   a confirmar conforme partidas e suporte. São metas, não resultados medidos.
2. Escolher destino externo controlado pelo proprietário, criptografia e
   retenção proposta de 7 diárias/4 semanais. Confirmar custo antes de contratar.
3. Preparar exportação do Postgres com credencial de backup apropriada, fora
   do cliente. Nenhuma credencial precisa ser enviada pelo chat.
4. Cobrir separadamente objetos Storage, configuração/identidades Firebase,
   Edge Functions e secrets em armazenamento apropriado.
5. Restaurar uma cópia em ambiente isolado autorizado, sem substituir produção.
6. Conferir contagens/integridade, papéis, isolamento, mídias e login e medir RTO.
7. Só então automatizar, alertar falhas e repetir o exercício periodicamente.

Não foram criadas assinaturas, credenciais, serviços pagos ou restauração remota.

## Dependências e documentação

`npm run audit:security` passou com as exceções já aprovadas: 14 moderadas,
21 altas e zero críticas; nenhuma exceção nova. A validade continua até
12/11/2026 e não elimina as vulnerabilidades.

A constituição descreve Firestore no bootstrap, mas o código/README/CLAUDE
descrevem Supabase como fonte única do produto. Divergência relatada novamente;
não foi feita emenda silenciosa. Outra divergência: o comentário de ordem das
camadas diz `elenco` por último, enquanto `notificacoes` aparece depois na lista
atual; não se concluiu defeito funcional por essa diferença.

O diagnóstico de erro de cliente em produção ainda precisa de evidência de
captura/alerta com dados minimizados; mensagens somente em `__DEV__` não
substituem monitoramento. Nenhum serviço de telemetria foi instalado.
