// upload.ts — append an image to a multipart form correctly on BOTH web and native.
// On native, React Native's FormData understands the {uri,name,type} object and reads the file.
// On web, the browser's FormData coerces that object to "[object Object]" and sends no file —
// so we must fetch the blob URI into a real Blob and append that. This is why photo uploads
// (notes, labels, recipes, progress) silently failed in the PWA.

import { Platform } from 'react-native';

export async function appendImage(form: FormData, field: string, uri: string, opts?: { name?: string; type?: string }): Promise<void> {
  const name = opts?.name ?? 'image.jpg';
  if (Platform.OS === 'web') {
    const blob = await (await fetch(uri)).blob();
    form.append(field, blob, name);
  } else {
    form.append(field, { uri, name, type: opts?.type ?? 'image/jpeg' } as unknown as Blob);
  }
}
