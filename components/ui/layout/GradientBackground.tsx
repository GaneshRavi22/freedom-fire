import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Colors } from '@/constants/theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
}

// Simulated gradient using overlapping views (LinearGradient requires native module)
export function GradientBackground({ children, style }: Props) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.gradientOverlay} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
});
