import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, BorderRadius, Spacing } from '@/constants/theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  elevated?: boolean;
  gradient?: boolean;
}

export function Card({ children, style, elevated }: Props) {
  return (
    <View style={[styles.card, elevated && styles.elevated, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  elevated: {
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
});
