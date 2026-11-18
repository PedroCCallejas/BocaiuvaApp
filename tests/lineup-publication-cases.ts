import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canEditMatchLineup, getPublishedLineup, canSharePublishedLineup, getLineupPresentation } from '@/lib/lineup-sharing';
import { buildLineupStateFromSource, getFormationPresetByKey } from '@/lib/lineup';
import type { Player, LineupNode } from '@/types/domain';
const saved = { formationKey: 'futsal-2-2', starters: [{ playerId: 'saved', x: 22, y: 37, zone: 'midfield' } as LineupNode], benchPlayerIds: ['bench'] };
const players = [{ id: 'saved' }, { id: 'bench' }];
export const lineupPublicationTestCases = [
  { name: 'entrar em edicao inclui recem-confirmado sem alterar publicacao', run() {
    const confirmedPlayers = [...players, { id: 'new-confirmed' }] as Player[];
    const published = getPublishedLineup(saved)!;
    const draft = buildLineupStateFromSource({ existingLineup: saved, preset: getFormationPresetByKey('futsal', 4, saved.formationKey), players: confirmedPlayers });
    const base = { canEdit: true, draft, published, confirmedPlayers, publishedPlayers: players as Player[] };
    const clean = getLineupPresentation({ ...base, hasUnsavedChanges: false });
    assert.equal(clean.editing, false);
    assert.deepEqual(clean.lineup, saved);
    assert.equal(clean.players.some((p) => p.id === 'new-confirmed'), false);
    const editing = getLineupPresentation({ ...base, hasUnsavedChanges: true });
    assert.equal(editing.editing, true);
    assert.ok(editing.lineup.benchPlayerIds.includes('new-confirmed'));
    assert.ok(editing.players.some((p) => p.id === 'new-confirmed'));
    assert.deepEqual(published, saved);
    assert.equal(canSharePublishedLineup({ lineup: published, players, ready: true, hasUnsavedChanges: true }), false);
    assert.equal(getLineupPresentation({ ...base, canEdit: false, hasUnsavedChanges: true }).editing, false);
    const source = fs.readFileSync('src/app/(app)/lineup/[matchId].tsx', 'utf8');
    assert.match(source, /onPress=\{handleBeginEditing\}/);
    const begin = source.slice(source.indexOf('const handleBeginEditing'), source.indexOf('const canExportLineup'));
    assert.match(begin, /setDraft\(editableSourceLineup\)/);
    assert.match(begin, /setSavePhase\('dirty'\)/);
  } },
  { name: 'edicao de escalacao exige admin e partida aberta', run() {
    for (const role of [true, false]) {
      for (const status of ['scheduled', 'confirmed', 'finished', 'canceled'] as const) {
        assert.equal(canEditMatchLineup(role, status), role && ['scheduled', 'confirmed'].includes(status));
      }
    }
    assert.equal(canEditMatchLineup(true), false);
  } },
  { name: 'publicacao preserva titulares banco coordenadas e nao inventa escalacao', run() {
    assert.equal(getPublishedLineup(null), null);
    const publication = getPublishedLineup(saved)!;
    assert.deepEqual(publication, saved);
    publication.starters[0].x = 99;
    publication.benchPlayerIds.push('new');
    assert.equal(saved.starters[0].x, 22);
    assert.deepEqual(saved.benchPlayerIds, ['bench']);
  } },
  { name: 'membros e admins compartilham salva inclusive encerrada sem depender de presenca atual', run() {
    for (const role of [true, false]) {
      for (const status of ['scheduled', 'finished', 'canceled'] as const) {
        const lineup = getPublishedLineup(saved);
        assert.equal(canSharePublishedLineup({ lineup, players, hasUnsavedChanges: false, ready: true }), true);
        if (status !== 'scheduled') assert.equal(canEditMatchLineup(role, status), false);
      }
    }
  } },
  { name: 'rascunho ausencia de publicacao vazio e jogador indisponivel nunca geram arte salva', run() {
    const base = { lineup: getPublishedLineup(saved), players, hasUnsavedChanges: false, ready: true };
    assert.equal(canSharePublishedLineup({ ...base, hasUnsavedChanges: true }), false);
    assert.equal(canSharePublishedLineup({ ...base, ready: false }), false);
    assert.equal(canSharePublishedLineup({ ...base, lineup: null }), false);
    assert.equal(canSharePublishedLineup({ ...base, lineup: { ...saved, starters: [] } }), false);
    assert.equal(canSharePublishedLineup({ ...base, players: [{ id: 'saved' }] }), false);
  } },
  { name: 'tela usa publicacao historica para arte e restringe todos os controles de escrita', run() {
    const source = fs.readFileSync('src/app/(app)/lineup/[matchId].tsx', 'utf8');
    assert.match(source, /const isReadOnly = !canEdit/);
    assert.match(source, /useAppStore\(selectTeamHistoricalPlayers\)/);
    assert.match(source, /getPublishedLineup\(existingLineup\)/);
    assert.match(source, /editable=\{editing\}/);
    assert.match(source, /starters=\{readOnlyLineup.starters\}/);
    assert.match(source, /benchPlayerIds=\{readOnlyLineup.benchPlayerIds\}/);
    assert.doesNotMatch(source.slice(source.indexOf('const handleDraftChange')), /\bcanManage\b/);
    assert.doesNotMatch(source, /title="Escalação bloqueada"/);
  } },
];
