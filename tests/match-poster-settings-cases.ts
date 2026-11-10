import { mockRepository, resetMockRepositoryState, patchMockTeamMember } from '@/services/repository/mock-repository';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseMatchPosterSettings, validateMatchPosterSettings } from '@/lib/match-poster-settings';
import { paraPartida } from '@/lib/migracao/mapear-dominio';
const valid = { version: 1, logoUrl: null, x: 0, y: -300, scale: 2.5, removeBackground: false } as const;
export const matchPosterSettingsTestCases = [
 { name: 'ajuste de arte persiste por partida sem alterar dados ou notificacoes', async run() {
   resetMockRepositoryState();
   await mockRepository.login({ email:'admin@bocaiuva.app', password:'123456' });
   const before=await mockRepository.getSnapshot();
   const original=before.matches.find(m=>m.id==='match-4')!;
   await mockRepository.saveMatchPosterSettings(original.id, valid, 'user-admin');
   const after=await mockRepository.getSnapshot();
   const saved=after.matches.find(m=>m.id===original.id)!;
   assert.deepEqual(saved.posterSettings,valid);
   const {posterSettings: _settings, updatedAt: _updated, ...same}=saved;
   const {posterSettings: _oldSettings, updatedAt: _oldUpdated, ...expected}=original;
   assert.deepEqual(same,expected);
   assert.deepEqual(after.notifications,before.notifications);
   await mockRepository.saveMatchPosterSettings(original.id,null,'user-admin');
   assert.equal((await mockRepository.getSnapshot()).matches.find(m=>m.id===original.id)?.posterSettings,null);
   patchMockTeamMember('member-admin-bocaiuva',{canManageTeam:false,roles:['player']});
   await assert.rejects(()=>mockRepository.saveMatchPosterSettings(original.id,valid,'user-admin'));
   resetMockRepositoryState();
 }},
 { name: 'ajustes da arte validam limites e ignoram dados antigos invalidos', run() {
   assert.deepEqual(validateMatchPosterSettings(valid), valid);
   assert.equal(validateMatchPosterSettings(null), null);
   assert.equal(parseMatchPosterSettings(undefined), null);
   for (const value of [{}, [], { ...valid, version: 2 }, { ...valid, x: 301 }, { ...valid, y: -301 },
     { ...valid, scale: 0.49 }, { ...valid, scale: 2.51 }, { ...valid, x: NaN }, { ...valid, x: Infinity },
     { ...valid, removeBackground: 1 }, { ...valid, logoUrl: 'x'.repeat(4097) }]) {
     assert.equal(parseMatchPosterSettings(value), null);
     assert.throws(() => validateMatchPosterSettings(value));
   }
   assert.deepEqual(parseMatchPosterSettings({...valid, extra:'discard'}), valid);
   assert.deepEqual(paraPartida({poster_settings:valid}).posterSettings, valid);
   assert.equal(paraPartida({}).posterSettings, null);
 }},
 { name: 'persistencia da arte isolada nao regrava dados nem envia avisos', run() {
   const source=fs.readFileSync('src/services/repository/supabase/composicao/partidas.ts','utf8');
   const method=source.split('async saveMatchPosterSettings')[1].split('async updateMatch')[0];
   assert.match(method,/salvarAjusteDaArte/);
   assert.doesNotMatch(method,/avisar|atualizarPartida/);
   const service=fs.readFileSync('src/services/repository/supabase/partidas.ts','utf8').split('export async function salvarAjusteDaArte')[1];
   assert.match(service,/poster_settings: validated/);
   assert.ok(service.includes(".eq('id', matchId).select('id').single()"));
   const migration=fs.readFileSync('supabase/migrations/20261110050419_ajustes_arte_partida.sql','utf8');
   assert.doesNotMatch(migration,/grant\s|create\s+policy|disable\s+row/i);
 }},
];
