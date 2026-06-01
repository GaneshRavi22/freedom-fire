import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { track } from '@/lib/analytics';
import { useAuthStore } from '@/stores/auth.store';
import { useTasksStore } from '@/stores/tasks.store';
import { useGamificationStore } from '@/stores/gamification.store';
import { useFireStore } from '@/stores/fire.store';
import { calculateFire, type FireInputs } from '@/lib/fire';
import { addMonths, applyTaskFireImpact, freedomDaysForTask, TARGET_DATE_PRESETS, type UserTask } from '@/lib/tasks';
import { TaskCard } from '@/components/ui/cards/TaskCard';
import { TaskCompleteModal } from '@/components/ui/modals/TaskCompleteModal';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius } from '@/constants/theme';

type SubTab = 'recommended' | 'accepted';

export default function TasksScreen() {
  const { user, profile } = useAuthStore();
  const { tasks, loading, fetchTasks, acceptTask, cancelTask, completeTask, markRecommendedSeen } = useTasksStore();
  const { awardTaskXP } = useGamificationStore();
  const { calculation, saveCalculation } = useFireStore();
  const currentAge = profile?.age ?? 27;

  const [activeTab, setActiveTab] = useState<SubTab>('recommended');

  // Accept flow state
  const [acceptingTask, setAcceptingTask] = useState<UserTask | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);

  // Completion celebration state
  const [completedTask, setCompletedTask] = useState<{ title: string; xp: number; freedomDays: number } | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (user) {
        fetchTasks(user.id);
        track(user.id, 'screen_viewed', { screen: 'tasks' });
      }
    }, [user?.id])
  );

  const recommendedTasks = tasks.filter((t) => t.status === 'recommended');
  const acceptedTasks = tasks.filter((t) => t.status === 'accepted');

  // Mark all visible recommended tasks as seen when the tab is active
  useEffect(() => {
    if (activeTab === 'recommended' && recommendedTasks.length > 0) {
      markRecommendedSeen(recommendedTasks.map((t) => t.id));
    }
  }, [activeTab, recommendedTasks.length]);

  const handleAcceptPress = (task: UserTask) => {
    setSelectedPreset(null);
    setAcceptingTask(task);
  };

  const confirmAccept = async () => {
    if (!acceptingTask || selectedPreset === null || !user) return;
    const targetDate = addMonths(selectedPreset);
    await acceptTask(user.id, acceptingTask.id, targetDate);
    track(user.id, 'task_accepted', { task_type: acceptingTask.task_type });
    setAcceptingTask(null);
    setActiveTab('accepted');
  };

  const handleCancelRecommended = async (task: UserTask) => {
    if (!user) return;
    await cancelTask(user.id, task.id, false);
    track(user.id, 'task_canceled', { task_type: task.task_type, was_accepted: false });
  };

  const handleRevertAccepted = async (task: UserTask) => {
    if (!user) return;
    await cancelTask(user.id, task.id, true);
    track(user.id, 'task_canceled', { task_type: task.task_type, was_accepted: true });
    setActiveTab('recommended');
  };

  const handleComplete = async (task: UserTask) => {
    if (!user) return;

    const xpEarned = await completeTask(user.id, task.id);
    track(user.id, 'task_completed', { task_type: task.task_type });
    const fd = freedomDaysForTask(task, calculation, currentAge) ?? 0;

    // Apply the task's financial impact to FIRE inputs, recalculate, and persist
    if (calculation) {
      const impact = applyTaskFireImpact(task, calculation);
      if (impact) {
        const updatedInputs: FireInputs = {
          monthly_income: calculation.monthly_income ?? 0,
          spouse_income: calculation.spouse_income ?? 0,
          monthly_expenses: calculation.monthly_expenses ?? 0,
          current_savings: calculation.current_savings ?? 0,
          loan_balance: calculation.loan_balance ?? 0,
          monthly_emi: calculation.monthly_emi ?? 0,
          loan_tenure_years: calculation.loan_tenure_years ?? 0,
          retirement_age: calculation.retirement_age ?? 60,
          expected_return_pct: calculation.expected_return_pct ?? 12,
          inflation_rate_pct: calculation.inflation_rate_pct ?? 6,
          lifestyle: calculation.lifestyle,
          ...impact,
        };
        const currentAge = profile?.age ?? 27;
        const result = calculateFire(updatedInputs, currentAge);
        try {
          await saveCalculation(user.id, {
            ...impact,
            fire_number: result.fire_number,
            retire_at_age: result.retire_at_age,
            years_to_fire: result.years_to_fire,
            monthly_savings: result.monthly_savings,
            savings_rate: result.savings_rate,
          });
        } catch {
          // non-fatal — FIRE update failure doesn't block the celebration
        }
      }
    }

    await awardTaskXP(user.id, xpEarned, { freedomDaysEarned: fd });
    setCompletedTask({ title: task.title, xp: xpEarned, freedomDays: fd });
  };

  function renderEmpty(message: string, icon: string) {
    return (
      <View style={styles.emptyState}>
        <Ionicons
          name={icon as React.ComponentProps<typeof Ionicons>['name']}
          size={48}
          color={Colors.textMuted}
          style={styles.emptyIcon}
        />
        <Text style={styles.emptyTitle}>{message}</Text>
        <Text style={styles.emptySubtitle}>
          {activeTab === 'recommended'
            ? 'Upload a bank statement in Insights to get personalized recommendations'
            : 'Accept a task from the Recommended tab to track your progress'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* ── Sub-tab bar ── */}
      <View style={tabStyles.bar}>
        <TouchableOpacity
          style={[tabStyles.tab, activeTab === 'recommended' && tabStyles.tabActive]}
          onPress={() => setActiveTab('recommended')}
          activeOpacity={0.8}
        >
          <Ionicons
            name={activeTab === 'recommended' ? 'list' : 'list-outline'}
            size={15}
            color={activeTab === 'recommended' ? Colors.primary : Colors.textMuted}
            style={{ marginRight: 5 }}
          />
          <Text style={[tabStyles.tabText, activeTab === 'recommended' && tabStyles.tabTextActive]}>
            Recommended
          </Text>
          {recommendedTasks.length > 0 && (
            <View style={tabStyles.badge}>
              <Text style={tabStyles.badgeText}>{recommendedTasks.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[tabStyles.tab, activeTab === 'accepted' && tabStyles.tabActive]}
          onPress={() => setActiveTab('accepted')}
          activeOpacity={0.8}
        >
          <Ionicons
            name={activeTab === 'accepted' ? 'checkmark-circle' : 'checkmark-circle-outline'}
            size={15}
            color={activeTab === 'accepted' ? Colors.primary : Colors.textMuted}
            style={{ marginRight: 5 }}
          />
          <Text style={[tabStyles.tabText, activeTab === 'accepted' && tabStyles.tabTextActive]}>
            Accepted
          </Text>
          {acceptedTasks.length > 0 && (
            <View style={[tabStyles.badge, { backgroundColor: Colors.success }]}>
              <Text style={tabStyles.badgeText}>{acceptedTasks.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : activeTab === 'recommended' ? (
          recommendedTasks.length === 0 ? (
            renderEmpty('No recommendations yet', 'bulb-outline')
          ) : (
            <>
              <Text style={styles.sectionHint}>
                Accept tasks to commit to them. Cancel to permanently dismiss.
              </Text>
              {recommendedTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  freedomDays={freedomDaysForTask(task, calculation, currentAge)}
                  onAccept={() => handleAcceptPress(task)}
                  onCancel={() => handleCancelRecommended(task)}
                />
              ))}
            </>
          )
        ) : acceptedTasks.length === 0 ? (
          renderEmpty('No accepted tasks', 'flag-outline')
        ) : (
          <>
            <Text style={styles.sectionHint}>
              Mark tasks as done to earn XP. Or move them back to Recommended
            </Text>
            {acceptedTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                freedomDays={freedomDaysForTask(task, calculation, currentAge)}
                onComplete={() => handleComplete(task)}
                onCancel={() => handleRevertAccepted(task)}
              />
            ))}
          </>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Accept flow: date picker modal ── */}
      <Modal
        visible={!!acceptingTask}
        transparent
        animationType="slide"
        onRequestClose={() => setAcceptingTask(null)}
      >
        <View style={modalStyles.overlay}>
          <View style={modalStyles.sheet}>
            <View style={modalStyles.handle} />

            <Text style={modalStyles.title}>Set Target Date</Text>
            <Text style={modalStyles.subtitle}>
              When do you plan to complete this task?
            </Text>

            {acceptingTask && (
              <View style={modalStyles.taskNameRow}>
                <Ionicons name="flag-outline" size={14} color={Colors.primary} />
                <Text style={modalStyles.taskName} numberOfLines={2}>
                  {acceptingTask.title}
                </Text>
              </View>
            )}

            <View style={modalStyles.presets}>
              {TARGET_DATE_PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset.months}
                  style={[
                    modalStyles.presetChip,
                    selectedPreset === preset.months && modalStyles.presetChipActive,
                  ]}
                  onPress={() => setSelectedPreset(preset.months)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      modalStyles.presetText,
                      selectedPreset === preset.months && modalStyles.presetTextActive,
                    ]}
                  >
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {selectedPreset !== null && (
              <View style={modalStyles.selectedDateRow}>
                <Ionicons name="calendar-outline" size={14} color={Colors.success} />
                <Text style={modalStyles.selectedDateText}>
                  Target: {new Date(
                    new Date().setMonth(new Date().getMonth() + selectedPreset)
                  ).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                </Text>
              </View>
            )}

            <View style={modalStyles.buttons}>
              <TouchableOpacity
                style={modalStyles.cancelBtn}
                onPress={() => setAcceptingTask(null)}
                activeOpacity={0.8}
              >
                <Text style={modalStyles.cancelBtnText}>Go Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  modalStyles.confirmBtn,
                  selectedPreset === null && modalStyles.confirmBtnDisabled,
                ]}
                onPress={confirmAccept}
                disabled={selectedPreset === null}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text style={modalStyles.confirmBtnText}>Accept Task</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Completion celebration modal ── */}
      <TaskCompleteModal
        visible={!!completedTask}
        taskTitle={completedTask?.title ?? ''}
        xpEarned={completedTask?.xp ?? 0}
        freedomDays={completedTask?.freedomDays ?? 0}
        onClose={() => setCompletedTask(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing.xxl,
  },
  sectionHint: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    lineHeight: 17,
    marginBottom: Spacing.md,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing.xxl,
    paddingHorizontal: Spacing.lg,
  },
  emptyIcon: {
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    textAlign: 'center',
    lineHeight: 19,
  },
});

const tabStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingTop: Spacing.sm,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    gap: 4,
  },
  tabActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.textMuted,
  },
  tabTextActive: {
    color: Colors.primary,
    fontWeight: FontWeight.semiBold,
  },
  badge: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: FontWeight.bold,
  },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
    paddingTop: Spacing.md,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: BorderRadius.full,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
    marginBottom: Spacing.md,
  },
  taskNameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: `${Colors.primary}12`,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  taskName: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    lineHeight: 18,
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  presetChip: {
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surfaceHigh,
  },
  presetChipActive: {
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primary}22`,
  },
  presetText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  presetTextActive: {
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
  selectedDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.lg,
    backgroundColor: `${Colors.success}12`,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
  },
  selectedDateText: {
    color: Colors.success,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  cancelBtnText: {
    color: Colors.textSecondary,
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
  },
  confirmBtn: {
    flex: 2,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.success,
  },
  confirmBtnDisabled: {
    opacity: 0.4,
  },
  confirmBtnText: {
    color: '#fff',
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
});
