import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  canonicalizeStorageUrl,
  createStorageReference,
  parseStorageReference,
  resolveSignedStorageUrl,
} from '@/lib/storage-reference';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const MIGRATION = 'supabase/migrations/20260903051620_web_supabase_sem_firestore.sql';
const ACCOUNT_FK_MIGRATION =
  'supabase/migrations/20260903053000_exclusao_de_conta_fks.sql';

export const webSupabaseTestCases: TestCase[] = [
  {
    name: 'web supabase: repositorio ativo nao importa Firestore',
    run() {
      const source = fs.readFileSync('src/services/repository/index.ts', 'utf8');

      assert.match(source, /criarRepositorioSupabase\(supabaseBaseRepository\)/);
      assert.doesNotMatch(source, /firebaseRepository|firebase-repository/);
      assert.doesNotMatch(source, /EXPO_PUBLIC_SUPABASE_MODULES/);
    },
  },
  {
    name: 'web supabase: visitante nao tenta carregar dados privados',
    run() {
      const source = fs.readFileSync(
        'src/services/repository/supabase/composicao/index.ts',
        'utf8',
      );

      assert.match(source, /if \(!session\) return await base\.getInitialSnapshot\(\)/);
      assert.match(source, /if \(!session\) return await base\.getSnapshot\(\)/);
    },
  },
  {
    name: 'web supabase: fotos e videos pessoais usam bucket privado',
    run() {
      const sql = fs.readFileSync(MIGRATION, 'utf8');

      assert.match(sql, /where id in \('player-photos', 'player-videos'\)/);
      assert.match(sql, /function app\.can_read_player_media/);
      assert.match(sql, /t\.is_public[\s\S]*t\.public_roster_enabled/);
      assert.match(sql, /create policy player_media_select_public/);
    },
  },
  {
    name: 'web supabase: referencia de Storage sobrevive a URL publica e assinada',
    run() {
      const canonical = createStorageReference('player-photos', 'team-1/player-1.jpg');
      assert.equal(canonical, 'supabase-storage://player-photos/team-1/player-1.jpg');
      assert.deepEqual(parseStorageReference(canonical), {
        bucket: 'player-photos',
        path: 'team-1/player-1.jpg',
      });
      assert.deepEqual(parseStorageReference(`${canonical}?v=2`), {
        bucket: 'player-photos',
        path: 'team-1/player-1.jpg',
      });
      assert.equal(
        canonicalizeStorageUrl(
          'https://project.supabase.co/storage/v1/object/public/player-photos/team-1/player-1.jpg?v=2',
        ),
        canonical,
      );
      assert.equal(
        canonicalizeStorageUrl(
          'https://project.supabase.co/storage/v1/object/sign/player-photos/team-1/player-1.jpg?token=x',
        ),
        canonical,
      );

      const publicUrl =
        'https://project.supabase.co/storage/v1/object/public/player-photos/team-1/player-1.jpg';
      assert.equal(
        resolveSignedStorageUrl(publicUrl, new Map()),
        publicUrl,
        'URL publica antiga deve continuar visivel durante a transicao',
      );
      assert.equal(
        resolveSignedStorageUrl(canonical, new Map()),
        null,
        'referencia privada nao pode virar URL sem uma assinatura valida',
      );
    },
  },
  {
    name: 'web supabase: conta pode exportar e excluir os proprios dados',
    run() {
      const profile = fs.readFileSync('src/app/(app)/(tabs)/profile.tsx', 'utf8');
      const exportFunction = fs.readFileSync(
        'supabase/functions/exportar-dados/index.ts',
        'utf8',
      );
      const deleteFunction = fs.readFileSync(
        'supabase/functions/excluir-conta/index.ts',
        'utf8',
      );
      const foreignKeys = fs.readFileSync(ACCOUNT_FK_MIGRATION, 'utf8');

      assert.match(profile, /Baixar meus dados/);
      assert.match(profile, /Excluir minha conta/);
      assert.match(exportFunction, /Authorization/);
      assert.match(exportFunction, /from\('users'\)\.select\('\*'\)\.maybeSingle\(\)/);
      assert.match(deleteFunction, /mode !== 'preflight' && mode !== 'finalize'/);
      assert.match(deleteFunction, /listarRecursivamente/);
      assert.match(deleteFunction, /Não foi possível remover suas mídias pessoais/);
      assert.match(foreignKeys, /on delete set null/g);
    },
  },
  {
    name: 'web supabase: Edge Functions validam o JWT Firebase dentro da funcao',
    run() {
      const config = fs.readFileSync('supabase/config.toml', 'utf8');

      for (const functionName of [
        'enviar-push',
        'excluir-time',
        'excluir-conta',
        'exportar-dados',
        'preparar-conta',
      ]) {
        assert.match(
          config,
          new RegExp(`\\[functions\\.${functionName}\\]\\s+verify_jwt = false`),
        );
      }
    },
  },
  {
    name: 'web supabase: conta nova recebe claim antes de acessar o banco',
    run() {
      const client = fs.readFileSync('src/config/supabase/client.ts', 'utf8');
      const bootstrap = fs.readFileSync(
        'supabase/functions/preparar-conta/index.ts',
        'utf8',
      );

      assert.match(client, /tokenResult\.claims\.role !== 'authenticated'/);
      assert.match(client, /functions\/v1\/preparar-conta/);
      assert.match(client, /getIdTokenResult\(true\)/);
      assert.match(bootstrap, /verifyIdToken\(idToken, true\)/);
      assert.match(bootstrap, /setCustomUserClaims/);
      assert.match(bootstrap, /\.\.\.currentClaims/);
    },
  },
  {
    name: 'web supabase: limpeza do Storage pagina alem dos primeiros cem objetos',
    run() {
      const source = fs.readFileSync('src/lib/team-storage.ts', 'utf8');

      assert.match(source, /let offset = 0/);
      assert.match(source, /offset \+= page\.length/);
      assert.match(source, /page\.length < STORAGE_LIST_PAGE_SIZE/);
    },
  },
  {
    name: 'web supabase: push aceita evento fechado e bloqueia conteudo arbitrario',
    run() {
      const edge = fs.readFileSync('supabase/functions/enviar-push/index.ts', 'utf8');
      const client = fs.readFileSync('src/services/notifications/push-subscriptions.ts', 'utf8');

      assert.match(edge, /EVENTOS_PERMITIDOS/);
      assert.match(edge, /consume_team_push_quota/);
      assert.match(edge, /Apenas gestores do time podem enviar avisos/);
      assert.doesNotMatch(client, /title: string|body: string|url\?: string/);
    },
  },
];
