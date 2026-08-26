/**
 * Service worker do Professô FC.
 *
 * Existe por um motivo só: receber push. O app é web, instalado pela tela de
 * início — não há app nativo, então `expo-notifications` não serve aqui. Push
 * na web é outra tecnologia (Web Push, RFC 8030/8291) e precisa de um service
 * worker vivo para receber a mensagem quando a aba está fechada.
 *
 * O que este arquivo NÃO faz, de propósito: cache offline. Um service worker
 * que faz cache erra fácil e serve versão velha do app depois do deploy — e o
 * app já vive de dado em tempo real. Aqui ele só escuta push.
 *
 * Mora em `public/` para o Expo copiar para `dist/` e ser servido em `/sw.js`,
 * na raiz. O escopo de um service worker é a pasta onde ele está: em qualquer
 * subpasta, ele não enxergaria o app inteiro.
 */

// Assume o controle sem esperar a pessoa fechar todas as abas. Sem isso, a
// primeira instalação só passaria a valer na próxima visita — e a permissão
// teria sido pedida à toa.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Chegou push.
 *
 * O navegador exige que todo push mostre uma notificação visível — é a troca
 * pela permissão. Push silencioso derruba a inscrição depois de algumas vezes,
 * então mesmo um payload quebrado precisa virar algo na tela.
 */
self.addEventListener('push', (event) => {
  let dados = {};

  try {
    dados = event.data ? event.data.json() : {};
  } catch (erro) {
    // Payload ilegível não pode virar silêncio: o navegador penaliza.
    dados = {};
  }

  const titulo = dados.title || 'Professô FC';
  const corpo = dados.body || 'Toque para abrir o app.';

  const opcoes = {
    body: corpo,
    icon: '/icons/pwa-192.png',
    badge: '/icons/pwa-192.png',
    // Agrupa por tipo: três avisos da mesma escalação viram um só, em vez de
    // encher a barra de notificação.
    tag: dados.tag || dados.type || 'professo-fc',
    renotify: true,
    data: {
      url: dados.url || '/',
      ...(dados.data || {}),
    },
  };

  event.waitUntil(self.registration.showNotification(titulo, opcoes));
});

/**
 * Tocou na notificação.
 *
 * Se o app já está aberto em alguma aba, foca ela e navega por dentro. Abrir
 * uma aba nova a cada toque deixaria meia dúzia de cópias do app abertas.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const destino = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((janelas) => {
        for (const janela of janelas) {
          if ('focus' in janela) {
            if ('navigate' in janela && destino !== '/') {
              return janela.navigate(destino).then((aberta) => aberta && aberta.focus());
            }

            return janela.focus();
          }
        }

        return self.clients.openWindow(destino);
      }),
  );
});
