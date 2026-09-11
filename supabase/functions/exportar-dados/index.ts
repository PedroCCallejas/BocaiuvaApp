import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

interface ConsultaResultado {
  data: unknown;
  error: unknown;
}

type Consulta = PromiseLike<ConsultaResultado>;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return resposta({ erro: 'Use POST.' }, 405);

  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    return resposta({ erro: 'Autenticação obrigatória.' }, 401);
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
  });
  const serviceClient = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: user, error: userError } = await userClient.from('users').select('*').maybeSingle();

  if (userError || !user) return resposta({ erro: 'Conta não encontrada.' }, 403);

  const [membershipsResult, playersResult] = await Promise.all([
    serviceClient.from('team_members').select('*').eq('user_id', user.id),
    serviceClient.from('players').select('*').eq('linked_user_id', user.id),
  ]);

  if (membershipsResult.error || playersResult.error) {
    return resposta({ erro: 'Não foi possível preparar a exportação.' }, 500);
  }

  const playerIds = (playersResult.data ?? []).map((player) => player.id);
  const queries: Array<readonly [string, Consulta]> = [
    ['partidas_criadas', serviceClient.from('matches').select('*').eq('created_by', user.id)],
    ['resenhas', serviceClient.from('match_diary_entries').select('*').eq('author_user_id', user.id)],
    ['despesas_criadas', serviceClient.from('expenses').select('*').eq('created_by', user.id)],
    ['assinaturas_push', serviceClient.from('push_subscriptions').select('*').eq('user_id', user.id)],
    [
      'notificacoes',
      serviceClient
        .from('notifications')
        .select('*')
        .or(`actor_user_id.eq.${user.id},target_user_id.eq.${user.id}`),
    ],
    ...(playerIds.length > 0
      ? [
      ['presencas', serviceClient.from('attendance').select('*').in('player_id', playerIds)],
      ['votos_mvp', serviceClient.from('mvp_votes').select('*').in('voter_player_id', playerIds)],
      [
        'avaliacoes_enviadas',
        serviceClient.from('player_ratings').select('*').in('rater_player_id', playerIds),
      ],
        ]
      : []),
  ];

  const resultados = await Promise.all(
    queries.map(async ([nome, consulta]) => {
      const { data, error } = await consulta;
      if (error) throw error;
      return [nome, data ?? []] as const;
    }),
  ).catch(() => null);

  if (!resultados) return resposta({ erro: 'Não foi possível concluir a exportação.' }, 500);

  return resposta({
    exportedAt: new Date().toISOString(),
    account: user,
    memberships: membershipsResult.data ?? [],
    linkedPlayers: playersResult.data ?? [],
    records: Object.fromEntries(resultados),
  });
});
