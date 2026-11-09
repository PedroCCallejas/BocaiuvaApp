# Escalação, escudos e dia de jogo — 09/11/2026

## Entrega
- Compartilhamento usa somente escalação salva e elenco histórico; leitura disponível também em partidas encerradas. Edição administrativa explícita antes do encerramento.
- Seção Escudo do adversário em criar/editar: PNG/JPEG/WebP até 5 MB e 40 MP, saída PNG até 1024 px. Envio ocorre ao salvar; imagem anterior e escudo principal não são sobrescritos.
- Template aprovado preservado. Na data local America/Cuiaba, partidas agendadas/confirmadas usam DIA DE JOGO e #matchDay; finalizadas/canceladas preservam estado.

## Verificação
Typecheck, 643 testes e build web (89 HTML com bundles) aprovados. PostgreSQL isolado: 30 migrations, 8 testes SQL e repetição após restore. Revisão independente sem bloqueios.
Migration escudos_adversarios aplicada com autorização explícita, versão remota 20261109203313. Apenas app.can_write_media_object ampliada para UUID.png na subpasta opponents, com can_manage_team; demais regras/grants preservados. Sem upload real ou alteração de partida.

## Limitações
Compartilhamento depende do navegador e aplicativos instalados; não publica automaticamente. Não testado em celulares físicos. Upload concluído seguido de abandono após falha de salvar pode deixar objeto órfão, preservando imagem anterior. Escalação da partida Planalto ainda precisa ser escolhida/salva por administrador.
