/**
 * Envia Web Push para os membros de um time.
 *
 * Roda no servidor por necessidade, não por gosto: a policy `users_select_self`
 * só deixa cada conta ler a própria linha, então o celular do admin não
 * consegue ler os tokens dos outros. Enviar pelo cliente exigiria abrir os dados
 * de todo mundo para todo mundo.
 *
 * O que esta função faz de segurança, em ordem:
 *
 * 1. exige o JWT do Firebase que o app já usa;
 * 2. confere no banco que quem chamou é membro **daquele** time — sem isso,
 *    qualquer conta autenticada mandaria push para qualquer time;
 * 3. só então lê as inscrições, com service role.
 *
 * O passo 2 é o que impede a função de virar um megafone aberto. A service role
 * passa por cima da RLS: aqui dentro, a checagem é responsabilidade nossa.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

type EventoDePush = 'match-created' | 'match-finished' | 'lineup-published';

interface PedidoDeEnvio {
  teamId: string;
  matchId: string;
  event: EventoDePush;
}

const EVENTOS_PERMITIDOS = new Set<EventoDePush>([
  'match-created',
  'match-finished',
  'lineup-published',
]);

// `x-client-info` e `apikey` não são enredo: o supabase-js manda os dois em
// todo `functions.invoke`. Se o preflight não listar exatamente os cabeçalhos
// que o pedido carrega, o navegador responde 200 no OPTIONS e simplesmente
// **não envia o POST** — sem erro de servidor, sem log, sem nada. Foi o que
// aconteceu aqui: `function_edge_logs` só tinha OPTIONS 200, nenhum POST.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  if (req.method !== 'POST') {
    return resposta({ erro: 'Use POST.' }, 405);
  }

  const chavePublica = Deno.env.get('VAPID_PUBLIC_KEY');
  const chavePrivada = Deno.env.get('VAPID_PRIVATE_KEY');
  const contatoVapid = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contato@professofc.app';

  if (!chavePublica || !chavePrivada) {
    // Falha explícita: sem chave, o envio sairia sem assinatura e o navegador
    // recusaria — melhor dizer o que falta do que devolver "não enviado".
    return resposta({ erro: 'VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY não configuradas.' }, 500);
  }

  const autorizacao = req.headers.get('Authorization') ?? '';

  if (!autorizacao.startsWith('Bearer ')) {
    return resposta({ erro: 'Autenticação obrigatória.' }, 401);
  }

  let pedido: PedidoDeEnvio;

  try {
    pedido = await req.json();
  } catch {
    return resposta({ erro: 'Corpo inválido.' }, 400);
  }

  if (!pedido.teamId || !pedido.matchId || !EVENTOS_PERMITIDOS.has(pedido.event)) {
    return resposta({ erro: 'teamId, matchId e event válido são obrigatórios.' }, 400);
  }

  const url = Deno.env.get('SUPABASE_URL')!;

  // Cliente com o JWT de quem chamou: a RLS vale, e é assim que conferimos
  // quem é a pessoa sem confiar no que ela diz.
  const comoUsuario = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: autorizacao } },
  });

  // `limit(1)` não é enfeite. A policy `team_members_select` deixa membro ver
  // o time inteiro, então esta consulta volta 19 linhas no Bocaiúva — e
  // `maybeSingle()` sozinho vira erro de "mais de uma linha", que cairia no
  // `erroDoVinculo` abaixo como se fosse falha de acesso. Uma linha basta:
  // quem não é do time não enxerga nenhuma.
  const { data: usuario, error: erroDoUsuario } = await comoUsuario
    .from('users')
    .select('id')
    .maybeSingle();

  if (erroDoUsuario || !usuario) {
    return resposta({ erro: 'Não foi possível validar sua conta.' }, 403);
  }

  const { data: vinculo, error: erroDoVinculo } = await comoUsuario
    .from('team_members')
    .select('user_id, can_manage_team, roles, status')
    .eq('team_id', pedido.teamId)
    .eq('user_id', usuario.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (erroDoVinculo) {
    return resposta({ erro: 'Não foi possível validar seu acesso.' }, 500);
  }

  if (!vinculo || (!vinculo.can_manage_team && !vinculo.roles?.includes('admin'))) {
    return resposta({ erro: 'Apenas gestores do time podem enviar avisos.' }, 403);
  }

  // A partir daqui, service role: precisa ler inscrição de outras pessoas.
  const comoServico = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: partida, error: erroDaPartida } = await comoServico
    .from('matches')
    .select('id, team_id, date, time, opponent_name, status, scoreboard')
    .eq('id', pedido.matchId)
    .eq('team_id', pedido.teamId)
    .maybeSingle();

  if (erroDaPartida || !partida) {
    return resposta({ erro: 'Partida não encontrada neste time.' }, 404);
  }

  const { data: dentroDaCota, error: erroDaCota } = await comoServico.rpc(
    'consume_team_push_quota',
    {
      p_team_id: pedido.teamId,
      p_user_id: usuario.id,
      p_limit: 10,
      p_window_seconds: 300,
    },
  );

  if (erroDaCota) {
    return resposta({ erro: 'Não foi possível validar o limite de avisos.' }, 500);
  }

  if (!dentroDaCota) {
    return resposta({ erro: 'Muitos avisos em pouco tempo. Aguarde alguns minutos.' }, 429);
  }

  const dataDaPartida = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
  }).format(new Date(`${partida.date}T12:00:00Z`));
  const placar = partida.scoreboard as { team?: number; opponent?: number } | null;
  const conteudo = (() => {
    switch (pedido.event) {
      case 'match-created':
        return {
          title: 'Jogo marcado',
          body: `${dataDaPartida} às ${partida.time}, contra ${partida.opponent_name}. Confirme sua presença.`,
          tag: `partida-${partida.id}`,
        };
      case 'match-finished':
        if (partida.status !== 'finished' || !placar) {
          return null;
        }
        return {
          title: `Jogo encerrado: ${placar.team ?? 0} x ${placar.opponent ?? 0}`,
          body: `Contra ${partida.opponent_name}. A votação de MVP está aberta.`,
          tag: `mvp-${partida.id}`,
        };
      case 'lineup-published':
        return {
          title: 'Escalação publicada',
          body: `Time montado para o jogo contra ${partida.opponent_name}. Veja se você está.`,
          tag: `escalacao-${partida.id}`,
        };
    }
  })();

  if (!conteudo) {
    return resposta({ erro: 'O estado da partida não permite este aviso.' }, 409);
  }

  const { data: membros } = await comoServico
    .from('team_members')
    .select('user_id')
    .eq('team_id', pedido.teamId)
    .eq('status', 'active');

  const destinatarios = (membros ?? [])
    .map((m) => m.user_id as string)
    .filter((id) => id && id !== usuario.id);

  if (destinatarios.length === 0) {
    return resposta({ enviados: 0, removidos: 0 });
  }

  const { data: inscricoes } = await comoServico
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('user_id', destinatarios);

  if (!inscricoes || inscricoes.length === 0) {
    return resposta({ enviados: 0, removidos: 0 });
  }

  webpush.setVapidDetails(contatoVapid, chavePublica, chavePrivada);

  const payload = JSON.stringify({
    title: conteudo.title.slice(0, 100),
    body: conteudo.body.slice(0, 240),
    url: `/matches/${encodeURIComponent(partida.id)}`,
    tag: conteudo.tag,
  });

  const mortos: string[] = [];
  let enviados = 0;

  // Em paralelo, mas cada falha isolada: um endpoint morto não pode impedir os
  // outros de receber.
  await Promise.all(
    inscricoes.map(async (inscricao) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: inscricao.endpoint as string,
            keys: { p256dh: inscricao.p256dh as string, auth: inscricao.auth as string },
          },
          payload,
        );

        enviados += 1;
      } catch (erro) {
        const status = (erro as { statusCode?: number }).statusCode;

        // 404/410 = o navegador descartou a inscrição. Não é erro: é a forma
        // padrão de avisar que aquele endpoint morreu. Guardar para sempre
        // faria a lista encher de lixo e o envio ficar mais lento a cada mês.
        if (status === 404 || status === 410) {
          mortos.push(inscricao.endpoint as string);
        }
      }
    }),
  );

  if (mortos.length > 0) {
    await comoServico.from('push_subscriptions').delete().in('endpoint', mortos);
  }

  return resposta({ enviados, removidos: mortos.length });
});
