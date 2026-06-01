import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, withTiming, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/auth.store';
import { useGamificationStore } from '@/stores/gamification.store';
import { getLevelFromXP } from '@/lib/gamification';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius } from '@/constants/theme';
import { FunanceLogo } from '@/components/ui/layout/FunanceLogo';
import { useEffect } from 'react';

export function TopBar() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuthStore();
  const { xp } = useGamificationStore();

  const levelDef = getLevelFromXP(xp);
  const range = levelDef.maxXP - levelDef.minXP;
  const progress = range > 0 ? Math.min((xp - levelDef.minXP) / range, 1) : 1;

  const fillWidth = useSharedValue(0);
  useEffect(() => {
    fillWidth.value = withTiming(progress, { duration: 800 });
  }, [progress]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fillWidth.value * 100}%` as any }));

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.sm }]}>
      {/* Single row: Logo | Level | User */}
      <View style={styles.mainRow}>
        {/* Left: Logo */}
        <View style={styles.logoRow}>
          <FunanceLogo size={32} />
          <Text style={styles.appName}>
            <Text style={styles.appNameFreedom}>Freedom</Text>
            <Text style={styles.appNameFire}>Fire</Text>
          </Text>
        </View>

        {/* Center: Level info */}
        <TouchableOpacity
          style={styles.levelCenter}
          onPress={() => router.push('/(tabs)/profile')}
          activeOpacity={0.8}
        >
          <View style={styles.levelIconRow}>
            <Ionicons
              name={levelDef.icon as React.ComponentProps<typeof Ionicons>['name']}
              size={13}
              color={levelDef.color}
            />
            <Text style={[styles.levelNum, { color: levelDef.color }]}>Lv.{levelDef.level}</Text>
          </View>
          <Text style={styles.levelTitle} numberOfLines={1}>{levelDef.title}</Text>
        </TouchableOpacity>

        {/* Right: Avatar + name below */}
        <TouchableOpacity
          style={styles.userCol}
          onPress={() => router.push('/(tabs)/profile')}
          activeOpacity={0.8}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {profile?.name?.[0]?.toUpperCase() ?? '?'}
            </Text>
          </View>
          <Text style={styles.userName} numberOfLines={1}>
            {profile?.name?.split(' ')[0] ?? 'You'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* XP progress line as bottom border */}
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { backgroundColor: levelDef.color }, fillStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
    paddingBottom: 0,
    gap: 6,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  appName: {
    fontSize: FontSize.lg,
  },
  appNameFreedom: {
    color: Colors.textPrimary,
    fontWeight: FontWeight.extraBold,
  },
  appNameFire: {
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
  levelCenter: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: Spacing.sm,
  },
  levelIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  levelNum: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    lineHeight: 18,
  },
  levelTitle: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    lineHeight: 14,
    textAlign: 'center',
  },
  userCol: {
    alignItems: 'center',
    gap: 3,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  avatarText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  userName: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: FontWeight.medium,
    maxWidth: 60,
    textAlign: 'center',
  },
  progressTrack: {
    height: 2,
    backgroundColor: Colors.border,
    marginHorizontal: -Spacing.lg,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
});
