import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  ActivityIndicator,
  View,
} from 'react-native';
import { Colors, FontSize, FontWeight, BorderRadius, Spacing } from '@/constants/theme';

interface Props {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  variant?: 'primary' | 'secondary' | 'outline';
}

export function GradientButton({ title, onPress, loading, disabled, style, variant = 'primary' }: Props) {
  const isPrimary = variant === 'primary';
  const isOutline = variant === 'outline';

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[
        styles.button,
        isPrimary && styles.primaryButton,
        isOutline && styles.outlineButton,
        variant === 'secondary' && styles.secondaryButton,
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? '#fff' : Colors.primary} size="small" />
      ) : (
        <Text style={[styles.text, isOutline && styles.outlineText]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 54,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  secondaryButton: {
    backgroundColor: Colors.surfaceHigh,
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  text: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
    letterSpacing: 0.3,
  },
  outlineText: {
    color: Colors.primary,
  },
  disabled: {
    opacity: 0.5,
  },
});
