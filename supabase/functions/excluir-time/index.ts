import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};
const BUCKETS = [
  'team-logos',
  'team-banners',
  'team-videos',
  'player-photos',
  'player-videos',
];

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
      const caminho = prefix ? `${prefix}/${item.name}` : item.name;
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return resposta({ erro: 'Use POST.' }, 405);

  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) {
    return resposta({ erro: 'Autenticação obrigatória.' }, 401);
  }

  const { teamId } = (await req.json().catch(() => ({}))) as { teamId?: string };
  if (!teamId) return resposta({ erro: 'teamId é obrigatório.' }, 400);

  const url = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
  });
  const serviceClient = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: user } = await userClient.from('users').select('id').maybeSingle();

  if (!user) return resposta({ erro: 'Conta não encontrada.' }, 403);

  const { data: team, error: teamError } = await userClient
    .from('teams')
    .select('id, admin_user_id')
    .eq('id', teamId)
    .maybeSingle();

  if (teamError) return resposta({ erro: 'Não foi possível validar o time.' }, 500);
  if (!team || team.admin_user_id !== user.id) {
    return resposta({ erro: 'Apenas o proprietário pode excluir o time.' }, 403);
  }

  const { error: deleteError } = await serviceClient.from('teams').delete().eq('id', teamId);
  if (deleteError) return resposta({ erro: 'Não foi possível excluir o time.' }, 500);

  let storageCleanupWarning = false;

  for (const bucket of BUCKETS) {
    try {
      const paths = await listarRecursivamente(serviceClient, bucket, teamId);
      for (let index = 0; index < paths.length; index += 100) {
        const { error } = await serviceClient.storage
          .from(bucket)
          .remove(paths.slice(index, index + 100));
        if (error) throw error;
      }
    } catch {
      storageCleanupWarning = true;
    }
  }

  return resposta({ ok: true, storageCleanupWarning });
});
