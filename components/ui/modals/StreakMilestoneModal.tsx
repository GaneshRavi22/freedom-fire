import React, { useEffect } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  withTiming,
  withSpring,
  withDelay,
  withRepeat,
  withSequence,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight } from '@/constants/theme';
import type { StreakType } from '@/lib/gamification';

const STREAK_MESSAGES: Record<number, string> = {
  3:   "3 days in a row! A great habit is forming 🌱",
  7:   "One full week! Your consistency is your superpower 💪",
  14:  "Two weeks strong — you're building real momentum 🔥",
  30:  "30 days! You're officially on the FIRE path 👑",
  50:  "50 days! Nothing can stop you now ⚡",
  100: "100 days. A true Financial Monk in the making 🏆",
};

const STREAK_TYPE_LABELS: Record<StreakType, string> = {
  investment: 'Investment',
  tracking:   'Expense Tracking',
  review:     'Review',
};

interface StreakMilestoneModalProps {
  visible: boolean;
  streakType: StreakType;
  count: number;
  onClose: () => void;
}

export function StreakMilestoneModal({ visible, streakType, count, onClose }: StreakMilestoneModalProps) {
  const cardScale = useSharedValue(0.7);
  const cardOpacity = useSharedValue(0);
  const flameScale = useSharedValue(0);
  const flamePulse = useSharedValue(1);
  const countScale = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      cardScale.value = withSpring(1, { damping: 11, stiffness: 170 });
      cardOpacity.value = withTiming(1, { duration: 220 });
      flameScale.value = withDelay(100, withSpring(1, { damping: 7, stiffness: 220 }));
      flamePulse.value = withDelay(
        400,
        withRepeat(withSequence(withTiming(1.12, { duration: 600 }), withTiming(1, { duration: 600 })), -1, true)
      );
      countScale.value = withDelay(200, withSpring(1, { damping: 9, stiffness: 200 }));
    } else {
      cardScale.value = 0.7;
      cardOpacity.value = 0;
      flameScale.value = 0;
      flamePulse.value = 1;
      countScale.value = 0;
    }
  }, [visible]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
    opacity: cardOpacity.value,
  }));
  const flameStyle = useAnimatedStyle(() => ({
    transform: [{ scale: flameScale.value * flamePulse.value }],
  }));
  const countStyle = useAnimatedStyle(() => ({ transform: [{ scale: countScale.value }] }));

  const message = STREAK_MESSAGES[count] ?? `${count} day streak on your ${STREAK_TYPE_LABELS[streakType]} habit! Keep it up 🔥`;
  const label = STREAK_TYPE_LABELS[streakType];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Animated.View style={[styles.card, cardStyle]}>
          <Text style={styles.label}>{label} Streak</Text>

          <Animated.View style={flameStyle}>
            <View style={styles.flameWrap}>
              <Ionicons name="flame" size={56} color={Colors.accent} />
            </View>
          </Animated.View>

          <Animated.View style={[styles.countRow, countStyle]}>
            <Text style={styles.countNum}>{count}</Text>
            <Text style={styles.countLabel}>DAY{count !== 1 ? 'S' : ''}</Text>
          </Animated.View>

          <Text style={styles.message}>{message}</Text>

          <TouchableOpacity style={styles.btn} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.btnText}>Keep the Streak!</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: `${Colors.accent}44`,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    width: '84%',
    gap: Spacing.sm,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.extraBold,
    color: Colors.accent,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  flameWrap: {
    width: 88,
    height: 88,
    borderRadius: BorderRadius.xl,
    backgroundColor: `${Colors.accent}18`,
    borderWidth: 2,
    borderColor: `${Colors.accent}44`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countRow: {
    alignItems: 'center',
    gap: 0,
  },
  countNum: {
    fontSize: 64,
    fontWeight: FontWeight.extraBold,
    color: Colors.textPrimary,
    lineHeight: 70,
  },
  countLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.extraBold,
    color: Colors.accent,
    letterSpacing: 3,
  },
  message: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: Spacing.xs,
  },
  btn: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm + 4,
    borderRadius: BorderRadius.full,
  },
  btnText: {
    color: '#fff',
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
});
