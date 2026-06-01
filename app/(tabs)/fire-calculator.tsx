import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Dimensions,
  TextInput,
  Animated as RNAnimated,
  KeyboardAvoidingView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { track } from '@/lib/analytics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import { LineChart } from 'react-native-gifted-charts';
import { Ionicons } from '@expo/vector-icons';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuthStore } from '@/stores/auth.store';
import { useFireStore } from '@/stores/fire.store';
import { useGamificationStore } from '@/stores/gamification.store';
import { useTasksStore } from '@/stores/tasks.store';
import { calculateFire, LIFESTYLE_SWR, type Lifestyle } from '@/lib/fire';
import {
  calculateFireNumber,
  calculateYearsToFireWithPayoff,
  buildWealthTimelineWithPayoff,
  formatCurrency,
} from '@/lib/calculations';
import { calculateFreedomDays } from '@/lib/gamification';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius } from '@/constants/theme';
import { GradientButton } from '@/components/ui/layout/GradientButton';
import { InputField } from '@/components/ui/inputs/InputField';
import { SliderInput } from '@/components/ui/inputs/SliderInput';
import { Card } from '@/components/ui/cards/Card';
import { XPCelebrationModal } from '@/components/ui/modals/XPCelebrationModal';
import { LevelUpModal } from '@/components/ui/modals/LevelUpModal';
import { BadgeUnlockModal } from '@/components/ui/modals/BadgeUnlockModal';
import { StreakMilestoneModal } from '@/components/ui/modals/StreakMilestoneModal';
import type { BadgeDefinition, LevelDefinition, StreakType } from '@/lib/gamification';

const schema = z.object({
  monthlyExpenses: z
    .string()
    .regex(/^\d+$/, 'Enter a valid amount')
    .refine((v) => parseInt(v) >= 1000, 'Minimum ₹1,000'),
  retirementAge: z
    .string()
    .regex(/^\d+$/, 'Enter a valid age')
    .refine((v) => parseInt(v) >= 25 && parseInt(v) <= 70, 'Must be between 25–70'),
  monthlyIncome: z.string().regex(/^\d*$/, 'Enter a valid amount'),
  spouseIncome: z.string().regex(/^\d*$/, 'Enter a valid amount'),
  currentSavings: z.string().regex(/^\d*$/, 'Enter a valid amount'),
  monthlyEmi: z.string().regex(/^\d*$/, 'Enter a valid amount'),
  loanBalance: z.string().regex(/^\d*$/, 'Enter a valid amount'),
});

type FormData = z.infer<typeof schema>;

export default function FireCalculatorScreen() {
  const { user, profile } = useAuthStore();
  const { calculation, saveCalculation } = useFireStore();
  const { awardXP, updateStreak, progressQuest } = useGamificationStore();
  const { seedInsightTasks, updateLoanTasksFromFire } = useTasksStore();
  type PendingModal =
    | { type: 'xp'; xpEarned: number; freedomDaysEarned: number; isFirstCalc: boolean; sipIncreased: boolean }
    | { type: 'levelup'; previousLevel: number; newLevel: number; levelDefinition: LevelDefinition; newBadges: BadgeDefinition[] }
    | { type: 'badge'; badges: BadgeDefinition[] }
    | { type: 'streak'; streakType: StreakType; count: number };

  const [modalQueue, setModalQueue] = useState<PendingModal[]>([]);
  const currentModal = modalQueue[0] ?? null;
  const advanceQueue = () => setModalQueue((q) => q.slice(1));
  const scrollRef = useRef<ScrollView>(null);
  const resultRef = useRef<View>(null);
  const [loading, setLoading] = useState(false);
  const [alreadyUpdatedToday, setAlreadyUpdatedToday] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const isPreviewingRef = useRef(false);
  const [fireNumber, setFireNumber] = useState<number | null>(calculation?.fire_number ?? null);
  const [retireAtAge, setRetireAtAge] = useState<number | null>(calculation?.retire_at_age ?? null);
  const [showInfo, setShowInfo] = useState(false);
  const [savedBannerOpacity] = useState(new RNAnimated.Value(0));
  const [expectedReturn, setExpectedReturn] = useState(calculation?.expected_return_pct ?? 10);
  const [inflationRate, setInflationRate] = useState(calculation?.inflation_rate_pct ?? 6);
  const [loanTenureYears, setLoanTenureYears] = useState(calculation?.loan_tenure_years ?? 10);
  const [monthlySavings, setMonthlySavings] = useState(calculation?.monthly_savings ?? 0);
  const [lifestyle, setLifestyle] = useState<Lifestyle>(calculation?.lifestyle ?? 'comfortable');
  const [leanExpenses, setLeanExpenses] = useState('');
  const [comfortableExpenses, setComfortableExpenses] = useState('');
  const [luxuryExpenses, setLuxuryExpenses] = useState('');

  const hasSynced = useRef(!!calculation);
  const resultOpacity = useSharedValue(calculation?.fire_number ? 1 : 0);
  const resultScale = useSharedValue(calculation?.fire_number ? 1 : 0.8);

  useEffect(() => {
    const checkLastUpdate = async () => {
      const last = await AsyncStorage.getItem('last_fire_update_date');
      setAlreadyUpdatedToday(last === new Date().toISOString().split('T')[0]);
    };
    checkLastUpdate();
  }, []);

  const showSavedBanner = () => {
    savedBannerOpacity.setValue(1);
    RNAnimated.timing(savedBannerOpacity, {
      toValue: 0,
      duration: 400,
      delay: 1800,
      useNativeDriver: true,
    }).start();
  };

  const { control, handleSubmit, formState: { errors }, setValue, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      monthlyExpenses: calculation?.monthly_expenses?.toString() ?? '',
      retirementAge: calculation?.retirement_age?.toString() ?? '',
      monthlyIncome: calculation?.monthly_income?.toString() ?? '',
      spouseIncome: calculation?.spouse_income?.toString() ?? '',
      currentSavings: calculation?.current_savings?.toString() ?? '',
      monthlyEmi: calculation?.monthly_emi?.toString() ?? '',
      loanBalance: calculation?.loan_balance?.toString() ?? '',
    },
  });

  const watchedEmi = watch('monthlyEmi');

  // Revert preview state when user navigates away without saving
  useFocusEffect(
    useCallback(() => {
      if (user) track(user.id, 'screen_viewed', { screen: 'fire_calculator' });
    }, [user?.id]),
  );

  useFocusEffect(
    useCallback(() => {
      return () => {
        if (!isPreviewingRef.current) return;
        isPreviewingRef.current = false;
        setIsPreviewing(false);
        const saved = useFireStore.getState().calculation;
        if (saved) {
          setValue('monthlyExpenses', saved.monthly_expenses?.toString() ?? '');
          setValue('retirementAge', saved.retirement_age?.toString() ?? '');
          setValue('monthlyIncome', saved.monthly_income?.toString() ?? '');
          setValue('spouseIncome', saved.spouse_income?.toString() ?? '');
          setValue('currentSavings', saved.current_savings?.toString() ?? '');
          setValue('monthlyEmi', saved.monthly_emi?.toString() ?? '');
          setValue('loanBalance', saved.loan_balance?.toString() ?? '');
          setExpectedReturn(saved.expected_return_pct ?? 10);
          setInflationRate(saved.inflation_rate_pct ?? 6);
          setLoanTenureYears(saved.loan_tenure_years ?? 10);
          if (saved.lifestyle) setLifestyle(saved.lifestyle);
          setMonthlySavings(saved.monthly_savings ?? 0);
          const e = saved.monthly_expenses;
          if (e) {
            setLeanExpenses(Math.round(e * 0.7).toString());
            setComfortableExpenses(e.toString());
            setLuxuryExpenses(Math.round(e * 1.5).toString());
          }
          setFireNumber(saved.fire_number ?? null);
          setRetireAtAge(saved.retire_at_age ?? null);
          if (!saved.fire_number) {
            resultOpacity.value = 0;
            resultScale.value = 0.8;
          }
        } else {
          setFireNumber(null);
          setRetireAtAge(null);
          resultOpacity.value = 0;
          resultScale.value = 0.8;
        }
      };
    }, [setValue])
  );

  useEffect(() => {
    if (calculation && !hasSynced.current) {
      hasSynced.current = true;
      setValue('monthlyExpenses', calculation.monthly_expenses?.toString() ?? '');
      setValue('retirementAge', calculation.retirement_age?.toString() ?? '');
      setValue('monthlyIncome', calculation.monthly_income?.toString() ?? '');
      setValue('spouseIncome', calculation.spouse_income?.toString() ?? '');
      setValue('currentSavings', calculation.current_savings?.toString() ?? '');
      setValue('monthlyEmi', calculation.monthly_emi?.toString() ?? '');
      setValue('loanBalance', calculation.loan_balance?.toString() ?? '');
      setExpectedReturn(calculation.expected_return_pct ?? 10);
      setInflationRate(calculation.inflation_rate_pct ?? 6);
      setLoanTenureYears(calculation.loan_tenure_years ?? 10);
      if (calculation.lifestyle) setLifestyle(calculation.lifestyle);
      if (calculation.monthly_savings) setMonthlySavings(calculation.monthly_savings);
      if (calculation.monthly_expenses) {
        const e = calculation.monthly_expenses;
        setLeanExpenses(Math.round(e * 0.7).toString());
        setComfortableExpenses(e.toString());
        setLuxuryExpenses(Math.round(e * 1.5).toString());
      }
      if (calculation.fire_number) {
        setFireNumber(calculation.fire_number);
        resultOpacity.value = withTiming(1, { duration: 400 });
        resultScale.value = withSpring(1, { damping: 14 });
      }
      if (calculation.retire_at_age) setRetireAtAge(calculation.retire_at_age);
    }
  }, [calculation]);

  const onSubmit = async (data: FormData) => {
    if (!user || !profile) return;
    const today = new Date().toISOString().split('T')[0];
    const lastUpdate = await AsyncStorage.getItem('last_fire_update_date');
    if (lastUpdate === today) {
      Alert.alert('Already updated today', 'You can update your FIRE plan once per day. Come back tomorrow!');
      return;
    }
    setLoading(true);
    const currentAge = profile.age ?? 27;
    const retirementAge = parseInt(data.retirementAge);
    if (retirementAge <= currentAge) {
      Alert.alert('Invalid Age', 'Retirement age must be greater than your current age');
      setLoading(false);
      return;
    }

    const monthlyExpensesVal = parseInt(data.monthlyExpenses);
    const currentSavingsVal  = parseInt(data.currentSavings  || '0') || 0;
    const monthlyEmiVal      = parseInt(data.monthlyEmi       || '0') || 0;
    const loanBalanceVal     = parseInt(data.loanBalance      || '0') || 0;
    const monthlyIncomeVal   = parseInt(data.monthlyIncome    || '0') || 0;
    const spouseIncomeVal    = parseInt(data.spouseIncome     || '0') || 0;

    // Use form expenses for savings/rate (current behaviour), no lifestyle override needed
    const result = calculateFire(
      {
        monthly_income:      monthlyIncomeVal,
        spouse_income:       spouseIncomeVal,
        monthly_expenses:    monthlyExpensesVal,
        current_savings:     currentSavingsVal,
        loan_balance:        loanBalanceVal,
        monthly_emi:         monthlyEmiVal,
        loan_tenure_years:   loanTenureYears,
        retirement_age:      retirementAge,
        expected_return_pct: expectedReturn,
        inflation_rate_pct:  inflationRate,
      },
      currentAge,
    );

    if (!result.possible) {
      setLoading(false);
      Alert.alert(
        'Not enough savings',
        'Your monthly expenses exceed your income. Reduce expenses or increase income to calculate a FIRE date.',
      );
      return;
    }

    // Resolve scenario expenses — use whatever the user has typed, else derive from form value.
    // These are the exact same values the scenario rows display.
    const effectiveLeanExp = leanExpenses ? parseInt(leanExpenses) : Math.round(monthlyExpensesVal * 0.7);
    const effectiveComfExp = comfortableExpenses ? parseInt(comfortableExpenses) : monthlyExpensesVal;
    const effectiveLuxExp  = luxuryExpenses  ? parseInt(luxuryExpenses)  : Math.round(monthlyExpensesVal * 1.5);
    const lifestyleExpMap  = { lean: effectiveLeanExp, comfortable: effectiveComfExp, luxury: effectiveLuxExp };

    // Compute FIRE number from lifestyle-specific expenses + SWR — identical to what the scenario row shows
    const lifestyleFireNum = calculateFireNumber({
      monthlyExpenses:    lifestyleExpMap[lifestyle],
      currentAge,
      retirementAge,
      expectedReturnPct:  expectedReturn,
      inflationRatePct:   inflationRate,
    });

    // Recompute years-to-FIRE against the lifestyle target using current savings behaviour
    const lifestyleYearsToFire = calculateYearsToFireWithPayoff({
      fireNumber:         lifestyleFireNum,
      currentSavings:     currentSavingsVal,
      monthlySavings:     Math.max(0, result.monthly_savings),
      expectedReturnPct:  expectedReturn,
      currentAge,
      monthlyEmi:         monthlyEmiVal,
      loanTenureYears,
    });
    const lifestyleRetireAtAge = lifestyleYearsToFire < 999 ? currentAge + lifestyleYearsToFire : -1;

    try {
      await saveCalculation(user.id, {
        monthly_income:      monthlyIncomeVal,
        spouse_income:       spouseIncomeVal,
        monthly_expenses:    monthlyExpensesVal,
        current_savings:     currentSavingsVal,
        loan_balance:        loanBalanceVal,
        monthly_emi:         monthlyEmiVal,
        loan_tenure_years:   loanTenureYears,
        retirement_age:      retirementAge,
        expected_return_pct: expectedReturn,
        inflation_rate_pct:  inflationRate,
        lifestyle,
        fire_number:         lifestyleFireNum,
        retire_at_age:       lifestyleRetireAtAge,
        years_to_fire:       lifestyleYearsToFire,
        monthly_savings:     result.monthly_savings,
        savings_rate:        result.savings_rate,
      });
      track(user.id, 'fire_calculated', {
        lifestyle,
        retire_at_age:  lifestyleRetireAtAge,
        years_to_fire:  lifestyleYearsToFire,
        savings_rate:   result.savings_rate ?? 0,
        has_loan:       loanBalanceVal > 0,
        is_first:       !calculation,
      });
    } catch (err: any) {
      setLoading(false);
      Alert.alert('Save failed', err?.message ?? 'Could not save your FIRE data. Please try again.');
      return;
    }

    // Seed new loan tasks and update descriptions/metadata on outstanding ones
    const updatedCalc = useFireStore.getState().calculation;
    if (updatedCalc) {
      seedInsightTasks(user.id, null, updatedCalc);
      updateLoanTasksFromFire(user.id, updatedCalc);
    }

    // Mark this day as used — prevents further saves until tomorrow
    await AsyncStorage.setItem('last_fire_update_date', today);
    setAlreadyUpdatedToday(true);
    isPreviewingRef.current = false;
    setIsPreviewing(false);

    setFireNumber(lifestyleFireNum);
    setRetireAtAge(lifestyleRetireAtAge);
    setMonthlySavings(result.monthly_savings);
    setLeanExpenses(effectiveLeanExp.toString());
    setComfortableExpenses(effectiveComfExp.toString());
    setLuxuryExpenses(effectiveLuxExp.toString());

    // ── Gamification ─────────────────────────────────────────────────────────
    if (user?.id) {
      const annualExpenses = monthlyExpensesVal * 12;
      const prevMonthlySavings = calculation?.monthly_savings ?? 0;
      const isFirstCalc = !calculation?.fire_number;
      const sipIncreased = !isFirstCalc && result.monthly_savings > prevMonthlySavings;
      const action = isFirstCalc ? 'first_fire_calc' : sipIncreased ? 'increase_sip' : 'update_fire_calc';
      const freedomDaysEarned = calculateFreedomDays(Math.max(0, result.monthly_savings), annualExpenses);

      try {
        const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100];
        const reward = await awardXP(user.id, action, {
          freedomDaysEarned,
          snapshot: { fireCalcSaved: true, savingsRate: result.savings_rate },
        });
        const newStreakCount = await updateStreak(user.id, 'investment');
        await progressQuest(user.id, 'weekly_fire_update');
        if (sipIncreased) await progressQuest(user.id, 'weekly_increase_sip');

        const queue: PendingModal[] = [];
        queue.push({ type: 'xp', xpEarned: reward.xpEarned, freedomDaysEarned, isFirstCalc, sipIncreased });
        if (reward.leveledUp) {
          queue.push({ type: 'levelup', previousLevel: reward.previousLevel, newLevel: reward.newLevel, levelDefinition: reward.levelDefinition, newBadges: reward.newBadges });
        } else if (reward.newBadges.length > 0) {
          queue.push({ type: 'badge', badges: reward.newBadges });
        }
        if (STREAK_MILESTONES.includes(newStreakCount)) {
          queue.push({ type: 'streak', streakType: 'investment', count: newStreakCount });
        }
        setModalQueue(queue);
      } catch {
        // gamification errors are non-fatal
      }
    }

    const isFirstSave = resultOpacity.value === 0;
    resultOpacity.value = withTiming(1, { duration: 600 });
    resultScale.value = withSpring(1, { damping: 12 });
    setLoading(false);
    showSavedBanner();

    // Scroll to result card — give animation a head start first
    if (isFirstSave) {
      setTimeout(() => {
        resultRef.current?.measureLayout(
          scrollRef.current?.getInnerViewNode?.() as any,
          (_, y) => scrollRef.current?.scrollTo({ y: y - 16, animated: true }),
          () => {}
        );
      }, 300);
    }
  };

  const onPreview = (data: FormData) => {
    if (!profile) return;
    const currentAge = profile.age ?? 27;
    const retirementAge = parseInt(data.retirementAge);
    if (retirementAge <= currentAge) {
      Alert.alert('Invalid Age', 'Retirement age must be greater than your current age');
      return;
    }

    const monthlyExpensesVal = parseInt(data.monthlyExpenses);
    const currentSavingsVal  = parseInt(data.currentSavings  || '0') || 0;
    const monthlyEmiVal      = parseInt(data.monthlyEmi       || '0') || 0;
    const loanBalanceVal     = parseInt(data.loanBalance      || '0') || 0;
    const monthlyIncomeVal   = parseInt(data.monthlyIncome    || '0') || 0;
    const spouseIncomeVal    = parseInt(data.spouseIncome     || '0') || 0;

    const result = calculateFire(
      {
        monthly_income:      monthlyIncomeVal,
        spouse_income:       spouseIncomeVal,
        monthly_expenses:    monthlyExpensesVal,
        current_savings:     currentSavingsVal,
        loan_balance:        loanBalanceVal,
        monthly_emi:         monthlyEmiVal,
        loan_tenure_years:   loanTenureYears,
        retirement_age:      retirementAge,
        expected_return_pct: expectedReturn,
        inflation_rate_pct:  inflationRate,
      },
      currentAge,
    );

    if (!result.possible) {
      Alert.alert(
        'Not enough savings',
        'Your monthly expenses exceed your income. Reduce expenses or increase income to calculate a FIRE date.',
      );
      return;
    }

    const effectiveLeanExp = leanExpenses ? parseInt(leanExpenses) : Math.round(monthlyExpensesVal * 0.7);
    const effectiveComfExp = comfortableExpenses ? parseInt(comfortableExpenses) : monthlyExpensesVal;
    const effectiveLuxExp  = luxuryExpenses  ? parseInt(luxuryExpenses)  : Math.round(monthlyExpensesVal * 1.5);
    const lifestyleExpMap  = { lean: effectiveLeanExp, comfortable: effectiveComfExp, luxury: effectiveLuxExp };

    const lifestyleFireNum = calculateFireNumber({
      monthlyExpenses:    lifestyleExpMap[lifestyle],
      currentAge,
      retirementAge,
      expectedReturnPct:  expectedReturn,
      inflationRatePct:   inflationRate,
    });

    const lifestyleYearsToFire = calculateYearsToFireWithPayoff({
      fireNumber:         lifestyleFireNum,
      currentSavings:     currentSavingsVal,
      monthlySavings:     Math.max(0, result.monthly_savings),
      expectedReturnPct:  expectedReturn,
      currentAge,
      monthlyEmi:         monthlyEmiVal,
      loanTenureYears,
    });
    const lifestyleRetireAtAge = lifestyleYearsToFire < 999 ? currentAge + lifestyleYearsToFire : -1;

    const isFirstPreview = resultOpacity.value === 0;
    setFireNumber(lifestyleFireNum);
    setRetireAtAge(lifestyleRetireAtAge);
    setMonthlySavings(result.monthly_savings);
    setLeanExpenses(effectiveLeanExp.toString());
    setComfortableExpenses(effectiveComfExp.toString());
    setLuxuryExpenses(effectiveLuxExp.toString());
    isPreviewingRef.current = true;
    setIsPreviewing(true);

    resultOpacity.value = withTiming(1, { duration: 600 });
    resultScale.value = withSpring(1, { damping: 12 });

    if (isFirstPreview) {
      setTimeout(() => {
        resultRef.current?.measureLayout(
          scrollRef.current?.getInnerViewNode?.() as any,
          (_, y) => scrollRef.current?.scrollTo({ y: y - 16, animated: true }),
          () => {}
        );
      }, 300);
    }
  };

  const resultStyle = useAnimatedStyle(() => ({
    opacity: resultOpacity.value,
    transform: [{ scale: resultScale.value }],
  }));

  const currentAge = profile?.age ?? 27;
  const watchedCurrentSavings = watch('currentSavings');
  const watchedMonthlyEmi = watch('monthlyEmi');

  const timeline =
    fireNumber !== null
      ? buildWealthTimelineWithPayoff(
          {
            fireNumber,
            currentSavings: parseInt(watchedCurrentSavings || '0') || (calculation?.current_savings ?? 0),
            monthlySavings,
            expectedReturnPct: expectedReturn,
            currentAge,
            monthlyEmi: parseInt(watchedMonthlyEmi || '0') || (calculation?.monthly_emi ?? 0),
            loanTenureYears,
          },
          retireAtAge !== null ? Math.max(1, retireAtAge - currentAge + 5) : 25
        )
      : [];

  const crossoverIdx = timeline.findIndex((p) => p.wealth >= (fireNumber ?? Infinity));
  const payoffIdx = timeline.findIndex((p) => p.isPayoffYear);
  const CHART_WIDTH = Dimensions.get('window').width - 120;

  const lineData = timeline.map((p, i) => {
    const isCrossover = crossoverIdx !== -1 && i === crossoverIdx;
    const isPayoff = i === payoffIdx;
    return {
      value: p.wealth / 100000,
      label: p.year % 5 === 0 || isCrossover || isPayoff ? String(p.age) : '',
      dataPointColor: isCrossover ? Colors.success : isPayoff ? Colors.warning : Colors.primary,
      dataPointRadius: isCrossover ? 7 : isPayoff ? 6 : 2,
      showStrip: isCrossover || isPayoff,
      stripColor: isCrossover ? Colors.success : Colors.warning,
      stripOpacity: 0.15,
    };
  });

  const fireLineData = timeline.map(() => ({
    value: fireNumber ? fireNumber / 100000 : 0,
  }));

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
    <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={styles.content}>
      {/* Saved banner */}
      <RNAnimated.View style={[styles.savedBanner, { opacity: savedBannerOpacity }]} pointerEvents="none">
        <Text style={styles.savedBannerText}>✓ FIRE updated across all screens</Text>
      </RNAnimated.View>

      {currentModal?.type === 'xp' && (
        <XPCelebrationModal
          visible
          title={currentModal.isFirstCalc ? 'FIRE NUMBER SET!' : currentModal.sipIncreased ? 'SIP INCREASED!' : 'FIRE PLAN SAVED!'}
          icon={currentModal.isFirstCalc ? 'flame' : currentModal.sipIncreased ? 'trending-up' : 'checkmark-circle'}
          iconColor={currentModal.isFirstCalc ? Colors.accent : currentModal.sipIncreased ? Colors.success : Colors.primary}
          xpEarned={currentModal.xpEarned}
          freedomDaysEarned={currentModal.freedomDaysEarned}
          message={
            currentModal.isFirstCalc
              ? "You've taken the first step to financial freedom!"
              : currentModal.sipIncreased
              ? 'Investing more is the fastest path to FIRE!'
              : 'Staying on top of your plan pays off!'
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

      <View style={styles.header}>
        <Text style={styles.title}>FIRE Calculator</Text>
      </View>

      <TouchableOpacity
        style={styles.infoCard}
        onPress={() => setShowInfo(!showInfo)}
      >
        <View style={styles.infoRow}>
          <Text style={styles.infoTitle}>What is FIRE?  <Ionicons name="information-circle-outline" size={16} color={Colors.textMuted} /></Text>
          <Text style={styles.infoChevron}>{showInfo ? '▲' : '▼'}</Text>
        </View>
        {showInfo && (
          <Text style={styles.infoText}>
            FIRE stands for Financial Independence, Retire Early. Your FIRE Number is the corpus you need to sustain your lifestyle indefinitely using investment returns — typically calculated as 25–28x your annual expenses (the 4% Safe Withdrawal Rule, adjusted for Indian inflation).
          </Text>
        )}
      </TouchableOpacity>

      {fireNumber !== null && lineData.length > 1 && (
        <Card style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <View>
              <Text style={styles.chartTitle}>Wealth Accumulation Timeline</Text>
              <Text style={styles.chartSubtitle}>₹ Lakhs</Text>
            </View>
            <View style={styles.chartBadges}>
              {crossoverIdx !== -1 && (
                <View style={styles.crossoverBadge}>
                  <Ionicons name="flag" size={12} color={Colors.success} />
                  <Text style={styles.crossoverBadgeText}>
                    FIRE @ {timeline[crossoverIdx].age}
                  </Text>
                </View>
              )}
              {payoffIdx !== -1 && (
                <View style={styles.payoffBadge}>
                  <Ionicons name="home-outline" size={12} color={Colors.warning} />
                  <Text style={styles.payoffBadgeText}>
                    Payoff @ {timeline[payoffIdx].age}
                  </Text>
                </View>
              )}
            </View>
          </View>
          <LineChart
            data={lineData}
            data2={fireLineData}
            color={Colors.primary}
            color2={Colors.accent}
            thickness={2.5}
            thickness2={1.5}
            dataPointsColor={Colors.primary}
            dataPointsRadius={2}
            startFillColor={Colors.primary}
            startOpacity={0.25}
            endOpacity={0.02}
            areaChart
            hideDataPoints2
            curved
            strokeDashArray2={[6, 4]}
            xAxisThickness={1}
            xAxisColor={Colors.border}
            yAxisThickness={0}
            yAxisTextStyle={{ color: Colors.textMuted, fontSize: 10 }}
            xAxisLabelTextStyle={{ color: Colors.textMuted, fontSize: 9 }}
            width={CHART_WIDTH}
            height={210}
            noOfSections={4}
            backgroundColor={Colors.surface}
            rulesColor={Colors.border}
            rulesType="dashed"
            dashWidth={4}
            dashGap={6}
            stripHeight={210}
          />
          <Text style={styles.xAxisLabel}>age</Text>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendLine, { backgroundColor: Colors.primary }]} />
              <Text style={styles.legendText}>Your Wealth</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendLine, { backgroundColor: Colors.accent }]} />
              <Text style={styles.legendText}>FIRE Target (dashed)</Text>
            </View>
            {crossoverIdx !== -1 && (
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Colors.success }]} />
                <Text style={styles.legendText}>FIRE crossover</Text>
              </View>
            )}
            {payoffIdx !== -1 && (
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Colors.warning }]} />
                <Text style={styles.legendText}>Loan payoff</Text>
              </View>
            )}
          </View>
        </Card>
      )}

      <Text style={styles.sectionLabel}>YOUR LIFESTYLE</Text>

      <View style={styles.lifestyleSelector}>
        {(
          [
            { key: 'lean',        label: 'Lean',        sub: '70% of budget' },
            { key: 'comfortable', label: 'Comfortable', sub: 'your budget' },
            { key: 'luxury',      label: 'Luxury',      sub: '150% of budget' },
          ] as const
        ).map(({ key, label, sub }) => (
          <TouchableOpacity
            key={key}
            style={[styles.lifestyleOption, lifestyle === key && styles.lifestyleOptionActive]}
            onPress={() => setLifestyle(key)}
            activeOpacity={0.75}
          >
            <Text style={[styles.lifestyleOptionLabel, lifestyle === key && styles.lifestyleOptionLabelActive]}>
              {label}
            </Text>
            <Text style={[styles.lifestyleOptionSub, lifestyle === key && styles.lifestyleOptionSubActive]}>
              {sub}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Controller
        control={control}
        name="monthlyExpenses"
        render={({ field: { onChange, value } }) => (
          <InputField
            label="Monthly expenses (₹)"
            icon="cash-outline"
            placeholder="50,000"
            value={value}
            onChangeText={onChange}
            keyboardType="numeric"
            indianFormat
            error={errors.monthlyExpenses?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="retirementAge"
        render={({ field: { onChange, value } }) => (
          <InputField
            label="Target retirement age"
            icon="flag-outline"
            placeholder="45"
            value={value}
            onChangeText={onChange}
            keyboardType="numeric"
            error={errors.retirementAge?.message}
          />
        )}
      />

      <Text style={[styles.sectionLabel, { marginTop: Spacing.md }]}>YOUR INCOME</Text>

      <Controller
        control={control}
        name="monthlyIncome"
        render={({ field: { onChange, value } }) => (
          <InputField
            label="Your monthly income (₹)"
            icon="briefcase-outline"
            placeholder="80,000"
            value={value}
            onChangeText={onChange}
            keyboardType="numeric"
            indianFormat
            error={errors.monthlyIncome?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="spouseIncome"
        render={({ field: { onChange, value } }) => (
          <InputField
            label="Spouse monthly income (₹)"
            icon="people-outline"
            placeholder="0"
            value={value}
            onChangeText={onChange}
            keyboardType="numeric"
            indianFormat
            error={errors.spouseIncome?.message}
          />
        )}
      />

      <Text style={[styles.sectionLabel, { marginTop: Spacing.md }]}>YOUR CURRENT FINANCES</Text>

      <Controller
        control={control}
        name="currentSavings"
        render={({ field: { onChange, value } }) => (
          <InputField
            label="Current savings & investments (₹)"
            icon="analytics-outline"
            placeholder="500000"
            value={value}
            onChangeText={onChange}
            keyboardType="numeric"
            indianFormat
            error={errors.currentSavings?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="monthlyEmi"
        render={({ field: { onChange, value } }) => (
          <InputField
            label="Monthly EMI total (₹)"
            icon="calendar-outline"
            placeholder="0"
            value={value}
            onChangeText={onChange}
            keyboardType="numeric"
            indianFormat
            error={errors.monthlyEmi?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="loanBalance"
        render={({ field: { onChange, value } }) => (
          <InputField
            label="Loan amount remaining (₹)"
            icon="receipt-outline"
            placeholder="0"
            value={value}
            onChangeText={onChange}
            keyboardType="numeric"
            indianFormat
            error={errors.loanBalance?.message}
          />
        )}
      />

      {parseInt(watchedEmi || '0') > 0 && (
        <SliderInput
          label="Loan tenure remaining"
          value={loanTenureYears}
          min={1}
          max={30}
          step={1}
          unit=" yrs"
          onValueChange={setLoanTenureYears}
        />
      )}

      <Text style={[styles.sectionLabel, { marginTop: Spacing.md }]}>ASSUMPTIONS</Text>

      <SliderInput
        label="Expected annual return"
        value={expectedReturn}
        min={6}
        max={20}
        step={0.5}
        unit="%"
        onValueChange={setExpectedReturn}
      />

      <SliderInput
        label="Inflation rate"
        value={inflationRate}
        min={3}
        max={12}
        step={0.5}
        unit="%"
        onValueChange={setInflationRate}
      />

      <GradientButton
        title="Preview my FIRE"
        onPress={handleSubmit(onPreview)}
        variant="outline"
        style={styles.previewBtn}
      />

      {fireNumber !== null && (
        <Animated.View ref={resultRef} style={resultStyle}>
          <Card style={styles.resultCard} elevated>
            <Text style={styles.resultLabel}>Your FIRE Number</Text>
            <View style={styles.resultAmountContainer}>
              <Text style={styles.resultAmount}>{formatCurrency(fireNumber)}</Text>
            </View>
            {retireAtAge !== null && (
              <View style={styles.retireRow}>
                <View style={styles.retireStat}>
                  <Text style={styles.retireStatVal}>{retireAtAge}</Text>
                  <Text style={styles.retireStatLabel}>Retire at age</Text>
                </View>
                <View style={[styles.retireStat, styles.retireStatMid]}>
                  <Text style={styles.retireStatVal}>
                    {Math.max(0, retireAtAge - currentAge)} yrs
                  </Text>
                  <Text style={styles.retireStatLabel}>Years away</Text>
                </View>
                <View style={styles.retireStat}>
                  <Text style={styles.retireStatVal}>
                    {(expectedReturn - inflationRate).toFixed(1)}%
                  </Text>
                  <Text style={styles.retireStatLabel}>Real return</Text>
                </View>
              </View>
            )}
            <View style={styles.resultMeta}>
              <Text style={styles.resultMetaText}>
                Inflation-adjusted corpus to age {watch('retirementAge') || calculation?.retirement_age || '—'}
              </Text>
              <Text style={[styles.resultMetaText, { marginTop: Spacing.xs }]}>
                Invest consistently and you'll get there!
              </Text>
            </View>
          </Card>

          <Card style={styles.scenariosCard}>
            <Text style={styles.scenariosTitle}>Lifestyle Scenarios</Text>
            <Text style={styles.scenariosHint}>Edit monthly expenses for each level</Text>
            {(
              [
                { key: 'lean', label: 'Lean', icon: 'leaf-outline' as const, color: Colors.success, expenses: leanExpenses, setExpenses: setLeanExpenses },
                { key: 'comfortable', label: 'Comfortable', icon: 'home-outline' as const, color: Colors.primary, expenses: comfortableExpenses, setExpenses: setComfortableExpenses },
                { key: 'luxury', label: 'Luxury', icon: 'diamond-outline' as const, color: Colors.warning, expenses: luxuryExpenses, setExpenses: setLuxuryExpenses },
              ] as const
            ).map(({ key, label, icon, color, expenses, setExpenses }) => {
              const expVal = parseInt(expenses) || 0;
              const scenarioFireNum = expVal > 0
                ? calculateFireNumber({
                    monthlyExpenses: expVal,
                    currentAge,
                    retirementAge: parseInt(watch('retirementAge') || '45'),
                    expectedReturnPct: expectedReturn,
                    inflationRatePct: inflationRate,
                  })
                : 0;
              return (
                <View key={key} style={styles.scenarioRow}>
                  <View style={[styles.scenarioAccent, { backgroundColor: color }]} />
                  <View style={styles.scenarioBody}>
                    <View style={styles.scenarioLabelRow}>
                      <Ionicons name={icon} size={13} color={color} />
                      <Text style={[styles.scenarioLabel, { color }]}>{label}</Text>
                    </View>
                    <View style={styles.scenarioInputWrapper}>
                      <Text style={styles.scenarioRupee}>₹</Text>
                      <TextInput
                        style={styles.scenarioInput}
                        value={expenses}
                        onChangeText={setExpenses}
                        keyboardType="numeric"
                        placeholder="monthly exp"
                        placeholderTextColor={Colors.textMuted}
                        selectTextOnFocus
                      />
                      <Text style={styles.scenarioPerMo}>/mo</Text>
                    </View>
                  </View>
                  <View style={styles.scenarioResult}>
                    <Text style={styles.scenarioFireLabel}>FIRE Number</Text>
                    <Text style={[styles.scenarioFireNum, { color }]}>
                      {expVal > 0 ? formatCurrency(scenarioFireNum) : '—'}
                    </Text>
                  </View>
                </View>
              );
            })}
          </Card>
        </Animated.View>
      )}

      <GradientButton
        title={alreadyUpdatedToday ? 'Updated today ✓' : 'Update my FIRE'}
        onPress={handleSubmit(onSubmit)}
        loading={loading}
        disabled={alreadyUpdatedToday}
        style={styles.calcBtn}
      />
      {alreadyUpdatedToday && (
        <Text style={styles.nextUpdateHint}>Next update available tomorrow</Text>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.xxl },
  header: { marginBottom: Spacing.lg },
  title: {
    color: Colors.textPrimary,
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing.xs,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.lg,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
  },
  infoChevron: { color: Colors.textMuted, fontSize: FontSize.sm },
  infoText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginTop: Spacing.sm,
  },
  sectionLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    letterSpacing: 1.2,
    marginBottom: Spacing.md,
  },
  chartCard: { marginBottom: Spacing.lg, paddingBottom: Spacing.sm },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  chartTitle: { color: Colors.textPrimary, fontSize: FontSize.base, fontWeight: FontWeight.semiBold, marginBottom: 2 },
  chartSubtitle: { color: Colors.textMuted, fontSize: FontSize.xs },
  chartBadges: { gap: 4, alignItems: 'flex-end' },
  crossoverBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: `${Colors.success}22`,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: `${Colors.success}55`,
  },
  crossoverBadgeText: { color: Colors.success, fontSize: FontSize.xs, fontWeight: FontWeight.semiBold },
  payoffBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: `${Colors.warning}22`,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: `${Colors.warning}55`,
  },
  payoffBadgeText: { color: Colors.warning, fontSize: FontSize.xs, fontWeight: FontWeight.semiBold },
  xAxisLabel: { color: Colors.textMuted, fontSize: FontSize.xs, textAlign: 'center', marginTop: 2, marginBottom: Spacing.xs },
  legendRow: { flexDirection: 'row', marginTop: Spacing.xs, gap: Spacing.md, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLine: { width: 16, height: 3, borderRadius: 2 },
  legendText: { color: Colors.textMuted, fontSize: FontSize.xs },
  lifestyleSelector: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  lifestyleOption: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  lifestyleOptionActive: {
    backgroundColor: Colors.primary,
  },
  lifestyleOptionLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
  },
  lifestyleOptionLabelActive: {
    color: Colors.background,
  },
  lifestyleOptionSub: {
    color: Colors.textMuted,
    fontSize: 10,
  },
  lifestyleOptionSubActive: {
    color: `${Colors.background}bb`,
  },
  savedBanner: {
    position: 'absolute',
    top: Spacing.lg,
    alignSelf: 'center',
    backgroundColor: Colors.success,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    zIndex: 100,
  },
  savedBannerText: {
    color: Colors.background,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
  },
  previewBtn: { marginTop: Spacing.lg, marginBottom: Spacing.md },
  calcBtn: { marginBottom: Spacing.xs },
  nextUpdateHint: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  resultCard: {
    borderColor: Colors.primary,
    borderWidth: 1.5,
  },
  resultLabel: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    marginBottom: Spacing.sm,
  },
  resultAmountContainer: {
    backgroundColor: `${Colors.primary}22`,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: `${Colors.primary}44`,
  },
  resultAmount: {
    color: Colors.primary,
    fontSize: FontSize.xxxl,
    fontWeight: FontWeight.extraBold,
    letterSpacing: -1,
  },
  retireRow: {
    flexDirection: 'row',
    width: '100%',
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  retireStat: { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm },
  retireStatMid: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: Colors.border },
  retireStatVal: { color: Colors.primary, fontSize: FontSize.md, fontWeight: FontWeight.bold, marginBottom: 2 },
  retireStatLabel: { color: Colors.textMuted, fontSize: FontSize.xs, textAlign: 'center' },
  resultMeta: { gap: Spacing.xs },
  resultMetaText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    lineHeight: 20,
  },
  scenariosCard: {
    marginTop: Spacing.md,
    borderColor: Colors.border,
    borderWidth: 1,
  },
  scenariosTitle: {
    color: Colors.textPrimary,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
    marginBottom: 2,
  },
  scenariosHint: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginBottom: Spacing.md,
  },
  scenarioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    backgroundColor: Colors.surfaceHigh,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  scenarioAccent: {
    width: 4,
    alignSelf: 'stretch',
  },
  scenarioBody: {
    flex: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    gap: 4,
  },
  scenarioLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scenarioLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
  },
  scenarioInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    alignSelf: 'flex-start',
    minWidth: 130,
  },
  scenarioRupee: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginRight: 2,
  },
  scenarioInput: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    flex: 1,
    paddingVertical: 0,
    minWidth: 70,
  },
  scenarioPerMo: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginLeft: 2,
  },
  scenarioResult: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    alignItems: 'flex-end',
    minWidth: 100,
  },
  scenarioFireLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginBottom: 2,
  },
  scenarioFireNum: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
  },
});
