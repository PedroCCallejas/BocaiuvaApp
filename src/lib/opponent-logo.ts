import type { SelectedImageAsset } from './uploadImage';

export const OPPONENT_LOGO_MAX_BYTES = 5 * 1024 * 1024;
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
export function validateOpponentLogo(asset: SelectedImageAsset) {
  if (!TYPES.has(asset.mimeType?.toLowerCase() ?? '')) {
    throw new Error('Escolha uma imagem PNG, JPEG ou WebP.');
  }
  if (!Number.isFinite(asset.fileSize) || !asset.fileSize || asset.fileSize > OPPONENT_LOGO_MAX_BYTES) {
    throw new Error('Escolha uma imagem de até 5 MB.');
  }
  if (!Number.isFinite(asset.width) || !Number.isFinite(asset.height) ||
      asset.width <= 0 || asset.height <= 0 || asset.width * asset.height > 40_000_000) {
    throw new Error('Escolha uma imagem com até 40 megapixels.');
  }
}
export function buildOpponentLogoStoragePath(teamId: string, id: string) {
  if (!teamId || /[\\/]/.test(teamId) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
    throw new Error('Caminho de escudo inválido.');
  }
  return `team-logos/${teamId}/opponents/${id}.png`;
}
