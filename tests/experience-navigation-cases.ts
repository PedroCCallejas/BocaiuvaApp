import { getScreenBackFallback, navigateScreenBack } from '@/lib/screen-back-navigation';
import assert from 'node:assert/strict';
import { getSafeReturnPath } from '@/lib/navigation';
import { createSingleFlight } from '@/lib/single-flight';
import { PICKUP_TOOLS_STORAGE_KEY, scopePickupToolsToAccount, usePickupToolsStore } from '@/store/pickup-tools-store';
import { mockAuthService } from '@/services/auth/mock-auth-service';
import { mockRepository, resetMockRepositoryState } from '@/services/repository/mock-repository';
import { selectCurrentTeam, selectCurrentMembership, selectTeamPlayers, selectTeamMatches, selectActiveTeamRatingCriteria } from '@/store/selectors';

export const experienceNavigationTestCases = [
  { name: 'voltar fica oculto nas raizes e mantem destinos seguros em links diretos', run() {
    for (const path of ['/', '/home', '/players', '/matches', '/stats', '/rankings', '/financeiro', '/profile', '/team-access', '/login']) {
      assert.equal(getScreenBackFallback(path, true), null, path);
    }
    for (const [path, expected] of [
      ['/players/create', '/players'], ['/players/p1/edit', '/players/p1'],
      ['/matches/create', '/matches'], ['/matches/import', '/matches'],
      ['/matches/register-legacy', '/matches'], ['/matches/m1', '/matches'],
      ['/matches/m1/finish', '/matches/m1'], ['/matches/m1/ratings', '/matches/m1'],
      ['/lineup/m1', '/matches/m1'], ['/team-invite', '/team-settings'],
      ['/team-rating-criteria', '/team-settings'], ['/team-setup', '/team-access'],
      ['/caixa', '/home'], ['/account', '/home'], ['/teams/t1/public', '/teams-gallery'],
    ]) assert.equal(getScreenBackFallback(path, true), expected, path);
    assert.equal(getScreenBackFallback('/account', false), '/team-access');
    assert.equal(getScreenBackFallback('/teams-gallery', false), '/');
  } },
  { name: 'voltar usa historico interno ou substitui link direto sem empilhar telas', run() {
    const actions: string[] = [];
    const navigation = { canGoBack: () => true, back: () => { actions.push('back'); }, replace: (href: never) => { actions.push(href); } };
    navigateScreenBack(navigation, '/matches');
    assert.deepEqual(actions, ['back']);
    navigation.canGoBack = () => false;
    navigateScreenBack(navigation, '/matches');
    assert.deepEqual(actions, ['back', '/matches']);
  } },
  { name: 'troca de time A para B e volta preserva contexto, elenco, partidas e criterios corretos', async run() {
    resetMockRepositoryState();
    try {
      const user = await mockRepository.login({ email: 'admin@bocaiuva.app', password: '123456' });
      const before = await mockRepository.getInitialSnapshot();
      const originalContext = { snapshot: before, currentUserId: user.id };
      const originalPlayers = selectTeamPlayers(originalContext).map(player => player.id);
      const originalMatches = selectTeamMatches(originalContext).map(match => match.id);
      const originalCriteria = selectActiveTeamRatingCriteria(originalContext).map(criterion => criterion.id);
      await mockRepository.joinTeamWithInviteCode('SERR26', user.id);
      await mockRepository.setActiveTeam('team-serrano', user.id);
      const switched = { snapshot: await mockRepository.getSnapshot(), currentUserId: user.id };
      assert.equal(selectCurrentTeam(switched)?.id, 'team-serrano');
      assert.equal(selectCurrentMembership(switched)?.teamId, 'team-serrano');
      assert.equal(selectTeamPlayers(switched).every(player => player.teamId === 'team-serrano'), true);
      assert.equal(selectTeamMatches(switched).every(match => match.teamId === 'team-serrano'), true);
      assert.equal(selectActiveTeamRatingCriteria(switched).every(criterion => criterion.teamId === 'team-serrano'), true);
      await mockRepository.setActiveTeam('team-bocaiuva', user.id);
      const restored = { snapshot: await mockRepository.getSnapshot(), currentUserId: user.id };
      assert.equal(selectCurrentTeam(restored)?.id, 'team-bocaiuva');
      assert.deepEqual(selectTeamPlayers(restored).map(player => player.id), originalPlayers);
      assert.deepEqual(selectTeamMatches(restored).map(match => match.id), originalMatches);
      assert.deepEqual(selectActiveTeamRatingCriteria(restored).map(criterion => criterion.id), originalCriteria);
      await assert.rejects(mockRepository.setActiveTeam('time-sem-acesso', user.id), /participa/);
      assert.equal(selectCurrentTeam({ snapshot: await mockRepository.getSnapshot(), currentUserId: user.id })?.id, 'team-bocaiuva');
    } finally { resetMockRepositoryState(); }
  } },
  { name: 'sessão demonstrativa mantém usuário restaurável e informa entrada e saída aos listeners', async run() {
    resetMockRepositoryState();
    await mockAuthService.logout();
    const events: (string | null)[] = [];
    const unsubscribe = mockAuthService.subscribe(user => events.push(user?.authId ?? null));
    try {
      const user = await mockAuthService.login({ email: 'admin@bocaiuva.app', password: '123456' });
      assert.equal((await mockAuthService.restoreSession())?.authId, user.authId);
      await mockAuthService.logout();
      assert.equal(await mockAuthService.restoreSession(), null);
      assert.deepEqual(events, [user.authId, null]);
    } finally {
      unsubscribe();
      resetMockRepositoryState();
    }
  } },
  { name: 'retorno após login aceita ferramenta e recusa URLs externas ou malformadas', run() {
    assert.equal(getSafeReturnPath('/ferramentas/cronometro-pelada'), '/ferramentas/cronometro-pelada');
    assert.equal(getSafeReturnPath('/account'), '/account');
    assert.equal(getSafeReturnPath('/ferramentas/%2e%2e/login'), '/');
    assert.equal(getSafeReturnPath('/ferramentas/desconhecida'), '/');
    for (const value of ['https://example.com', '//example.com', '/ferramentasevil', '/ferramentas/../login', '/ferramentas?next=external', '/ferramentas\\evil', ['/account']]) assert.equal(getSafeReturnPath(value), '/');
  } },
  { name: 'inicialização concorrente compartilha tarefa e permite repetir depois de erro', async run() {
    const run = createSingleFlight();
    let calls = 0;
    const task = async () => { calls += 1; throw new Error('offline'); };
    const first = run(task);
    const second = run(task);
    assert.equal(first, second);
    await Promise.all([assert.rejects(first, /offline/), assert.rejects(second, /offline/)]);
    assert.equal(calls, 1);
    await run(async () => { calls += 1; });
    assert.equal(calls, 2);
  } },
  { name: 'pelada preserva conta e não expõe legado anônimo ou outra conta', run() {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) };
    data.set(PICKUP_TOOLS_STORAGE_KEY, JSON.stringify({ teamAScore: 99 }));
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage } });
    try {
      scopePickupToolsToAccount('test-alice');
      assert.equal(usePickupToolsStore.getState().teamAScore, 0);
      usePickupToolsStore.getState().configureTimer(600_000, 0);
      usePickupToolsStore.getState().startTimer();
      usePickupToolsStore.getState().addGoal('A');
      const timestamp = usePickupToolsStore.getState().startedAt;
      scopePickupToolsToAccount('test-alice');
      assert.equal(usePickupToolsStore.getState().startedAt, timestamp);
      scopePickupToolsToAccount('test-bob');
      assert.equal(usePickupToolsStore.getState().teamAScore, 0);
      assert.equal(usePickupToolsStore.getState().isRunning, false);
      scopePickupToolsToAccount('test-alice');
      assert.equal(usePickupToolsStore.getState().teamAScore, 1);
      assert.equal(usePickupToolsStore.getState().startedAt, timestamp);
      scopePickupToolsToAccount(null);
      assert.equal(usePickupToolsStore.getState().isRunning, false);
      assert.equal(JSON.parse(data.get(PICKUP_TOOLS_STORAGE_KEY)!).teamAScore, 99);
    } finally {
      if (previous) Object.defineProperty(globalThis, 'window', previous);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  } },
];
