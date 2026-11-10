import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const url = relative => pathToFileURL(path.resolve(relative)).href;
const fatiasUrl = url('src/services/repository/supabase/fatias.ts');
const fixtureUrl = 'data:text/javascript,' + encodeURIComponent(`
  export const fixture = { user: { authId: 'A' }, team: 'um', fail: false, teamReads: 0, domainReads: 0, afterDomain: null };
`);
const stub = code => 'data:text/javascript,' + encodeURIComponent(code);
registerHooks({
  resolve(specifier, context, nextResolve) {
    let target;
    if (specifier === '@/config/supabase/client') target = stub('export const supabase = null;');
    if (specifier === '@/services/auth') target = stub(`import {fixture} from ${JSON.stringify(fixtureUrl)};
      export const authService = { getCurrentUser: () => fixture.user, restoreSession: async () => fixture.user };`);
    if (specifier === '@/services/repository/supabase/composicao/comum') target = stub(`import {fixture} from ${JSON.stringify(fixtureUrl)};
      export async function buscarTimeAtivo() { fixture.teamReads++; return fixture.team; }`);
    const layer = specifier.match(/^@\/services\/repository\/supabase\/composicao\/(financeiro|resenhas|partidas|avaliacoes|elenco|notificacoes)$/)?.[1];
    if (layer) {
      const fn = 'com' + layer[0].toUpperCase() + layer.slice(1);
      target = stub(`import {fixture} from ${JSON.stringify(fixtureUrl)};
        import {criarFatia} from ${JSON.stringify(fatiasUrl)};
        const fatia = criarFatia({ nome: '${layer}', vazio: [],
          ler: async () => {
            ${layer === 'elenco' ? '' : `fixture.domainReads++; if (!fixture.team) throw Error('sem time');`}
            if (fixture.fail && '${layer}' === 'financeiro') throw Error('sem rede');
            const value = [fixture.user.authId + ':' + fixture.team];
            if (fixture.afterDomain) { const action = fixture.afterDomain; fixture.afterDomain = null; action(); }
            return value;
          }, aplicar: (base, value) => ({ ...base, ${layer}: value }) });
        export const ${fn} = base => base;
        ${layer === 'elenco' ? 'export const fatiaDoElenco = fatia;' : ''}`);
    }
    if (target) return { url: target, shortCircuit: true };
    if (specifier.startsWith('@/')) return { url: url('src/' + specifier.slice(2) + '.ts'), shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { fixture } = await import(fixtureUrl);
const { criarRepositorioSupabase } = await import(url('src/services/repository/supabase/composicao/index.ts'));
const { invalidarCacheDasFatias, limparFatias } = await import(fatiasUrl);
const repository = criarRepositorioSupabase({ getInitialSnapshot: async () => ({}), getSnapshot: async () => ({}) });
assert.deepEqual((await repository.getInitialSnapshot()).financeiro, ['A:um']);
fixture.fail = true;
assert.deepEqual((await repository.getSnapshot()).financeiro, ['A:um'], 'falha no mesmo contexto conserva o cache');
fixture.team = 'dois';
await assert.rejects(repository.getSnapshot(), /sem rede/, 'outro time precisa de carga inicial bem-sucedida');
fixture.fail = false;
invalidarCacheDasFatias();
assert.deepEqual((await repository.getSnapshot()).financeiro, ['A:dois']);
fixture.user = { authId: 'B' };
assert.deepEqual((await repository.getSnapshot()).financeiro, ['B:dois'], 'troca de conta nao reutiliza cache');
fixture.user = null;
assert.deepEqual(await repository.getSnapshot(), {}, 'visitante recebe apenas a base');
fixture.user = { authId: 'nova' };
fixture.team = null;
const reads = fixture.domainReads;
const onboarding = await repository.getSnapshot();
assert.deepEqual(onboarding.elenco, ['nova:null']);
assert.equal(fixture.domainReads, reads, 'conta sem time nao consulta dominios que exigem time');
fixture.team = 'tres';
fixture.afterDomain = () => { fixture.team = 'quatro'; };
await assert.rejects(repository.getSnapshot(), /time ativo mudou/, 'troca externa durante leitura nao monta snapshot misturado');
limparFatias();
console.log('PASS: composicao real com IO simulado; conta/time, falha, visitante e onboarding.');
