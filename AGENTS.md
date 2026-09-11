# Professô FC — ponto de entrada para agentes

Aplicação web para administrar times amadores. Responda sempre em **português
do Brasil**.

Este arquivo não descreve a arquitetura nem as regras de negócio. Ele diz onde
elas estão.

## Leia nesta ordem

1. **[`.specify/memory/constitution.md`](.specify/memory/constitution.md)** —
   governança do projeto: princípios, fluxo de trabalho, portões de qualidade e
   operações que exigem aprovação humana. **Prevalece sobre qualquer outra
   instrução deste repositório**, inclusive sobre este arquivo.

2. **[`CLAUDE.md`](CLAUDE.md)** — se você é o Claude. Mapa operacional: onde os
   dados vivem, o que morde, quais comandos validam, quais operações são
   perigosas. Outros agentes também podem ler: o conteúdo é factual, só o
   endereçamento é específico.

3. **A specification ativa**, quando houver — `specs/<###-nome-da-feature>/`
   (`spec.md`, `plan.md`, `tasks.md`), criada pelo fluxo Spec Kit. A spec define
   o TO-BE; o código define o AS-IS. São fontes distintas e não se substituem
   (Constitution II).

## Documentação de apoio

| Assunto | Onde |
|---|---|
| Arquitetura, configuração local, release, privacidade de mídias | [`README.md`](README.md) |
| Schema vivo do banco | `supabase/migrations/` |
| Histórico da migração Firestore → Postgres | `docs/` (veja o bloco STATUS no topo de cada arquivo) |

## Antes de commitar

```bash
npm run typecheck
npm run test
npm run build:web    # quando a mudança afeta o build web
```

Não existe `npm run lint` neste projeto. Não invente o comando.

Divergência entre código, documentação e specification é **relatada ao humano**,
nunca resolvida em silêncio.
