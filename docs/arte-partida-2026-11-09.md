# Arte de partida

## Comportamento

No detalhe da partida, **Arte da partida** abre a prévia e **Baixar PNG** salva uma imagem 1080 × 1350 para postagem manual. Nenhuma publicação ou escrita no banco acontece.

A arte usa nome e escudo do time, nome e escudo cadastrado do adversário, data, horário e local da partida. A situação é respeitada: agendado, confirmado, finalizado ou cancelado. Escudos ausentes, indisponíveis ou sem CORS usam as iniciais com aviso visível na prévia. Corrija o escudo no cadastro e reabra a arte.

O desenho usa Canvas no navegador; não depende da resolução da tela, de captura de DOM ou de novos pacotes. Imagens remotas têm limite de espera de dez segundos.

## Critérios e validação

- Dados do jogo atual e escudo manual com fallback para escudo do time adversário: teste focado passou.
- Situação correta sem anunciar jogo agendado como confirmado: teste focado passou.
- PNG 1080 × 1350 e fallback de iniciais: teste focado passou.
- Layout azul/amarelo com nomes quebrados, data, hora e local legíveis: prévia sintética renderizada e inspecionada no Edge.
- Abrir/fechar/reabrir modal, download no app autenticado e carregamento dos escudos reais: ainda requer teste integrado no app. Nenhuma leitura ou escrita de dados de produção foi necessária nesta implementação.
- Typecheck inicial executado durante transição de dependências: falhou em módulos Expo de outros arquivos. Repetir após instalação estável, junto com a suíte e build web finais.

Os casos da arte integram o runner e o CI. Execute:

```sh
npm run test
```

Arquivos: `src/lib/match-poster.ts`, `src/components/matches/MatchPoster.tsx`, `src/app/(app)/matches/[matchId].tsx`, `tests/match-poster.test.ts`.
