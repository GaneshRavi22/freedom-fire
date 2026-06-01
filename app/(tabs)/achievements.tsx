import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useAuthStore } from '@/stores/auth.store';
import { track } from '@/lib/analytics';
import { useGamificationStore } from '@/stores/gamification.store';
import {
  getLevelFromXP,
  BADGE_DEFINITIONS,
  QUEST_DEFINITIONS,
  STREAK_LABELS,
  type StreakType,
} from '@/lib/gamification';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius } from '@/constants/theme';
import { Card } from '@/components/ui/cards/Card';
import { XPBar } from '@/components/ui/gamification/XPBar';
import { BadgeCard } from '@/components/ui/cards/BadgeCard';
import { QuestCard } from '@/components/ui/cards/QuestCard';

export default function AchievementsScreen() {
  const { user } = useAuthStore();
  const { xp, totalFreedomDays, unlockedBadges, streaks, quests } = useGamificationStore();
  const { width: screenWidth } = useWindowDimensions();
  const badgeCellWidth = Math.floor((screenWidth - 2 * Spacing.lg - 2 * Spacing.sm) / 3);

  useFocusEffect(useCallback(() => {
    if (user) track(user.id, 'screen_viewed', { screen: 'achievements' });
  }, [user?.id]));

  const levelDef = getLevelFromXP(xp);
  const unlockedIds = unlockedBadges.map((b) => b.badge_id);
  const unlockedCount = unlockedIds.length;

  const activeQuests = quests.filter(
    (q) => !q.completed && (!q.expires_at || new Date(q.expires_at) >= new Date())
  );
  const completedQuests = quests.filter((q) => q.completed);

  const streakTypes: StreakType[] = ['investment', 'tracking', 'review'];
  const streakIcons: Record<StreakType, string> = {
    investment: 'trending-up-outline',
    tracking: 'receipt-outline',
    review: 'eye-outline',
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* ── XP Header ───────────────────────────────────────────────────── */}
      <XPBar
        level={levelDef.level}
        levelTitle={levelDef.title}
        levelIcon={levelDef.icon}
        levelColor={levelDef.color}
        xp={xp}
        currentLevelXP={levelDef.minXP}
        nextLevelXP={levelDef.maxXP}
        style={styles.xpBar}
      />

      {/* ── Freedom Days Summary ─────────────────────────────────────────── */}
      <Card style={styles.fdCard}>
        <View style={styles.fdRow}>
          <Ionicons name="flame" size={32} color={Colors.warning} />
          <View style={styles.fdBody}>
            <Text style={styles.fdNum}>{Math.round(totalFreedomDays).toLocaleString('en-IN')}</Text>
            <Text style={styles.fdLabel}>Total Freedom Days Earned</Text>
          </View>
        </View>
      </Card>

      {/* ── Streaks ──────────────────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>STREAKS</Text>
      <View style={styles.streakGrid}>
        {streakTypes.map((type) => {
          const s = streaks.find((sr) => sr.streak_type === type);
          const count = s?.current_count ?? 0;
          const longest = s?.longest_count ?? 0;
          return (
            <Card key={type} style={styles.streakCard}>
              <Ionicons
                name={streakIcons[type] as React.ComponentProps<typeof Ionicons>['name']}
                size={20}
                color={count > 0 ? Colors.warning : Colors.textMuted}
              />
              <Text style={[styles.streakCount, count > 0 && styles.streakCountActive]}>
                {count}
              </Text>
              <Text style={styles.streakType}>{STREAK_LABELS[type]}</Text>
              <Text style={styles.streakSub}>Best: {longest}</Text>
            </Card>
          );
        })}
      </View>

      {/* ── Badges ───────────────────────────────────────────────────────── */}
      <View style={styles.badgeHeader}>
        <Text style={styles.sectionLabel}>BADGES</Text>
        <Text style={styles.badgeCount}>
          {unlockedCount} / {BADGE_DEFINITIONS.length} unlocked
        </Text>
      </View>

      <View style={styles.badgeGrid}>
        {/* Unlocked first, locked after */}
        {[
          ...BADGE_DEFINITIONS.filter((b) => unlockedIds.includes(b.id)),
          ...BADGE_DEFINITIONS.filter((b) => !unlockedIds.includes(b.id)),
        ].map((badge) => {
          const unlockedRecord = unlockedBadges.find((ub) => ub.badge_id === badge.id);
          return (
            <BadgeCard
              key={badge.id}
              badge={badge}
              unlocked={unlockedIds.includes(badge.id)}
              earnedAt={unlockedRecord?.unlocked_at}
              size="large"
              style={{ width: badgeCellWidth, height: badgeCellWidth + 46 }}
            />
          );
        })}
      </View>

      {/* ── Active Quests ────────────────────────────────────────────────── */}
      {activeQuests.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>ACTIVE QUESTS</Text>
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
        </>
      )}

      {/* ── Completed Quests ─────────────────────────────────────────────── */}
      {completedQuests.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>COMPLETED QUESTS</Text>
          {completedQuests.map((q) => {
            const def = QUEST_DEFINITIONS.find((d) => d.id === q.quest_id);
            if (!def) return null;
            return (
              <QuestCard
                key={`${q.quest_id}_done`}
                title={def.title}
                description={def.description}
                icon={def.icon}
                progress={q.progress}
                target={q.target}
                completed
                xpReward={def.xpReward}
                frequency={def.frequency}
                style={styles.questCard}
              />
            );
          })}
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  xpBar: {
    marginBottom: Spacing.md,
  },

  // Freedom days
  fdCard: {
    marginBottom: Spacing.lg,
  },
  fdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  fdBody: {},
  fdNum: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.extraBold,
    color: Colors.warning,
  },
  fdLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
  },

  sectionLabel: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    letterSpacing: 1.2,
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
    textTransform: 'uppercase',
  },

  // Streaks
  streakGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  streakCard: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
  },
  streakCount: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.extraBold,
    color: Colors.textMuted,
  },
  streakCountActive: {
    color: Colors.warning,
  },
  streakType: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    color: Colors.textSecondary,
  },
  streakSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },

  // Badges
  badgeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
  badgeCount: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: FontWeight.medium,
  },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  badgeCard: {},

  // Quests
  questCard: {
    marginBottom: Spacing.sm,
  },
});
