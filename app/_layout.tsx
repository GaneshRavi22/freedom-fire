import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import * as Sentry from '@sentry/react-native';
import { supabase } from '@/services/supabase';
import { useAuthStore } from '@/stores/auth.store';
import { useOnboardingStore } from '@/stores/onboarding.store';
import { useFireStore } from '@/stores/fire.store';
import { useTasksStore } from '@/stores/tasks.store';
import { useFeaturesStore } from '@/stores/features.store';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: __DEV__ ? 'development' : 'production',
  sendDefaultPii: true,
  enableLogs: true,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],
});

async function persistPendingOnboarding(userId: string) {
  const { loadPending, clearPending } = useOnboardingStore.getState();
  await loadPending();
  const { pending } = useOnboardingStore.getState();
  if (!pending) return;

  // OnboardingPayload field names now match the DB columns directly — no renaming.
  const { age: _age, ...planFields } = pending;
  const { saveCalculation } = useFireStore.getState();
  await saveCalculation(userId, planFields);

  // Seed loan-related tasks from onboarding data (prepay_loan, reduce_loan_tenure)
  const savedCalculation = useFireStore.getState().calculation;
  if (savedCalculation) {
    const { seedInsightTasks } = useTasksStore.getState();
    await seedInsightTasks(userId, null, savedCalculation);
  }

  await clearPending();
}

export default function RootLayout() {
  const { setSession, session } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    useFeaturesStore.getState().fetchFeatures();
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        // Stale or revoked refresh token — clear it so the user gets a clean
        // login prompt instead of a persistent AuthApiError on every launch.
        supabase.auth.signOut();
      }
      setSession(session ?? null);
      setIsLoaded(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session && _event === 'SIGNED_IN') {
        await persistPendingOnboarding(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!session && !inAuthGroup) {
      router.replace('/(auth)');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [isLoaded, session, segments]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" backgroundColor="transparent" translucent />
      <Stack screenOptions={{ headerShown: false }} />
    </GestureHandlerRootView>
  );
}
