# Skill: correcao-minima

**Ativação:** `/correcao-minima`

## Objetivo

Aplicar a menor correção segura possível para o problema reportado. Não vai além do mínimo necessário.

## Regras rígidas

- Não refatorar código adjacente
- Não alterar regras de negócio
- Não mexer em `firestore.rules`
- Não mexer em `.env`, `google-services.json` ou qualquer credencial
- Não atualizar dependências (Expo SDK, Firebase, Supabase, etc.)
- Não alterar o fluxo principal de autenticação
- Não alterar mais de 3 arquivos sem avisar o usuário primeiro
- Não adicionar abstrações novas sem necessidade clara

## Processo

1. **Entender** — Ler o problema relatado. Se ambíguo, perguntar antes de agir.
2. **Localizar** — Identificar o(s) arquivo(s) responsável(is).
3. **Propor** — Explicar a correção antes de aplicar (a menos que o usuário já tenha pedido implementação direta).
4. **Aplicar** — Fazer apenas a mudança necessária.
5. **Validar** — Rodar `npm run typecheck`. Se o problema for de lógica, rodar `npm run test`.

## Validação pós-correção

```bash
npm run typecheck   # sempre
npm run test        # quando a lógica foi alterada
```

> Não rodar `npm run build:web` ou `expo start` sem pedido.

## Formato de resposta

```
## Correção mínima aplicada

### Causa encontrada
...

### Correção aplicada
...

### Arquivos alterados
- src/...

### Validação realizada
- Comando: npm run typecheck
- Resultado: ...

### Riscos
...

### Próximo passo
...
```
