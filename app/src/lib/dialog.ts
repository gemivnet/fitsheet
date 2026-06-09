// dialog.ts — cross-platform confirm/notify. react-native's Alert is a no-op on web, so on web
// we use the browser's confirm()/alert().

import { Alert, Platform } from 'react-native';

export function confirmAction(
  title: string,
  message: string,
  onConfirm: () => void,
  opts?: { confirmText?: string; destructive?: boolean },
): void {
  if (Platform.OS === 'web') {
    const c = (globalThis as any).confirm;
    if (!c || c(message ? `${title}\n\n${message}` : title)) onConfirm();
    return;
  }
  Alert.alert(title, message || undefined, [
    { text: 'Cancel', style: 'cancel' },
    { text: opts?.confirmText ?? 'OK', style: opts?.destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}

export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    const a = (globalThis as any).alert;
    if (a) a(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
