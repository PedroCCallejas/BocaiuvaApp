# Skill: deploy-vercel

**Ativação:** `/deploy-vercel`

## Objetivo

Preparar e revisar tudo antes de um deploy no Vercel. Não faz deploy automaticamente.

## Contexto do projeto

- Build: `npm run build:web` → `npx expo export --platform web` → pasta `dist/`
- Vercel configurado em `vercel.json`:
  - `buildCommand`: `npx expo export -p web`
  - `outputDirectory`: `dist`
  - `cleanUrls`: true
  - `trailingSlash`: false
  - Rewrite SPA: `/(.*) → /index.html`
- Variáveis de ambiente necessárias no Vercel: `EXPO_PUBLIC_*`

## O que verificar antes do deploy

### Build local
- Rodar `npm run build:web` e verificar erros
- Verificar se pasta `dist/` foi gerada corretamente
- Verificar se `dist/index.html` existe

### TypeScript
- Rodar `npm run typecheck` — zero erros antes de qualquer deploy

### Rotas
- Rotas dinâmicas `[param]` funcionando como SPA (rewrite configurado)
- Rotas públicas indexáveis coerentes com `public/sitemap.xml` e `public/robots.txt`

### Imports e módulos nativos
- Módulos com `.native.tsx` têm versão web `.tsx` correspondente
- Imports que usam APIs nativas não quebram no web

### Variáveis de ambiente
- Variáveis `EXPO_PUBLIC_*` configuradas no projeto Vercel
- `EXPO_PUBLIC_ADS_ENABLED` e `EXPO_PUBLIC_ADS_WEB_ENABLED` com valores corretos para produção
- IDs de slot do AdSense configurados no Vercel (não hardcoded no source)

### `vercel.json`
- `outputDirectory` aponta para `dist`
- Rewrites cobrem todas as rotas da SPA
- `cleanUrls` e `trailingSlash` consistentes com as rotas do Expo Router

### Riscos de deploy
- Migration e Edge Function não sobem com o build da Vercel: são publicadas à parte (README)
- Assets grandes em `dist/` (vídeos, imagens pesadas)
- Console.log com dados sensíveis em produção

## O que NUNCA fazer

- Não fazer deploy sem pedido explícito do usuário
- Não mexer em variáveis de ambiente de produção sem pedido explícito
- Não alterar `vercel.json` sem entender impacto nas rotas
- Não commitar pasta `dist/` no Git (deve estar no `.gitignore`)

## Comandos para rodar (apenas com autorização)

```bash
npm run typecheck         # validar tipos
npm run build:web         # gerar dist/ local
# Deploy: feito via Vercel dashboard ou CLI — não rodar aqui
```

## Formato de resposta

```
## Revisão pré-deploy Vercel

### Checklist
- [ ] npm run typecheck — sem erros
- [ ] npm run build:web — pasta dist/ gerada
- [ ] Variáveis de ambiente configuradas no Vercel
- [ ] vercel.json consistente
- [ ] Nenhum arquivo sensível em dist/

### Riscos identificados
- ...

### Correções necessárias antes do deploy
- ...

### Veredicto
✅ Pronto para deploy  |  ⚠️ Revisar antes  |  ❌ Não fazer deploy agora
```
