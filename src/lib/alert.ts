import { Alert, Platform } from 'react-native';
import type { AlertButton } from 'react-native';

/**
 * Faz `Alert.alert` voltar a funcionar no navegador.
 *
 * O `Alert` do react-native-web é um no-op — a implementação é literalmente
 * `static alert() {}`. Como o app usa `Alert.alert` em mais de cem pontos
 * para reportar erro, toda falha na web desaparecia silenciosamente e uma
 * operação recusada parecia bem-sucedida.
 *
 * Em vez de trocar cada chamada, substituímos a implementação uma única vez
 * na inicialização. Assim todo o app passa a mostrar os avisos sem precisar
 * de alteração espalhada.
 *
 * Para erro de formulário, mensagem inline continua sendo melhor: fica
 * visível enquanto o problema existir, em vez de sumir num clique.
 */
export function installWebAlert() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return;
  }

  Alert.alert = (title, message, buttons) => {
    const text = message ? `${title}\n\n${message}` : title;

    if (!buttons || buttons.length === 0) {
      window.alert(text);
      return;
    }

    const cancelButton = buttons.find((button) => button.style === 'cancel') ?? null;
    const confirmButton =
      buttons.find((button) => button.style !== 'cancel') ?? buttons[0] ?? null;

    // Um botão só: é um aviso, não uma decisão.
    if (buttons.length === 1) {
      window.alert(text);
      confirmButton?.onPress?.();
      return;
    }

    const confirmed = window.confirm(text);
    const chosen: AlertButton | null = confirmed ? confirmButton : cancelButton;

    chosen?.onPress?.();
  };
}
