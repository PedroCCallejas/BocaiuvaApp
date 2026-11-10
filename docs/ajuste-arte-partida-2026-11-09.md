# Ajuste da arte da partida

Status: implementado e validado localmente; migration aplicada no BocaApp em 2026-11-10 após autorização. Publicação do frontend em andamento.

## Comportamento

A prévia permite a quem já pode gerenciar o time ajustar o escudo adversário: arrastar (mouse/toque ou setas do teclado), tamanho de 50% a 250%, centralizar e restaurar. Cancelar ou fechar com alterações solicita descarte em área fixa, fora da rolagem. A imagem compartilhada não inclui a seleção do editor. Rascunhos são guardados apenas na sessão do navegador, isolados por usuário/time/partida, e podem ser retomados após Voltar/Avançar ou recarregar. Descartar ou salvar limpa o rascunho; uma resposta antiga de salvamento não apaga um rascunho mais novo.

A base limpa `public/artes/bocaiuva-template-clean.png` mantém a composição Bocaiúva 941×1672 e substitui os remendos dos textos por áreas limpas. Foi preparada a partir da arte aprovada, com pequenas variações de textura. A imagem original continua no repositório. O fallback de outros clubes foi preservado.

A remoção opcional de fundo é local e conservadora: remove apenas pixels quase brancos ligados às bordas, preservando regiões internas isoladas. Não é segmentação por IA, não garante remoção perfeita, pode apagar detalhes brancos ligados à borda e exige conferência na prévia. Desmarcar restaura o original. Nenhuma imagem é enviada a serviço externo ou regravada por esse ajuste.

## Dados e permissão

`Match.posterSettings` guarda versão, URL da imagem-fonte, deslocamentos, escala e opção de fundo. Ao trocar a imagem, configurações da fonte anterior deixam de ser usadas. Dados e status da partida continuam sendo obtidos do cadastro, incluindo virada de dia em America/Cuiaba.

`saveMatchPosterSettings` escreve somente `poster_settings` e `updated_at`, sem notificar o time nem atualizar data, hora, local, placar, escalação ou escudo global. A autoridade continua a RLS existente `app.can_manage_team`; não há novos grants ou policies. Firebase permanece legado.

## Publicação

Migration `20261110050419_ajustes_arte_partida.sql` aplicada e registrada no BocaApp (`xepbopkhsprfemqjzrkm`) antes do frontend novo. A migration é aditiva: coluna JSONB nullable com validação dos parâmetros. Coluna e check validado foram confirmados após a aplicação; ACL, RLS e policies permaneceram idênticos. Nenhuma linha de partida foi escrita. Em falha de gravação, a interface mantém a prévia e informa o erro, sem simular sucesso.

Não incluir a rota temporária de fixture, os arquivos `tmp/` nem alterações preexistentes de documentação no commit desta feature.

## Verificações

- Typecheck e suíte unitária/invariantes do projeto.
- Testes da remoção local, troca de fonte, dados/status e render sem remendos nos textos Bocaiúva.
- Persistência mock: salvar, reabrir, restaurar e não emitir notificações.
- PostgreSQL isolado: migration, limites JSON, admin/membro/outro time, dados do jogo preservados e restauração de backup.
- QA manual em harness temporário com dados fictícios: desktop/mobile, descarte, falha de salvamento, perfil leitor e exportação.

Resultados locais: typecheck passou; 648 testes passaram; build web com 89 páginas e verificação de hidratação passou; audit:security sem bloqueios (5 moderadas, 0 altas/críticas). PostgreSQL isolado passou 31 migrations e 9 suites, incluindo restauração. QA desktop e 390×844 passou, inclusive recuperação após Back/Forward e reload. O diálogo nativo beforeunload não foi capturado pela automação; a recuperação de rascunho foi verificada. PNG baixado pelo editor conferido em 941×1672 com dados fictícios. Migration de produção aplicada em 2026-11-10, conforme descrito acima. A publicação do frontend deve ser verificada separadamente.
