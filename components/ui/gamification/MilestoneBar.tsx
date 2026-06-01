import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, BorderRadius } from '@/constants/theme';

interface Milestone {
  pct: number;
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}

interface MilestoneBarProps {
  progress: number; // 0–100
  milestones?: Milestone[];
}

const DEFAULT_MILESTONES: Milestone[] = [
  { pct: 25, label: '25%' },
  { pct: 50, label: '50%' },
  { pct: 75, label: '75%' },
  { pct: 100, label: 'FIRE', icon: 'flame' },
];

export function MilestoneBar({ progress, milestones = DEFAULT_MILESTONES }: MilestoneBarProps) {
  const clamped = Math.min(Math.max(progress, 0), 100);

  return (
    <View style={styles.container}>
      <View style={styles.trackWrapper}>
        {/* Trail */}
        <View style={styles.track} />
        {/* Fill */}
        <View style={[styles.fill, { width: `${clamped}%` }]} />

        {/* Milestone ticks */}
        {milestones.map((m) => {
          const reached = clamped >= m.pct;
          return (
            <View
              key={m.pct}
              style={[styles.tickWrapper, { left: `${m.pct}%` }]}
            >
              <View style={[styles.tick, reached && styles.tickReached]} />
            </View>
          );
        })}

        {/* Current position dot */}
        {clamped > 0 && (
          <View style={[styles.cursor, { left: `${clamped}%` }]}>
            <View style={styles.cursorDot} />
          </View>
        )}
      </View>

      {/* Labels row */}
      <View style={styles.labelsRow}>
        <Text style={styles.labelEdge}>0%</Text>
        {milestones.map((m) => {
          const reached = clamped >= m.pct;
          return (
            <View key={m.pct} style={[styles.labelWrapper, { left: `${m.pct}%` }]}>
              {m.icon ? (
                <Ionicons
                  name={m.icon}
                  size={11}
                  color={reached ? Colors.accent : Colors.textMuted}
                />
              ) : (
                <Text style={[styles.labelText, reached && styles.labelReached]}>
                  {m.label}
                </Text>
              )}
            </View>
          );
        })}
      </View>

      {/* Current progress label */}
      {clamped > 0 && clamped < 100 && (
        <View style={[styles.progressLabelWrapper, { left: `${clamped}%` }]}>
          <View style={styles.progressBadge}>
            <Text style={styles.progressBadgeText}>{Math.round(clamped)}%</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const BAR_HEIGHT = 8;
const TICK_HEIGHT = 14;

const styles = StyleSheet.create({
  container: {
    paddingBottom: 28,
  },
  trackWrapper: {
    height: BAR_HEIGHT,
    position: 'relative',
    marginBottom: 8,
  },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: Colors.border,
    borderRadius: BorderRadius.full,
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
  },
  tickWrapper: {
    position: 'absolute',
    top: -(TICK_HEIGHT - BAR_HEIGHT) / 2,
    transform: [{ translateX: -1 }],
    height: TICK_HEIGHT,
    alignItems: 'center',
  },
  tick: {
    width: 2,
    height: TICK_HEIGHT,
    backgroundColor: Colors.border,
    borderRadius: 1,
  },
  tickReached: {
    backgroundColor: Colors.primary,
  },
  cursor: {
    position: 'absolute',
    top: -(16 - BAR_HEIGHT) / 2,
    transform: [{ translateX: -8 }],
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cursorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.primary,
    borderWidth: 2.5,
    borderColor: Colors.background,
  },
  labelsRow: {
    flexDirection: 'row',
    position: 'relative',
    height: 16,
  },
  labelEdge: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
  },
  labelWrapper: {
    position: 'absolute',
    transform: [{ translateX: -10 }],
  },
  labelText: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
  },
  labelReached: {
    color: Colors.primary,
    fontWeight: FontWeight.semiBold,
  },
  progressLabelWrapper: {
    position: 'absolute',
    bottom: 0,
    transform: [{ translateX: -18 }],
  },
  progressBadge: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  progressBadgeText: {
    color: Colors.textPrimary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
  },
});
