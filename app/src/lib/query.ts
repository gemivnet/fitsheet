import { MutationCache, QueryClient } from '@tanstack/react-query';
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
    queries: { retry: 1, staleTime: 10_000, refetchOnWindowFocus: false },
  },
  mutationCache: new MutationCache({
    onError: (err, _vars, _ctx, mutation) => {
      if (mutation.meta?.suppressErrorToast) return;
      showToast(friendly(err), { kind: 'error' });
    },
  }),
});
