# Skill: revisao-expo

**Ativação:** `/revisao-expo`

## Objetivo

Revisar riscos em Expo, Expo Router e build web neste projeto. Não altera arquivos.

## Contexto do projeto

- App: **Professô FC** (slug: `appboca`)
- **Web-only hoje:** `app.config.ts` declara `web.output: 'static'` e
  `plugins: ['expo-router']`. Não há `/ios`, `/android`, `eas.json` nem build EAS.
- Expo Router com rotas em `src/app/`
- Deploy web via `npm run build:web` → Vercel
- Tipagem de rotas: `experiments.typedRoutes: true`
- React Compiler: `experiments.reactCompiler: true`
- Anúncios: **AdSense web** (`src/config/ads.ts`), não AdMob
- Avisos: **Web Push** (`public/sw.js` + Edge Function `enviar-push`), não
  `expo-notifications`

Se alguma revisão exigir o mundo nativo (EAS, plugins nativos, permissões de
sistema), diga que ele não existe neste repositório em vez de supor que existe.

## O que verificar

### Expo SDK e dependências
- Versão do Expo SDK compatível com as dependências instaladas
- Mudança em `app.config.ts` que altere a saída do build web

### Expo Router
- Rotas em `src/app/` sem `_layout.tsx` correspondente
- Links internos com paths incorretos
- Rotas dinâmicas `[param]` com tipagem correta
- Grupos `(auth)` e `(app)` separados corretamente

### Assets
- Imagens referenciadas em `app.config.ts` existindo em `assets/`
- `favicon.png` e ícones de `public/icons/` presentes

### Build web
- Componentes com `.native.tsx` têm par `.tsx` para web
  (ex.: `src/components/tools/ToolSeoHead.native.tsx`)
- Imports de módulos nativos condicionais ou substituídos para web
- Variáveis `EXPO_PUBLIC_*` necessárias documentadas em `.env.example`

### Web Push
- Serviço em `src/services/notifications/`
- Service worker em `public/sw.js`
- Assinatura registrada em `push_subscriptions`; chave pública em
  `EXPO_PUBLIC_VAPID_PUBLIC_KEY` (a privada fica só nos secrets do Supabase)

### AdSense
- `EXPO_PUBLIC_ADS_ENABLED` e `EXPO_PUBLIC_ADS_WEB_ENABLED` coerentes
- Slots vindo de variável de ambiente, não hardcoded

## O que NUNCA fazer

- Não rodar `expo start` sem autorização explícita
- Não atualizar Expo SDK sem pedido explícito
- Não alterar `app.config.ts` sem entender o impacto no build web
- Não propor reintroduzir dependência nativa sem pedido explícito

## Formato de resposta

```
## Revisão Expo / build web

### Riscos críticos (bloqueiam build)
- ...

### Riscos médios
- ...

### Avisos (baixo impacto)
- ...

### Correções mínimas sugeridas
- ...

### Próximo passo
- ...
```
