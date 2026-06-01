import React, { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
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

interface TaskCompleteModalProps {
  visible: boolean;
  taskTitle: string;
  xpEarned: number;
  freedomDays?: number;
  onClose: () => void;
}

export function TaskCompleteModal({ visible, taskTitle, xpEarned, freedomDays, onClose }: TaskCompleteModalProps) {
  const cardScale = useSharedValue(0.7);
  const cardOpacity = useSharedValue(0);
  const iconScale = useSharedValue(0);
  const [burstKey, setBurstKey] = useState(0);

  useEffect(() => {
    if (visible) {
      cardScale.value = withSpring(1, { damping: 12, stiffness: 180 });
      cardOpacity.value = withTiming(1, { duration: 220 });
      iconScale.value = withDelay(150, withSpring(1, { damping: 8, stiffness: 200 }));
      setBurstKey((k) => k + 1);
    } else {
      cardScale.value = 0.7;
      cardOpacity.value = 0;
      iconScale.value = 0;
    }
  }, [visible]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
    opacity: cardOpacity.value,
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Animated.View style={[styles.card, cardStyle]}>
          <Text style={styles.label}>TASK COMPLETE!</Text>

          <Animated.View style={[styles.iconWrap, iconStyle]}>
            <Ionicons name="checkmark-circle" size={64} color={Colors.success} />
          </Animated.View>

          <Text style={styles.taskTitle} numberOfLines={2}>
            {taskTitle}
          </Text>

          <View style={styles.xpBadge}>
            <Ionicons name="flash" size={18} color={Colors.warning} />
            <Text style={styles.xpText}>+{xpEarned} XP earned</Text>
          </View>

          {!!freedomDays && freedomDays > 0 && (
            <View style={styles.fdBadge}>
              <Ionicons name="sunny" size={16} color={Colors.success} />
              <Text style={styles.fdText}>+{freedomDays} Freedom Days unlocked</Text>
            </View>
          )}

          <Text style={styles.motiveLine}>
            Every step forward brings you closer to financial freedom. Keep it up!
          </Text>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.closeBtnText}>Keep Going!</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Rendered after card so confetti bursts over and around it */}
        <ConfettiBurst key={burstKey} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: `${Colors.success}44`,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    width: '84%',
    gap: Spacing.sm,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.extraBold,
    color: Colors.success,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  iconWrap: {
    marginVertical: Spacing.xs,
  },
  taskTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
    lineHeight: 24,
  },
  xpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: `${Colors.warning}18`,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
  },
  xpText: {
    color: Colors.warning,
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  fdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: `${Colors.success}18`,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
  },
  fdText: {
    color: Colors.success,
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  motiveLine: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: Spacing.xs,
  },
  closeBtn: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.success,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm + 4,
    borderRadius: BorderRadius.full,
  },
  closeBtnText: {
    color: '#fff',
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
});
