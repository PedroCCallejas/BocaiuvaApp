import { supabase } from '@/config/supabase/client';

export async function downloadMyData() {
  if (!supabase) {
    throw new Error('O serviço de dados não está disponível.');
  }

  const { data, error } = await supabase.functions.invoke('exportar-dados', {
    body: {},
  });

  if (error) {
    throw new Error('Não foi possível preparar seus dados para download.');
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `professo-fc-meus-dados-${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
