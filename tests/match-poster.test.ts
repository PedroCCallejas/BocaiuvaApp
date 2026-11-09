import assert from 'node:assert/strict';
import { buildMatchPosterData, renderMatchPoster } from '@/lib/match-poster';
import type { Match, Team } from '@/types/domain';

const team = { name: 'Bocaiúva', logoUrl: 'https://example.com/boca.png' } as Team;
const match = { opponentName: 'São José', opponentTeamLogoUrl: 'https://example.com/opponent.png', date: '2026-11-15', time: '09:30', venue: 'Estádio Municipal', status: 'confirmed' } as Match;
const build = (team: Team, match: Match) => buildMatchPosterData(team, match, new Date('2026-11-01T12:00:00Z'));
const data = build(team, match);
export const matchPosterTestCases: Array<{ name: string; run: () => void | Promise<void> }> = [
  {
    name: 'arte da partida preserva dados, status e prioridade dos escudos',
    run() {
      assert.equal(data.headline, 'JOGO CONFIRMADO');
      assert.equal(data.date, '15/11/2026');
      assert.equal(data.opponentLogoUrl, match.opponentTeamLogoUrl);
      assert.equal(data.filename, 'jogo-bocaiuva-sao-jose-2026-11-15.png');
      assert.equal(build(team, { ...match, opponentLogoUrl: 'https://example.com/custom.png' }).opponentLogoUrl, 'https://example.com/custom.png');
      assert.equal(build(team, { ...match, status: 'scheduled' }).headline, 'JOGO AGENDADO');
      assert.equal(build(team, { ...match, status: 'canceled' }).headline, 'JOGO CANCELADO');
      assert.equal(build(team, { ...match, status: 'finished' }).headline, 'JOGO FINALIZADO');
      assert.equal(build(team, { ...match, venue: '', time: '' }).venue, 'Local a definir');
      assert.equal(build(team, { ...match, time: '' }).time, 'A definir');
      assert.equal(build(team, { ...match, opponentLogoUrl: ' ', opponentTeamLogoUrl: null }).opponentLogoUrl, null);
    },
  },
  {
    name: 'dia de jogo respeita meia-noite de Cuiaba e preserva status encerrados',
    run() {
      const at = (instant: string, status: Match['status'] = 'scheduled') =>
        buildMatchPosterData(team, { ...match, status }, new Date(instant));
      assert.equal(at('2026-11-15T03:59:59.999Z').headline, 'JOGO AGENDADO');
      assert.equal(at('2026-11-15T04:00:00Z').headline, 'DIA DE JOGO');
      assert.equal(at('2026-11-15T04:00:00Z').hashtag, '#matchDay');
      assert.equal(at('2026-11-16T03:59:59.999Z', 'confirmed').headline, 'DIA DE JOGO');
      assert.equal(at('2026-11-16T04:00:00Z', 'confirmed').headline, 'JOGO CONFIRMADO');
      assert.equal(at('2026-11-16T04:00:00Z').headline, 'JOGO AGENDADO');
      assert.equal(at('2026-11-16T04:00:00Z').hashtag, '#UpComingGame');
      assert.equal(at('2026-11-15T12:00:00Z', 'finished').headline, 'JOGO FINALIZADO');
      assert.equal(at('2026-11-15T12:00:00Z', 'canceled').headline, 'JOGO CANCELADO');
      assert.equal(at('2026-11-15T12:00:00Z', 'finished').hashtag, '#UpComingGame');
    },
  },
  {
    name: 'arte da partida gera PNG 941x1672 com dados e iniciais quando faltam escudos',
    async run() {
      const drawn: string[] = [];
      const patches: number[][] = [];
      let font = '';
      const context = new Proxy({
        get font() { return font; }, set font(value: string) { font = value; },
        drawImage: (_image: unknown, ...coordinates: number[]) => patches.push(coordinates),
        createLinearGradient: () => ({ addColorStop() {} }),
        createRadialGradient: () => ({ addColorStop() {} }),
        getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w*h*4) }),
        measureText: (s: string) => ({ width: s.length * Number(font.match(/(\d+)px/)?.[1] ?? 20) * 0.6 }),
        fillText: (s: string) => drawn.push(s),
      }, { get: (target, key) => key in target ? target[key as keyof typeof target] : () => {} });
      const canvas = { width: 0, height: 0, getContext: () => context, toDataURL: () => 'data:image/png;base64,test' };
      const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
      const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
      Object.defineProperty(globalThis, 'window', { configurable:true, value:{ Image: class {
        naturalWidth=941; naturalHeight=1672; onload: (()=>void) | null=null; onerror=null;
        set src(_value: string) { queueMicrotask(()=>this.onload?.()); }
      } } });
      try {
      Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => canvas } });
      const poster = await renderMatchPoster({ ...data, teamLogoUrl: null, opponentLogoUrl: null });
      assert.equal(canvas.width, 941); assert.equal(canvas.height, 1672);
      assert.deepEqual(poster.missingLogos, ['São José']);
      assert.ok(!drawn.includes('B'), 'escudo original do Bocaiuva deve ser preservado');
      assert.ok(drawn.includes('SJ')); assert.ok(drawn.includes('15/11/2026'));
      const matchDay = buildMatchPosterData(team, match, new Date('2026-11-15T12:00:00Z'));
      drawn.length = 0; patches.length = 0;
      await renderMatchPoster({ ...matchDay, opponentLogoUrl: null });
      assert.ok(drawn.includes('DIA DE')); assert.ok(drawn.includes('JOGO'));
      assert.ok(drawn.includes('#matchDay'));
      assert.ok(!drawn.includes('CONFIRMADO!')); assert.ok(!drawn.includes('DIA DE JOGO!'));
      assert.ok(patches.some((p) => p[4] === 287 && p[5] === 104), 'apaga JOGO original');
      assert.ok(patches.some((p) => p[4] === 65 && p[5] === 218), 'apaga status original');
      assert.ok(patches.some((p) => p[4] === 220 && p[5] === 347), 'apaga hashtag original');
      assert.equal(canvas.width, 941); assert.equal(canvas.height, 1672);
      assert.ok(drawn.includes('09:30')); assert.ok(drawn.includes('Estádio Municipal'));
      } finally {
        if (originalWindow) Object.defineProperty(globalThis,'window',originalWindow);
        else delete (globalThis as {window?:unknown}).window;
        if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
        else delete (globalThis as { document?: unknown }).document;
      }
    },
  },
];
