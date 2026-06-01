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

interface XPCelebrationModalProps {
  visible: boolean;
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  xpEarned: number;
  freedomDaysEarned?: number;
  message: string;
  onClose: () => void;
}

export function XPCelebrationModal({
  visible,
  title,
  icon,
  iconColor,
  xpEarned,
  freedomDaysEarned,
  message,
  onClose,
}: XPCelebrationModalProps) {
  const cardScale = useSharedValue(0.7);
  const cardOpacity = useSharedValue(0);
  const iconScale = useSharedValue(0);
  const xpScale = useSharedValue(0);
  const [burstKey, setBurstKey] = useState(0);

  useEffect(() => {
    if (visible) {
      cardScale.value = withSpring(1, { damping: 12, stiffness: 180 });
      cardOpacity.value = withTiming(1, { duration: 220 });
      iconScale.value = withDelay(120, withSpring(1, { damping: 8, stiffness: 200 }));
      xpScale.value = withDelay(280, withSpring(1, { damping: 9, stiffness: 200 }));
      setBurstKey((k) => k + 1);
    } else {
      cardScale.value = 0.7;
      cardOpacity.value = 0;
      iconScale.value = 0;
      xpScale.value = 0;
    }
  }, [visible]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
    opacity: cardOpacity.value,
  }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: iconScale.value }] }));
  const xpStyle = useAnimatedStyle(() => ({ transform: [{ scale: xpScale.value }] }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Animated.View style={[styles.card, cardStyle]}>
          <Text style={[styles.label, { color: iconColor }]}>{title}</Text>

          <Animated.View style={[styles.iconWrap, { backgroundColor: `${iconColor}18`, borderColor: `${iconColor}44` }, iconStyle]}>
            <Ionicons name={icon} size={52} color={iconColor} />
          </Animated.View>

          <Animated.View style={[styles.badges, xpStyle]}>
            <View style={[styles.xpBadge, { backgroundColor: `${Colors.warning}18`, borderColor: `${Colors.warning}44` }]}>
              <Ionicons name="flash" size={16} color={Colors.warning} />
              <Text style={styles.xpText}>+{xpEarned} XP</Text>
            </View>
            {freedomDaysEarned != null && freedomDaysEarned > 0 && (
              <View style={[styles.fdBadge, { backgroundColor: `${Colors.success}18`, borderColor: `${Colors.success}44` }]}>
                <Ionicons name="sunny" size={14} color={Colors.success} />
                <Text style={styles.fdText}>+{freedomDaysEarned} Freedom Days</Text>
              </View>
            )}
          </Animated.View>

          <Text style={styles.message}>{message}</Text>

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: iconColor }]}
            onPress={onClose}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>Awesome!</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Rendered after card so confetti appears on top */}
        <ConfettiBurst key={burstKey} />
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
    borderColor: Colors.border,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    width: '84%',
    gap: Spacing.sm,
  },
  label: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.extraBold,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: BorderRadius.xl,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: Spacing.xs,
  },
  badges: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  xpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
  },
  xpText: {
    color: Colors.warning,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.extraBold,
  },
  fdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  fdText: {
    color: Colors.success,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
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
