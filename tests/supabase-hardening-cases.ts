import assert from 'node:assert/strict';
import fs from 'node:fs';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const MIGRATION =
  'supabase/migrations/20260821071359_seguranca_pre_migracao.sql';

function readMigration() {
  return fs.readFileSync(MIGRATION, 'utf8');
}

export const supabaseHardeningTestCases: TestCase[] = [
  {
    name: 'supabase: entrada direta de jogador e removida e convite passa por RPC',
    run() {
      const sql = readMigration();

      assert.match(sql, /drop policy if exists team_members_insert_self/);
      assert.match(sql, /function public\.join_team_with_invite_code/);
      assert.match(sql, /where t\.invite_code = v_code/);
      assert.match(sql, /revoke all on function public\.join_team_with_invite_code\(text\)/);
      assert.match(sql, /grant execute on function public\.join_team_with_invite_code\(text\) to authenticated/);
    },
  },
  {
    name: 'supabase: storage remove escrita anonima e valida caminho autenticado',
    run() {
      const sql = readMigration();

      assert.match(sql, /drop policy if exists "Allow upload player photos/);
      assert.match(sql, /drop policy if exists "Allow update team logos/);
      assert.match(sql, /function app\.can_write_media_object/);
      assert.match(sql, /create policy media_insert_authenticated/);
      assert.match(sql, /create policy media_update_authenticated/);
      assert.match(sql, /create policy media_delete_authenticated/);
      assert.doesNotMatch(sql, /create policy[\s\S]{0,100}for (insert|update|delete)[\s\S]{0,80}to anon/i);
    },
  },
  {
    name: 'supabase: projecao publica nao expoe convite nem proprietario',
    run() {
      const sql = readMigration();
      const view = /create or replace view public\.public_team_summaries([\s\S]*?)create or replace view public\.public_team_roster/.exec(
        sql,
      )?.[1];

      assert.ok(view);
      assert.doesNotMatch(view, /invite_code/);
      assert.doesNotMatch(view, /admin_user_id/);
      assert.match(view, /case when t\.allow_friendly_contact then t\.contact_phone else null end/);
    },
  },
  {
    name: 'supabase: presenca do jogador nao usa FOR ALL nem permite delete',
    run() {
      const sql = readMigration();

      assert.match(sql, /drop policy if exists attendance_write_self/);
      assert.match(sql, /create policy attendance_insert_authenticated/);
      assert.match(sql, /create policy attendance_update_authenticated/);
      assert.match(sql, /create policy attendance_delete_manager/);
      assert.match(sql, /function app\.guard_attendance_self_edit/);
    },
  },
  {
    name: 'supabase: cliente envia JWT Firebase e atualiza claim na primeira chamada',
    run() {
      const client = fs.readFileSync('src/config/supabase/client.ts', 'utf8');

      assert.match(client, /accessToken: getFirebaseAccessToken/);
      assert.match(client, /getIdToken\(forceRefresh\)/);
      assert.match(client, /tokenRefreshedForUserId !== currentUser\.uid/);
    },
  },
  {
    name: 'supabase: importacao confirma os ids depois de cada upsert',
    run() {
      const source = fs.readFileSync('scripts/migrar-para-postgres.ts', 'utf8');

      assert.match(source, /async function confirmarIdsGravados/);
      assert.match(source, /await confirmarIdsGravados\(supabase, tabela, aceitas\)/);
      assert.match(source, /id\(s\) nao apareceram apos o upsert/);
    },
  },
  {
    name: 'supabase: objetos futuros nao recebem grants amplos por padrao',
    run() {
      const sql = readMigration();

      assert.match(sql, /alter default privileges in schema public[\s\S]*revoke select on tables from anon/);
      assert.match(sql, /alter default privileges in schema app[\s\S]*revoke execute on functions from authenticated, anon/);
    },
  },
];
