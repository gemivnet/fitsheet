import { MutationCache, QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import type { Persister } from '@tanstack/react-query-persist-client';
import { showToast } from '../components/Toast';

// One friendly line per failure class — every mutation in the app gets this for free.
// Screens that render their own inline error set `meta: { suppressErrorToast: true }`.
function friendly(err: unknown): string {
  const status = (err as { status?: number })?.status;
  if (status === 503) return 'AI is off on the server — everything else still works.';
  if (status == null) return 'Couldn’t reach the server — that change wasn’t saved.';
  return 'Something went wrong — that change wasn’t saved.';
}

export const queryClient = new QueryClient({
  defaultOptions: {
    // gcTime ≥ the persist maxAge so cached reads survive long enough to be written to
    // localStorage and restored on the next open (instant load + offline viewing).
    queries: { retry: 1, staleTime: 10_000, gcTime: 1000 * 60 * 60 * 24, refetchOnWindowFocus: false },
  },
  mutationCache: new MutationCache({
    onError: (err, _vars, _ctx, mutation) => {
      if (mutation.meta?.suppressErrorToast) return;
      showToast(friendly(err), { kind: 'error' });
    },
  }),
});

// Persist the read cache to localStorage on web so the app opens with last-known data and
// stays viewable offline. Native has no localStorage → no persister (PersistQueryClientProvider
// falls back to a plain provider when persister is undefined).
export const persister: Persister | undefined =
  typeof window !== 'undefined' && window.localStorage
    ? createSyncStoragePersister({ storage: window.localStorage, key: 'fitsheet-cache' })
    : undefined;
