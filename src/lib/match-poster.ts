import type { MatchPosterSettings } from '@/types/domain';
import { parseMatchPosterSettings } from '@/lib/match-poster-settings';
import { removeBorderWhite } from '@/lib/poster-background';
import type { Match, Team } from '@/types/domain';
import { formatDateBR } from '@/lib/date';

export type MatchPosterData = {
  teamName: string;
  teamLogoUrl: string | null;
  opponentName: string;
  opponentLogoUrl: string | null;
  date: string;
  time: string;
  venue: string;
  headline: string;
  filename: string;
  hashtag: string;
};

// Match dates are calendar dates in the club's timezone, never the browser's timezone.
export function matchPosterLocalDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Cuiaba', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function buildMatchPosterData(team: Team, match: Match, now: Date = new Date()): MatchPosterData {
  const isMatchDay = (match.status === 'scheduled' || match.status === 'confirmed')
    && match.date === matchPosterLocalDate(now);
  const opponentName = match.opponentName.trim() || match.opponentTeamName?.trim() || 'Adversário';
  const labels: Record<Match['status'], string> = {
    scheduled: 'JOGO AGENDADO',
    confirmed: 'JOGO CONFIRMADO',
    finished: 'JOGO FINALIZADO',
    canceled: 'JOGO CANCELADO',
  };
  const slug = `${team.name}-${opponentName}-${match.date}`
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 150);
  return {
    teamName: team.name.trim() || 'Meu time',
    teamLogoUrl: team.logoUrl?.trim() || null,
    opponentName,
    opponentLogoUrl: match.opponentLogoUrl?.trim() || match.opponentTeamLogoUrl?.trim() || null,
    date: formatDateBR(match.date),
    time: match.time?.trim() || 'A definir',
    venue: match.venue?.trim() || 'Local a definir',
    headline: isMatchDay ? 'DIA DE JOGO' : labels[match.status],
    hashtag: isMatchDay ? '#matchDay' : '#UpComingGame',
    filename: `jogo-${slug || 'partida'}.png`,
  };
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}



export const POSTER_WIDTH = 941;
export const POSTER_HEIGHT = 1672;
export const POSTER_CREST = { x: 592, y: 711, width: 227, height: 282 };

export function defaultPosterSettings(logoUrl: string | null): MatchPosterSettings {
  return { version: 1, logoUrl, x: 0, y: 0, scale: 1, removeBackground: false };
}
export function effectivePosterSettings(settings: MatchPosterSettings | null | undefined, logoUrl: string | null): MatchPosterSettings {
  const parsed = parseMatchPosterSettings(settings);
  return parsed && parsed.logoUrl === logoUrl ? parsed : defaultPosterSettings(logoUrl);
}

// Cache source images, not generated posters. Dragging never triggers an upload or repeated downloads.
const sourceImages = new Map<string, Promise<HTMLImageElement | null>>();
function loadPosterImage(url: string | null): Promise<HTMLImageElement | null> {
  if (!url || !/^(https?:|data:image\/|blob:|\/)/i.test(url)) return Promise.resolve(null);
  const cached = sourceImages.get(url);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new window.Image();
    image.crossOrigin = 'anonymous';
    const timer = setTimeout(() => { image.onload = null; image.onerror = null; sourceImages.delete(url); resolve(null); }, 10000);
    image.onload = () => { clearTimeout(timer); resolve(image.naturalWidth ? image : null); };
    image.onerror = () => { clearTimeout(timer); sourceImages.delete(url); resolve(null); };
    image.src = url;
  });
  if (sourceImages.size >= 12) sourceImages.delete(sourceImages.keys().next().value!);
  sourceImages.set(url, promise);
  return promise;
}
const transparentLogos = new WeakMap<HTMLImageElement, HTMLCanvasElement>();
function withoutBorderWhite(image: HTMLImageElement): HTMLCanvasElement {
  const cached = transparentLogos.get(image);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  const ratio = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível preparar o escudo sem fundo.');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  pixels.data.set(removeBorderWhite(pixels.data, canvas.width, canvas.height));
  ctx.putImageData(pixels, 0, 0);
  transparentLogos.set(image, canvas);
  return canvas;
}

// All editable text is drawn on a clean background, never patched over existing text.
export async function renderMatchPoster(data: MatchPosterData, requestedSettings?: MatchPosterSettings | null) {
  const canvas = document.createElement('canvas');
  canvas.width = POSTER_WIDTH;
  canvas.height = POSTER_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Este navegador não conseguiu criar a arte. Tente outro navegador.');
  const isBocaiuva = /bocaiuva/.test(data.teamName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());
  const [template, opponentLogo, teamLogo] = await Promise.all([
    loadPosterImage('/artes/bocaiuva-template-clean.png'),
    loadPosterImage(data.opponentLogoUrl),
    isBocaiuva ? Promise.resolve(null) : loadPosterImage(data.teamLogoUrl),
  ]);
  if (!template) throw new Error('Não foi possível carregar o modelo da arte. Tente novamente.');
  ctx.drawImage(template, 0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  const missingLogos = [!isBocaiuva && !teamLogo ? data.teamName : '', !opponentLogo ? data.opponentName : ''].filter(Boolean);
  const settings = effectivePosterSettings(requestedSettings, data.opponentLogoUrl);
  const navy = '#041F65';
  const fit = (value: string, x: number, y: number, width: number, size: number, color: string, italic = false, family = 'Impact') => {
    do {
      ctx.font = `${italic ? 'italic ' : ''}${family === 'Impact' ? 400 : 700} ${size}px ${family}, "Arial Narrow", Arial, sans-serif`;
      if (ctx.measureText(value).width <= width || size <= 12) break;
      size--;
    } while (size > 11);
    ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.fillText(value, x, y);
  };
  fit(data.opponentName.toUpperCase(), 720, 589, 315, 55, navy);
  const crest = (logo: HTMLImageElement | HTMLCanvasElement | null, name: string, x: number, y: number, w: number, h: number) => {
    if (logo) {
      const sourceWidth = 'naturalWidth' in logo ? logo.naturalWidth : logo.width;
      const sourceHeight = 'naturalHeight' in logo ? logo.naturalHeight : logo.height;
      const scale = Math.min(w / sourceWidth, h / sourceHeight);
      const width = sourceWidth * scale; const height = sourceHeight * scale;
      ctx.drawImage(logo, x + (w - width) / 2, y + (h - height) / 2, width, height);
    } else fit(initials(name), x + w / 2, y + h / 2 + 27, w - 25, 88, navy);
  };
  const box = POSTER_CREST;
  const width = box.width * settings.scale, height = box.height * settings.scale;
  const logo = opponentLogo && settings.removeBackground ? withoutBorderWhite(opponentLogo) : opponentLogo;
  crest(logo, data.opponentName, box.x + settings.x + (box.width - width) / 2,
    box.y + settings.y + (box.height - height) / 2, width, height);
  if (!isBocaiuva) {
    // Preserve the existing fallback for other clubs; this artwork change targets Bocaiúva.
    const patch = (sx: number, sy: number, sw: number, sh: number, x: number, y: number, w: number, h: number) => {
      for (let dx = 0; dx < w; dx += sw) for (let dy = 0; dy < h; dy += sh) {
        const width = Math.min(sw, w - dx), height = Math.min(sh, h - dy);
        ctx.drawImage(template, sx, sy, width, height, x + dx, y + dy, width, height);
      }
    };
    patch(410,535,110,65,67,532,343,69);
    patch(395,650,140,100,76,625,320,413);
    fit(data.teamName.toUpperCase(), 238, 589, 330, 55, navy);
    crest(teamLogo, data.teamName, 94, 673, 280, 326);
  }
  if (data.headline === 'DIA DE JOGO') {
    fit('DIA DE', 470, 207, 360, 107, '#FFFFFF', true);
    fit('JOGO', 470, 326, 800, 133, '#FFDA00', true);
  } else {
    fit('JOGO', 470, 207, 360, 107, '#FFFFFF', true);
    fit(data.headline.replace(/^JOGO\s+/, '') + '!', 470, 326, 800, 111, '#FFDA00', true);
  }
  fit(data.hashtag, 470, 392, 490, 49, '#FFFFFF', true, 'Arial');
  fit(data.date, 565, 1226, 416, 48, '#FFFFFF', false, 'Arial');
  fit(data.time, 565, 1347, 416, 48, '#FFFFFF', false, 'Arial');
  fit(data.venue, 565, 1466, 416, 42, '#FFFFFF', false, 'Arial');
  return { dataUrl: canvas.toDataURL('image/png'), missingLogos };
}
