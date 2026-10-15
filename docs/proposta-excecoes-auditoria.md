# Proposta de exceções temporárias — aprovação recebida em 13/10/2026

A atualização compatível das dependências eliminou os alertas críticos e
corrigiu gRPC, mantendo Expo, Firebase e React Native nas versões existentes.
O relatório atual ainda tem 21 entradas altas, que se propagam de duas origens:

| Pacote | Versão | Advisory sem correção publicada | Validade proposta |
| --- | --- | --- | --- |
| braces | 3.0.3 | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | Até 12/11/2026 |
| node-forge | 1.4.0 | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | Até 12/11/2026 |

Os riscos permanecem: `braces` pode sofrer exaustão de pilha ao processar padrões
profundamente aninhados; `node-forge` tem falha de verificação de assinatura RSA.
São dependências das ferramentas de build/assinatura, e não APIs adicionadas ao
produto por esta tarefa. Não se presume risco zero nem ausência de exploração
apenas por serem transitivas.

Proposta concreta: usar `scripts/security-audit.mjs` no gate do CI com apenas
essas duas exceções. O script continua executando npm audit, imprime as
contagens originais e falha para qualquer advisory, versão, local instalado ou
validade que não corresponda exatamente. Expiração é bloqueante. Falha de rede
ou relatório inválido também bloqueia.

`security/audit-exceptions.json` está com `approved: true` para as duas entradas.
O usuário aprovou explicitamente estas duas exceções em 13/10/2026.
O workflow usa o gate revisado, preservando a execução e o relatório npm audit.
Alternativa: manter o CI bloqueado até os mantenedores publicarem correções.
