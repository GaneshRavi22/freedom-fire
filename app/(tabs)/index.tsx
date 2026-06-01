import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ViewStyle,
} from 'react-native';
import { supabase } from '@/services/supabase';
import { useRouter, useFocusEffect } from 'expo-router';
import { track } from '@/lib/analytics';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/auth.store';
import { useFireStore } from '@/stores/fire.store';
import { useSpendStore } from '@/stores/spend.store';
import { useGamificationStore } from '@/stores/gamification.store';
import {
  formatCurrency,
  formatCurrencyShort,
} from '@/lib/calculations';
import {
  QUEST_DEFINITIONS,
  type RewardEvent,
  type LevelDefinition,
  type BadgeDefinition,
} from '@/lib/gamification';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius } from '@/constants/theme';
import { Card } from '@/components/ui/cards/Card';
import { ProgressRing } from '@/components/ui/gamification/ProgressRing';
import { MilestoneBar } from '@/components/ui/gamification/MilestoneBar';
import { FreedomDaysCard } from '@/components/ui/cards/FreedomDaysCard';
import { QuestCard } from '@/components/ui/cards/QuestCard';
import { RewardToast } from '@/components/ui/gamification/RewardToast';
import { LevelUpModal } from '@/components/ui/modals/LevelUpModal';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface MetricCardProps {
  label: string;
  value: string;
  sublabel?: string;
  icon: IoniconsName;
  iconColor: string;
  accent?: boolean;
}

function MetricCard({ label, value, sublabel, icon, iconColor, accent }: MetricCardProps) {
  const cardStyle: ViewStyle = {
    ...styles.metricCard,
    ...(accent ? { borderColor: `${iconColor}40`, borderWidth: 1 } : {}),
  };
  return (
    <Card style={cardStyle}>
      <View style={[styles.metricIcon, { backgroundColor: `${iconColor}18` }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      {sublabel ? <Text style={styles.metricSublabel}>{sublabel}</Text> : null}
    </Card>
  );
}

interface AiInsight {
  id: string;
  category: 'spending' | 'fire_progress' | 'task_opportunity' | 'milestone';
  message: string;
  action_id: string | null;
}

const INSIGHT_COLORS: Record<string, string> = {
  spending: '#FF5A5A',
  fire_progress: '#06D6A0',
  task_opportunity: '#FFB547',
  milestone: '#FFD166',
};

const INSIGHT_ICONS: Record<string, string> = {
  spending: 'wallet-outline',
  fire_progress: 'trending-up-outline',
  task_opportunity: 'bulb-outline',
  milestone: 'trophy-outline',
};

export default function HomeScreen() {
  const router = useRouter();
  const { profile, fetchProfile, user } = useAuthStore();
  const { calculation, fetchCalculation } = useFireStore();
  const { analysis, fetchAnalysis } = useSpendStore();
  const { xp, level, totalFreedomDays, unlockedBadges, quests, pendingRewards, fetchAll, checkAndAwardLoginXP, consumeReward } = useGamificationStore();
  const [refreshing, setRefreshing] = useState(false);
  const [aiInsights, setAiInsights] = useState<AiInsight[]>([]);
  const [toastVisible, setToastVisible] = useState(false);
  const [levelUpVisible, setLevelUpVisible] = useState(false);
  const [levelUpData, setLevelUpData] = useState<{
    previousLevel: number; newLevel: number;
    levelDefinition: LevelDefinition; newBadges: BadgeDefinition[];
  } | null>(null);

  const loadAiInsights = async (userId: string) => {
    const { data } = await supabase
      .from('ai_insights')
      .select('id,category,message,action_id')
      .eq('user_id', userId)
      .eq('dismissed', false)
      .order('created_at', { ascending: false })
      .limit(3);
    if (data) setAiInsights(data as AiInsight[]);
  };

  const dismissInsight = async (insightId: string) => {
    setAiInsights((prev) => prev.filter((i) => i.id !== insightId));
    await supabase.from('ai_insights').update({ dismissed: true }).eq('id', insightId);
  };

  const loadData = async () => {
    if (!user) return;
    await Promise.all([fetchProfile(), fetchCalculation(user.id), fetchAnalysis(user.id), fetchAll(user.id)]);
    loadAiInsights(user.id).catch(() => {});
    // Award login XP once per calendar day; uses DB date so it works across
    // devices and after reinstalls (fetchAll must complete first to read lastLoginDate).
    checkAndAwardLoginXP(user.id).catch(() => {});
  };

  useEffect(() => {
    loadData();
  }, [user]);

  useFocusEffect(useCallback(() => {
    if (user) track(user.id, 'screen_viewed', { screen: 'home' });
  }, [user?.id]));

  // Consume pending reward events for toast/modal
  useEffect(() => {
    const reward = pendingRewards[0];
    if (!reward) return;
    if (reward.leveledUp) {
      setLevelUpData({
        previousLevel: reward.previousLevel,
        newLevel: reward.newLevel,
        levelDefinition: reward.levelDefinition,
        newBadges: reward.newBadges,
      });
      setLevelUpVisible(true);
    } else if (reward.xpEarned > 0) {
      setToastVisible(true);
    }
  }, [pendingRewards]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // ─── Derived metrics ──────────────────────────────────────────────────────
  const fireProgress =
    calculation?.current_savings != null && calculation.fire_number
      ? Math.min((calculation.current_savings / calculation.fire_number) * 100, 100)
      : 0;

  const netWorth = calculation?.current_savings ?? 0;
  const corpusNeeded = calculation?.fire_number ?? 0;
  const yearsToFire =
    calculation?.years_to_fire != null && calculation.years_to_fire < 999
      ? calculation.years_to_fire
      : null;
  const savingsRate = calculation?.savings_rate ?? null;

  const yearsTimeProgress = (() => {
    if (yearsToFire == null) return 0;
    const retireAge = calculation?.retire_at_age ?? ((profile?.age ?? 30) + yearsToFire);
    const startAge = 22;
    const totalYears = Math.max(retireAge - startAge, 1);
    const elapsed = Math.max((profile?.age ?? 30) - startAge, 0);
    return Math.min(100, Math.max(0, (elapsed / totalYears) * 100));
  })();
  const monthlyBurn =
    analysis?.effective_avg_monthly_spend ??
    analysis?.avg_monthly_spend ??
    calculation?.monthly_expenses ??
    0;
  const passiveIncome =
    calculation?.current_savings && calculation.expected_return_pct
      ? Math.round(calculation.current_savings * (calculation.expected_return_pct / 100) / 12)
      : 0;

  // ─── Gamification derived values ─────────────────────────────────────────
  const annualExpenses = monthlyBurn * 12;

  const activeQuests = quests
    .filter((q) => !q.completed && (!q.expires_at || new Date(q.expires_at) >= new Date()))
    .slice(0, 2);

  const latestReward = pendingRewards[0];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={Colors.primary}
          colors={[Colors.primary]}
        />
      }
    >
      {/* ── Reward overlays ────────────────────────────────────────────── */}
      <RewardToast
        visible={toastVisible}
        xpEarned={latestReward?.xpEarned ?? 0}
        freedomDaysEarned={latestReward?.freedomDaysEarned}
        message="Progress made!"
        onHide={() => { setToastVisible(false); consumeReward(); }}
      />
      {levelUpData && (
        <LevelUpModal
          visible={levelUpVisible}
          previousLevel={levelUpData.previousLevel}
          newLevel={levelUpData.newLevel}
          levelDefinition={levelUpData.levelDefinition}
          newBadges={levelUpData.newBadges}
          onClose={() => { setLevelUpVisible(false); consumeReward(); }}
        />
      )}

      {/* ── Hero: FIRE Progress Ring ────────────────────────────────────── */}
      {calculation ? (
        <Card style={styles.heroCard} elevated>
          <Text style={styles.sectionLabel}>FIRE PROGRESS</Text>

          <View style={styles.ringRow}>
            <View style={styles.ringItem}>
              <ProgressRing
                progress={fireProgress}
                size={140}
                strokeWidth={13}
                color={Colors.primary}
                trailColor={Colors.border}
              >
                <Text style={styles.ringPct}>{Math.round(fireProgress)}%</Text>
                <Text style={styles.ringSubtext}>to FIRE corpus</Text>
              </ProgressRing>
            </View>

            <View style={styles.ringItem}>
              <ProgressRing
                progress={yearsTimeProgress}
                size={140}
                strokeWidth={13}
                color={Colors.success}
                trailColor={Colors.border}
              >
                <Text style={[styles.ringPct, { color: Colors.success }]}>
                  {yearsToFire !== null ? yearsToFire : '—'}
                </Text>
                <Text style={styles.ringSubtext}>yrs to FIRE</Text>
              </ProgressRing>
            </View>
          </View>

          <View style={styles.ringStats}>
            <View style={styles.ringStatRow}>
              <Ionicons name="wallet-outline" size={14} color={Colors.primary} />
              <View style={{ marginLeft: 6 }}>
                <Text style={styles.ringStatValue}>{formatCurrencyShort(netWorth)}</Text>
                <Text style={styles.ringStatLabel}>Net Worth</Text>
              </View>
            </View>
            <View style={styles.ringStatDivider} />
            <View style={styles.ringStatRow}>
              <Ionicons name="trending-up-outline" size={14} color={Colors.warning} />
              <View style={{ marginLeft: 6 }}>
                <Text style={[styles.ringStatValue, { color: Colors.warning }]}>
                  {savingsRate !== null ? `${savingsRate}%` : '—'}
                </Text>
                <Text style={styles.ringStatLabel}>Savings Rate</Text>
              </View>
            </View>
          </View>

          <Text style={styles.corpusLine}>
            Corpus needed:{' '}
            <Text style={styles.corpusAmount}>{formatCurrency(corpusNeeded)}</Text>
          </Text>
        </Card>
      ) : (
        <TouchableOpacity onPress={() => router.push('/(tabs)/fire-calculator')}>
          <Card style={styles.ctaCard}>
            <Ionicons name="flame-outline" size={40} color={Colors.accent} style={{ marginBottom: Spacing.sm }} />
            <Text style={styles.ctaTitle}>Calculate Your FIRE Number</Text>
            <Text style={styles.ctaSubtext}>Tap to get started →</Text>
          </Card>
        </TouchableOpacity>
      )}

      {/* ── Freedom Days ───────────────────────────────────────────────── */}
      <FreedomDaysCard
        totalDays={totalFreedomDays}
        recentlyEarned={latestReward?.freedomDaysEarned}
        annualExpenses={annualExpenses}
        style={styles.freedomCard}
      />

      {/* ── AI Insights ─────────────────────────────────────────────────── */}
      {aiInsights.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>AI INSIGHTS</Text>
          {aiInsights.map((insight) => (
            <Card key={insight.id} style={styles.insightCard}>
              <View style={styles.insightHeader}>
                <View style={[styles.insightBadge, { backgroundColor: `${INSIGHT_COLORS[insight.category]}20` }]}>
                  <Ionicons
                    name={INSIGHT_ICONS[insight.category] as any}
                    size={12}
                    color={INSIGHT_COLORS[insight.category]}
                  />
                  <Text style={[styles.insightCategory, { color: INSIGHT_COLORS[insight.category] }]}>
                    {insight.category.replace('_', ' ').toUpperCase()}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => dismissInsight(insight.id)} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <Ionicons name="close-outline" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>
              <Text style={styles.insightMessage}>{insight.message}</Text>
              {insight.action_id && (
                <TouchableOpacity onPress={() => router.push('/(tabs)/tasks')} style={styles.insightAction}>
                  <Text style={styles.insightActionText}>View Task →</Text>
                </TouchableOpacity>
              )}
            </Card>
          ))}
        </>
      )}

      {/* ── Active Quests ───────────────────────────────────────────────── */}
      {activeQuests.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>ACTIVE QUESTS</Text>
          <View style={styles.questList}>
            {activeQuests.map((q) => {
              const def = QUEST_DEFINITIONS.find((d) => d.id === q.quest_id);
              if (!def) return null;
              return (
                <QuestCard
                  key={q.quest_id}
                  title={def.title}
                  description={def.description}
                  icon={def.icon}
                  progress={q.progress}
                  target={q.target}
                  completed={q.completed}
                  xpReward={def.xpReward}
                  frequency={def.frequency}
                  style={styles.questCard}
                />
              );
            })}
          </View>
        </>
      )}

      {/* ── Metrics Grid ────────────────────────────────────────────────── */}
      {calculation && (
        <>
          <Text style={styles.sectionLabel}>YOUR NUMBERS</Text>
          <View style={styles.metricsGrid}>
            <MetricCard
              label="Monthly Burn"
              value={formatCurrencyShort(monthlyBurn)}
              sublabel="avg spend / mo"
              icon="flame-outline"
              iconColor={Colors.accent}
            />
            <MetricCard
              label="Passive Income"
              value={formatCurrencyShort(passiveIncome)}
              sublabel="/ month from corpus"
              icon="leaf-outline"
              iconColor={Colors.success}
            />
            <MetricCard
              label="Corpus Needed"
              value={formatCurrencyShort(corpusNeeded)}
              sublabel="retirement target"
              icon="diamond-outline"
              iconColor={Colors.primary}
              accent
            />
            <MetricCard
              label="Savings Rate"
              value={savingsRate !== null ? `${savingsRate}%` : '—'}
              sublabel="of monthly income"
              icon="trending-up-outline"
              iconColor={Colors.warning}
            />
            {calculation.onboarding_retire_age != null && (
              <MetricCard
                label="Original Retire Age"
                value={`${calculation.onboarding_retire_age}`}
                sublabel="your first estimate"
                icon="time-outline"
                iconColor={Colors.textSecondary}
              />
            )}
            {(calculation.monthly_emi ?? 0) > 0 && (
              <MetricCard
                label="Monthly EMI"
                value={formatCurrencyShort(calculation.monthly_emi!)}
                sublabel="active loan repayment"
                icon="home-outline"
                iconColor={Colors.accent}
              />
            )}
            {(calculation.monthly_emi ?? 0) > 0 && (calculation.loan_tenure_years ?? 0) > 0 && (
              <MetricCard
                label="EMI Tenure Left"
                value={`${calculation.loan_tenure_years} yr${calculation.loan_tenure_years !== 1 ? 's' : ''}`}
                sublabel="until loan is paid off"
                icon="calendar-outline"
                iconColor={Colors.textSecondary}
              />
            )}
          </View>
        </>
      )}

      {/* ── Milestone Bar ───────────────────────────────────────────────── */}
      {calculation && fireProgress > 0 && (
        <>
          <Text style={styles.sectionLabel}>MILESTONES</Text>
          <Card style={styles.milestoneCard}>
            <MilestoneBar progress={fireProgress} />
            {yearsToFire !== null && (
              <Text style={styles.milestoneFooter}>
                On track to reach FIRE in{' '}
                <Text style={styles.milestoneHighlight}>{yearsToFire} years</Text>
                {calculation.retire_at_age
                  ? ` · at age ${calculation.retire_at_age}`
                  : ''}
              </Text>
            )}
          </Card>
        </>
      )}

      {/* ── Spend Summary ───────────────────────────────────────────────── */}
      {analysis && (
        <>
          <Text style={styles.sectionLabel}>THIS MONTH</Text>
          <Card style={styles.spendCard}>
            <View style={styles.spendRow}>
              <View>
                <Text style={styles.spendLabel}>Avg Monthly Spend</Text>
                <Text style={styles.spendAmount}>
                  {formatCurrency(analysis.effective_avg_monthly_spend ?? analysis.avg_monthly_spend)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/spend-analyzer')}
                style={styles.viewBtn}
              >
                <Text style={styles.viewBtnText}>Details →</Text>
              </TouchableOpacity>
            </View>
            {analysis.category_breakdown && (() => {
              const total = Object.values(analysis.category_breakdown).reduce((s, v) => s + v, 0);
              return (
                <View style={styles.topCategories}>
                  {Object.entries(analysis.category_breakdown)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 3)
                    .map(([cat, amount]) => (
                      <View key={cat} style={styles.miniCategory}>
                        <View
                          style={[
                            styles.miniDot,
                            {
                              backgroundColor:
                                cat === 'food'
                                  ? Colors.accent
                                  : cat === 'transport'
                                  ? Colors.primary
                                  : Colors.warning,
                            },
                          ]}
                        />
                        <Text style={styles.miniCatText}>
                          {cat} · {total > 0 ? Math.round((amount / total) * 100) : 0}%
                        </Text>
                      </View>
                    ))}
                </View>
              );
            })()}
          </Card>
        </>
      )}

      {!analysis && !calculation && (
        <>
          <Text style={styles.sectionLabel}>GET STARTED</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/spend-analyzer')}>
            <Card style={styles.ctaCard}>
              <Ionicons name="card-outline" size={40} color={Colors.primary} style={{ marginBottom: Spacing.sm }} />
              <Text style={styles.ctaTitle}>Analyze Your Spending</Text>
              <Text style={styles.ctaSubtext}>Upload a credit card statement →</Text>
            </Card>
          </TouchableOpacity>
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.xxl },

  freedomCard: {
    marginBottom: Spacing.md,
  },
  questList: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  questCard: {},
  sectionLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    letterSpacing: 1.2,
    marginBottom: Spacing.sm,
    marginTop: Spacing.md,
  },

  // Hero card
  heroCard: {
    marginBottom: Spacing.md,
    borderColor: `${Colors.primary}33`,
    borderWidth: 1,
  },
  ringRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginVertical: Spacing.md,
  },
  ringItem: {
    alignItems: 'center',
  },
  ringPct: {
    color: Colors.textPrimary,
    fontSize: FontSize.xl,
    fontWeight: FontWeight.extraBold,
  },
  ringSubtext: { color: Colors.textMuted, fontSize: FontSize.xs, textAlign: 'center' },
  ringStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: Spacing.sm,
    gap: 4,
  },
  ringStatRow: { flexDirection: 'row', alignItems: 'center' },
  ringStatValue: {
    color: Colors.primary,
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  ringStatLabel: { color: Colors.textMuted, fontSize: FontSize.xs },
  ringStatDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.md,
    alignSelf: 'stretch',
  },
  corpusLine: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: 4 },
  corpusAmount: { color: Colors.textPrimary, fontWeight: FontWeight.semiBold },

  // CTA
  ctaCard: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    marginBottom: Spacing.lg,
    borderStyle: 'dashed',
    borderColor: Colors.border,
  },
  ctaTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
    marginBottom: Spacing.xs,
  },
  ctaSubtext: { color: Colors.primary, fontSize: FontSize.sm },

  // Metrics grid
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: 0,
  },
  metricCard: {
    flex: 1,
    minWidth: '45%',
    padding: Spacing.md,
    gap: 4,
  },
  metricIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  metricValue: {
    color: Colors.textPrimary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
  },
  metricLabel: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: FontWeight.medium },
  metricSublabel: { color: Colors.textMuted, fontSize: 10 },

  // Milestone
  milestoneCard: { marginBottom: 0 },
  milestoneFooter: { color: Colors.textSecondary, fontSize: FontSize.sm, marginTop: Spacing.sm },
  milestoneHighlight: { color: Colors.success, fontWeight: FontWeight.semiBold },

  // Spend card
  spendCard: { marginBottom: 0 },
  spendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  spendLabel: { color: Colors.textSecondary, fontSize: FontSize.sm, marginBottom: 4 },
  spendAmount: { color: Colors.textPrimary, fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  viewBtn: {
    backgroundColor: `${Colors.primary}22`,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  viewBtnText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  topCategories: { flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap' },
  miniCategory: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  miniDot: { width: 8, height: 8, borderRadius: 4 },
  miniCatText: { color: Colors.textMuted, fontSize: FontSize.xs },

  // AI Insights
  insightCard: {
    marginBottom: Spacing.sm,
    padding: Spacing.md,
  },
  insightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  insightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  insightCategory: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    textTransform: 'capitalize',
  },
  insightMessage: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  insightAction: {
    marginTop: Spacing.sm,
    alignSelf: 'flex-start',
  },
  insightActionText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
});
