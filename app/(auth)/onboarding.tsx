import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius } from '@/constants/theme';
import { GradientButton } from '@/components/ui/layout/GradientButton';
import { InputField } from '@/components/ui/inputs/InputField';
import { SliderInput } from '@/components/ui/inputs/SliderInput';
import { useOnboardingStore } from '@/stores/onboarding.store';
import { calculateFire, FireInputs, FireResult, Lifestyle } from '@/lib/fire';

// ─── Local form state (UI strings, camelCase) ─────────────────────────────────

interface OData {
  age: number;
  ownSalary: string;
  expenses: string;
  savings: string;
  monthlyEmi: string;
  loanTenureYears: number;
  retireAge: number;
  lifestyle: Lifestyle | null;
}

/** Maps local form state to the canonical FireInputs shape. */
function toFireInputs(d: OData): FireInputs {
  return {
    monthly_income:      parseInt(d.ownSalary)  || 0,
    spouse_income:       0,
    monthly_expenses:    parseInt(d.expenses)   || 0,
    current_savings:     parseInt(d.savings)    || 0,
    loan_balance:        0,
    monthly_emi:         parseInt(d.monthlyEmi) || 0,
    loan_tenure_years:   d.loanTenureYears,
    retirement_age:      d.retireAge,
    expected_return_pct: 10,
    inflation_rate_pct:  6,
    lifestyle:           d.lifestyle ?? undefined,
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TOTAL_QUESTIONS = 3; // steps 0–2 are questions; step 3 is the result

const LIFESTYLES: {
  id: Lifestyle;
  emoji: string;
  title: string;
  tagline: string;
  rule: string;
  color: string;
}[] = [
  { id: 'lean',        emoji: '🏕️', title: 'Lean FIRE',        tagline: 'Simple & frugal',           rule: '25× annual spend', color: Colors.success },
  { id: 'comfortable', emoji: '🏠', title: 'Comfortable FIRE',  tagline: 'Current lifestyle, forever', rule: '30× annual spend', color: Colors.primary },
  { id: 'luxury',      emoji: '✈️', title: 'Luxury FIRE',       tagline: 'Live without limits',       rule: '40× annual spend', color: Colors.accent  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCr(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${n.toLocaleString('en-IN')}`;
}

function fmtMonthly(n: number): string {
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(1)}L/mo`;
  if (Math.abs(n) >= 1000) return `₹${Math.round(n / 1000)}K/mo`;
  return `₹${n.toLocaleString('en-IN')}/mo`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setPending } = useOnboardingStore();

  const [step, setStep] = useState(0);
  const [data, setData] = useState<OData>({
    age: 28, ownSalary: '', expenses: '', savings: '', monthlyEmi: '',
    loanTenureYears: 10, retireAge: 45, lifestyle: 'comfortable',
  });
  const [displayCorpus, setDisplayCorpus] = useState(0);

  const opacity  = useSharedValue(1);
  const tx       = useSharedValue(0);
  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: tx.value }],
  }));

  const transition = useCallback((next: number, dir: 1 | -1 = 1) => {
    opacity.value = withTiming(0, { duration: 160 }, () => {
      runOnJS(setStep)(next);
      tx.value = dir * 36;
      tx.value = withTiming(0, { duration: 220 });
      opacity.value = withTiming(1, { duration: 220 });
    });
  }, [opacity, tx]);

  const goBack = () => {
    if (step === 0) { router.back(); return; }
    transition(step - 1, -1);
  };

  // Animated corpus counter when result screen appears
  useEffect(() => {
    if (step !== TOTAL_QUESTIONS) return;
    const r = calculateFire(toFireInputs(data), data.age);
    if (!r.possible || r.already_there) { setDisplayCorpus(r.fire_number); return; }
    const target = r.fire_number;
    const ticks  = 50;
    const ms     = 28;
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayCorpus(Math.round((i / ticks) * target));
      if (i >= ticks) { clearInterval(id); setDisplayCorpus(target); }
    }, ms);
    return () => clearInterval(id);
  }, [step]);

  const isResult    = step === TOTAL_QUESTIONS;
  const isSkippable = step === 2;
  const progressPct = Math.min((step / (TOTAL_QUESTIONS - 1)) * 100, 100);
  const result: FireResult = calculateFire(toFireInputs(data), data.age);

  function canContinue(): boolean {
    switch (step) {
      case 0: return data.age >= 18 && data.age <= 69 && data.retireAge > data.age;
      case 1: return parseInt(data.ownSalary) > 0 && parseInt(data.expenses) > 0;
      case 2: return true;
      default: return false;
    }
  }

  // Persist onboarding data then navigate
  const handleSavePlan = async (dest: '/(auth)/signup' | '/(auth)/login') => {
    if (result.possible && !result.already_there) {
      await setPending({
        age:                 data.age,
        monthly_income:      parseInt(data.ownSalary)  || 0,
        spouse_income:       0,
        monthly_expenses:    parseInt(data.expenses)   || 0,
        current_savings:     parseInt(data.savings)    || 0,
        loan_balance:        0,
        monthly_emi:         parseInt(data.monthlyEmi) || 0,
        loan_tenure_years:   data.loanTenureYears,
        retirement_age:      data.retireAge,
        lifestyle:           data.lifestyle ?? 'comfortable',
        expected_return_pct: 10,
        inflation_rate_pct:  6,
        fire_number:         result.fire_number,
        retire_at_age:       result.retire_at_age,
        years_to_fire:       result.years_to_fire,
        monthly_savings:     result.monthly_savings,
        savings_rate:        result.savings_rate,
      });
    }
    router.push(dest);
  };

  // ── Question Steps ──────────────────────────────────────────────────────────

  function renderQuestion() {
    switch (step) {
      // ── Step 0: Your Timeline ────────────────────────────────────────────────
      case 0: {
        const minRetireAge    = data.age + 1;
        const clampedRetireAge = data.retireAge <= data.age ? data.age + 1 : data.retireAge;
        return (
          <View style={styles.stepBody}>
            <Text style={styles.stepEmoji}>🎯</Text>
            <Text style={styles.question}>Let's set your timeline</Text>
            <View style={{ alignItems: 'center', width: '100%', marginBottom: Spacing.md }}>
              <View style={[styles.sliderWrap, { marginBottom: Spacing.xs }]}>
                <SliderInput
                  label="Your current age"
                  value={data.age}
                  min={18} max={69} unit=" yrs"
                  onValueChange={(v) => setData(d => ({
                    ...d, age: v,
                    retireAge: d.retireAge <= v ? v + 1 : d.retireAge,
                  }))}
                />
              </View>
              <Text style={styles.bigValue}>{data.age} years old</Text>
            </View>
            <View style={styles.timelineDivider} />
            <View style={{ alignItems: 'center', width: '100%', marginTop: Spacing.md }}>
              <View style={[styles.sliderWrap, { marginBottom: Spacing.xs }]}>
                <SliderInput
                  label="Target retirement age"
                  value={clampedRetireAge}
                  min={minRetireAge} max={70} unit=" yrs"
                  onValueChange={(v) => setData(d => ({ ...d, retireAge: v }))}
                />
              </View>
              <Text style={styles.bigValue}>Retire at {clampedRetireAge}</Text>
              <Text style={styles.subValue}>
                That's {clampedRetireAge - data.age} year{clampedRetireAge - data.age !== 1 ? 's' : ''} from now
              </Text>
            </View>
          </View>
        );
      }

      // ── Step 1: Your Money ───────────────────────────────────────────────────
      case 1: {
        const income      = parseInt(data.ownSalary) || 0;
        const expVal      = parseInt(data.expenses) || 0;
        const net         = income - expVal;
        const showNetChip = income > 0 && expVal > 0;
        return (
          <View style={styles.stepBody}>
            <Text style={styles.stepEmoji}>💰</Text>
            <Text style={styles.question}>Your financial snapshot</Text>
            <Text style={styles.hint}>Monthly take-home income and spending</Text>
            <InputField
              label="Your monthly take-home income (₹)"
              icon="cash-outline" placeholder="75,000"
              value={data.ownSalary}
              onChangeText={(v) => setData(d => ({ ...d, ownSalary: v }))}
              keyboardType="numeric" indianFormat containerStyle={styles.inputWrap}
            />
            <InputField
              label="Monthly expenses (₹)"
              icon="card-outline" placeholder="45,000"
              value={data.expenses}
              onChangeText={(v) => setData(d => ({ ...d, expenses: v }))}
              keyboardType="numeric" indianFormat
              containerStyle={{ ...styles.inputWrap, marginBottom: Spacing.xs }}
            />
            <Text style={styles.fieldNote}>Rent, food, transport, bills — excl. EMIs</Text>
            <InputField
              label="Overall current savings & investments (₹)"
              icon="analytics-outline" placeholder="0"
              value={data.savings}
              onChangeText={(v) => setData(d => ({ ...d, savings: v }))}
              keyboardType="numeric" indianFormat containerStyle={styles.inputWrap}
            />
            {showNetChip && (
              <View style={[styles.infoChip, net < 0 ? styles.infoChipRed : styles.infoChipGreen]}>
                <Text style={[styles.infoChipText, { color: net < 0 ? Colors.error : Colors.success }]}>
                  {net < 0
                    ? `⚠️ Spending ₹${Math.abs(net).toLocaleString('en-IN')}/mo more than you earn`
                    : `Before EMIs: ${fmtMonthly(net)} investable`}
                </Text>
              </View>
            )}
          </View>
        );
      }

      // ── Step 2: Your Loans (skippable) ───────────────────────────────────────
      case 2:
        return (
          <View style={styles.stepBody}>
            <Text style={styles.stepEmoji}>🏷️</Text>
            <Text style={styles.question}>Any outstanding loans?</Text>
            <Text style={styles.hint}>Home, car, personal — enter your monthly EMI & tenure. Skip if debt-free.</Text>
            <InputField
              label="Monthly EMI total (₹)"
              icon="calendar-outline" placeholder="25,000"
              value={data.monthlyEmi}
              onChangeText={(v) => setData(d => ({ ...d, monthlyEmi: v }))}
              keyboardType="numeric" indianFormat containerStyle={styles.inputWrap}
            />
            {parseInt(data.monthlyEmi) > 0 && (
              <View style={styles.sliderWrap}>
                <SliderInput
                  label="Remaining tenure"
                  value={data.loanTenureYears}
                  min={1} max={30} step={1} unit=" yrs"
                  onValueChange={(v) => setData(d => ({ ...d, loanTenureYears: v }))}
                />
              </View>
            )}
          </View>
        );

      default:
        return null;
    }
  }

  // ── Result Screen ───────────────────────────────────────────────────────────

  function renderResult() {
    const ls = LIFESTYLES.find(l => l.id === (data.lifestyle ?? 'comfortable'))!;

    if (!result.possible) {
      return (
        <View style={[styles.resultContainer, { paddingTop: insets.top + Spacing.xl }]}>
          <Text style={styles.resultBigEmoji}>⚠️</Text>
          <Text style={styles.resultTitle}>Expenses Exceed Income</Text>
          <Text style={styles.resultSubtitle}>
            You're spending more than you earn. Close this gap to start your FIRE journey.
          </Text>
          <View style={styles.resultCard}>
            <Text style={styles.resultCardLabel}>Monthly shortfall</Text>
            <Text style={[styles.retireAge, { color: Colors.error }]}>
              {fmtMonthly(Math.abs(result.monthly_savings))}
            </Text>
            <Text style={styles.resultCardHint}>
              Reduce expenses or grow your income to unlock your FIRE date
            </Text>
          </View>
          <GradientButton
            title="Track My Spending — Free Account"
            onPress={() => handleSavePlan('/(auth)/signup')}
            style={styles.resultCta}
          />
          <TouchableOpacity onPress={goBack} style={styles.backLink}>
            <Text style={styles.backLinkText}>← Update my details</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (result.already_there) {
      return (
        <View style={[styles.resultContainer, { paddingTop: insets.top + Spacing.xl }]}>
          <Text style={styles.resultBigEmoji}>🎉</Text>
          <Text style={styles.resultTitle}>You Can Retire TODAY!</Text>
          <Text style={styles.resultSubtitle}>You already have enough for {ls.title}!</Text>
          <View style={styles.resultCard}>
            <Text style={styles.resultCardLabel}>Your freedom fund for retirement</Text>
            <Text style={[styles.retireAge, { color: Colors.success }]}>{fmtCr(result.fire_number)}</Text>
            <Text style={[styles.lifestyleTag, { color: ls.color }]}>{ls.emoji} {ls.title}</Text>
          </View>
          <GradientButton
            title="Save My Plan — Create Account"
            onPress={() => handleSavePlan('/(auth)/signup')}
            style={styles.resultCta}
          />
          <TouchableOpacity onPress={goBack} style={styles.backLink}>
            <Text style={styles.backLinkText}>← Update my details</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const emi = parseInt(data.monthlyEmi) || 0;

    return (
      <View style={[styles.resultContainer, { paddingTop: insets.top + 20 }]}>
        <Text style={styles.fireLabel}>🔥  YOUR FIRE DATE</Text>
        <Text style={styles.resultSubtitle}>Here's your path to financial freedom</Text>

        <View style={styles.resultCard}>
          <Text style={styles.resultCardLabel}>You can retire at</Text>
          <Text style={styles.retireAge}>{result.retire_at_age}</Text>
          <Text style={styles.retireUnit}>years old</Text>

          <View style={styles.cardDivider} />

          <Text style={styles.resultCardLabel}>Your freedom fund for retirement</Text>
          <Text style={styles.corpus}>{fmtCr(displayCorpus)}</Text>
          <Text style={[styles.lifestyleTag, { color: ls.color }]}>
            {ls.emoji}  {ls.title}
          </Text>
          <Text style={styles.assumptionNote}>
            10% return · 6% inflation · Refine assumptions in FIRE Calculator
          </Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statVal}>{fmtMonthly(result.monthly_savings)}</Text>
            <Text style={styles.statLabel}>Net savings</Text>
          </View>
          <View style={[styles.statItem, styles.statMid]}>
            <Text style={styles.statVal}>{result.savings_rate}%</Text>
            <Text style={styles.statLabel}>Savings rate</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statVal}>{result.years_to_fire} yrs</Text>
            <Text style={styles.statLabel}>Years to FIRE</Text>
          </View>
        </View>

        {emi > 0 && (
          <View style={styles.breakdownCard}>
            <Text style={styles.breakdownTitle}>Monthly cash flow</Text>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Income</Text>
              <Text style={styles.breakdownValue}>
                +{fmtMonthly(parseInt(data.ownSalary) || 0)}
              </Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Expenses</Text>
              <Text style={[styles.breakdownValue, { color: Colors.error }]}>
                −{fmtMonthly(parseInt(data.expenses) || 0)}
              </Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Loan EMI</Text>
              <Text style={[styles.breakdownValue, { color: Colors.warning }]}>
                −{fmtMonthly(emi)}
              </Text>
            </View>
            <View style={[styles.breakdownRow, styles.breakdownTotal]}>
              <Text style={styles.breakdownTotalLabel}>Investable</Text>
              <Text style={[styles.breakdownValue, { color: Colors.success, fontWeight: FontWeight.bold }]}>
                {fmtMonthly(result.monthly_savings)}
              </Text>
            </View>
            <Text style={styles.investNote}>
              Invest {fmtMonthly(result.monthly_savings)} at 10% annual returns
            </Text>
          </View>
        )}

        {result.loan_payoff_age !== null && (
          <View style={styles.milestoneCard}>
            <View style={styles.milestoneHeader}>
              <Ionicons name="trending-up-outline" size={16} color={Colors.success} />
              <Text style={styles.milestoneTitle}>Loan Payoff Milestone</Text>
            </View>
            <Text style={styles.milestoneBody}>
              At age {result.loan_payoff_age} your loan clears — monthly savings jump by{' '}
              <Text style={{ color: Colors.success, fontWeight: FontWeight.semiBold }}>
                +{fmtMonthly(emi)}
              </Text>
            </Text>
            {result.years_accelerated > 0 && (
              <Text style={styles.milestoneAccel}>
                This boosts your FIRE date by{' '}
                <Text style={{ color: Colors.success, fontWeight: FontWeight.bold }}>
                  {result.years_accelerated} year{result.years_accelerated !== 1 ? 's' : ''}
                </Text>{' '}
                earlier 🚀
              </Text>
            )}
          </View>
        )}

        <GradientButton
          title="Save My Plan — Create Account"
          onPress={() => handleSavePlan('/(auth)/signup')}
          style={styles.resultCta}
        />
        <TouchableOpacity
          onPress={() => handleSavePlan('/(auth)/login')}
          style={styles.loginLink}
        >
          <Text style={styles.loginLinkText}>
            Have an account? <Text style={styles.loginLinkBold}>Log In</Text>
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={goBack} style={styles.backLink}>
          <Text style={styles.backLinkText}>← Update my details</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {!isResult && (
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity
            onPress={goBack} style={styles.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
          </View>

          {isSkippable ? (
            <TouchableOpacity onPress={() => transition(step + 1)} style={styles.skipBtn}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.skipPlaceholder} />
          )}
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
      >
        <ScrollView
          contentContainerStyle={isResult ? undefined : styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          <Animated.View style={animStyle}>
            {isResult ? renderResult() : renderQuestion()}
          </Animated.View>
        </ScrollView>

        {!isResult && (
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.md) + Spacing.sm }]}>
            <GradientButton
              title="Continue →"
              onPress={() => transition(step + 1)}
              disabled={!canContinue()}
              style={styles.continueBtn}
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },

  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm, gap: Spacing.sm,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { flex: 1, height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: 2 },
  skipBtn: { width: 48, alignItems: 'flex-end', justifyContent: 'center', paddingVertical: 8 },
  skipText: { color: Colors.textMuted, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  skipPlaceholder: { width: 48 },

  scrollContent: { flexGrow: 1 },
  stepBody: {
    flex: 1, paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxl, paddingBottom: Spacing.lg, alignItems: 'center',
  },
  stepEmoji: { fontSize: 52, marginBottom: Spacing.lg },
  question: {
    fontSize: FontSize.xxl, fontWeight: FontWeight.bold,
    color: Colors.textPrimary, textAlign: 'center', lineHeight: 36, marginBottom: Spacing.sm,
  },
  hint: {
    fontSize: FontSize.base, color: Colors.textSecondary,
    textAlign: 'center', lineHeight: 22, marginBottom: Spacing.xxl,
  },
  sliderWrap: { alignItems: 'center', marginBottom: Spacing.lg, width: '100%' },
  bigValue: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.primary, marginTop: Spacing.sm },
  subValue: { fontSize: FontSize.base, color: Colors.textMuted, marginTop: Spacing.xs },
  inputWrap: { width: '100%', marginBottom: Spacing.sm },
  fieldNote: {
    width: '100%', fontSize: FontSize.xs, color: Colors.textMuted,
    marginTop: -Spacing.xs, marginBottom: Spacing.sm, paddingHorizontal: 2,
  },
  timelineDivider: { width: '40%', height: 1, backgroundColor: Colors.border, marginVertical: Spacing.lg },
  infoChip: {
    backgroundColor: `${Colors.primary}22`, borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
  },
  infoChipGreen: { backgroundColor: `${Colors.success}22` },
  infoChipRed: { backgroundColor: `${Colors.error}22` },
  infoChipText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: FontWeight.medium },

  lifestyleCards: { width: '100%', gap: Spacing.sm },
  lifestyleCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1.5, borderColor: Colors.border,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.md, gap: Spacing.md,
  },
  lsEmoji: { fontSize: 28 },
  lsText: { flex: 1 },
  lsTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginBottom: 2 },
  lsTagline: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: 2 },
  lsRule: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium },
  lsCheck: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  footer: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm, backgroundColor: Colors.background },
  continueBtn: { width: '100%' },

  resultContainer: { alignItems: 'center', paddingHorizontal: Spacing.xl, paddingBottom: Spacing.xxl },
  resultBigEmoji: { fontSize: 64, marginBottom: Spacing.md },
  fireLabel: {
    fontSize: FontSize.sm, fontWeight: FontWeight.bold,
    color: Colors.accent, letterSpacing: 2, marginBottom: Spacing.xs,
  },
  resultTitle: {
    fontSize: FontSize.xl, fontWeight: FontWeight.bold,
    color: Colors.textPrimary, textAlign: 'center', marginBottom: Spacing.sm,
  },
  resultSubtitle: {
    fontSize: FontSize.base, color: Colors.textSecondary,
    textAlign: 'center', marginBottom: Spacing.lg, lineHeight: 22,
  },
  resultCard: {
    width: '100%', backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl, borderWidth: 1.5, borderColor: Colors.primary,
    alignItems: 'center', paddingVertical: Spacing.xl, paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25, shadowRadius: 16, elevation: 8,
  },
  resultCardLabel: {
    fontSize: FontSize.sm, color: Colors.textMuted,
    fontWeight: FontWeight.medium, textTransform: 'uppercase',
    letterSpacing: 1, marginBottom: Spacing.xs, textAlign: 'center',
  },
  resultCardHint: {
    fontSize: FontSize.sm, color: Colors.textSecondary,
    textAlign: 'center', marginTop: Spacing.sm, lineHeight: 20,
  },
  retireAge: { fontSize: 72, fontWeight: FontWeight.extraBold, color: Colors.primary, lineHeight: 80 },
  retireUnit: { fontSize: FontSize.base, color: Colors.textSecondary, marginBottom: Spacing.xs },
  cardDivider: { width: '60%', height: 1, backgroundColor: Colors.border, marginVertical: Spacing.md },
  corpus: { fontSize: FontSize.xxl, fontWeight: FontWeight.extraBold, color: Colors.textPrimary, marginBottom: Spacing.xs },
  lifestyleTag: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, marginTop: 2 },
  assumptionNote: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: Spacing.sm, textAlign: 'center' },

  statsRow: {
    flexDirection: 'row', width: '100%',
    backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    marginBottom: Spacing.md, overflow: 'hidden',
  },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md },
  statMid: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: Colors.border },
  statVal: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginBottom: 2 },
  statLabel: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center' },

  breakdownCard: {
    width: '100%', backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg, borderWidth: 1,
    borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.md,
  },
  breakdownTitle: {
    fontSize: FontSize.sm, fontWeight: FontWeight.semiBold,
    color: Colors.textSecondary, marginBottom: Spacing.sm,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  breakdownTotal: { borderTopWidth: 1, borderTopColor: Colors.border, marginTop: Spacing.xs, paddingTop: Spacing.sm },
  breakdownLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  breakdownTotalLabel: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.semiBold },
  breakdownValue: { fontSize: FontSize.sm, color: Colors.textPrimary },
  investNote: {
    marginTop: Spacing.sm,
    fontSize: FontSize.sm,
    color: Colors.primary,
    fontWeight: FontWeight.semiBold,
    textAlign: 'center',
  },

  milestoneCard: {
    width: '100%', backgroundColor: `${Colors.success}12`,
    borderRadius: BorderRadius.lg, borderWidth: 1,
    borderColor: `${Colors.success}44`, padding: Spacing.md, marginBottom: Spacing.md,
  },
  milestoneHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.xs },
  milestoneTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, color: Colors.success },
  milestoneBody: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, marginBottom: 4 },
  milestoneAccel: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },

  resultCta: { width: '100%', marginBottom: Spacing.sm },
  loginLink: { paddingVertical: Spacing.sm, marginBottom: Spacing.xs },
  loginLinkText: { color: Colors.textSecondary, fontSize: FontSize.base },
  loginLinkBold: { color: Colors.primary, fontWeight: FontWeight.semiBold },
  backLink: { paddingVertical: Spacing.sm },
  backLinkText: { color: Colors.textMuted, fontSize: FontSize.sm },
});
