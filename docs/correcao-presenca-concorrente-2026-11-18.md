# Correcao da confirmacao de presenca - 2026-11-18

Status: corrigida e testada localmente; nao publicada.

## AS-IS e causa reproduzida

A captura enviada mostra `Nao foi possivel atualizar a presenca` seguido de
`O contexto mudou durante o carregamento. Tente novamente.`
`comPartidas.updateAttendance` grava e recarrega sua fatia. O realtime tambem
pode recarregar as fatias. Duas leituras simultaneas da mesma fatia incrementavam
`leituraMaisRecente`, rejeitando a primeira como se houvesse troca de contexto.
Isso podia informar falha ao usuario apos a escrita ja ter sido efetuada.
A captura isolada nao confirma se a presenca especifica foi salva.

## TO-BE e criterios de aceitacao

- Releituras concorrentes do mesmo contexto terminam sem falso erro de contexto.
- Uma recarga apos escrita faz leitura nova, nao reaproveita a resposta anterior.
- Uma carga inicial concorrente permanece valida.
- Troca real de conta/time ou logout continua invalidando leituras e cache.
- Nao alterar RLS, schema, dados ou permissoes de producao.

## Correcao

`fatias.ts`: serializar recargas por fatia, aguardando a leitura anterior antes
de iniciar uma nova. Cada operacao mantem a geracao do contexto e verifica-a
antes/depois da leitura. Invalidacao libera a fila para o novo contexto, sem
permitir que respostas antigas escrevam no cache ou emitam dados.
Falhas de rede continuam preservando o ultimo cache valido como antes.

## Verificacao

Tres regressoes adicionadas em `tests/supabase-financeiro-cases.ts`.
Antes da correcao: 3 falhas / 651, incluindo a mensagem exata da captura.
Depois: typecheck passou e 651 testes passaram.
Build web: passou; exportacao e hidratacao de 89 paginas concluidas.
Sem teste de escrita em partida real e sem deploy nesta tarefa.
Alteracoes preexistentes em docs de backup/monetizacao preservadas.

