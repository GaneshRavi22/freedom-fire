import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Linking,
} from 'react-native';

const PRIVACY_POLICY_URL = 'https://sandy-spike-86d.notion.site/FreedomFire-Privacy-Policy-36eeffe8da2c801e87dbffdf26fb5c1e';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/services/supabase';
import { useOnboardingStore } from '@/stores/onboarding.store';
import { Colors, FontSize, FontWeight, Spacing } from '@/constants/theme';
import { GradientButton } from '@/components/ui/layout/GradientButton';
import { InputField } from '@/components/ui/inputs/InputField';
import { FunanceLogo } from '@/components/ui/layout/FunanceLogo';

const schema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Enter a valid email'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

type FormData = z.infer<typeof schema>;

export default function SignupScreen() {
  const router = useRouter();
  const { pending } = useOnboardingStore();
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    if (!agreed) {
      Alert.alert('Terms Required', 'Please agree to our Terms & Privacy Policy');
      return;
    }
    setLoading(true);
    const { data: authData, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { name: data.name, age: pending?.age ?? 27 },
      },
    });
    setLoading(false);

    if (error) {
      Alert.alert('Signup Failed', error.message);
      return;
    }

    // Navigate unconditionally — Supabase returns user: null when the email is
    // already registered (to prevent enumeration) but still sends a confirmation
    // email, so we always want to show the verify screen.
    router.push({
      pathname: '/(auth)/verify-email',
      params: { email: data.email },
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior="padding"
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <FunanceLogo size={44} showText textSize={FontSize.xl} />
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>
            Join thousands on their FIRE journey
          </Text>
        </View>

        <Controller
          control={control}
          name="name"
          render={({ field: { onChange, value } }) => (
            <InputField
              label="Full Name"
              icon="person-outline"
              placeholder="John Doe"
              value={value}
              onChangeText={onChange}
              textContentType="name"
              autoComplete="name"
              error={errors.name?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, value } }) => (
            <InputField
              label="Email address"
              icon="mail-outline"
              placeholder="you@example.com"
              value={value}
              onChangeText={onChange}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              autoComplete="email"
              error={errors.email?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, value } }) => (
            <InputField
              label="Password"
              icon="lock-closed-outline"
              placeholder="At least 8 characters"
              value={value}
              onChangeText={onChange}
              isPassword
              textContentType="newPassword"
              autoComplete="new-password"
              autoCapitalize="none"
              autoCorrect={false}
              error={errors.password?.message}
            />
          )}
        />

        <Controller
          control={control}
          name="confirmPassword"
          render={({ field: { onChange, value } }) => (
            <InputField
              label="Confirm Password"
              icon="lock-closed-outline"
              placeholder="Re-enter password"
              value={value}
              onChangeText={onChange}
              isPassword
              textContentType="newPassword"
              autoComplete="new-password"
              autoCapitalize="none"
              autoCorrect={false}
              error={errors.confirmPassword?.message}
            />
          )}
        />

        <View style={styles.checkRow}>
          <TouchableOpacity
            style={[styles.checkbox, agreed && styles.checkboxChecked]}
            onPress={() => setAgreed(!agreed)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {agreed && <Text style={styles.checkmark}>✓</Text>}
          </TouchableOpacity>
          <Text style={styles.checkText}>
            <Text onPress={() => setAgreed(!agreed)}>{'I agree to '}</Text>
            <Text style={styles.link} onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
              Terms & Privacy Policy
            </Text>
          </Text>
        </View>

        <GradientButton
          title="Create Account  →"
          onPress={handleSubmit(onSubmit)}
          loading={loading}
          disabled={!agreed}
          style={styles.createBtn}
        />

        <TouchableOpacity
          style={styles.loginLink}
          onPress={() => router.push('/(auth)/login')}
        >
          <Text style={styles.loginLinkText}>
            Already a member?{' '}
            <Text style={styles.loginLinkBold}>Log In</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingTop: 60,
    paddingBottom: Spacing.xxl,
  },
  backBtn: { marginBottom: Spacing.xl },
  backIcon: { color: Colors.textSecondary, fontSize: FontSize.xl },
  header: { marginBottom: Spacing.xl, gap: Spacing.md },
  title: {
    color: Colors.textPrimary,
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.xs,
  },
  subtitle: { color: Colors.textSecondary, fontSize: FontSize.base },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.border,
    marginRight: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: FontWeight.bold },
  checkText: { color: Colors.textSecondary, fontSize: FontSize.sm, flex: 1 },
  link: { color: Colors.primary },
  createBtn: { marginBottom: Spacing.md },
  loginLink: { alignItems: 'center', paddingVertical: Spacing.sm },
  loginLinkText: { color: Colors.textSecondary, fontSize: FontSize.base },
  loginLinkBold: { color: Colors.primary, fontWeight: FontWeight.semiBold },
});
