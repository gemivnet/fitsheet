// ref.ts — a navigation ref so app-wide chrome (Marmalade) can navigate from outside any screen.
import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootTabParams } from './types';

export const navigationRef = createNavigationContainerRef<RootTabParams>();

// Loosely typed on purpose — callers are app-level chrome, not screens, so the strict
// nested-params overloads aren't worth fighting here.
export function navigate(name: string, params?: object): void {
  if (navigationRef.isReady()) (navigationRef.navigate as (n: string, p?: object) => void)(name, params);
}
