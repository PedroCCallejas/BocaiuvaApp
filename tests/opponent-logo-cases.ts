import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildOpponentLogoStoragePath, validateOpponentLogo, OPPONENT_LOGO_MAX_BYTES } from '@/lib/opponent-logo';
const asset = { uri: 'local', width: 512, height: 512, fileSize: 100, mimeType: 'image/png' };
export const opponentLogoTestCases = [
  { name: 'escudo aceita PNG JPEG WebP dentro do limite', run() {
    for (const mimeType of ['image/png', 'image/jpeg', 'image/webp']) validateOpponentLogo({ ...asset, mimeType });
    validateOpponentLogo({ ...asset, fileSize: OPPONENT_LOGO_MAX_BYTES });
  } },
  { name: 'escudo rejeita tipo tamanho e dimensoes invalidos', run() {
    for (const value of [{ mimeType: 'image/svg+xml' }, { mimeType: 'application/pdf' }, { fileSize: OPPONENT_LOGO_MAX_BYTES + 1 }, { fileSize: 0 }, { fileSize: null }, { width: 0 }, { width: 10000, height: 10000 }]) {
      assert.throws(() => validateOpponentLogo({ ...asset, ...value }));
    }
  } },
  { name: 'escudo usa UUID e pasta separada sem sobrescrever logo', run() {
    assert.equal(buildOpponentLogoStoragePath('team-a', '00000000-0000-4000-8000-000000000001'), 'team-logos/team-a/opponents/00000000-0000-4000-8000-000000000001.png');
    assert.throws(() => buildOpponentLogoStoragePath('../team-a', '00000000-0000-4000-8000-000000000001'));
    assert.throws(() => buildOpponentLogoStoragePath('team-a', '../logo'));
  } },
  { name: 'formulario preserva escudo e upload nao altera default JPEG', run() {
    const edit = fs.readFileSync('src/app/(app)/matches/[matchId]/edit.tsx', 'utf8');
    assert.ok(edit.includes('currentMatch.opponentLogoUrl ?? currentMatch.opponentTeamLogoUrl ?? null'));
    const upload = fs.readFileSync('src/lib/uploadImage.ts', 'utf8');
    assert.ok(upload.includes("format = 'jpeg'"));
    assert.ok(upload.includes("format === 'png' ? SaveFormat.PNG : SaveFormat.JPEG"));
    const hook = fs.readFileSync('src/hooks/use-opponent-logo.ts', 'utf8');
    assert.ok(hook.includes('if (!asset) return;'));
    assert.ok(hook.includes('if (!pending) return existingUrl;'));
    assert.ok(hook.includes('uploaded.current?.asset === pending'));
  } },
];
