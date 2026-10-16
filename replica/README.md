# Professô FC — validação e gaps

Rodada de 16/10/2026, sobre a main `d244583` e alterações locais de teste.

As skills Replica foram adaptadas à avaliação do produto do próprio usuário.
Não há clone nem meta de copiar concorrentes. `original=yes` na matriz significa
requisito do recorte acordado; `clone` representa a evidência do estado atual.
O resultado de `parity.py` mede essa matriz e **não certifica prontidão comercial**.

Comece pelo [resultado e decisão recomendada](resultado.md).

- [Mapa de telas e jornadas](recon.md)
- [Casos executados e cobertura](test-plan.md)
- [Bugs e itens a confirmar](bugs.md)
- [Matriz e cálculo de cobertura](features.csv), [resultado](parity.md)
- [Pesquisa pública e limites da amostra](feedback.md), [trechos](reviews.csv)
- [Plano de melhorias](fixes.md)
- [Piloto com o time atual](piloto-time-atual.md)
- [Proposta de cobrança por time](cobranca-por-time.md)
- [Banco, backup e recuperação](operacao-e-recuperacao.md)

Capturas de produção, dados de sessão e logs detalhados ficam somente em
`.expo/validacao-gaps-2026-10-16/`, ignorada pelo Git. Nenhum dado dos jogadores
ou credencial deve ser adicionado a esta pasta versionada.

Sem mudanças em Auth, RLS, credenciais, dados de produção ou deploy. A única
escrita funcional de produção nesta rodada foi alternar o time ativo existente
e restaurar o Bocaiúva, conforme o teste pedido.
