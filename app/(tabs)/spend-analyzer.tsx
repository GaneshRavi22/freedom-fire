import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect } from 'expo-router';
import { track } from '@/lib/analytics';
import { BarChart, PieChart } from 'react-native-gifted-charts';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/auth.store';
import { useSpendStore, OutlierTransaction } from '@/stores/spend.store';
import { useFireStore, FireRecord } from '@/stores/fire.store';
import { useGamificationStore } from '@/stores/gamification.store';
import { useTasksStore } from '@/stores/tasks.store';
import { calculateFireNumber, calculateMonthsToFireWithPayoff, calculateYearsToFireWithPayoff, formatCurrency, formatCurrencyShort } from '@/lib/calculations';
import { calculateFreedomDays } from '@/lib/gamification';
import { LIFESTYLE_SWR } from '@/lib/fire';
import {
  Colors,
  FontSize,
  FontWeight,
  Spacing,
  BorderRadius,
  categoryColors,
  categoryLabels,
  categoryIcons,
} from '@/constants/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Card } from '@/components/ui/cards/Card';
import { InputField } from '@/components/ui/inputs/InputField';
import { GradientButton } from '@/components/ui/layout/GradientButton';
import { XPCelebrationModal } from '@/components/ui/modals/XPCelebrationModal';
import { LevelUpModal } from '@/components/ui/modals/LevelUpModal';
import { BadgeUnlockModal } from '@/components/ui/modals/BadgeUnlockModal';
import { StreakMilestoneModal } from '@/components/ui/modals/StreakMilestoneModal';
import type { BadgeDefinition, LevelDefinition, StreakType } from '@/lib/gamification';

// ─── FIRE impact helper ───────────────────────────────────────────────────────

interface FireImpact {
  monthsAccelerated: number;
  newRetireAtAge: number;
  currentRetireAtAge: number;
  fireNumberReduction: number;
}

function calcFireImpact(
  calc: FireRecord,
  currentAge: number,
  monthlySaving: number
): FireImpact | null {
  if (
    !calc.fire_number ||
    calc.years_to_fire == null ||
    calc.years_to_fire >= 999 ||
    currentAge <= 0 ||
    monthlySaving <= 0
  ) return null;

  const newMonthlyExpenses = Math.max(0, (calc.monthly_expenses ?? 0) - monthlySaving);
  const newMonthlySavings = Math.max(0, (calc.monthly_savings ?? 0) + monthlySaving);

  const newFireNumber = calculateFireNumber({
    monthlyExpenses: newMonthlyExpenses,
    currentAge,
    retirementAge: calc.retirement_age ?? currentAge + 30,
    expectedReturnPct: calc.expected_return_pct ?? 12,
    inflationRatePct: calc.inflation_rate_pct ?? 6,
    swrPct: calc.lifestyle ? LIFESTYLE_SWR[calc.lifestyle] : undefined,
  });

  const baselineMonths = calculateMonthsToFireWithPayoff({
    fireNumber: calc.fire_number,
    currentSavings: calc.current_savings ?? 0,
    monthlySavings: calc.monthly_savings ?? 0,
    expectedReturnPct: calc.expected_return_pct ?? 12,
    currentAge,
    monthlyEmi: calc.monthly_emi,
    loanTenureYears: calc.loan_tenure_years,
  });

  const newMonths = calculateMonthsToFireWithPayoff({
    fireNumber: newFireNumber,
    currentSavings: calc.current_savings ?? 0,
    monthlySavings: newMonthlySavings,
    expectedReturnPct: calc.expected_return_pct ?? 12,
    currentAge,
    monthlyEmi: calc.monthly_emi,
    loanTenureYears: calc.loan_tenure_years,
  });

  const monthsAccelerated = Math.max(0, baselineMonths - newMonths);
  const currentRetireAtAge = calc.retire_at_age ?? currentAge + calc.years_to_fire;
  const newRetireAtAge = Math.floor(currentAge + newMonths / 12);

  return {
    monthsAccelerated,
    newRetireAtAge,
    currentRetireAtAge,
    fireNumberReduction: calc.fire_number - newFireNumber,
  };
}

function formatMonthsEarlier(months: number): string {
  if (months <= 0) return 'No change';
  const yrs = Math.floor(months / 12);
  const mos = months % 12;
  if (yrs === 0) return mos === 1 ? '1 month earlier' : `${mos} months earlier`;
  if (mos === 0) return yrs === 1 ? '1 year earlier' : `${yrs} years earlier`;
  const yPart = yrs === 1 ? '1 year' : `${yrs} years`;
  const mPart = mos === 1 ? '1 month' : `${mos} months`;
  return `${yPart} ${mPart} earlier`;
}

// ─── EMI delay helper ─────────────────────────────────────────────────────────

interface EmiDelayResult {
  yearsDelayed: number;
  currentRetireAtAge: number;
  emiFreeRetireAtAge: number;
  emiFreeMonthlySavings: number;
}

function calcEmiDelay(calc: FireRecord, currentAge: number): EmiDelayResult | null {
  const emi = calc.monthly_emi ?? 0;
  if (emi <= 0 || !calc.fire_number || calc.years_to_fire == null || calc.years_to_fire >= 999 || currentAge <= 0) return null;
  const emiFreeSavings = (calc.monthly_savings ?? 0) + emi;
  if (emiFreeSavings <= 0) return null;

  const emiFreeYears = calculateYearsToFireWithPayoff({
    fireNumber: calc.fire_number,
    currentSavings: calc.current_savings ?? 0,
    monthlySavings: emiFreeSavings,
    expectedReturnPct: calc.expected_return_pct ?? 12,
    currentAge,
    monthlyEmi: 0,
    loanTenureYears: 0,
  });

  if (emiFreeYears >= 999) return null;

  return {
    yearsDelayed: Math.max(0, calc.years_to_fire - emiFreeYears),
    currentRetireAtAge: calc.retire_at_age ?? currentAge + calc.years_to_fire,
    emiFreeRetireAtAge: currentAge + emiFreeYears,
    emiFreeMonthlySavings: emiFreeSavings,
  };
}

// ─── Tenure → corpus inflation helper ────────────────────────────────────────

interface TenureImpactResult {
  targetRetireAge: number;
  actualRetireAge: number;
  extraDelayYears: number;
  targetFireNumber: number;
  actualFireNumber: number;
  extraCorpus: number;
  monthlyExpensesAtActualRetirement: number;
}

function calcTenureImpact(calc: FireRecord, currentAge: number): TenureImpactResult | null {
  const emi = calc.monthly_emi ?? 0;
  const tenure = calc.loan_tenure_years ?? 0;
  if (emi <= 0 || tenure <= 0 || !calc.fire_number || calc.years_to_fire == null || calc.years_to_fire >= 999 || currentAge <= 0) return null;

  const targetRetireAge = calc.retirement_age ?? currentAge + 20;
  const actualRetireAge = calc.retire_at_age ?? currentAge + calc.years_to_fire;
  if (actualRetireAge <= targetRetireAge) return null;

  const swrPct = calc.lifestyle ? LIFESTYLE_SWR[calc.lifestyle] : undefined;
  const inflationRate = calc.inflation_rate_pct ?? 6;

  const actualFireNumber = calculateFireNumber({
    monthlyExpenses: calc.monthly_expenses ?? 0,
    currentAge,
    retirementAge: actualRetireAge,
    expectedReturnPct: calc.expected_return_pct ?? 12,
    inflationRatePct: inflationRate,
    swrPct,
  });

  const monthlyExpensesAtActualRetirement = Math.round(
    (calc.monthly_expenses ?? 0) * Math.pow(1 + inflationRate / 100, actualRetireAge - currentAge)
  );

  return {
    targetRetireAge,
    actualRetireAge,
    extraDelayYears: actualRetireAge - targetRetireAge,
    targetFireNumber: calc.fire_number,
    actualFireNumber,
    extraCorpus: actualFireNumber - calc.fire_number,
    monthlyExpensesAtActualRetirement,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FireImpactBadge({ impact, saving }: { impact: FireImpact | null; saving: number }) {
  if (!impact) return null;
  return (
    <View style={impactStyles.box}>
      <View style={impactStyles.row}>
        <Ionicons name="flash" size={14} color={Colors.success} />
        <Text style={impactStyles.headline}>
          {impact.monthsAccelerated > 0
            ? `Retire ${formatMonthsEarlier(impact.monthsAccelerated)}`
            : 'Minimal impact on retire date'}
        </Text>
      </View>
      <Text style={impactStyles.sub}>
        Age {impact.newRetireAtAge} instead of {impact.currentRetireAtAge}
      </Text>
      <Text style={impactStyles.sub}>
        FIRE corpus reduces by {formatCurrency(impact.fireNumberReduction)}
      </Text>
      <Text style={impactStyles.savingLine}>
        ↑ Extra {formatCurrency(saving)}/mo invested
      </Text>
    </View>
  );
}

const impactStyles = StyleSheet.create({
  box: {
    backgroundColor: `${Colors.success}15`,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: `${Colors.success}44`,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  headline: {
    color: Colors.success,
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
  sub: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  savingLine: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: 6,
  },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

const SAVING_PRESETS = [1000, 2000, 3000, 5000, 7500, 10000];

export default function SpendAnalyzerScreen() {
  const { user, profile } = useAuthStore();
  const { analysis, uploading, loading, fetchAnalysis, uploadAndAnalyze, analyzeWithPassword, toggleIgnore } = useSpendStore();
  const { calculation, fetchCalculation } = useFireStore();
  const { awardXP, updateStreak, progressQuest } = useGamificationStore();
  const { seedInsightTasks } = useTasksStore();
  const [activeTab, setActiveTab] = useState<'spend' | 'emi'>('spend');
  const [error, setError] = useState<string | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordValue, setPasswordValue] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [selectedSaving, setSelectedSaving] = useState(3000);
  const [customSavingText, setCustomSavingText] = useState('');
  type PendingModal =
    | { type: 'xp'; xpEarned: number; freedomDaysEarned: number; isFirst: boolean }
    | { type: 'levelup'; previousLevel: number; newLevel: number; levelDefinition: LevelDefinition; newBadges: BadgeDefinition[] }
    | { type: 'badge'; badges: BadgeDefinition[] }
    | { type: 'streak'; streakType: StreakType; count: number };

  const [modalQueue, setModalQueue] = useState<PendingModal[]>([]);
  const currentModal = modalQueue[0] ?? null;
  const advanceQueue = () => setModalQueue((q) => q.slice(1));
  const [outlierCardVisible, setOutlierCardVisible] = useState(false);
  // null = use live ignored IDs (initial DB load); array = committed snapshot from Generate Insights
  const [committedIgnoredIds, setCommittedIgnoredIds] = useState<string[] | null>(null);

  useEffect(() => {
    if (user) {
      fetchAnalysis(user.id);
      fetchCalculation(user.id);
    }
  }, [user]);

  useFocusEffect(useCallback(() => {
    if (user) track(user.id, 'screen_viewed', { screen: 'spend_analyzer' });
  }, [user?.id]));

  // Seed loan-based tasks whenever the FIRE calculation changes (covers existing users)
  useEffect(() => {
    if (user && calculation) {
      seedInsightTasks(user.id, null, calculation);
    }
  }, [user?.id, calculation?.id]);

  const STMT_MONTHLY_CAP = 5;
  const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100];

  const triggerSpendGamification = async (isFirst: boolean) => {
    if (!user?.id) return;

    const monthKey = `stmt_uploads_${new Date().toISOString().slice(0, 7)}`;
    const stored = await AsyncStorage.getItem(monthKey);
    const monthCount = stored ? parseInt(stored, 10) : 0;

    if (monthCount >= STMT_MONTHLY_CAP) return; // cap reached, no XP this month

    const currentAnalysis = useSpendStore.getState().analysis;
    const annualExpenses = (currentAnalysis?.avg_monthly_spend ?? 0) * 12;
    const freedomDaysEarned = calculateFreedomDays(selectedSaving, annualExpenses);

    try {
      const reward = await awardXP(
        user.id,
        isFirst ? 'first_spend_analysis' : 'track_expenses',
        { freedomDaysEarned, snapshot: { spendAnalysisDone: true } }
      );
      const newStreakCount = await updateStreak(user.id, 'tracking');
      await progressQuest(user.id, 'weekly_spend_review');
      await AsyncStorage.setItem(monthKey, String(monthCount + 1));

      const queue: PendingModal[] = [];
      queue.push({ type: 'xp', xpEarned: reward.xpEarned, freedomDaysEarned, isFirst });
      if (reward.leveledUp) {
        queue.push({ type: 'levelup', previousLevel: reward.previousLevel, newLevel: reward.newLevel, levelDefinition: reward.levelDefinition, newBadges: reward.newBadges });
      } else if (reward.newBadges.length > 0) {
        queue.push({ type: 'badge', badges: reward.newBadges });
      }
      if (STREAK_MILESTONES.includes(newStreakCount)) {
        queue.push({ type: 'streak', streakType: 'tracking', count: newStreakCount });
      }
      setModalQueue(queue);
    } catch {
      // non-fatal
    }
  };

  const handleUpload = async () => {
    const wasFirstAnalysis = !analysis;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];
      if (!user) return;
      setError(null);
      await uploadAndAnalyze(user.id, file.uri, file.name ?? 'statement.pdf');
      setOutlierCardVisible(true);
      setCommittedIgnoredIds(null);
      const freshAnalysis = useSpendStore.getState().analysis;
      track(user.id, 'statement_uploaded', {
        is_first: wasFirstAnalysis,
        analysis_period_months: freshAnalysis?.analysis_period_months ?? 1,
      });
      await seedInsightTasks(user.id, freshAnalysis, null);
      await triggerSpendGamification(wasFirstAnalysis);
    } catch (e: any) {
      if ((e as any).code === 'PASSWORD_PROTECTED') {
        setPasswordValue('');
        setPasswordError(null);
        setShowPasswordModal(true);
        return;
      }
      setError(e.message ?? 'Upload failed');
      Alert.alert('Upload Failed', e.message ?? 'Something went wrong. Please try again.');
    }
  };

  const handlePasswordSubmit = async () => {
    if (!user || !passwordValue.trim()) return;
    setPasswordError(null);
    const wasFirstAnalysis = !analysis;
    try {
      await analyzeWithPassword(user.id, passwordValue);
      setShowPasswordModal(false);
      setPasswordValue('');
      setOutlierCardVisible(true);
      setCommittedIgnoredIds(null);
      const freshAnalysis = useSpendStore.getState().analysis;
      await seedInsightTasks(user.id, freshAnalysis, null);
      await triggerSpendGamification(wasFirstAnalysis);
    } catch (e: any) {
      setPasswordError(e.message ?? 'Failed to unlock PDF');
    }
  };

  const handlePasswordCancel = () => {
    setShowPasswordModal(false);
    setPasswordValue('');
    setPasswordError(null);
  };

  const handleGenerateInsights = () => {
    setCommittedIgnoredIds([...(analysis?.ignored_transaction_ids ?? [])]);
    setOutlierCardVisible(false);
    // Seed spend-based tasks using the effective analysis (with user's ignored selections applied)
    if (user && effectiveAnalysis) {
      seedInsightTasks(user.id, effectiveAnalysis, null);
    }
  };

  // Adjust category breakdown and monthly trend for ignored outliers.
  // avg_monthly_spend uses the persisted effective_avg_monthly_spend field so both
  // screens always read from the same DB source of truth.
  const effectiveAnalysis = useMemo(() => {
    if (!analysis) return null;
    // Use committed snapshot when available; fall back to live IDs for initial DB load
    const ids = committedIgnoredIds ?? (analysis.ignored_transaction_ids ?? []);
    const ignoredIds = new Set(ids);
    const ignoredOutliers = (analysis.outlier_transactions ?? []).filter((o) => ignoredIds.has(o.id));

    const effectiveCategoryBreakdown = { ...analysis.category_breakdown };
    for (const o of ignoredOutliers) {
      effectiveCategoryBreakdown[o.category] = Math.max(
        0,
        (effectiveCategoryBreakdown[o.category] ?? 0) - o.amount
      );
    }

    const effectiveMonthlyTrend = analysis.monthly_trend.map((item) => {
      const ignoredInMonth = ignoredOutliers
        .filter((o) => o.month === item.month)
        .reduce((s, o) => s + o.amount, 0);
      return { ...item, amount: Math.max(0, item.amount - ignoredInMonth) };
    });

    return {
      ...analysis,
      avg_monthly_spend: analysis.effective_avg_monthly_spend ?? analysis.avg_monthly_spend,
      category_breakdown: effectiveCategoryBreakdown,
      monthly_trend: effectiveMonthlyTrend,
    };
  }, [analysis, committedIgnoredIds]);

  // ─── Fast-commerce recommendation ─────────────────────────────────────────
  const fastCommerceRec = useMemo(() => {
    const age = profile?.age ?? 0;
    const breakdown = effectiveAnalysis?.category_breakdown;

    const foodSpend = breakdown?.food ?? 0;
    const shoppingSpend = breakdown?.shopping ?? 0;

    // Estimate: ~60% of food is delivery apps, ~50% of shopping is quick commerce
    const estimatedDelivery = Math.round(foodSpend * 0.6);
    const estimatedQuickCommerce = Math.round(shoppingSpend * 0.5);
    const totalEstimate = estimatedDelivery + estimatedQuickCommerce;

    // Recommend 30% reduction
    const saving30 = Math.round(totalEstimate * 0.3);

    const impact = calculation && age > 0
      ? calcFireImpact(calculation, age, saving30)
      : null;

    return { estimatedDelivery, estimatedQuickCommerce, totalEstimate, saving30, impact };
  }, [effectiveAnalysis, calculation, profile]);

  // ─── Subscription recommendation ──────────────────────────────────────────
  const subscriptionRec = useMemo(() => {
    const age = profile?.age ?? 0;
    const entertainmentSpend = effectiveAnalysis?.category_breakdown?.entertainment ?? 0;
    // Estimate ~75% of entertainment is subscriptions (OTT, music, apps)
    const estimatedSubscriptions = Math.round(entertainmentSpend * 0.75);

    // Three savings scenarios (cancel 1, 2-3, or most subscriptions)
    const scenarios = [
      { label: 'Cancel 1–2 subscriptions', saving: 600 },
      { label: 'Cancel 3–4 subscriptions', saving: 1500 },
      { label: 'Cancel most non-essentials', saving: 3000 },
    ].map((s) => ({
      ...s,
      impact: calculation && age > 0 ? calcFireImpact(calculation, age, s.saving) : null,
    }));

    return { estimatedSubscriptions, scenarios };
  }, [effectiveAnalysis, calculation, profile]);

  // ─── EMI impact memos ──────────────────────────────────────────────────────
  const emiDelayResult = useMemo(() => {
    const age = profile?.age ?? 0;
    return calculation && age > 0 ? calcEmiDelay(calculation, age) : null;
  }, [calculation, profile]);

  const tenureImpactResult = useMemo(() => {
    const age = profile?.age ?? 0;
    return calculation && age > 0 ? calcTenureImpact(calculation, age) : null;
  }, [calculation, profile]);

  const hasEmi = (calculation?.monthly_emi ?? 0) > 0 && (calculation?.loan_tenure_years ?? 0) > 0;

  // ─── Chart data ────────────────────────────────────────────────────────────
  const totalCategorySpend = effectiveAnalysis
    ? Object.values(effectiveAnalysis.category_breakdown).reduce((sum, v) => sum + v, 0)
    : 0;

  const categoryEntries = effectiveAnalysis
    ? Object.entries(effectiveAnalysis.category_breakdown)
        .filter(([, amount]) => amount > 0)
        .sort(([, a], [, b]) => b - a)
    : [];

  const pieData = categoryEntries.map(([cat, amount]) => ({
    value: amount,
    color: categoryColors[cat] ?? Colors.textMuted,
  }));

  const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const barData = effectiveAnalysis?.monthly_trend?.map((item) => ({
    value: item.amount / 1000,
    label: MONTH_SHORT[parseInt(item.month.slice(5), 10) - 1] ?? item.month.slice(5),
    frontColor: Colors.primary,
    topLabelComponent: () => (
      <Text style={{ color: Colors.textMuted, fontSize: 8 }}>
        {formatCurrencyShort(item.amount)}
      </Text>
    ),
  })) ?? [];

  const hasFire = !!(calculation?.fire_number && calculation.years_to_fire != null && calculation.years_to_fire < 999);

  // ── Spend Insights tab content ─────────────────────────────────────────────
  function renderSpendTab() {
    return (
      <>
        <TouchableOpacity
          style={styles.uploadZone}
          onPress={handleUpload}
          disabled={uploading}
        >
          {uploading ? (
            <View style={styles.uploadingState}>
              <ActivityIndicator color={Colors.primary} size="large" />
              <Text style={styles.uploadingText}>Analyzing your statement...</Text>
              <Text style={styles.uploadingSubtext}>This may take a few seconds</Text>
            </View>
          ) : (
            <>
              <Ionicons name="document-text-outline" size={48} color={Colors.textMuted} style={styles.uploadIconStyle} />
              <Text style={styles.uploadTitle}>
                {analysis ? 'Upload New Statement' : 'Upload Statement'}
              </Text>
              <Text style={styles.uploadSubtext}>Tap to select a PDF</Text>
              <View style={styles.bankChips}>
                {['HDFC', 'ICICI', 'SBI', 'Axis', 'Kotak'].map((bank) => (
                  <View key={bank} style={styles.chip}>
                    <Text style={styles.chipText}>{bank}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </TouchableOpacity>

        {error && (
          <View style={styles.errorBanner}>
            <View style={styles.errorInner}>
              <Ionicons name="warning-outline" size={16} color={Colors.error} />
              <Text style={styles.errorText}> {error}</Text>
            </View>
          </View>
        )}

        {loading && (
          <View style={styles.loadingState}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.loadingText}>Loading analysis...</Text>
          </View>
        )}

        {outlierCardVisible && analysis && !loading && (
          <Card style={styles.outlierCard}>
            <View style={styles.outlierHeader}>
              <Ionicons name="alert-circle-outline" size={18} color={Colors.warning} style={{ marginRight: 6 }} />
              <Text style={styles.outlierTitle}>One-time Charges</Text>
            </View>
            <Text style={styles.outlierSubtitle}>
              These large charges appear once and may inflate your monthly averages.
              Mark them as ignored to exclude from calculations.
            </Text>
            {(analysis.outlier_transactions ?? []).length === 0 ? (
              <View style={styles.outlierEmpty}>
                <Ionicons name="checkmark-circle-outline" size={26} color={Colors.success} />
                <Text style={styles.outlierEmptyText}>No one-time charges detected</Text>
              </View>
            ) : (
              (analysis.outlier_transactions ?? []).map((txn: OutlierTransaction) => {
                const ignored = (analysis.ignored_transaction_ids ?? []).includes(txn.id);
                return (
                  <View key={txn.id} style={[styles.outlierRow, ignored && styles.outlierRowIgnored]}>
                    <View style={styles.outlierRowLeft}>
                      <View style={[styles.outlierCategoryDot, { backgroundColor: categoryColors[txn.category] ?? Colors.textMuted }]} />
                      <View style={styles.outlierRowInfo}>
                        <Text style={[styles.outlierDesc, ignored && styles.outlierTextDim]} numberOfLines={1}>
                          {txn.description}
                        </Text>
                        <Text style={styles.outlierMeta}>
                          {categoryLabels[txn.category] ?? txn.category} · {txn.date}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.outlierRowRight}>
                      <Text style={[styles.outlierAmount, ignored && styles.outlierTextDim]}>
                        {formatCurrency(txn.amount)}
                      </Text>
                      <TouchableOpacity
                        style={[styles.ignoreBtn, ignored && styles.ignoreBtnActive]}
                        onPress={() => toggleIgnore(txn.id)}
                      >
                        <Text style={[styles.ignoreBtnText, ignored && styles.ignoreBtnTextActive]}>
                          {ignored ? 'Ignored' : 'Ignore'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
            <TouchableOpacity style={styles.generateInsightsBtn} onPress={handleGenerateInsights}>
              <Ionicons name="flash" size={15} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.generateInsightsBtnText}>Generate Insights</Text>
            </TouchableOpacity>
          </Card>
        )}

        {!outlierCardVisible && analysis && effectiveAnalysis && !loading && (
          <Card style={styles.avgCard} elevated>
            <Text style={styles.avgLabel}>Average Monthly Spend</Text>
            <Text style={styles.avgAmount}>{formatCurrency(effectiveAnalysis.avg_monthly_spend)}</Text>
            <Text style={styles.avgPeriod}>
              Based on {analysis.analysis_period_months} month
              {analysis.analysis_period_months !== 1 ? 's' : ''} of data
            </Text>
          </Card>
        )}

        {/* ── Fast-Commerce Recommendations ── */}
        <Text style={styles.sectionLabel}>FAST-COMMERCE APPS</Text>
        <Card style={styles.recCard}>
          <View style={styles.recHeader}>
            <View style={[styles.recIconBox, { backgroundColor: `${Colors.accent}22` }]}>
              <Ionicons name="cart-outline" size={20} color={Colors.accent} />
            </View>
            <View style={styles.recHeaderText}>
              <Text style={styles.recTitle}>Delivery & Quick Commerce</Text>
              <Text style={styles.recAppList}>Swiggy · Zomato · Amazon · Myntra · Meesho · Nykaa</Text>
            </View>
          </View>

          {effectiveAnalysis ? (
            <>
              <View style={styles.recSpendRow}>
                <View style={styles.recSpendItem}>
                  <Text style={styles.recSpendLabel}>Food delivery (est.)</Text>
                  <Text style={styles.recSpendValue}>{formatCurrency(fastCommerceRec.estimatedDelivery)}/mo</Text>
                </View>
                <View style={styles.recSpendDivider} />
                <View style={styles.recSpendItem}>
                  <Text style={styles.recSpendLabel}>Quick commerce (est.)</Text>
                  <Text style={styles.recSpendValue}>{formatCurrency(fastCommerceRec.estimatedQuickCommerce)}/mo</Text>
                </View>
              </View>

              <View style={styles.recAction}>
                <Ionicons name="trending-down-outline" size={15} color={Colors.warning} style={{ marginRight: 6 }} />
                <Text style={styles.recActionText}>
                  Reduce orders by 30% → Save{' '}
                  <Text style={styles.recActionHighlight}>{formatCurrency(fastCommerceRec.saving30)}/mo</Text>
                </Text>
              </View>

              {hasFire ? (
                <FireImpactBadge impact={fastCommerceRec.impact} saving={fastCommerceRec.saving30} />
              ) : (
                <View style={styles.noFireNote}>
                  <Text style={styles.noFireText}>Set up FIRE goals to see retirement impact</Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.recPlaceholder}>
              <Text style={styles.recPlaceholderText}>
                Upload a bank statement to get personalized estimates based on your actual food & shopping spend.
              </Text>
              {hasFire && (
                <View style={styles.recExampleBox}>
                  <Text style={styles.recExampleLabel}>Example: if you save ₹3,000/mo on delivery</Text>
                  <FireImpactBadge impact={calcFireImpact(calculation!, profile?.age ?? 30, 3000)} saving={3000} />
                </View>
              )}
            </View>
          )}
        </Card>

        {/* ── Subscription Recommendations ── */}
        <Text style={styles.sectionLabel}>SUBSCRIPTIONS</Text>
        <Card style={styles.recCard}>
          <View style={styles.recHeader}>
            <View style={[styles.recIconBox, { backgroundColor: `${Colors.primary}22` }]}>
              <Ionicons name="repeat-outline" size={20} color={Colors.primary} />
            </View>
            <View style={styles.recHeaderText}>
              <Text style={styles.recTitle}>Streaming & Digital Subscriptions</Text>
              <Text style={styles.recAppList}>Netflix · Hotstar · Spotify · Amazon Prime · YouTube Premium</Text>
            </View>
          </View>

          {effectiveAnalysis && subscriptionRec.estimatedSubscriptions > 0 && (
            <View style={styles.recSpendRow}>
              <View style={styles.recSpendItem}>
                <Text style={styles.recSpendLabel}>Subscriptions (est.)</Text>
                <Text style={styles.recSpendValue}>{formatCurrency(subscriptionRec.estimatedSubscriptions)}/mo</Text>
              </View>
            </View>
          )}

          <Text style={styles.subScenarioHeader}>What if you cancelled some?</Text>

          {subscriptionRec.scenarios.map((scenario, i) => (
            <View key={i} style={[styles.subScenarioRow, i < subscriptionRec.scenarios.length - 1 && styles.subScenarioBorder]}>
              <View style={styles.subScenarioLeft}>
                <Text style={styles.subScenarioLabel}>{scenario.label}</Text>
                <Text style={styles.subScenarioSaving}>Save {formatCurrency(scenario.saving)}/mo</Text>
              </View>
              {hasFire && scenario.impact && scenario.impact.monthsAccelerated > 0 ? (
                <View style={styles.subScenarioBadge}>
                  <Ionicons name="flash" size={11} color={Colors.success} />
                  <Text style={styles.subScenarioBadgeText}>
                    {formatMonthsEarlier(scenario.impact.monthsAccelerated)}
                  </Text>
                </View>
              ) : hasFire ? (
                <View style={[styles.subScenarioBadge, { backgroundColor: `${Colors.textMuted}18` }]}>
                  <Text style={[styles.subScenarioBadgeText, { color: Colors.textMuted }]}>Minimal impact</Text>
                </View>
              ) : null}
            </View>
          ))}

          {hasFire && (
            <FireImpactBadge
              impact={subscriptionRec.scenarios[1].impact}
              saving={subscriptionRec.scenarios[1].saving}
            />
          )}

          {!hasFire && (
            <View style={styles.noFireNote}>
              <Text style={styles.noFireText}>Set up FIRE goals to see retirement impact</Text>
            </View>
          )}
        </Card>

        {/* ── Custom Monthly Savings Simulator ── */}
        <Text style={styles.sectionLabel}>REDUCE MONTHLY SPEND</Text>
        <Card style={styles.recCard}>
          <View style={styles.recHeader}>
            <View style={[styles.recIconBox, { backgroundColor: `${Colors.warning}22` }]}>
              <Ionicons name="trending-down-outline" size={20} color={Colors.warning} />
            </View>
            <View style={styles.recHeaderText}>
              <Text style={styles.recTitle}>Savings Simulator</Text>
              <Text style={styles.recAppList}>See how cutting monthly spend accelerates your FIRE date</Text>
            </View>
          </View>

          <Text style={styles.subScenarioHeader}>How much could you cut each month?</Text>

          <View style={presetStyles.row}>
            {SAVING_PRESETS.map((amt) => (
              <TouchableOpacity
                key={amt}
                style={[presetStyles.chip, selectedSaving === amt && !customSavingText && presetStyles.chipActive]}
                onPress={() => { setSelectedSaving(amt); setCustomSavingText(''); }}
              >
                <Text style={[presetStyles.chipText, selectedSaving === amt && !customSavingText && presetStyles.chipTextActive]}>
                  ₹{amt >= 1000 ? `${amt / 1000}K` : amt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={presetStyles.customRow}>
            <Text style={presetStyles.customLabel}>Custom amount</Text>
            <View style={presetStyles.customInputWrapper}>
              <Text style={presetStyles.customPrefix}>₹</Text>
              <TextInput
                style={presetStyles.customInput}
                keyboardType="numeric"
                placeholder="e.g. 1500"
                placeholderTextColor={Colors.textMuted}
                value={customSavingText}
                onChangeText={(val) => {
                  setCustomSavingText(val);
                  const parsed = parseInt(val.replace(/[^0-9]/g, ''), 10);
                  if (!isNaN(parsed) && parsed > 0) setSelectedSaving(parsed);
                }}
              />
            </View>
          </View>

          {hasFire ? (
            <FireImpactBadge
              impact={calculation && (profile?.age ?? 0) > 0
                ? calcFireImpact(calculation, profile!.age!, selectedSaving)
                : null}
              saving={selectedSaving}
            />
          ) : (
            <View style={styles.noFireNote}>
              <Text style={styles.noFireText}>Set up FIRE goals to see retirement impact</Text>
            </View>
          )}
        </Card>

        {/* ── Spend breakdown charts ── */}
        {!outlierCardVisible && analysis && effectiveAnalysis && !loading && (
          <>
            {pieData.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>SPEND BREAKDOWN</Text>
                <Card style={styles.chartCard}>
                  <Text style={styles.chartTitle}>Spending by Category</Text>
                  <View style={styles.pieContainer}>
                    <PieChart
                      key={pieData.map((d) => d.value).join(',')}
                      data={pieData}
                      donut
                      radius={90}
                      innerRadius={55}
                      centerLabelComponent={() => (
                        <Ionicons name="card-outline" size={28} color={Colors.textMuted} />
                      )}
                    />
                  </View>
                  <View style={styles.legendList}>
                    {categoryEntries.map(([cat, amount]) => {
                      const pct = Math.round((amount / totalCategorySpend) * 100);
                      return (
                        <View key={cat} style={styles.legendRow}>
                          <View style={styles.legendLeft}>
                            <View style={[styles.legendSwatch, { backgroundColor: categoryColors[cat] ?? Colors.textMuted }]} />
                            <Ionicons
                              name={(categoryIcons[cat] ?? 'apps-outline') as React.ComponentProps<typeof Ionicons>['name']}
                              size={15}
                              color={categoryColors[cat] ?? Colors.textMuted}
                              style={styles.legendIcon}
                            />
                            <Text style={styles.legendName}>{categoryLabels[cat] ?? cat}</Text>
                          </View>
                          <View style={styles.legendRight}>
                            <Text style={styles.legendAmount}>{formatCurrency(amount)}</Text>
                            <View style={[styles.legendBadge, { backgroundColor: `${categoryColors[cat] ?? Colors.textMuted}22` }]}>
                              <Text style={[styles.legendPct, { color: categoryColors[cat] ?? Colors.textMuted }]}>{pct}%</Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </Card>
              </>
            )}

            {barData.length > 0 && (
              <Card style={styles.chartCard}>
                <Text style={styles.chartTitle}>Monthly Trend</Text>
                <View style={styles.barChartWrapper}>
                  <View style={styles.yAxisLabelContainer}>
                    <Text style={styles.yAxisLabel}>Spend (₹K)</Text>
                  </View>
                  <View style={styles.barChartInner}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <BarChart
                        key={barData.map((d) => d.value).join(',')}
                        data={barData}
                        barWidth={32}
                        spacing={12}
                        roundedTop
                        xAxisThickness={0}
                        yAxisThickness={0}
                        yAxisTextStyle={{ color: Colors.textMuted, fontSize: 10 }}
                        xAxisLabelTextStyle={{ color: Colors.textMuted, fontSize: 10 }}
                        noOfSections={4}
                        maxValue={Math.max(...barData.map((d) => d.value)) * 1.2}
                        width={Math.max(300, barData.length * 50)}
                        height={160}
                        backgroundColor={Colors.surface}
                        yAxisLabelSuffix="K"
                      />
                    </ScrollView>
                    <Text style={styles.xAxisLabel}>Month</Text>
                  </View>
                </View>
              </Card>
            )}

            {analysis.insights?.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>INSIGHTS</Text>
                {analysis.insights.map((insight, i) => (
                  <View key={i} style={styles.insightCard}>
                    <Text style={styles.insightText}>{insight}</Text>
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </>
    );
  }

  // ── EMI Insights tab content ────────────────────────────────────────────────
  function renderEmiTab() {
    if (!hasFire) {
      return (
        <View style={styles.noFireNote}>
          <Ionicons name="flame-outline" size={32} color={Colors.textMuted} style={{ marginBottom: Spacing.sm }} />
          <Text style={[styles.noFireText, { fontSize: FontSize.sm, textAlign: 'center' }]}>
            Set up your FIRE goals on the FIRE tab to see how your loan impacts your retirement timeline.
          </Text>
        </View>
      );
    }

    if (!hasEmi) {
      return (
        <View style={styles.noFireNote}>
          <Ionicons name="checkmark-circle-outline" size={32} color={Colors.success} style={{ marginBottom: Spacing.sm }} />
          <Text style={[styles.noFireText, { fontSize: FontSize.sm, textAlign: 'center', color: Colors.success }]}>
            No active EMI — you're in the fast lane!
          </Text>
          <Text style={[styles.noFireText, { marginTop: Spacing.xs, textAlign: 'center' }]}>
            Add your loan details on the FIRE tab if you have an active loan.
          </Text>
        </View>
      );
    }

    return (
      <>
        {/* Card 1: EMI Delay */}
        <Text style={styles.sectionLabel}>EMI DELAY</Text>
        <Card style={styles.recCard}>
          <View style={styles.recHeader}>
            <View style={[styles.recIconBox, { backgroundColor: `${Colors.error}22` }]}>
              <Ionicons name="hourglass-outline" size={20} color={Colors.error} />
            </View>
            <View style={styles.recHeaderText}>
              <Text style={styles.recTitle}>Your EMI is Slowing You Down</Text>
              <Text style={styles.recAppList}>
                Every rupee spent on EMI is a rupee not compounding for your freedom
              </Text>
            </View>
          </View>

          {emiDelayResult ? (
            <>
              <View style={loanStyles.statBox}>
                <Text style={loanStyles.statBoxLabel}>Retirement delayed by</Text>
                <Text style={[loanStyles.statBoxValue, { color: Colors.error }]}>
                  {emiDelayResult.yearsDelayed > 0
                    ? `${emiDelayResult.yearsDelayed} year${emiDelayResult.yearsDelayed !== 1 ? 's' : ''}`
                    : 'Less than 1 year'}
                </Text>
                <Text style={loanStyles.statBoxSub}>
                  due to {formatCurrency(calculation!.monthly_emi!)}/mo EMI
                </Text>
              </View>

              <View style={loanStyles.compareRow}>
                <View style={loanStyles.compareCol}>
                  <Text style={loanStyles.compareLabel}>With EMI</Text>
                  <Text style={loanStyles.compareValue}>{formatCurrency(calculation!.monthly_savings ?? 0)}/mo</Text>
                  <Text style={[loanStyles.compareAge, { color: Colors.error }]}>
                    Retire at {emiDelayResult.currentRetireAtAge}
                  </Text>
                </View>
                <View style={loanStyles.compareArrow}>
                  <Ionicons name="arrow-forward" size={18} color={Colors.textMuted} />
                </View>
                <View style={loanStyles.compareCol}>
                  <Text style={loanStyles.compareLabel}>EMI-free</Text>
                  <Text style={loanStyles.compareValue}>{formatCurrency(emiDelayResult.emiFreeMonthlySavings)}/mo</Text>
                  <Text style={[loanStyles.compareAge, { color: Colors.success }]}>
                    Retire at {emiDelayResult.emiFreeRetireAtAge}
                  </Text>
                </View>
              </View>

              <View style={loanStyles.tipBox}>
                <Ionicons name="bulb-outline" size={13} color={Colors.primary} style={{ marginRight: 6, marginTop: 1 }} />
                <Text style={loanStyles.tipText}>
                  Clearing your loan early (via prepayment) is one of the highest-return moves you can make — it instantly frees up {formatCurrency(calculation!.monthly_emi!)}/mo to invest.
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.noFireNote}>
              <Text style={styles.noFireText}>Not enough data to compute EMI delay</Text>
            </View>
          )}
        </Card>

        {/* Card 2: Tenure → FIRE corpus inflation */}
        <Text style={styles.sectionLabel}>LOAN TENURE IMPACT</Text>
        <Card style={styles.recCard}>
          <View style={styles.recHeader}>
            <View style={[styles.recIconBox, { backgroundColor: `${Colors.warning}22` }]}>
              <Ionicons name="stats-chart-outline" size={20} color={Colors.warning} />
            </View>
            <View style={styles.recHeaderText}>
              <Text style={styles.recTitle}>Long Tenure = Bigger Target</Text>
              <Text style={styles.recAppList}>
                A longer loan pushes your retirement later — and inflation makes the corpus grow too
              </Text>
            </View>
          </View>

          {tenureImpactResult ? (
            <>
              <View style={loanStyles.explainerBox}>
                <Text style={loanStyles.explainerText}>
                  Your loan runs until you're{' '}
                  <Text style={{ color: Colors.textPrimary, fontWeight: FontWeight.semiBold }}>
                    {(profile?.age ?? 0) + (calculation?.loan_tenure_years ?? 0)}
                  </Text>
                  . Because of this, your earliest realistic retirement is{' '}
                  <Text style={{ color: Colors.warning, fontWeight: FontWeight.semiBold }}>
                    age {tenureImpactResult.actualRetireAge}
                  </Text>{' '}
                  — not your target of {tenureImpactResult.targetRetireAge}.
                </Text>
                <Text style={[loanStyles.explainerText, { marginTop: Spacing.xs }]}>
                  Those extra{' '}
                  <Text style={{ color: Colors.warning, fontWeight: FontWeight.semiBold }}>
                    {tenureImpactResult.extraDelayYears} year{tenureImpactResult.extraDelayYears !== 1 ? 's' : ''}
                  </Text>{' '}
                  of inflation mean your monthly expenses at retirement will be{' '}
                  <Text style={{ color: Colors.textPrimary, fontWeight: FontWeight.semiBold }}>
                    {formatCurrency(tenureImpactResult.monthlyExpensesAtActualRetirement)}/mo
                  </Text>{' '}
                  instead of what you'd spend today. Your required corpus grows accordingly.
                </Text>
              </View>

              <View style={loanStyles.corpusTable}>
                <View style={loanStyles.corpusRow}>
                  <View style={loanStyles.corpusLabelCol}>
                    <Text style={loanStyles.corpusLabel}>Target corpus</Text>
                    <Text style={loanStyles.corpusSubLabel}>Retire at {tenureImpactResult.targetRetireAge} (your goal)</Text>
                  </View>
                  <Text style={loanStyles.corpusAmount}>{formatCurrency(tenureImpactResult.targetFireNumber)}</Text>
                </View>
                <View style={[loanStyles.corpusRow, loanStyles.corpusRowBorder]}>
                  <View style={loanStyles.corpusLabelCol}>
                    <Text style={loanStyles.corpusLabel}>Realistic corpus</Text>
                    <Text style={loanStyles.corpusSubLabel}>Retire at {tenureImpactResult.actualRetireAge} (with loan)</Text>
                  </View>
                  <Text style={[loanStyles.corpusAmount, { color: Colors.warning }]}>
                    {formatCurrency(tenureImpactResult.actualFireNumber)}
                  </Text>
                </View>
                <View style={[loanStyles.corpusRow, loanStyles.corpusRowBorder, loanStyles.corpusRowHighlight]}>
                  <View style={loanStyles.corpusLabelCol}>
                    <Text style={[loanStyles.corpusLabel, { color: Colors.error }]}>Extra corpus needed</Text>
                    <Text style={loanStyles.corpusSubLabel}>Due to {tenureImpactResult.extraDelayYears}yr delay + inflation</Text>
                  </View>
                  <Text style={[loanStyles.corpusAmount, { color: Colors.error, fontWeight: FontWeight.bold }]}>
                    +{formatCurrency(tenureImpactResult.extraCorpus)}
                  </Text>
                </View>
              </View>

              <View style={loanStyles.tipBox}>
                <Ionicons name="bulb-outline" size={13} color={Colors.primary} style={{ marginRight: 6, marginTop: 1 }} />
                <Text style={loanStyles.tipText}>
                  Reducing your loan tenure by even 3–5 years through prepayment can dramatically shrink your required corpus by cutting the inflation compounding window.
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.noFireNote}>
              <Ionicons name="checkmark-circle-outline" size={20} color={Colors.success} style={{ marginBottom: 6 }} />
              <Text style={[styles.noFireText, { textAlign: 'center' }]}>
                You're on track to retire by your target age — loan tenure is not impacting your goal
              </Text>
            </View>
          )}
        </Card>
      </>
    );
  }

  return (
    <View style={styles.root}>
      {currentModal?.type === 'xp' && (
        <XPCelebrationModal
          visible
          title={currentModal.isFirst ? 'FIRST ANALYSIS!' : 'STATEMENT ANALYZED!'}
          icon={currentModal.isFirst ? 'star' : 'card'}
          iconColor={currentModal.isFirst ? Colors.warning : Colors.primary}
          xpEarned={currentModal.xpEarned}
          freedomDaysEarned={currentModal.freedomDaysEarned}
          message={
            currentModal.isFirst
              ? 'Your financial journey begins now! Every rupee tracked is progress.'
              : 'Keep tracking — consistency is the secret to FIRE!'
          }
          onClose={advanceQueue}
        />
      )}
      {currentModal?.type === 'levelup' && (
        <LevelUpModal
          visible
          previousLevel={currentModal.previousLevel}
          newLevel={currentModal.newLevel}
          levelDefinition={currentModal.levelDefinition}
          newBadges={currentModal.newBadges}
          onClose={advanceQueue}
        />
      )}
      {currentModal?.type === 'badge' && (
        <BadgeUnlockModal visible newBadges={currentModal.badges} onClose={advanceQueue} />
      )}
      {currentModal?.type === 'streak' && (
        <StreakMilestoneModal visible streakType={currentModal.streakType} count={currentModal.count} onClose={advanceQueue} />
      )}
      {/* ── Sub-tab switcher ── */}
      <View style={tabStyles.bar}>
        <TouchableOpacity
          style={[tabStyles.tab, activeTab === 'spend' && tabStyles.tabActive]}
          onPress={() => setActiveTab('spend')}
          activeOpacity={0.8}
        >
          <Ionicons
            name={activeTab === 'spend' ? 'receipt' : 'receipt-outline'}
            size={15}
            color={activeTab === 'spend' ? Colors.primary : Colors.textMuted}
            style={{ marginRight: 5 }}
          />
          <Text style={[tabStyles.tabText, activeTab === 'spend' && tabStyles.tabTextActive]}>
            Spend Insights
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[tabStyles.tab, activeTab === 'emi' && tabStyles.tabActive]}
          onPress={() => setActiveTab('emi')}
          activeOpacity={0.8}
        >
          <Ionicons
            name={activeTab === 'emi' ? 'home' : 'home-outline'}
            size={15}
            color={activeTab === 'emi' ? Colors.primary : Colors.textMuted}
            style={{ marginRight: 5 }}
          />
          <Text style={[tabStyles.tabText, activeTab === 'emi' && tabStyles.tabTextActive]}>
            EMI Insights
          </Text>
        </TouchableOpacity>
      </View>

    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {activeTab === 'spend' ? renderSpendTab() : renderEmiTab()}

      <View style={{ height: 32 }} />
    </ScrollView>

    <Modal visible={showPasswordModal} transparent animationType="fade" onRequestClose={handlePasswordCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Ionicons name="lock-closed-outline" size={22} color={Colors.primary} style={{ marginRight: Spacing.sm }} />
            <Text style={styles.modalTitle}>Password Required</Text>
          </View>
          <Text style={styles.modalSubtitle}>
            This PDF is password-protected. Enter the statement password to continue.
          </Text>
          <InputField
            label="PDF Password"
            icon="key-outline"
            placeholder="Enter password"
            value={passwordValue}
            onChangeText={setPasswordValue}
            isPassword
            error={passwordError ?? undefined}
            autoFocus
            onSubmitEditing={handlePasswordSubmit}
            returnKeyType="done"
          />
          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={handlePasswordCancel} disabled={uploading}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <GradientButton
              title="Unlock"
              onPress={handlePasswordSubmit}
              loading={uploading}
              style={styles.modalUnlockBtn}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.xxl },

  uploadZone: {
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    backgroundColor: Colors.surface,
    marginBottom: Spacing.lg,
  },
  uploadIconStyle: { marginBottom: Spacing.sm },
  uploadTitle: { color: Colors.textPrimary, fontSize: FontSize.md, fontWeight: FontWeight.semiBold, marginBottom: Spacing.xs },
  uploadSubtext: { color: Colors.textMuted, fontSize: FontSize.sm, marginBottom: Spacing.md },
  bankChips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  chip: { backgroundColor: Colors.surfaceHigh, borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { color: Colors.textSecondary, fontSize: FontSize.xs, fontWeight: FontWeight.medium },
  uploadingState: { alignItems: 'center', paddingVertical: Spacing.lg },
  uploadingText: { color: Colors.textPrimary, fontSize: FontSize.base, fontWeight: FontWeight.medium, marginTop: Spacing.md },
  uploadingSubtext: { color: Colors.textMuted, fontSize: FontSize.sm, marginTop: Spacing.xs },

  errorBanner: { backgroundColor: `${Colors.error}22`, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.error },
  errorInner: { flexDirection: 'row', alignItems: 'center' },
  errorText: { color: Colors.error, fontSize: FontSize.sm },
  loadingState: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  loadingText: { color: Colors.textSecondary, marginLeft: Spacing.sm },

  avgCard: { borderColor: Colors.primary, borderWidth: 1.5, marginBottom: Spacing.lg },
  avgLabel: { color: Colors.textSecondary, fontSize: FontSize.sm, marginBottom: Spacing.xs },
  avgAmount: { color: Colors.primary, fontSize: FontSize.xxxl, fontWeight: FontWeight.extraBold, marginBottom: Spacing.xs },
  avgPeriod: { color: Colors.textMuted, fontSize: FontSize.sm },

  sectionLabel: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: FontWeight.semiBold, letterSpacing: 1.2, marginTop: Spacing.sm, marginBottom: Spacing.sm },

  // Recommendation cards
  recCard: { marginBottom: Spacing.md },
  recHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.md },
  recIconBox: { width: 40, height: 40, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  recHeaderText: { flex: 1 },
  recTitle: { color: Colors.textPrimary, fontSize: FontSize.base, fontWeight: FontWeight.semiBold, marginBottom: 3 },
  recAppList: { color: Colors.textMuted, fontSize: FontSize.xs, lineHeight: 17 },

  recSpendRow: { flexDirection: 'row', backgroundColor: Colors.surfaceHigh, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.md, gap: Spacing.sm },
  recSpendItem: { flex: 1 },
  recSpendDivider: { width: 1, backgroundColor: Colors.border },
  recSpendLabel: { color: Colors.textMuted, fontSize: FontSize.xs, marginBottom: 4 },
  recSpendValue: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },

  recAction: { flexDirection: 'row', alignItems: 'center', paddingTop: Spacing.xs },
  recActionText: { color: Colors.textSecondary, fontSize: FontSize.sm, flex: 1, flexWrap: 'wrap' },
  recActionHighlight: { color: Colors.warning, fontWeight: FontWeight.bold },

  recPlaceholder: { backgroundColor: Colors.surfaceHigh, borderRadius: BorderRadius.md, padding: Spacing.md },
  recPlaceholderText: { color: Colors.textSecondary, fontSize: FontSize.sm, lineHeight: 20 },
  recExampleBox: { marginTop: Spacing.sm },
  recExampleLabel: { color: Colors.textMuted, fontSize: FontSize.xs, marginBottom: 2 },

  noFireNote: { marginTop: Spacing.md, backgroundColor: Colors.surfaceHigh, borderRadius: BorderRadius.md, padding: Spacing.sm },
  noFireText: { color: Colors.textMuted, fontSize: FontSize.xs, textAlign: 'center' },

  // Subscription scenarios
  subScenarioHeader: { color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: FontWeight.medium, marginBottom: Spacing.sm, marginTop: Spacing.xs },
  subScenarioRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  subScenarioBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  subScenarioLeft: { flex: 1 },
  subScenarioLabel: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  subScenarioSaving: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 2 },
  subScenarioBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: `${Colors.success}18`, borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4 },
  subScenarioBadgeText: { color: Colors.success, fontSize: FontSize.xs, fontWeight: FontWeight.semiBold },

  // Charts
  chartCard: { marginBottom: Spacing.md },
  chartTitle: { color: Colors.textPrimary, fontSize: FontSize.base, fontWeight: FontWeight.semiBold, marginBottom: Spacing.md },
  pieContainer: { alignItems: 'center', marginBottom: Spacing.md },
  barChartWrapper: { flexDirection: 'row', alignItems: 'center' },
  yAxisLabelContainer: { width: 20, height: 190, justifyContent: 'center', alignItems: 'center' },
  yAxisLabel: { color: Colors.textMuted, fontSize: FontSize.xs, transform: [{ rotate: '-90deg' }], width: 90, textAlign: 'center' },
  barChartInner: { flex: 1 },
  xAxisLabel: { color: Colors.textMuted, fontSize: FontSize.xs, textAlign: 'center', marginTop: 4 },
  legendList: { marginTop: Spacing.xs },
  legendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 9, borderTopWidth: 1, borderTopColor: Colors.border },
  legendLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  legendSwatch: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  legendIcon: { marginRight: 6 },
  legendName: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  legendRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendAmount: { color: Colors.textSecondary, fontSize: FontSize.sm },
  legendBadge: { borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 2 },
  legendPct: { fontSize: FontSize.xs, fontWeight: FontWeight.semiBold },

  insightCard: { backgroundColor: `${Colors.warning}18`, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: `${Colors.warning}44` },
  insightText: { color: Colors.textSecondary, fontSize: FontSize.sm, lineHeight: 20 },

  outlierCard: { marginBottom: Spacing.lg, borderColor: `${Colors.warning}55`, borderWidth: 1 },
  outlierEmpty: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  outlierEmptyText: { color: Colors.success, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  outlierHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.xs },
  outlierTitle: { color: Colors.textPrimary, fontSize: FontSize.base, fontWeight: FontWeight.semiBold },
  outlierSubtitle: { color: Colors.textMuted, fontSize: FontSize.xs, lineHeight: 17, marginBottom: Spacing.md },
  outlierRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.border },
  outlierRowIgnored: { opacity: 0.45 },
  outlierRowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: Spacing.sm },
  outlierCategoryDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10, flexShrink: 0 },
  outlierRowInfo: { flex: 1 },
  outlierDesc: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  outlierMeta: { color: Colors.textMuted, fontSize: FontSize.xs, marginTop: 2 },
  outlierTextDim: { color: Colors.textMuted },
  outlierRowRight: { alignItems: 'flex-end', gap: 6 },
  outlierAmount: { color: Colors.textPrimary, fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
  ignoreBtn: { borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: Colors.border, backgroundColor: 'transparent' },
  ignoreBtnActive: { backgroundColor: `${Colors.warning}22`, borderColor: Colors.warning },
  ignoreBtnText: { color: Colors.textMuted, fontSize: FontSize.xs, fontWeight: FontWeight.medium },
  ignoreBtnTextActive: { color: Colors.warning },
  generateInsightsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: Spacing.md, backgroundColor: Colors.primary, borderRadius: BorderRadius.md, paddingVertical: Spacing.sm + 4 },
  generateInsightsBtnText: { color: '#fff', fontSize: FontSize.base, fontWeight: FontWeight.semiBold },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  modalTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
  },
  modalSubtitle: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  modalButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  modalCancelBtn: {
    flex: 1,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  modalCancelText: {
    color: Colors.textSecondary,
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
  },
  modalUnlockBtn: {
    flex: 1,
    marginBottom: 0,
  },
});

const loanStyles = StyleSheet.create({
  statBox: {
    backgroundColor: `${Colors.error}10`,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: `${Colors.error}33`,
    padding: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  statBoxLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  statBoxValue: {
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.extraBold,
    marginBottom: 2,
  },
  statBoxSub: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
  },

  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceHigh,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  compareCol: { flex: 1, alignItems: 'center' },
  compareArrow: { paddingHorizontal: Spacing.xs },
  compareLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginBottom: 4,
  },
  compareValue: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
    marginBottom: 2,
  },
  compareAge: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },

  explainerBox: {
    backgroundColor: Colors.surfaceHigh,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  explainerText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },

  corpusTable: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  corpusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    backgroundColor: Colors.surface,
  },
  corpusRowBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  corpusRowHighlight: {
    backgroundColor: `${Colors.error}0A`,
  },
  corpusLabelCol: { flex: 1 },
  corpusLabel: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    marginBottom: 2,
  },
  corpusSubLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
  },
  corpusAmount: {
    color: Colors.textPrimary,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
  },

  tipBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: `${Colors.primary}10`,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
  },
  tipText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: FontSize.xs,
    lineHeight: 17,
  },
});

const presetStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },
  chip: {
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: Colors.surface,
  },
  chipActive: {
    borderColor: Colors.warning,
    backgroundColor: `${Colors.warning}18`,
  },
  chipText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  chipTextActive: {
    color: Colors.warning,
    fontWeight: FontWeight.bold,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  customLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
  customInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 130,
  },
  customPrefix: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginRight: 4,
  },
  customInput: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    flex: 1,
    padding: 0,
  },
});

const tabStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingTop: Spacing.sm,
    paddingBottom: 0,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
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
});
