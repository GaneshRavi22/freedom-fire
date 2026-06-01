import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/services/supabase';
import { Colors, FontSize, FontWeight, Spacing } from '@/constants/theme';
import { GradientButton } from '@/components/ui/layout/GradientButton';

export default function VerifyEmailScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const router = useRouter();
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (countdown <= 0) {
      setCanResend(true);
      return;
    }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleResend = async () => {
    if (!canResend || !email) return;
    setResending(true);
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    setResending(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setCountdown(60);
      setCanResend(false);
      Alert.alert('Sent!', 'A new verification email has been sent.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons name="mail-open-outline" size={44} color={Colors.primary} />
      </View>

      <Text style={styles.title}>Check your inbox!</Text>
      <Text style={styles.subtitle}>
        We've sent a verification link to
      </Text>
      <Text style={styles.email}>{email}</Text>
      <Text style={styles.instructions}>
        Click the link in the email to verify your account and get started.
      </Text>

      <GradientButton
        title="I've Verified My Email  →"
        onPress={() => router.replace('/(auth)/login')}
        style={styles.btn}
      />

      <TouchableOpacity
        onPress={handleResend}
        disabled={!canResend}
        style={styles.resendBtn}
      >
        <Text style={[styles.resendText, !canResend && styles.resendDisabled]}>
          {canResend
            ? "Didn't get it? Resend"
            : `Resend in 0:${String(countdown).padStart(2, '0')}`}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
        <Text style={styles.backText}>← Back to Login</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.base,
    textAlign: 'center',
  },
  email: {
    color: Colors.primary,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
    marginTop: 4,
    marginBottom: Spacing.md,
  },
  instructions: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.xl,
  },
  btn: { width: '100%', marginBottom: Spacing.md },
  resendBtn: { marginBottom: Spacing.lg },
  resendText: {
    color: Colors.primary,
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
  },
  resendDisabled: { color: Colors.textMuted },
  backText: { color: Colors.textSecondary, fontSize: FontSize.sm },
});
