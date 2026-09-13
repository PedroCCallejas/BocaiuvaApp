# Skill: revisao-antes-commit

**Ativação:** `/revisao-antes-commit`

## Objetivo

Revisar o diff atual do Git antes de fazer commit. Não altera arquivos.

## Processo

1. Ler `git status` para listar arquivos modificados/staged.
2. Ler `git diff` (staged + unstaged) para ver as mudanças.
3. Analisar cada arquivo alterado.
4. Produzir relatório.

## O que verificar

### Segurança
- Arquivos sensíveis sendo commitados: `.env`, `secrets/`, `dados-firestore/`, `google-services.json`, `firestore.rules`, chaves ou tokens hardcoded
- Secrets expostos no código
- `console.log` com dados sensíveis

### Qualidade do código
- Bugs óbvios introduzidos
- Tipos quebrados ou `any` desnecessário
- Imports que não existem
- Lógica inconsistente

### Escopo
- Mudanças fora do escopo da tarefa (arquivos não relacionados)
- Refatorações não solicitadas misturadas com o fix
- Arquivos de build (`dist/`, `.expo/`) sendo incluídos acidentalmente

### Regressão
- Funções alteradas que são usadas em muitos lugares
- Mudanças em hooks ou contextos globais
- Alterações em tipos compartilhados (`src/types/domain.ts`; `src/types/firestore.ts` é legado)

### Git
- Mensagem de commit sugerida (convencional: `fix:`, `feat:`, `chore:`, etc.)

## O que NÃO fazer

- Não alterar arquivos
- Não fazer commit
- Não rodar comandos destrutivos

## Formato de resposta

```
## Revisão pré-commit

### Resumo do que mudou
...

### Possíveis bugs
- ...

### Riscos de regressão
- ...

### Arquivos sensíveis detectados
- [ nenhum / listar ]

### Mudanças fora do escopo
- [ nenhuma / listar ]

### Mensagem de commit sugerida
feat(match): descrição do que foi feito

### Veredicto
✅ Seguro para commit  |  ⚠️ Revisar antes  |  ❌ Não commitar ainda
```
