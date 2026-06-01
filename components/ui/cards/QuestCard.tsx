import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight } from '@/constants/theme';

interface QuestCardProps {
  title: string;
  description: string;
  icon: string;
  progress: number;
  target: number;
  completed: boolean;
  xpReward: number;
  frequency: 'daily' | 'weekly';
  style?: object;
}

export function QuestCard({
  title,
  description,
  icon,
  progress,
  target,
  completed,
  xpReward,
  frequency,
  style,
}: QuestCardProps) {
  const fillPct = target > 0 ? Math.min(progress / target, 1) : 0;

  return (
    <View style={[styles.container, completed && styles.completedContainer, style]}>
      <View style={[styles.iconWrap, completed && styles.completedIconWrap]}>
        <Ionicons
          name={icon as React.ComponentProps<typeof Ionicons>['name']}
          size={18}
          color={completed ? Colors.success : Colors.primary}
        />
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, completed && styles.completedTitle]} numberOfLines={1}>
            {title}
          </Text>
          <View style={[styles.freqChip, frequency === 'weekly' && styles.weeklyChip]}>
            <Text style={styles.freqText}>{frequency}</Text>
          </View>
        </View>
        <Text style={styles.description} numberOfLines={1}>
          {description}
        </Text>

        {!completed && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${fillPct * 100}%` }]} />
          </View>
        )}
      </View>

      <View style={[styles.xpChip, completed && styles.completedXpChip]}>
        {completed ? (
          <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
        ) : (
          <Text style={styles.xpText}>+{xpReward}</Text>
        )}
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
    paddingVertical: Spacing.sm + 4,
    gap: Spacing.sm + 4,
  },
  completedContainer: {
    borderColor: `${Colors.success}44`,
    backgroundColor: `${Colors.success}0A`,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    backgroundColor: `${Colors.primary}22`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedIconWrap: {
    backgroundColor: `${Colors.success}22`,
  },
  body: {
    flex: 1,
    gap: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  title: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
    color: Colors.textPrimary,
  },
  completedTitle: {
    color: Colors.textMuted,
  },
  description: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  freqChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    backgroundColor: `${Colors.primary}22`,
  },
  weeklyChip: {
    backgroundColor: `${Colors.accent}22`,
  },
  freqText: {
    fontSize: 9,
    fontWeight: FontWeight.semiBold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    marginTop: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
  },
  xpChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: `${Colors.warning}22`,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 40,
  },
  completedXpChip: {
    backgroundColor: 'transparent',
  },
  xpText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.warning,
  },
});
