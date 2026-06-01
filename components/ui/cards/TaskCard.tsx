import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius } from '@/constants/theme';
import { TASK_DEFINITIONS, formatTargetDate, getConcreteTaskDescription, type UserTask } from '@/lib/tasks';

interface TaskCardProps {
  task: UserTask;
  freedomDays?: number | null;
  onAccept?: () => void;
  onCancel?: () => void;
  onComplete?: () => void;
}

export function TaskCard({ task, freedomDays, onAccept, onCancel, onComplete }: TaskCardProps) {
  const def = TASK_DEFINITIONS[task.task_type];
  const isAccepted = task.status === 'accepted';

  return (
    <View style={[styles.card, { borderLeftColor: def.color }]}>
      <View style={styles.header}>
        <View style={[styles.iconBox, { backgroundColor: `${def.color}22` }]}>
          <Ionicons
            name={def.icon as React.ComponentProps<typeof Ionicons>['name']}
            size={20}
            color={def.color}
          />
        </View>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{task.title}</Text>
          <View style={styles.xpRow}>
            <Ionicons name="flash" size={12} color={Colors.warning} />
            <Text style={styles.xpText}>{task.xp_reward} XP on completion</Text>
          </View>
        </View>
      </View>

      <Text style={styles.description}>{getConcreteTaskDescription(task)}</Text>

      {!!freedomDays && freedomDays > 0 && (
        <View style={styles.freedomDaysRow}>
          <Ionicons name="sunny" size={13} color="#FFB547" />
          <Text style={styles.freedomDaysText}>
            {freedomDays >= 365
              ? `+${(freedomDays / 365).toFixed(1)} Freedom Years`
              : `+${freedomDays} Freedom ${freedomDays === 1 ? 'Day' : 'Days'}`}
          </Text>
        </View>
      )}

      {isAccepted && task.target_completion_date && (
        <View style={styles.targetDateRow}>
          <Ionicons name="calendar-outline" size={13} color={Colors.primary} />
          <Text style={styles.targetDateText}>
            Target: {formatTargetDate(task.target_completion_date)}
          </Text>
        </View>
      )}

      <View style={styles.actions}>
        {isAccepted ? (
          <>
            <TouchableOpacity style={styles.doneBtn} onPress={onComplete} activeOpacity={0.8}>
              <Ionicons name="checkmark-circle-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.doneBtnText}>Mark as Done</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.revertBtn} onPress={onCancel} activeOpacity={0.8}>
              <Text style={styles.revertBtnText}>Move Back</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.acceptBtn} onPress={onAccept} activeOpacity={0.8}>
              <Ionicons name="checkmark-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.acceptBtnText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 4,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  titleBlock: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
    lineHeight: 20,
  },
  xpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  xpText: {
    color: Colors.warning,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  description: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: 19,
  },
  freedomDaysRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFB54718',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  freedomDaysText: {
    color: '#FFB547',
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  targetDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: `${Colors.primary}18`,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
  },
  targetDateText: {
    color: Colors.primary,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  acceptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.success,
    borderRadius: BorderRadius.sm,
    paddingVertical: 10,
  },
  acceptBtnText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  doneBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingVertical: 10,
  },
  doneBtnText: {
    color: '#fff',
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
  },
  revertBtn: {
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revertBtnText: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
});
