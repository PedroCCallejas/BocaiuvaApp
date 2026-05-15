import { Linking, Platform } from 'react-native';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

function normalizeUrl(url: string) {
  return url.trim();
}

function toBrowserUrl(url: string) {
  if (typeof window === 'undefined') {
    return normalizeUrl(url);
  }

  return new URL(normalizeUrl(url), window.location.href).toString();
}

export async function openExternalUrl(url: string) {
  const normalizedUrl = normalizeUrl(url);

  if (!normalizedUrl) {
    throw new Error('O link informado esta vazio.');
  }

  if (Platform.OS === 'web') {
    const browserUrl = toBrowserUrl(normalizedUrl);
    const protocol = new URL(browserUrl).protocol;

    if (!ALLOWED_PROTOCOLS.has(protocol)) {
      throw new Error('Esse link nao pode ser aberto no navegador.');
    }

    if (typeof window !== 'undefined') {
      window.open(browserUrl, '_blank', 'noopener,noreferrer');
    }

    return;
  }

  const supported = await Linking.canOpenURL(normalizedUrl);
  if (!supported) {
    throw new Error('Esse link nao pode ser aberto neste aparelho.');
  }

  await Linking.openURL(normalizedUrl);
}
