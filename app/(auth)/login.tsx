import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/services/supabase';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius } from '@/constants/theme';
import { GradientButton } from '@/components/ui/layout/GradientButton';
import { InputField } from '@/components/ui/inputs/InputField';
import { FunanceLogo } from '@/components/ui/layout/FunanceLogo';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type FormData = z.infer<typeof schema>;

export default function LoginScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    setLoading(false);
    if (error) Alert.alert('Login Failed', error.message);
  };

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: 'freedomfire:///(tabs)/' },
    });
    if (error) Alert.alert('Google Login Failed', error.message);
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
          <Text style={styles.title}>Welcome back!</Text>
          <Text style={styles.subtitle}>Sign in to continue your FIRE journey</Text>
        </View>

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
              placeholder="Enter your password"
              value={value}
              onChangeText={onChange}
              isPassword
              textContentType="password"
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect={false}
              error={errors.password?.message}
            />
          )}
        />

        <TouchableOpacity style={styles.forgotBtn}>
          <Text style={styles.forgotText}>Forgot Password?</Text>
        </TouchableOpacity>

        <GradientButton
          title="Log In  →"
          onPress={handleSubmit(onSubmit)}
          loading={loading}
          style={styles.loginBtn}
        />

        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.divider} />
        </View>

        <TouchableOpacity style={styles.googleBtn} onPress={handleGoogleLogin}>
          <Text style={styles.googleIcon}>G</Text>
          <Text style={styles.googleText}>Continue with Google</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.signupLink}
          onPress={() => router.push('/(auth)/signup')}
        >
          <Text style={styles.signupLinkText}>
            New here?{' '}
            <Text style={styles.signupLinkBold}>Sign Up</Text>
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
  backBtn: {
    marginBottom: Spacing.xl,
  },
  backIcon: {
    color: Colors.textSecondary,
    fontSize: FontSize.xl,
  },
  header: {
    marginBottom: Spacing.xl,
    gap: Spacing.md,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.base,
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginBottom: Spacing.lg,
    marginTop: -Spacing.sm,
  },
  forgotText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
  },
  loginBtn: {
    marginBottom: Spacing.lg,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    marginHorizontal: Spacing.md,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginBottom: Spacing.xl,
  },
  googleIcon: {
    color: '#EA4335',
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    marginRight: Spacing.sm,
  },
  googleText: {
    color: Colors.textPrimary,
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
  },
  signupLink: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  signupLinkText: {
    color: Colors.textSecondary,
    fontSize: FontSize.base,
  },
  signupLinkBold: {
    color: Colors.primary,
    fontWeight: FontWeight.semiBold,
  },
});
