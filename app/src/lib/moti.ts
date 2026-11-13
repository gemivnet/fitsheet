/**
 * Moti 0.30's `transition` types do not accept any `{ type: ... }` object under
 * react-native-reanimated 4.7 (Expo SDK 58), although the runtime accepts them
 * unchanged. Wrapping the literal here keeps the call sites readable until Moti
 * ships types for the newer Reanimated.
 */
export function transition(config: object): never {
  return config as never;
}
