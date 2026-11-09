import { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { useAppStore } from '@/store/app-store';
import { selectCurrentTeam, selectCurrentUser, selectCanManageTeam } from '@/store/selectors';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useTeamCash } from '@/hooks/use-team-cash';
import { cashAmount, cashTotal, type TeamCashEntry } from '@/lib/team-cash';
import { formatCentsBRL, formatCentsForInput } from '@/lib/money';
import { formatDateBR } from '@/lib/date';
import { saveTeamCash } from '@/services/repository/supabase/caixa';

export default function CashScreen() {
  const team = useAppStore(selectCurrentTeam);
  const user = useAppStore(selectCurrentUser);
  const canManage = useAppStore(selectCanManageTeam);
  if (!team || !user) return null;
  return <CashContent key={user.id + ':' + team.id} teamId={team.id} userId={user.id} canManage={canManage} />;
}

function CashContent({ teamId, userId, canManage }: { teamId: string; userId: string; canManage: boolean }) {
  const theme = useAppTheme();
  const { entries, loading, error, reload } = useTeamCash(teamId, userId);
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [editing, setEditing] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const busy = useRef(false);
  const text = { color: theme.colors.text };
  function clear() {
    setEditing(undefined); setDate(''); setAmount(''); setDescription('');
  }
  function edit(entry: TeamCashEntry) {
    setEditing(entry.id); setDate(entry.week_start); setAmount(formatCentsForInput(entry.amount_cents));
    setDescription(entry.description ?? ''); setNotice('');
  }
  async function save() {
    if (busy.current) return;
    busy.current = true; setSaving(true); setNotice('');
    try {
      await saveTeamCash({ id: editing, teamId, date, amountCents: cashAmount(amount), description });
      clear(); setNotice('Arrecadação salva.'); await reload();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Não foi possível confirmar o registro.');
    } finally { busy.current = false; setSaving(false); }
  }
  return <Screen refreshing={loading} onRefresh={() => void reload()}>
    <SectionHeader title="Caixa do time" subtitle="Total das arrecadações informadas. Despesas e cobranças individuais não são descontadas aqui." />
    <Text style={[text, { fontSize: 34, fontWeight: '800' }]} accessibilityLiveRegion="polite">
      {loading ? 'Carregando…' : error ? 'Total indisponível' : formatCentsBRL(cashTotal(entries))}
    </Text>
    {error ? <Text style={text}>{error}</Text> : null}
    <AppButton label="Atualizar caixa" variant="secondary" disabled={loading || saving} onPress={() => void reload()} />
    {canManage ? <View style={{ gap: 12 }}>
      <SectionHeader title={editing ? 'Corrigir arrecadação' : 'Registrar arrecadação semanal'} subtitle="Uma arrecadação por semana (segunda a domingo). Para corrigir um valor, use o histórico abaixo." />
      <AppInput label="Data da semana (AAAA-MM-DD)" value={date} onChangeText={setDate} placeholder="AAAA-MM-DD" editable={!saving} maxLength={10} />
      <AppInput label="Valor arrecadado (R$)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!saving} />
      <AppInput label="Descrição (opcional)" value={description} onChangeText={setDescription} maxLength={240} editable={!saving} />
      <AppButton label={editing ? 'Salvar correção' : 'Registrar arrecadação'} loading={saving} disabled={loading || !!error} onPress={() => void save()} />
      {editing ? <AppButton label="Cancelar correção" variant="ghost" disabled={saving} onPress={clear} /> : null}
    </View> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={text}>{notice}</Text> : null}
    <SectionHeader title="Histórico semanal" />
    {!loading && !error && entries.length === 0 ? <Text style={text}>Nenhuma arrecadação registrada.</Text> : null}
    {entries.map((entry) => <View key={entry.id} style={{ padding: 16, gap: 8, borderRadius: 16, backgroundColor: theme.colors.surface }}>
      <Text style={text}>Semana de {formatDateBR(entry.week_start)}</Text>
      <Text style={[text, { fontSize: 22, fontWeight: '700' }]}>{formatCentsBRL(entry.amount_cents)}</Text>
      {entry.description ? <Text style={text}>{entry.description}</Text> : null}
      {canManage ? <AppButton label="Corrigir" variant="ghost" disabled={saving} onPress={() => edit(entry)} /> : null}
    </View>)}
  </Screen>;
}
