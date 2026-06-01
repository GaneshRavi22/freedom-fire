import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  withSpring,
  withTiming,
  withDelay,
  useAnimatedStyle,
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight } from '@/constants/theme';

interface RewardToastProps {
  visible: boolean;
  xpEarned: number;
  freedomDaysEarned?: number;
  message: string;
  onHide: () => void;
}

export function RewardToast({
  visible,
  xpEarned,
  freedomDaysEarned,
  message,
  onHide,
}: RewardToastProps) {
  const translateY = useSharedValue(100);
  const opacity = useSharedValue(0);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      translateY.value = withSpring(0, { damping: 14, stiffness: 180 });
      opacity.value = withTiming(1, { duration: 200 });
      // Auto-hide after 2.8s
      opacity.value = withDelay(
        2800,
        withTiming(0, { duration: 300 }, (finished) => {
          if (finished) runOnJS(onHide)();
        })
      );
      translateY.value = withDelay(2800, withTiming(100, { duration: 300 }));
    } else {
      translateY.value = 100;
      opacity.value = 0;
      setRendered(false);
    }
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!rendered) return null;

  return (
    <Animated.View style={[styles.container, animStyle]} pointerEvents="none">
      <View style={styles.iconWrap}>
        <Ionicons name="flash" size={18} color={Colors.warning} />
      </View>
      <View style={styles.body}>
        <Text style={styles.message} numberOfLines={1}>
          {message}
        </Text>
        <View style={styles.chips}>
          {xpEarned > 0 && (
            <Text style={styles.xpChip}>+{xpEarned} XP</Text>
          )}
          {freedomDaysEarned && freedomDaysEarned > 0 ? (
            <Text style={styles.fdChip}>+{freedomDaysEarned} Freedom Days</Text>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 88,
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceHigh,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: `${Colors.warning}44`,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    backgroundColor: `${Colors.warning}22`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 3,
  },
  message: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
    color: Colors.textPrimary,
  },
  chips: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  xpChip: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.warning,
  },
  fdChip: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.success,
  },
});
