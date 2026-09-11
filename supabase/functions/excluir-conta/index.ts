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

async function listarRecursivamente(
  client: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const encontrados: string[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });

    if (error) throw error;
    const pagina = data ?? [];

    for (const item of pagina) {
      const caminho = `${prefix}/${item.name}`;
      if (!item.id) {
        encontrados.push(...(await listarRecursivamente(client, bucket, caminho)));
      } else {
        encontrados.push(caminho);
      }
    }

    if (pagina.length < 100) break;
    offset += pagina.length;
  }

  return encontrados;
}

async function apagarEmLotes(
  client: ReturnType<typeof createClient>,
  bucket: string,
  paths: string[],
) {
  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await client.storage.from(bucket).remove(paths.slice(index, index + 100));
    if (error) throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return resposta({ erro: 'Use POST.' }, 405);

  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    return resposta({ erro: 'Autenticação obrigatória.' }, 401);
  }

  const { mode } = (await req.json().catch(() => ({}))) as {
    mode?: 'preflight' | 'finalize';
  };
  if (mode !== 'preflight' && mode !== 'finalize') {
    return resposta({ erro: 'Modo inválido.' }, 400);
  }

  const url = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
  });
  const serviceClient = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: user } = await userClient.from('users').select('id').maybeSingle();

  if (!user) return resposta({ erro: 'Conta não encontrada.' }, 403);

  const { count: ownedTeams, error: ownershipError } = await serviceClient
    .from('teams')
    .select('id', { count: 'exact', head: true })
    .eq('admin_user_id', user.id);

  if (ownershipError) return resposta({ erro: 'Não foi possível validar seus times.' }, 500);
  if ((ownedTeams ?? 0) > 0) {
    return resposta(
      { erro: 'Exclua ou transfira os times que você administra antes de apagar a conta.' },
      409,
    );
  }

  if (mode === 'preflight') return resposta({ ok: true });

  const { data: linkedPlayers, error: playersError } = await serviceClient
    .from('players')
    .select('id, team_id')
    .eq('linked_user_id', user.id);

  if (playersError) return resposta({ erro: 'Não foi possível preparar a exclusão.' }, 500);

  try {
    for (const player of linkedPlayers ?? []) {
      const videos = await listarRecursivamente(
        serviceClient,
        'player-videos',
        `${player.team_id}/${player.id}`,
      );

      await Promise.all([
        apagarEmLotes(serviceClient, 'player-photos', [
          `${player.team_id}/${player.id}.jpg`,
          `${player.team_id}/${player.id}.jpeg`,
          `${player.team_id}/${player.id}.png`,
          `${player.team_id}/${player.id}.webp`,
        ]),
        apagarEmLotes(serviceClient, 'player-videos', videos),
      ]);
    }
  } catch {
    return resposta({ erro: 'Não foi possível remover suas mídias pessoais.' }, 500);
  }

  if ((linkedPlayers ?? []).length > 0) {
    const ids = (linkedPlayers ?? []).map((player) => player.id);
    const { error: anonymizeError } = await serviceClient
      .from('players')
      .update({
        linked_user_id: null,
        linked_email: null,
        full_name: 'Jogador removido',
        nickname: 'Removido',
        photo_url: null,
        presentation_video_url: null,
        intro_video_url: null,
        celebration_video_url: null,
        bio: null,
        updated_at: new Date().toISOString(),
      })
      .in('id', ids);

    if (anonymizeError) return resposta({ erro: 'Não foi possível anonimizar seu perfil.' }, 500);
  }

  const { error: deleteError } = await serviceClient.from('users').delete().eq('id', user.id);
  if (deleteError) return resposta({ erro: 'Não foi possível remover os dados da conta.' }, 500);

  return resposta({ ok: true });
});
