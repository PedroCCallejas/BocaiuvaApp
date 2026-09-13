# Skill: auditoria-segura

**Ativação:** `/auditoria-segura`

## Objetivo

Analisar o projeto sem alterar nenhum arquivo. Produzir um relatório completo de riscos, problemas e recomendações.

## O que verificar

### TypeScript
- Rodar `npm run typecheck` e interpretar erros
- Identificar tipos `any` desnecessários
- Imports com caminho quebrado

### Estrutura e código
- Arquivos mortos ou não utilizados
- Componentes sem tipos claros
- Variantes `.native.tsx` sem par `.tsx` correspondente (ou vice-versa)
- Hooks com dependências incorretas em `useEffect`

### Supabase (banco do produto)
- Uso do cliente em `src/config/supabase/client.ts`
- Queries sem tratamento de erro
- Leitura de coleção que cresce sem `todasAsLinhas` (o PostgREST corta em 1000
  linhas, sem erro)
- `UPDATE`/`DELETE` sem `.eq()` — o `safeupdate` recusa antes da RLS
- Permissão checada no cliente em vez de na RLS

### Firebase (só Auth)
- Leitura disparada antes de `authStateReady()`
- Código novo lendo ou escrevendo no Firestore legado

### Expo / build web
- Mudança em `app.config.ts` que altere a saída do build web
- Variantes `.native.tsx` sem par `.tsx`
- AdSense: variáveis de ambiente obrigatórias presentes

### Vercel / Web
- `vercel.json` consistente com `app.config.ts` (output: static)
- Imports que funcionam em web mas quebram em native (ou vice-versa)
- Assets referenciados corretamente

### Segurança geral
- Arquivos sensíveis alterados no diff atual (`.env`, `secrets/`, `google-services.json`, `firestore.rules`)
- Secrets expostos em código-fonte
- Riscos de regressão nas últimas alterações

### Git
- Arquivos staged que não deveriam ser commitados
- Mudanças fora do escopo da tarefa atual

## O que NÃO fazer

- Não alterar nenhum arquivo
- Não rodar comandos destrutivos
- Não mexer em configurações sensíveis
- Não rodar `expo start` ou `eas build`

## Formato de resposta

```
## Auditoria — Professô FC

### Nota geral de risco: [CRÍTICO / ALTO / MÉDIO / BAIXO]

---

### Achados Críticos
- ...

### Achados Médios
- ...

### Achados Baixos
- ...

---

### Correção mínima sugerida
- ...

### Próximos passos
1. ...
```
