import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight } from '@/constants/theme';
import { formatCurrency } from '@/lib/calculations';

interface FreedomDaysCardProps {
  totalDays: number;
  recentlyEarned?: number;
  annualExpenses: number;
  style?: object;
}

export function FreedomDaysCard({
  totalDays,
  recentlyEarned,
  annualExpenses,
  style,
}: FreedomDaysCardProps) {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const [displayDays, setDisplayDays] = useState(0);
  const earnedOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    animatedValue.addListener(({ value }) => {
      setDisplayDays(Math.round(value));
    });
    Animated.timing(animatedValue, {
      toValue: totalDays,
      duration: 1200,
      useNativeDriver: false,
    }).start();
    return () => animatedValue.removeAllListeners();
  }, [totalDays]);

  useEffect(() => {
    if (recentlyEarned && recentlyEarned > 0) {
      earnedOpacity.setValue(1);
      Animated.timing(earnedOpacity, {
        toValue: 0,
        duration: 400,
        delay: 2200,
        useNativeDriver: true,
      }).start();
    }
  }, [recentlyEarned]);

  // Each day of freedom = annualExpenses / 365 in corpus terms
  const corpusValue = annualExpenses > 0 ? Math.round((totalDays * annualExpenses) / 365) : 0;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconWrap}>
        <Ionicons name="sunny" size={22} color={Colors.warning} />
      </View>

      <View style={styles.content}>
        <Text style={styles.label}>Freedom Days Earned</Text>
        <View style={styles.countRow}>
          <Text style={styles.count}>{displayDays.toLocaleString('en-IN')}</Text>
          <Text style={styles.unit}> days</Text>
          {recentlyEarned && recentlyEarned > 0 ? (
            <Animated.Text style={[styles.earned, { opacity: earnedOpacity }]}>
              {' '}+{recentlyEarned}
            </Animated.Text>
          ) : null}
        </View>
        {corpusValue > 0 && (
          <Text style={styles.sub}>= {formatCurrency(corpusValue)} of freedom corpus</Text>
        )}
      </View>

      <View style={styles.flame}>
        <Ionicons name="flame" size={24} color={Colors.warning} />
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
    borderColor: `${Colors.warning}44`,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.sm + 4,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    backgroundColor: `${Colors.warning}22`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  label: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
    marginBottom: 2,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  count: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.extraBold,
    color: Colors.warning,
  },
  unit: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  earned: {
    fontSize: FontSize.sm,
    color: Colors.success,
    fontWeight: FontWeight.semiBold,
  },
  sub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  flame: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
