// App.tsx — fitsheet root. Loads Nunito, wires theme + safe-area + data, and gates on onboarding.

import React, { useEffect } from 'react';
import { ActivityIndicator, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { DarkTheme, DefaultTheme, NavigationContainer, type Theme as NavTheme } from '@react-navigation/native';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import {
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  Nunito_900Black,
  useFonts,
} from '@expo-google-fonts/nunito';
import { ThemeProvider, useTheme } from './src/theme';
import { RootTabs } from './src/navigation/RootTabs';
import { Companion, OfflineBanner, ReminderSync, T, ToastHost } from './src/components';
import { OnboardingScreen } from './src/screens';
import { navigationRef } from './src/navigation/ref';
import { api } from './src/lib/api';
import { persister, queryClient } from './src/lib/query';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';

  const [loaded] = useFonts({
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Nunito_900Black,
  });
  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);

  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <DataProvider>
        <SafeAreaProvider>
          <ThemeProvider>
            <Gate />
            <ReminderSync />
            <ToastHost />
            <OfflineBanner />
            <StatusBar style={dark ? 'light' : 'dark'} />
          </ThemeProvider>
        </SafeAreaProvider>
      </DataProvider>
    </GestureHandlerRootView>
  );
}

// On web we persist the read cache to localStorage (instant opens + offline viewing); on a
// platform without localStorage there's no persister, so we fall back to the plain provider.
function DataProvider({ children }: { children: React.ReactNode }) {
  if (persister) {
    return (
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 }}>
        {children}
      </PersistQueryClientProvider>
    );
  }
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function Gate() {
  const palette = useTheme();
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings.get });

  const base = palette.mode === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme: NavTheme = {
    ...base,
    colors: { ...base.colors, background: palette.bg, card: palette.surface, primary: palette.accent, border: palette.hairline, text: palette.text },
  };

  if (settings.isError) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <T w={800} size={18} style={{ textAlign: 'center', marginBottom: 8 }}>
          Can&rsquo;t reach the server
        </T>
        <T w={600} size={15} color={palette.text2} style={{ textAlign: 'center' }}>
          Make sure fitsheet is running, then pull to retry.
        </T>
      </View>
    );
  }

  if (settings.isLoading || !settings.data) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={palette.accent} />
      </View>
    );
  }

  if (!settings.data.onboarded) return <OnboardingScreen />;

  return (
    <NavigationContainer theme={navTheme} ref={navigationRef}>
      <RootTabs />
      <Companion />
    </NavigationContainer>
  );
}
