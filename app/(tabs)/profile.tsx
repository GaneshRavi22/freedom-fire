import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  useWindowDimensions,
  KeyboardAvoidingView,
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
  RARITY_COLORS,
  RARITY_LABELS,
  type StreakType,
  type BadgeDefinition,
} from '@/lib/gamification';
import { supabase } from '@/services/supabase';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius } from '@/constants/theme';
import { Card } from '@/components/ui/cards/Card';
import { XPBar } from '@/components/ui/gamification/XPBar';
import { BadgeCard } from '@/components/ui/cards/BadgeCard';
import { QuestCard } from '@/components/ui/cards/QuestCard';
import { GradientButton } from '@/components/ui/layout/GradientButton';
import { InputField } from '@/components/ui/inputs/InputField';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

export default function ProfileScreen() {
  const { user, profile, signOut, setProfile } = useAuthStore();
  const { xp, totalFreedomDays, unlockedBadges, streaks, quests } = useGamificationStore();
  const { width: screenWidth } = useWindowDimensions();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.name ?? '');
  const [age, setAge] = useState(profile?.age?.toString() ?? '');
  const [saving, setSaving] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState<BadgeDefinition | null>(null);

  useFocusEffect(useCallback(() => {
    if (user) track(user.id, 'screen_viewed', { screen: 'profile' });
  }, [user?.id]));

  const levelDef = getLevelFromXP(xp);
  const unlockedIds = unlockedBadges.map((b) => b.badge_id);
  const unlockedCount = unlockedIds.length;

  const badgeCellWidth = Math.floor((screenWidth - 2 * Spacing.lg - 2 * Spacing.sm) / 3);

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

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('profiles')
      .update({ name, age: parseInt(age) })
      .eq('id', user.id)
      .select()
      .maybeSingle();
    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else if (!data) {
      Alert.alert('Error', 'Profile not found. Please sign out and sign in again.');
    } else {
      setProfile(data);
      setEditing(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const infoRows: { label: string; value: string; icon: IoniconsName }[] = [
    { label: 'Email', value: user?.email ?? '—', icon: 'mail-outline' },
    { label: 'Age', value: profile?.age ? `${profile.age} years` : '—', icon: 'calendar-outline' },
    {
      label: 'Member since',
      value: profile?.created_at
        ? new Date(profile.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
        : '—',
      icon: 'time-outline',
    },
  ];

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
      {/* ── Avatar & Name ──────────────────────────────────────────────────── */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {profile?.name?.[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <Text style={styles.displayName}>{profile?.name ?? 'User'}</Text>
        <Text style={styles.displayEmail}>{user?.email}</Text>
      </View>

      {/* ── XP Bar ─────────────────────────────────────────────────────────── */}
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
                name={streakIcons[type] as IoniconsName}
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
        {[
          ...BADGE_DEFINITIONS.filter((b) => unlockedIds.includes(b.id)),
          ...BADGE_DEFINITIONS.filter((b) => !unlockedIds.includes(b.id)),
        ].map((badge) => {
          const unlockedRecord = unlockedBadges.find((ub) => ub.badge_id === badge.id);
          return (
            <TouchableOpacity
              key={badge.id}
              onPress={() => setSelectedBadge(badge)}
              activeOpacity={0.85}
              style={{ width: badgeCellWidth, height: badgeCellWidth + 46 }}
            >
              <BadgeCard
                badge={badge}
                unlocked={unlockedIds.includes(badge.id)}
                earnedAt={unlockedRecord?.unlocked_at}
                size="large"
                style={{ width: badgeCellWidth, height: badgeCellWidth + 46 }}
              />
            </TouchableOpacity>
          );
        })}
      </View>

      {selectedBadge !== null && (() => {
        const isEarned = unlockedIds.includes(selectedBadge.id);
        const record = unlockedBadges.find((ub) => ub.badge_id === selectedBadge.id);
        const rarityColor = RARITY_COLORS[selectedBadge.rarity];
        return (
          <Modal
            visible
            transparent
            animationType="fade"
            onRequestClose={() => setSelectedBadge(null)}
          >
            <TouchableOpacity
              style={styles.modalBackdrop}
              activeOpacity={1}
              onPress={() => setSelectedBadge(null)}
            >
              <TouchableOpacity activeOpacity={1} style={styles.badgeDetailCard}>
                <View style={[styles.badgeDetailIconWrap, { borderColor: isEarned ? rarityColor : Colors.border }]}>
                  <Ionicons
                    name={(isEarned ? selectedBadge.icon : 'lock-closed-outline') as IoniconsName}
                    size={40}
                    color={isEarned ? rarityColor : Colors.textMuted}
                  />
                </View>
                <Text style={styles.badgeDetailTitle}>{selectedBadge.title}</Text>
                <View style={[styles.badgeDetailRarityChip, { backgroundColor: `${rarityColor}22` }]}>
                  <Text style={[styles.badgeDetailRarityText, { color: rarityColor }]}>
                    {RARITY_LABELS[selectedBadge.rarity]}
                  </Text>
                </View>
                <Text style={styles.badgeDetailDesc}>{selectedBadge.description}</Text>
                {isEarned ? (
                  <View style={styles.badgeDetailStatus}>
                    <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                    <Text style={[styles.badgeDetailStatusText, { color: Colors.success }]}>
                      {'Earned on '}
                      {record?.unlocked_at
                        ? new Date(record.unlocked_at).toLocaleDateString('en-IN', {
                            day: 'numeric', month: 'long', year: 'numeric',
                          })
                        : '—'}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.badgeDetailStatus}>
                    <Ionicons name="hourglass-outline" size={16} color={Colors.textMuted} />
                    <Text style={styles.badgeDetailNotEarned}>Keep going to earn this badge!</Text>
                  </View>
                )}
                <TouchableOpacity style={styles.badgeDetailCloseBtn} onPress={() => setSelectedBadge(null)}>
                  <Text style={styles.badgeDetailCloseTxt}>Close</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        );
      })()}

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

      {/* ── Profile Info ──────────────────────────────────────────────────── */}
      <View style={styles.separator} />
      <Text style={styles.sectionLabel}>PROFILE</Text>

      {editing ? (
        <Card style={styles.editCard}>
          <Text style={styles.editTitle}>Edit Profile</Text>
          <InputField
            label="Full Name"
            icon="person-outline"
            value={name}
            onChangeText={setName}
            placeholder="Your name"
          />
          <InputField
            label="Age"
            icon="calendar-outline"
            value={age}
            onChangeText={setAge}
            keyboardType="numeric"
            placeholder="27"
          />
          <View style={styles.editButtons}>
            <GradientButton
              title="Save Changes"
              onPress={handleSave}
              loading={saving}
              style={styles.saveBtn}
            />
            <TouchableOpacity onPress={() => setEditing(false)} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Card>
      ) : (
        <>
          <Card style={styles.infoCard}>
            {infoRows.map((row, i) => (
              <View
                key={row.label}
                style={[styles.infoRow, i < infoRows.length - 1 && styles.infoRowBorder]}
              >
                <Ionicons name={row.icon} size={20} color={Colors.textMuted} style={styles.infoIcon} />
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>{row.label}</Text>
                  <Text style={styles.infoValue}>{row.value}</Text>
                </View>
              </View>
            ))}
          </Card>

          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => {
              setName(profile?.name ?? '');
              setAge(profile?.age?.toString() ?? '');
              setEditing(true);
            }}
          >
            <Ionicons name="pencil-outline" size={14} color={Colors.primary} />
            <Text style={styles.editBtnText}> Edit Profile</Text>
          </TouchableOpacity>
        </>
      )}

      {/* ── Account ───────────────────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>ACCOUNT</Text>
      <Card style={styles.menuCard}>
        <TouchableOpacity style={styles.menuItem} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={20} color={Colors.error} style={styles.menuItemIcon} />
          <Text style={styles.menuItemText}>Sign Out</Text>
          <Text style={styles.menuItemChevron}>→</Text>
        </TouchableOpacity>
      </Card>

      <Text style={styles.version}>FreedomFire v1.0.0</Text>
      <View style={{ height: 40 }} />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.xxl },

  // Avatar
  avatarSection: { alignItems: 'center', marginBottom: Spacing.lg },
  avatar: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  avatarText: { color: '#fff', fontSize: FontSize.xxl, fontWeight: FontWeight.bold },
  displayName: { color: Colors.textPrimary, fontSize: FontSize.xl, fontWeight: FontWeight.bold, marginBottom: 4 },
  displayEmail: { color: Colors.textSecondary, fontSize: FontSize.sm },

  xpBar: { marginBottom: Spacing.md },

  // Freedom days
  fdCard: { marginBottom: Spacing.lg },
  fdRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  fdBody: {},
  fdNum: { fontSize: FontSize.xxl, fontWeight: FontWeight.extraBold, color: Colors.warning },
  fdLabel: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium },

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
  streakGrid: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  streakCard: { flex: 1, alignItems: 'center', gap: Spacing.xs, paddingVertical: Spacing.md },
  streakCount: { fontSize: FontSize.xxl, fontWeight: FontWeight.extraBold, color: Colors.textMuted },
  streakCountActive: { color: Colors.warning },
  streakType: { fontSize: FontSize.xs, fontWeight: FontWeight.semiBold, color: Colors.textSecondary },
  streakSub: { fontSize: FontSize.xs, color: Colors.textMuted },

  // Badges
  badgeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    marginTop: Spacing.sm,
  },
  badgeCount: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: FontWeight.medium },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },

  // Badge detail modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDetailCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    width: '82%',
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  badgeDetailIconWrap: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.xl,
    borderWidth: 2,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDetailTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  badgeDetailRarityChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  badgeDetailRarityText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  badgeDetailDesc: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  badgeDetailStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  badgeDetailStatusText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  badgeDetailNotEarned: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
  },
  badgeDetailCloseBtn: {
    marginTop: Spacing.xs,
    backgroundColor: Colors.surfaceHigh,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  badgeDetailCloseTxt: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
    color: Colors.textPrimary,
  },

  // Quests
  questCard: { marginBottom: Spacing.sm },

  // Separator
  separator: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.lg },

  // Profile info
  infoCard: { marginBottom: Spacing.md },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  infoIcon: { marginRight: Spacing.md },
  infoContent: { flex: 1 },
  infoLabel: { color: Colors.textMuted, fontSize: FontSize.xs, marginBottom: 2 },
  infoValue: { color: Colors.textPrimary, fontSize: FontSize.base, fontWeight: FontWeight.medium },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'center',
    backgroundColor: `${Colors.primary}22`, borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, marginBottom: Spacing.lg,
  },
  editBtnText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  editCard: { marginBottom: Spacing.md, borderColor: Colors.primary, borderWidth: 1 },
  editTitle: { color: Colors.textPrimary, fontSize: FontSize.lg, fontWeight: FontWeight.semiBold, marginBottom: Spacing.md },
  editButtons: { gap: Spacing.sm },
  saveBtn: {},
  cancelBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  cancelText: { color: Colors.textMuted, fontSize: FontSize.base },

  // Account
  menuCard: { marginBottom: Spacing.md },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm },
  menuItemIcon: { marginRight: Spacing.md },
  menuItemText: { flex: 1, color: Colors.error, fontSize: FontSize.base, fontWeight: FontWeight.medium },
  menuItemChevron: { color: Colors.textMuted, fontSize: FontSize.base },
  version: { color: Colors.textMuted, fontSize: FontSize.xs, textAlign: 'center', marginTop: Spacing.lg },
});
