import React, { useEffect } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  withTiming,
  withSpring,
  withDelay,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight } from '@/constants/theme';
import { ConfettiBurst } from '../gamification/ConfettiBurst';
import { BadgeCard } from '../cards/BadgeCard';
import type { BadgeDefinition } from '@/lib/gamification';

interface BadgeUnlockModalProps {
  visible: boolean;
  newBadges: BadgeDefinition[];
  onClose: () => void;
}

export function BadgeUnlockModal({ visible, newBadges, onClose }: BadgeUnlockModalProps) {
  const cardScale = useSharedValue(0.7);
  const cardOpacity = useSharedValue(0);
  const starScale = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      cardScale.value = withSpring(1, { damping: 12, stiffness: 180 });
      cardOpacity.value = withTiming(1, { duration: 220 });
      starScale.value = withDelay(140, withSpring(1, { damping: 7, stiffness: 220 }));
    } else {
      cardScale.value = 0.7;
      cardOpacity.value = 0;
      starScale.value = 0;
    }
  }, [visible]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
    opacity: cardOpacity.value,
  }));
  const starStyle = useAnimatedStyle(() => ({ transform: [{ scale: starScale.value }] }));

  const isSingle = newBadges.length === 1;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ConfettiBurst />

        <Animated.View style={[styles.card, cardStyle]}>
          <Text style={styles.label}>
            {isSingle ? 'BADGE UNLOCKED!' : `${newBadges.length} BADGES UNLOCKED!`}
          </Text>

          <Animated.View style={starStyle}>
            <Ionicons name="ribbon" size={52} color={Colors.warning} />
          </Animated.View>

          <ScrollView
            style={styles.badgeScroll}
            contentContainerStyle={styles.badgesRow}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {newBadges.map((b) => (
              <BadgeCard key={b.id} badge={b} unlocked size="small" />
            ))}
          </ScrollView>

          <Text style={styles.message}>
            {isSingle
              ? `You earned the "${newBadges[0].title}" badge! Keep building your FIRE journey.`
              : `You're on a roll! Keep up the momentum on your path to financial freedom.`}
          </Text>

          <TouchableOpacity style={styles.btn} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.btnText}>Let's Go!</Text>
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
    borderColor: `${Colors.warning}44`,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    width: '84%',
    gap: Spacing.sm,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.extraBold,
    color: Colors.warning,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  badgeScroll: {
    maxHeight: 160,
    width: '100%',
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
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
    backgroundColor: Colors.warning,
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
