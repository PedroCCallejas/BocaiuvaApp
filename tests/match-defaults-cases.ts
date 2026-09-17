import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  buildDefaultFieldPayment,
  buildNewMatchDefaults,
  nextWeekdayDateIso,
} from '@/lib/match-defaults';

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const MIGRATION = 'supabase/migrations/20260917210642_padroes_novas_partidas.sql';

export const matchDefaultsTestCases: TestCase[] = [
  {
    name: 'próxima quinta nunca usa a quinta de hoje',
    run() {
      assert.equal(nextWeekdayDateIso(4, new Date(2026, 8, 17, 10)), '2026-09-24');
    },
  },
  {
    name: 'próxima quinta usa o dia seguinte quando hoje é quarta',
    run() {
      assert.equal(nextWeekdayDateIso(4, new Date(2026, 8, 16, 10)), '2026-09-17');
    },
  },
  {
    name: 'dia semanal automático atravessa a virada do ano',
    run() {
      assert.equal(nextWeekdayDateIso(4, new Date(2026, 11, 31, 10)), '2027-01-07');
    },
  },
  {
    name: 'nova partida recebe local, mapa e dia configurados pelo time',
    run() {
      const defaults = buildNewMatchDefaults(
        {
          homeFieldName: 'La Macaibeira (AMAM)',
          homeFieldLocationUrl: 'https://maps.app.goo.gl/exemplo',
          defaultMatchWeekday: 4,
        },
        new Date(2026, 8, 17, 10),
      );

      assert.deepEqual(defaults, {
        date: '24/09/2026',
        venue: 'La Macaibeira (AMAM)',
        locationUrl: 'https://maps.app.goo.gl/exemplo',
      });
    },
  },
  {
    name: 'PIX da partida vence o padrão e o padrão cobre partida nova',
    run() {
      const team = {
        defaultPixKey: '65999778759',
        defaultPaymentResponsibleName: 'Alex',
      };

      assert.deepEqual(buildDefaultFieldPayment(team, null), {
        pixKey: '65999778759',
        responsibleName: 'Alex',
      });
      assert.deepEqual(
        buildDefaultFieldPayment(team, {
          payerPlayerIds: [],
          pixKey: 'outra-chave',
          responsibleName: 'Outro',
        }),
        {
          pixKey: 'outra-chave',
          responsibleName: 'Outro',
        },
      );
    },
  },
  {
    name: 'migration mantém times antigos pendentes e permite ausente por time',
    run() {
      const sql = fs.readFileSync(MIGRATION, 'utf8');

      assert.match(sql, /default_attendance_status text not null default 'pending'/);
      assert.match(sql, /check \(default_attendance_status in \('pending', 'absent'\)\)/);
      assert.match(sql, /select coalesce\(t\.default_attendance_status, 'pending'\)/);
      assert.match(sql, /v_attendance_status/);
      assert.match(sql, /revoke all on function public\.criar_partida\(jsonb, jsonb\)/);
    },
  },
];
