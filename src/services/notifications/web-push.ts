/**
 * Push no navegador (Web Push).
 *
 * O app é web, instalado pela tela de início. `expo-notifications` só entrega
 * push em build nativo, então aqui a tecnologia é outra: Web Push, com service
 * worker e chave VAPID.
 *
 * Diferenças que importam para quem for mexer:
 *
 * - **iOS só funciona instalado.** Safari só entrega push para PWA adicionada à
 *   tela de início, em iOS 16.4 ou mais novo. Na aba do Safari não existe, e não
 *   há contorno. Por isso `motivoDeIndisponibilidade` distingue "não dá neste
 *   aparelho" de "você ainda não instalou" — a segunda tem conserto.
 * - **A inscrição é por navegador, não por conta.** A mesma pessoa no celular e
 *   no desktop tem duas inscrições, e cada uma precisa ser guardada.
 * - **A inscrição expira sozinha.** O navegador pode trocar o endpoint sem
 *   avisar; por isso a assinatura é reconferida a cada abertura, não só uma vez.
 */

export interface InscricaoDePush {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type MotivoSemPush =
  | 'nao-e-web'
  | 'sem-suporte'
  | 'precisa-instalar'
  | 'permissao-negada';

/** Só existe navegador quando `window` existe. No app nativo isto nem carrega. */
function noNavegador(): boolean {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined';
}

/**
 * A PWA está rodando instalada (tela de início) ou numa aba comum?
 *
 * `display-mode: standalone` é o sinal padrão. O `navigator.standalone` é a
 * variante antiga do Safari, que ainda é o que responde em iPhone.
 */
export function estaInstalado(): boolean {
  if (!noNavegador()) {
    return false;
  }

  const comoApp = window.matchMedia?.('(display-mode: standalone)')?.matches ?? false;
  const safariAntigo = (window.navigator as { standalone?: boolean }).standalone === true;

  return comoApp || safariAntigo;
}

function pareceIOS(): boolean {
  if (!noNavegador()) {
    return false;
  }

  const ua = navigator.userAgent || '';

  // iPad moderno se anuncia como Mac; o toque é o que denuncia.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * Por que o push não está disponível — ou `null` quando está.
 *
 * Devolve o motivo em vez de um booleano porque a tela precisa dizer o que
 * fazer. "Não foi possível ativar" não ajuda ninguém; "adicione à tela de
 * início" ajuda.
 */
export function motivoDeIndisponibilidade(): MotivoSemPush | null {
  if (!noNavegador()) {
    return 'nao-e-web';
  }

  const temSuporte =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  if (!temSuporte) {
    // No iPhone, a falta de suporte quase sempre é a aba do Safari, não o
    // aparelho: instalado, o mesmo iOS passa a suportar.
    return pareceIOS() && !estaInstalado() ? 'precisa-instalar' : 'sem-suporte';
  }

  if (pareceIOS() && !estaInstalado()) {
    return 'precisa-instalar';
  }

  if (Notification.permission === 'denied') {
    return 'permissao-negada';
  }

  return null;
}

export const MENSAGEM_POR_MOTIVO: Record<MotivoSemPush, string> = {
  'nao-e-web': 'Avisos no celular funcionam pelo navegador.',
  'sem-suporte': 'Este navegador não suporta avisos. Tente pelo Chrome ou Safari atualizado.',
  'precisa-instalar':
    'No iPhone, adicione o app à tela de início (botão Compartilhar → "Adicionar à Tela de Início") para receber avisos.',
  'permissao-negada':
    'Os avisos foram bloqueados neste navegador. Libere nas configurações do site para voltar a receber.',
};

/**
 * Converte a chave pública VAPID de base64url para bytes.
 *
 * O `applicationServerKey` só aceita `Uint8Array`. É chave **pública** — vive no
 * bundle sem problema; quem assina é a privada, que fica no servidor.
 */
function chaveParaBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const preenchimento = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + preenchimento).replace(/-/g, '+').replace(/_/g, '/');
  const bruto = atob(base64);
  // `ArrayBuffer` explícito: `applicationServerKey` não aceita a variante que
  // pode ser `SharedArrayBuffer`.
  const bytes = new Uint8Array(new ArrayBuffer(bruto.length));

  for (let i = 0; i < bruto.length; i += 1) {
    bytes[i] = bruto.charCodeAt(i);
  }

  return bytes;
}

/** Extrai as chaves da inscrição no formato que o servidor precisa. */
function paraInscricao(assinatura: PushSubscription): InscricaoDePush | null {
  const json = assinatura.toJSON();
  const chaves = json.keys ?? {};

  if (!json.endpoint || !chaves.p256dh || !chaves.auth) {
    return null;
  }

  return { endpoint: json.endpoint, p256dh: chaves.p256dh, auth: chaves.auth };
}

export async function registrarServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!noNavegador() || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    // `scope: '/'` é o padrão para um arquivo na raiz, mas explicitar evita
    // surpresa se o arquivo mudar de lugar.
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (erro) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[push] service worker nao registrou', erro);
    }

    return null;
  }
}

/**
 * Pede permissão e devolve a inscrição.
 *
 * **Precisa ser chamada a partir de um toque da pessoa.** O Safari exige gesto
 * do usuário para `Notification.requestPermission()`; chamada no carregamento,
 * ela é recusada em silêncio. Por isso isto vive atrás de um botão, e não do
 * bootstrap do app.
 */
export async function assinarPush(chavePublicaVapid: string): Promise<
  { ok: true; inscricao: InscricaoDePush } | { ok: false; motivo: MotivoSemPush }
> {
  const motivo = motivoDeIndisponibilidade();

  if (motivo) {
    return { ok: false, motivo };
  }

  if (!chavePublicaVapid) {
    return { ok: false, motivo: 'sem-suporte' };
  }

  const registro = (await registrarServiceWorker()) ?? (await navigator.serviceWorker.ready);

  if (!registro) {
    return { ok: false, motivo: 'sem-suporte' };
  }

  const permissao = await Notification.requestPermission();

  if (permissao !== 'granted') {
    return { ok: false, motivo: 'permissao-negada' };
  }

  // Reaproveita a inscrição existente. Assinar de novo geraria outro endpoint e
  // deixaria o antigo apontando para lugar nenhum — a pessoa passaria a receber
  // duas vezes, ou nenhuma.
  const jaAssinada = await registro.pushManager.getSubscription();
  const assinatura =
    jaAssinada ??
    (await registro.pushManager.subscribe({
      // Obrigatório: o navegador não aceita push que não vire notificação.
      userVisibleOnly: true,
      applicationServerKey: chaveParaBytes(chavePublicaVapid),
    }));

  const inscricao = paraInscricao(assinatura);

  return inscricao ? { ok: true, inscricao } : { ok: false, motivo: 'sem-suporte' };
}

/** A inscrição atual, se já existir. Não pede permissão nem mostra nada. */
export async function inscricaoAtual(): Promise<InscricaoDePush | null> {
  if (motivoDeIndisponibilidade() || Notification.permission !== 'granted') {
    return null;
  }

  const registro = await navigator.serviceWorker.getRegistration('/');
  const assinatura = await registro?.pushManager.getSubscription();

  return assinatura ? paraInscricao(assinatura) : null;
}

/** Cancela no navegador. Quem apaga do banco é o chamador. */
export async function cancelarPush(): Promise<string | null> {
  const registro = await navigator.serviceWorker?.getRegistration('/');
  const assinatura = await registro?.pushManager.getSubscription();

  if (!assinatura) {
    return null;
  }

  const endpoint = assinatura.endpoint;
  await assinatura.unsubscribe();

  return endpoint;
}
