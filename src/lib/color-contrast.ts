/**
 * Utilidades de contraste (WCAG 2.1) para escolher cores legíveis
 * a partir da identidade visual de cada time.
 *
 * Regra prática: 4.5 é o mínimo para texto normal (AA);
 * 3.0 serve para texto grande ou elementos não textuais.
 */

const AA_NORMAL_TEXT = 4.5;

/** Texto escuro e claro usados sobre superfícies coloridas. */
export const DARK_ON_COLOR = '#0A1208';
export const LIGHT_ON_COLOR = '#F7F9F8';

function parseHex(value: string): [number, number, number] | null {
  const hex = value.trim().replace('#', '');

  const normalized =
    hex.length === 3
      ? hex
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : hex;

  if (normalized.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return null;
  }

  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
}

function channelLuminance(channel: number) {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** Luminância relativa (0 = preto, 1 = branco). Retorna null se o hex for inválido. */
export function relativeLuminance(color: string): number | null {
  const rgb = parseHex(color);

  if (!rgb) {
    return null;
  }

  const [r, g, b] = rgb;

  return (
    0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
  );
}

/** Razão de contraste entre duas cores, de 1 (igual) a 21 (preto x branco). */
export function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);

  if (foregroundLuminance === null || backgroundLuminance === null) {
    return 1;
  }

  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

/** Entre texto escuro e claro, devolve o que for mais legível sobre `background`. */
export function bestTextOn(background: string): string {
  return contrastRatio(DARK_ON_COLOR, background) >= contrastRatio(LIGHT_ON_COLOR, background)
    ? DARK_ON_COLOR
    : LIGHT_ON_COLOR;
}

/** True quando a cor comporta texto legível (AA) em pelo menos uma das variantes. */
export function isReadableSurface(background: string, minimumRatio = AA_NORMAL_TEXT): boolean {
  if (relativeLuminance(background) === null) {
    return false;
  }

  return contrastRatio(bestTextOn(background), background) >= minimumRatio;
}

/**
 * Escurece uma cor hex por um fator de 0 a 1. Usado no estado pressionado,
 * que precisa ser opaco: alpha sobre fundo escuro apenas apaga a cor.
 */
export function darkenColor(color: string, amount = 0.16): string {
  const rgb = parseHex(color);

  if (!rgb) {
    return color;
  }

  const factor = Math.min(Math.max(1 - amount, 0), 1);

  return `#${rgb
    .map((channel) =>
      Math.round(channel * factor)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** Contraste mínimo entre o botão e o fundo da tela (WCAG, elemento não textual). */
const AA_NON_TEXT = 3;

/**
 * Escolhe, entre as cores do time, a primeira que serve como cor de ação
 * (botão primário, foco). Uma cor só serve se cumprir as duas condições:
 *
 * 1. comportar texto legível **dentro** dela (AA);
 * 2. destacar-se **do fundo** da tela — senão o botão some, como um
 *    quase-preto sobre o fundo escuro do app.
 *
 * Se nenhuma servir, devolve `fallback`: a identidade do time é preservada
 * quando possível, sem nunca gerar um botão ilegível ou invisível.
 */
export function resolveActionColor(
  candidates: Array<string | null | undefined>,
  fallback: string,
  background?: string,
) {
  for (const candidate of candidates) {
    if (!candidate || !isReadableSurface(candidate)) {
      continue;
    }

    if (background && contrastRatio(candidate, background) < AA_NON_TEXT) {
      continue;
    }

    return candidate;
  }

  return fallback;
}

/**
 * Monta as cores de ação (botão primário, estado pressionado, texto do botão e foco)
 * a partir da identidade do time. Fica aqui, e não em `constants/theme`, para poder
 * ser testada sem carregar o React Native.
 */
export function buildActionPalette(
  candidates: Array<string | null | undefined>,
  fallback: string,
  background?: string,
) {
  const action = resolveActionColor(candidates, fallback, background);

  return {
    action,
    actionPressed: darkenColor(action),
    actionText: bestTextOn(action),
    focus: action,
  };
}
