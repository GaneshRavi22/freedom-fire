import React, { useEffect } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  withTiming,
  withSpring,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight } from '@/constants/theme';
import { BadgeCard } from '../cards/BadgeCard';
import { ConfettiBurst } from '../gamification/ConfettiBurst';
import { type BadgeDefinition, type LevelDefinition } from '@/lib/gamification';

interface LevelUpModalProps {
  visible: boolean;
  previousLevel: number;
  newLevel: number;
  levelDefinition: LevelDefinition;
  newBadges: BadgeDefinition[];
  onClose: () => void;
}

export function LevelUpModal({
  visible,
  previousLevel,
  newLevel,
  levelDefinition,
  newBadges,
  onClose,
}: LevelUpModalProps) {
  const cardScale = useSharedValue(0.7);
  const cardOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      cardScale.value = withSpring(1, { damping: 10, stiffness: 160 });
      cardOpacity.value = withTiming(1, { duration: 250 });
    } else {
      cardScale.value = 0.7;
      cardOpacity.value = 0;
    }
  }, [visible]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
    opacity: cardOpacity.value,
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ConfettiBurst />

        <Animated.View style={[styles.card, cardStyle]}>
          <ScrollView
            contentContainerStyle={styles.cardContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Text style={styles.levelUpLabel}>LEVEL UP!</Text>
            <View style={[styles.iconWrap, { borderColor: `${levelDefinition.color}44`, backgroundColor: `${levelDefinition.color}18` }]}>
              <Ionicons
                name={levelDefinition.icon as React.ComponentProps<typeof Ionicons>['name']}
                size={52}
                color={levelDefinition.color}
              />
            </View>
            <Text style={[styles.levelNum, { color: levelDefinition.color }]}>
              Level {newLevel}
            </Text>
            <Text style={styles.levelTitle}>{levelDefinition.title}</Text>

            {newBadges.length > 0 && (
              <View style={styles.badgesSection}>
                <Text style={styles.badgesLabel}>New Badges Unlocked!</Text>
                <View style={styles.badgesRow}>
                  {newBadges.map((b) => (
                    <View key={b.id} style={styles.badgeItem}>
                      <BadgeCard badge={b} unlocked size="small" />
                      <Text style={styles.badgeName} numberOfLines={2}>{b.title}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: levelDefinition.color }]} onPress={onClose}>
              <Text style={styles.closeBtnText}>Awesome!</Text>
            </TouchableOpacity>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    width: '82%',
    maxHeight: '80%',
    overflow: 'hidden',
  },
  cardContent: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  levelUpLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.extraBold,
    color: Colors.textMuted,
    letterSpacing: 3,
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
  levelNum: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.extraBold,
  },
  levelTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semiBold,
    color: Colors.textSecondary,
  },
  badgesSection: {
    width: '100%',
    marginTop: Spacing.xs,
    alignItems: 'center',
    gap: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  badgesLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
    color: Colors.textSecondary,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  badgeItem: {
    alignItems: 'center',
    gap: 4,
    maxWidth: 88,
  },
  badgeName: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    color: Colors.textPrimary,
    textAlign: 'center',
    lineHeight: 14,
  },
  closeBtn: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm + 4,
    borderRadius: BorderRadius.full,
  },
  closeBtnText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: '#fff',
  },
});
