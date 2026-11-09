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

// A fixed-size canvas makes the downloaded art independent of viewport size,
// browser zoom and DOM capture support. No external image service receives data.
export async function renderMatchPoster(data: MatchPosterData) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Este navegador não conseguiu criar a arte. Tente outro navegador.');

  const loadLogo = (url: string | null): Promise<HTMLImageElement | null> => new Promise((resolve) => {
    if (!url || !/^(https?:|data:image\/|blob:)/i.test(url)) { resolve(null); return; }
    const image = new window.Image();
    image.crossOrigin = 'anonymous';
    const timer = setTimeout(() => { image.onload = null; image.onerror = null; resolve(null); }, 10000);
    image.onload = () => { clearTimeout(timer); resolve(image.naturalWidth ? image : null); };
    image.onerror = () => { clearTimeout(timer); resolve(null); };
    image.src = url;
  });
  const [teamLogo, opponentLogo] = await Promise.all([loadLogo(data.teamLogoUrl), loadLogo(data.opponentLogoUrl)]);
  const missingLogos = [!teamLogo ? data.teamName : '', !opponentLogo ? data.opponentName : ''].filter(Boolean);
  const blue = '#124BE1';
  const navy = '#071D68';
  const yellow = '#FFE12B';
  const gradient = ctx.createLinearGradient(0, 0, 950, 1350);
  gradient.addColorStop(0, '#1E5CFF'); gradient.addColorStop(0.5, blue); gradient.addColorStop(1, navy);
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1080, 1350);

  // Slanted floodlights and pitch markings frame the central fixture.
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  for (let x = -800; x < 1500; x += 220) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 90, 0);
    ctx.lineTo(x + 890, 1350); ctx.lineTo(x + 800, 1350); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(540, 615, 370, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(540, 615, 295, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = yellow; ctx.fillRect(56, 58, 66, 8);
  ctx.fillRect(130, 58, 16, 8);

  const text = (value: string, x: number, y: number, size: number, color = '#FFFFFF', weight = 800) => {
    ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.font = `${weight} ${size}px Arial, sans-serif`;
    ctx.fillText(value, x, y);
  };
  const fittedText = (value: string, x: number, y: number, width: number, size: number, color = '#FFFFFF') => {
    while (size > 10) {
      ctx.font = `800 ${size}px Arial, sans-serif`;
      if (ctx.measureText(value).width <= width) break;
      size -= 1;
    }
    text(value, x, y, size, color);
  };
  const wrappedText = (value: string, x: number, y: number, width: number, size: number, maxLines: number, color = '#FFFFFF') => {
    let lines: string[] = [];
    // Reduce type to fit all the actual text rather than silently truncating names/local.
    for (; size >= 12; size--) {
      ctx.font = `800 ${size}px Arial, sans-serif`; lines = []; let line = '';
      for (const word of value.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(next).width > width) { lines.push(line); line = word; }
        else line = next;
      }
      if (line) lines.push(line);
      if (lines.length <= maxLines && lines.every((v) => ctx.measureText(v).width <= width)) break;
    }
    lines.forEach((line, i) => fittedText(line, x, y + i * size * 1.23, width, size, color));
  };

  text('FUTEBOL • RAÇA • UNIÃO', 540, 116, 24, '#D3DFFF', 600);
  text('DIA DE', 540, 239, 78);
  text('JOGO', 540, 382, 158, yellow, 900);
  ctx.fillStyle = navy; ctx.fillRect(292, 413, 496, 54);
  fittedText(data.headline, 540, 450, 460, 27, yellow);

  const crest = (logo: HTMLImageElement | null, name: string, x: number) => {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.23)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(x, 628, 132, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = yellow; ctx.lineWidth = 5; ctx.stroke();
    if (logo) {
      const scale = Math.min(190 / logo.naturalWidth, 190 / logo.naturalHeight);
      const w = logo.naturalWidth * scale; const h = logo.naturalHeight * scale;
      ctx.drawImage(logo, x - w / 2, 628 - h / 2, w, h);
    } else {
      text(initials(name), x, 650, 64, blue);
    }
    ctx.restore();
    wrappedText(name.toUpperCase(), x, 808, 370, 34, 3);
  };
  crest(teamLogo, data.teamName, 285);
  crest(opponentLogo, data.opponentName, 795);
  text('VS', 540, 648, 57, yellow, 900);

  ctx.fillStyle = yellow; ctx.fillRect(56, 952, 968, 148);
  ctx.fillStyle = 'rgba(7,29,104,0.2)'; ctx.fillRect(539, 980, 2, 91);
  text('DATA', 298, 993, 21, navy, 600);
  fittedText(data.date, 298, 1057, 420, 52, navy);
  text('HORÁRIO', 782, 993, 21, navy, 600);
  fittedText(data.time, 782, 1057, 420, 58, navy);
  text('LOCAL DA PARTIDA', 540, 1150, 21, '#C7D7FF', 600);
  wrappedText(data.venue, 540, 1200, 940, 35, 2);
  ctx.fillStyle = yellow; ctx.fillRect(487, 1281, 106, 5);
  text('NOSSO TIME. NOSSA PAIXÃO.', 540, 1320, 20, '#D3DFFF', 600);

  return { dataUrl: canvas.toDataURL('image/png'), missingLogos };
}
