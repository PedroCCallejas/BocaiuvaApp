import type { MatchPosterSettings } from '@/types/domain';

/** Invalid stored settings safely fall back to the original layout. */
export function parseMatchPosterSettings(value: unknown): MatchPosterSettings | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || typeof v.removeBackground !== 'boolean' ||
      !(v.logoUrl === null || (typeof v.logoUrl === 'string' && v.logoUrl.length <= 4096)) ||
      typeof v.x !== 'number' || !Number.isFinite(v.x) || Math.abs(v.x) > 300 ||
      typeof v.y !== 'number' || !Number.isFinite(v.y) || Math.abs(v.y) > 300 ||
      typeof v.scale !== 'number' || !Number.isFinite(v.scale) || v.scale < 0.5 || v.scale > 2.5) return null;
  return { version: 1, logoUrl: v.logoUrl, x: v.x, y: v.y, scale: v.scale, removeBackground: v.removeBackground };
}

export function validateMatchPosterSettings(value: unknown): MatchPosterSettings | null {
  if (value === null) return null;
  const parsed = parseMatchPosterSettings(value);
  if (!parsed) throw new Error('O ajuste da arte é inválido. Restaure o ajuste e tente novamente.');
  return parsed;
}
