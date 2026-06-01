import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  useAnimatedStyle,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight } from '@/constants/theme';
import { RARITY_COLORS, RARITY_LABELS, type BadgeDefinition } from '@/lib/gamification';

interface BadgeCardProps {
  badge: BadgeDefinition;
  unlocked: boolean;
  size?: 'small' | 'large';
  earnedAt?: string;
  style?: object;
}

export function BadgeCard({ badge, unlocked, size = 'small', earnedAt, style }: BadgeCardProps) {
  const isLarge = size === 'large';
  const dimension = isLarge ? 110 : 76;
  const shineWidth = Math.round(dimension * 0.6);

  const shineX = useSharedValue(-shineWidth);

  useEffect(() => {
    if (unlocked) {
      shineX.value = -shineWidth;
      shineX.value = withRepeat(
        withSequence(
          withTiming(dimension + shineWidth, { duration: 750, easing: Easing.ease }),
          withDelay(2750, withTiming(-shineWidth, { duration: 1 })),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(shineX);
    }
  }, [unlocked]);

  const shineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shineX.value }],
  }));

  const borderColor = unlocked ? RARITY_COLORS[badge.rarity] : Colors.border;
  const iconSize = isLarge ? 28 : 20;
  const iconName = unlocked ? badge.icon : 'lock-closed-outline';
  const iconColor = unlocked ? RARITY_COLORS[badge.rarity] : Colors.textMuted;

  return (
    <View
      style={[
        styles.container,
        {
          width: dimension,
          height: isLarge ? dimension + 32 : dimension,
          borderColor,
          opacity: unlocked ? 1 : 0.4,
        },
        style,
      ]}
    >
      <View style={[styles.iconWrap, { width: isLarge ? 56 : 40, height: isLarge ? 56 : 40 }]}>
        <Ionicons
          name={iconName as React.ComponentProps<typeof Ionicons>['name']}
          size={iconSize}
          color={iconColor}
        />
      </View>

      {isLarge && (
        <>
          <Text style={styles.title} numberOfLines={2}>
            {badge.title}
          </Text>
          <View style={[styles.rarityChip, { backgroundColor: `${borderColor}33` }]}>
            <Text style={[styles.rarityText, { color: borderColor }]}>
              {RARITY_LABELS[badge.rarity]}
            </Text>
          </View>
          {unlocked && earnedAt && (
            <Text style={styles.earnedDate}>
              {new Date(earnedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
            </Text>
          )}
        </>
      )}

      {unlocked && (
        <Animated.View
          style={[styles.shineTrack, { width: shineWidth }, shineStyle]}
          pointerEvents="none"
        >
          {/* Skewed inner view keeps the diagonal effect separate from the translation */}
          <View style={styles.shineBand}>
            <View style={styles.shineFade} />
            <View style={styles.shineCore} />
            <View style={styles.shineFade} />
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    overflow: 'hidden',
  },
  iconWrap: {
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    color: Colors.textPrimary,
    textAlign: 'center',
    lineHeight: 14,
  },
  rarityChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  rarityText: {
    fontSize: 9,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  earnedDate: {
    fontSize: 9,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 1,
  },
  shineTrack: {
    position: 'absolute',
    top: -6,
    bottom: -6,
  },
  shineBand: {
    flex: 1,
    flexDirection: 'row',
    transform: [{ skewX: '-20deg' }],
  },
  shineFade: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  shineCore: {
    flex: 2,
    backgroundColor: 'rgba(255,255,255,0.20)',
  },
});
