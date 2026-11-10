# Backup real e recuperação — 16/10/2026

Status: **cópia real dos registros do produto criada e restaurada localmente**. Ainda não constitui recuperação completa da plataforma ou cópia externa independente do computador.

## Resultado comprovado

- Snapshot do BocaApp em 16/10/2026 às 05:48:29 UTC (01:48:29 em Cuiabá).
- **20 tabelas públicas, 4.041 registros reais**, restaurados sobre as **27 migrations** versionadas.
- Fingerprint de todos os registros restaurados igual ao capturado dentro do banco.
- Relações de chave estrangeira conferidas; **20 tabelas com RLS**; policies de `public`/`storage` iguais às capturadas.
- **Cinco testes SQL** novamente aprovados sobre o banco restaurado. Isso cobre os casos existentes, não toda operação possível.
- PostgreSQL 17 descartável, sem rede/portas, dados no tmpfs, recursos limitados; contêiner removido após verificar.
- Ensaio de 19 segundos; não é promessa de RTO da plataforma.
- SHA-256 do ciphertext: `391d7bc984d9967bb3cc5b518b21ade95c057edfd53f0252677bb6522a1c5967`.

## Arquivos e proteção

Pasta local: `C:/Projetos/AppBoca/.expo/backups-reais/2026-10-16-03/`.

| Arquivo | Conteúdo |
|---|---|
| `snapshot.pgp` | Snapshot real criptografado, 158.072 bytes |
| `private-key.dpapi` | Chave privada protegida pelo perfil Windows atual |
| `public-key.asc` | Chave pública usada pelo banco para criptografar a resposta |
| `verification.json` | Resultado e limites, sem registros privados |
| `tables.json` / `snapshot-query.sql` | Inventário e consulta de leitura, sem os registros |
| `snapshot.b64` | Mesmo ciphertext em base64; não é cópia independente |

ACL restrita ao usuário Windows executor; pasta ignorada pelo Git. Não houve envio de dados reais ao GitHub, PR, Vercel ou Obsidian. Keyrings e chave privada temporária foram removidos; credenciais existentes não foram alteradas.

O proprietário não tinha senha do banco. A revisão automática inicialmente bloqueou a exportação; houve então **autorização humana específica** para os registros, trânsito pelo conector e destino local. A conexão administrativa existente executou somente leitura. OpenPGP/RSA com subchave de criptografia e AES-256 foram aplicados **dentro do banco**, retornando apenas ciphertext pelo conector. A abertura ocorreu no computador, sem imprimir registros ou gravar JSON/SQL de dados em claro no disco.

## Escopo

O arquivo contém todas as tabelas `public`, tabelas auxiliares inventariadas de `storage`/`supabase_migrations`, definições de funções `public`/`app`, colunas, constraints, índices e policies capturadas na mesma consulta. O ensaio reconstruiu o schema com migrations **locais revisadas**, sem executar definições do arquivo como código arbitrário.

**Não é pg_dump integral.** Comprova os registros e policies declarados, não todos os grants, roles, extensões e configurações gerenciadas. pgcrypto já existia. Nenhuma extensão, função, tabela, policy ou dado remoto foi alterado para exportar.

## Pendências para recuperação completa

1. **Arquivos Storage:** fotos, banners, escudos e vídeos não estão nos metadados. Copiar os objetos dos buckets com manifesto/hash e testar abertura após recuperar, sem abrir buckets privados.
2. **Identidade/configuração:** planejar recuperação do Firebase Auth, providers, domínios, Edge Functions e secrets em cofre apropriado, fora do Git/Obsidian.
3. **Chave portátil e cópia externa:** DPAPI depende deste perfil Windows. Copiar os dois arquivos para outro PC não basta se o perfil for perdido. Definir recuperação criptográfica portátil e destino privado externo aprovado.
4. **Recorrência/retenção:** definir RPO, RTO, responsável e retenção. As propostas anteriores de 24h/4h e 7 diárias/4 semanais não são compromissos implementados. Não foi criada automação.
5. **Ensaio da plataforma:** recuperar banco, arquivos e identidade em ambiente equivalente isolado e validar login/mídia/fluxos. Nunca usar produção como destino de ensaio.

Esta cópia melhora concretamente o ensaio sintético anterior; as pendências não estão resolvidas.

## Repetir a verificação

No mesmo perfil Windows, com Docker e GnuPG do Git for Windows, na raiz do projeto:

```powershell
./scripts/verify-real-backup.ps1 -Directory 'C:\Projetos\AppBoca\.expo\backups-reais\2026-10-16-03'
```

Só aceita diretório sob `.expo/backups-reais`. Abre a chave temporariamente, descriptografa em memória, restaura em contêiner sem rede, compara os dados e limpa o contêiner/keyring criado. Não conecta à produção. Erros não imprimem registros recusados.

Para nova cópia: usar pasta nova com `prepare-real-backup.ps1`, conferir inventário atual, preparar a consulta com `build-backup-query.mjs` e executar a exportação com autorização adequada. Não substituir a cópia anterior antes de verificar a nova. É procedimento assistido, não serviço automático.

Referência: [Supabase: backups e limite dos objetos Storage](https://supabase.com/docs/guides/platform/backups).
