# Validação de estatísticas e caso Fares

Este documento registra apenas conclusões verificáveis sem consultar ou alterar os dados reais.

## Comprovado pelo código

- A regra atual de jogo disputado exige partida encerrada, `MatchStat.played === true` e presença `confirmed`.
- O fluxo antigo podia deixar presença e súmula divergentes.
- Antes do campo `played` ser respeitado na edição, confirmação podia ser tratada como participação.
- A edição administrativa pós-jogo podia alterar a presença sem sincronizar a súmula.
- O detalhamento soma partidas elegíveis e apresenta `manualStats` separadamente como ajuste manual ou histórico importado.

## Ainda pendente nos dados

- A partida exata relacionada ao Fares.
- A quantidade real de partidas divergentes.
- A origem exata do jogo que eventualmente deve ser removido.
- A comparação do resultado calculado com o ajuste esperado de `-1`.

Nenhuma partida ou causa individual deve ser declarada como confirmada antes do dry-run. Nomes servem somente para localizar jogadores; comparações e qualquer futura escrita devem usar IDs.

## Próxima validação permitida

Executar somente o dry-run, após preencher o ID correto do time:

```powershell
npm run audit:player-stats -- `
  --team "ID_DO_TIME" `
  --names "Frank,Abner,Callejas,Rômulo,Leleno,Luis,Eder,Vilella,Tafnes,Fares"
```

Não usar `--apply` nesta etapa.
