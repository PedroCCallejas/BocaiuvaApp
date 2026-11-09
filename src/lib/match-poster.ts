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
};

export function buildMatchPosterData(team: Team, match: Match): MatchPosterData {
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
    headline: labels[match.status],
    filename: `jogo-${slug || 'partida'}.png`,
  };
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}


// The supplied PNG is the actual background, not a visual recreation.
// Coordinates are in the original 941 x 1672 image, so its artwork is not distorted.
export async function renderMatchPoster(data: MatchPosterData) {
  const canvas = document.createElement('canvas');
  canvas.width = 941;
  canvas.height = 1672;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Este navegador não conseguiu criar a arte. Tente outro navegador.');
  const loadImage = (url: string | null): Promise<HTMLImageElement | null> => new Promise((resolve) => {
    if (!url || !/^(https?:|data:image\/|blob:|\/)/i.test(url)) { resolve(null); return; }
    const image = new window.Image();
    image.crossOrigin = 'anonymous';
    const timer = setTimeout(() => { image.onload = null; image.onerror = null; resolve(null); }, 10000);
    image.onload = () => { clearTimeout(timer); resolve(image.naturalWidth ? image : null); };
    image.onerror = () => { clearTimeout(timer); resolve(null); };
    image.src = url;
  });
  const isBocaiuva = /bocaiuva/.test(data.teamName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());
  const [template, opponentLogo, teamLogo] = await Promise.all([
    loadImage('/artes/bocaiuva-template-original.png'),
    loadImage(data.opponentLogoUrl),
    isBocaiuva ? Promise.resolve(null) : loadImage(data.teamLogoUrl),
  ]);
  if (!template) throw new Error('Não foi possível carregar o modelo original da arte. Tente novamente.');
  ctx.drawImage(template, 0, 0, 941, 1672);
  const missingLogos = [!isBocaiuva && !teamLogo ? data.teamName : '', !opponentLogo ? data.opponentName : ''].filter(Boolean);
  const navy = '#041F65';
  const fit = (value: string, x: number, y: number, width: number, size: number, color: string, italic = false, family = 'Impact') => {
    do {
      ctx.font = `${italic ? 'italic ' : ''}${family === 'Impact' ? 400 : 700} ${size}px ${family}, "Arial Narrow", Arial, sans-serif`;
      if (ctx.measureText(value).width <= width || size <= 12) break;
      size--;
    } while (size > 11);
    ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.fillText(value, x, y);
  };
  // Reuse clean texture from this very image to cover only editable placeholders.
  const patch = (sx: number, sy: number, sw: number, sh: number, x: number, y: number, w: number, h: number) => {
    for (let dx = 0; dx < w; dx += sw) for (let dy = 0; dy < h; dy += sh) {
      const width = Math.min(sw, w-dx); const height = Math.min(sh, h-dy);
      ctx.drawImage(template, sx, sy, width, height, x+dx, y+dy, width, height);
    }
  };
  const eraseText = (x: number, y: number, width: number, height: number, sourceX: number, dark: boolean) => {
    const area = ctx.getImageData(x,y,width,height);
    const clean = ctx.getImageData(dark ? 400 : sourceX, dark ? 550 : y, 130, dark ? 45 : height);
    for(let py=0;py<height;py++) for(let px=0;px<width;px++) {
      const i=(py*width+px)*4;
      const j=((dark ? py%45 : py)*130+px%130)*4;
      const alpha=Math.min(1,Math.min(px,py,width-1-px,height-1-py)/7);
      for(let c=0;c<3;c++) area.data[i+c]=Math.round(area.data[i+c]*(1-alpha)+clean.data[j+c]*alpha);
    }
    ctx.putImageData(area,x,y);
  };
  eraseText(550,520,338,83,5,true);
  fit(data.opponentName.toUpperCase(), 720, 589, 315, 55, navy);
  // Clear the icon/text inside the opponent's existing shield, keeping its outline.
  ctx.save();
  ctx.beginPath(); ctx.moveTo(566,714); ctx.quadraticCurveTo(648,705,705,664);
  ctx.quadraticCurveTo(771,705,846,714); ctx.quadraticCurveTo(849,908,705,1011);
  ctx.quadraticCurveTo(565,918,566,714); ctx.closePath(); ctx.clip();
  patch(395,650,140,100,558,655,300,367);
  ctx.restore();
  const crest = (logo: HTMLImageElement | null, name: string, x: number, y: number, w: number, h: number) => {
    if (logo) {
      const scale = Math.min(w / logo.naturalWidth, h / logo.naturalHeight);
      const width = logo.naturalWidth * scale; const height = logo.naturalHeight * scale;
      ctx.drawImage(logo, x + (w-width)/2, y + (h-height)/2, width, height);
    } else fit(initials(name), x+w/2, y+h/2+27, w-25, 88, navy);
  };
  crest(opponentLogo, data.opponentName, 592, 731, 227, 242);
  if (!isBocaiuva) {
    patch(410,535,110,65,67,532,343,69);
    fit(data.teamName.toUpperCase(),238,589,330,55,navy);
    patch(395,650,140,100,76,625,320,413);
    crest(teamLogo,data.teamName,94,673,280,326);
  }
  // Keep the supplied title untouched for a confirmed match. Other statuses must not lie.
  if (data.headline !== 'JOGO CONFIRMADO') {
    patch(325,15,290,28,65,218,820,121);
    fit(data.headline.replace(/^JOGO\s+/, '')+'!',470,326,800,111,'#FFDA00',true);
  }
  const fields = [
    { value:data.date, top:1173, baseline:1226, size:48 },
    { value:data.time, top:1294, baseline:1347, size:48 },
    { value:data.venue, top:1414, baseline:1466, size:42 },
  ];
  fields.forEach(({ value, top, baseline, size }) => {
    eraseText(348,top,436,67,655,false);
    fit(value,565,baseline,416,size,'#FFFFFF',false,'Arial');
  });
  return { dataUrl:canvas.toDataURL('image/png'), missingLogos };
}
