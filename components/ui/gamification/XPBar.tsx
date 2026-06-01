import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { useSharedValue, withTiming, useAnimatedStyle } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight } from '@/constants/theme';

interface XPBarProps {
  level: number;
  levelTitle: string;
  levelIcon: string;
  levelColor: string;
  xp: number;
  currentLevelXP: number;
  nextLevelXP: number;
  style?: object;
}

export function XPBar({
  level,
  levelTitle,
  levelIcon,
  levelColor,
  xp,
  currentLevelXP,
  nextLevelXP,
  style,
}: XPBarProps) {
  const range = nextLevelXP - currentLevelXP;
  const progress = range > 0 ? Math.min((xp - currentLevelXP) / range, 1) : 1;
  const fillWidth = useSharedValue(0);

  useEffect(() => {
    fillWidth.value = withTiming(progress, { duration: 900 });
  }, [progress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${fillWidth.value * 100}%`,
  }));

  const xpInLevel = xp - currentLevelXP;
  const xpNeeded = nextLevelXP - currentLevelXP;

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.badge, { borderColor: levelColor }]}>
        <Ionicons
          name={levelIcon as React.ComponentProps<typeof Ionicons>['name']}
          size={16}
          color={levelColor}
        />
        <Text style={[styles.badgeLevel, { color: levelColor }]}>{level}</Text>
      </View>

      <View style={styles.right}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{levelTitle}</Text>
          <Text style={styles.xpText}>
            {xpInLevel} / {xpNeeded} XP
          </Text>
        </View>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, { backgroundColor: levelColor }, fillStyle]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    gap: Spacing.sm + 4,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceHigh,
    gap: 2,
  },
  badgeLevel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    lineHeight: 13,
  },
  right: {
    flex: 1,
    gap: 6,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
    color: Colors.textPrimary,
  },
  xpText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
  },
  track: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: BorderRadius.full,
  },
});
