# Arte de partidas e compartilhamento — 09/11/2026

## Critérios de aceitação
- Arte 941×1672 no estilo da referência: azul/amarelo, título de status, faixa central com dois escudos, data/hora/local.
- Todos os dados vêm da partida/time; escudo indisponível usa iniciais e aviso, nunca inventa identidade.
- Jogo e escalação oferecem Instagram, WhatsApp e download PNG.
- Arquivo pronto antes do clique de compartilhar; cancelar não inicia download nem outra tentativa.
- Escalação alterada invalida arquivo preparado; alterações não salvas impedem compartilhar.
- Nenhum envio ou publicação automática.

## Implementado
Após a segunda orientação do usuário, o renderizador usa o PNG anexado EXATO como fundo (public/artes/bocaiuva-template-original.png), sem recriação. Preserva escudo Bocaiúva, textura, título, estrelas e ícones, cobrindo somente placeholders e preenchendo nome/escudo adversário, data, horário e local. Máscaras com bordas suaves reutilizam textura da própria imagem. Para outros times, a identidade da esquerda também é substituída; status diferente de confirmado troca o texto para não anunciar confirmação inexistente. Não envia dados a serviço de geração de imagem. A arte de jogo usa 9:16 para Stories; a escalação mantém seu formato e todos os reservas.
As duas telas usam ImageShareActions e image-sharing. O clique chama Web Share imediatamente com File preparado; o usuário escolhe o aplicativo no seletor do sistema. Não existe URL web universal que anexe PNG diretamente ao Instagram/WhatsApp. Na ausência de suporte, o usuário baixa e anexa manualmente.

## Validação
- npm run typecheck: passou.
- npm run test: 631/631 passaram.
- npm run build:web: passou.
- git diff --check: passou.
- Arte efetiva renderizada em Chrome headless e inspecionada em 941×1672; dados demonstrativos, com fallback de iniciais.
- Testes automatizados cobrem chamada imediata, cancelamento, falta de suporte, negação, conversão PNG e invalidação da escalação. Não equivalem a teste em aparelho iOS/Android com aplicativos instalados.
- Ajustada referência do teste de caixa ao nome real da migration 20261109135601_caixa_semanal.sql. Nenhuma migration alterada nesta tarefa.

## Limites
A presença de Instagram/WhatsApp no seletor depende do navegador, sistema e aplicativos. Testes reais em iPhone/Android e publicação manual pelo usuário permanecem necessários. Nenhum push/deploy foi feito; alterações locais preexistentes foram preservadas.

## QA de compartilhamento em navegador (2026-11-09)

Componente real `ImageShareActions` executado no Edge em uma página local isolada, com React real, adaptadores HTML para os elementos React Native e tema fictício. Web Share foi simulado deliberadamente; nenhum aplicativo externo foi aberto nem recebeu dados.

- Preparar imagem: ações aparecem somente depois de haver arquivo pronto.
- Sem suporte: mensagem para baixar/anexar manualmente, zero chamadas ao seletor.
- Cancelamento: mensagem de cancelamento, sem fallback automático.
- Falha: orientação de download manual; ação permanece disponível para nova tentativa.
- Sucesso simulado: mensagem para concluir no aplicativo escolhido.
- Download explícito: aviso de download solicitado; contador de compartilhamentos permanece inalterado.

Limites: isso valida o comportamento do componente e mensagens, não o seletor real do iOS/Android, entrega dentro de Instagram/WhatsApp, nem a captura completa da tela de escalação autenticada. A página de QA usou coluna de 350 px, mas não houve emulação de dispositivo móvel. Os seis testes automatizados cobrem chamada imediata com arquivo pronto, cancelamento, ausência de suporte, erros, bytes do PNG e invalidação da versão antiga da escalação. Typecheck e build web passaram. A suíte completa foi revalidada pelo responsável após ajustar a referência antiga da migration do caixa: 631/631.
