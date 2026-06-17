// url.ts — open an external link, tolerantly. A link pasted without a scheme ("youtube.com/…")
// makes Linking.openURL reject silently, so we add https:// when it's missing.

import { Linking } from 'react-native';

export function openUrl(url: string | null | undefined): void {
  const u = (url ?? '').trim();
  if (!u) return;
  Linking.openURL(/^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : `https://${u}`).catch(() => {});
}
