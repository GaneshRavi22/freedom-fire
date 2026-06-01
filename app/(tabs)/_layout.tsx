import { Tabs } from 'expo-router';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useEffect, useRef } from 'react';
import { Colors } from '@/constants/theme';
import { TopBar } from '@/components/ui/layout/TopBar';
import { useTasksStore } from '@/stores/tasks.store';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({
  name,
  focused,
  color,
}: {
  name: IoniconsName;
  focused: boolean;
  color: string;
}) {
  return (
    <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
      <Ionicons name={name} size={22} color={color} />
    </View>
  );
}

function TasksTabIcon({ focused, color }: { focused: boolean; color: string }) {
  const { tasks, seenRecommendedIds } = useTasksStore();
  const recommendedIds = tasks.filter((t) => t.status === 'recommended').map((t) => t.id);
  const unreadCount = recommendedIds.filter((id) => !seenRecommendedIds.includes(id)).length;

  const bounceAnim = useRef(new Animated.Value(1)).current;
  const prevUnread = useRef<number | null>(null);

  useEffect(() => {
    // Skip on initial mount — badge shows stale unread count, no animation needed.
    if (prevUnread.current === null) {
      prevUnread.current = unreadCount;
      return;
    }
    if (unreadCount > prevUnread.current) {
      bounceAnim.stopAnimation(() => {
        bounceAnim.setValue(1);
        Animated.loop(
          Animated.sequence([
            Animated.timing(bounceAnim, { toValue: 1.25, duration: 180, useNativeDriver: true }),
            Animated.timing(bounceAnim, { toValue: 0.9, duration: 120, useNativeDriver: true }),
            Animated.timing(bounceAnim, { toValue: 1.1, duration: 100, useNativeDriver: true }),
            Animated.timing(bounceAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
            Animated.delay(2500),
          ]),
          { iterations: 4 }
        ).start();
      });
    }
    prevUnread.current = unreadCount;
  }, [unreadCount]);

  return (
    <View style={[styles.tabIcon, focused && styles.tabIconActive]}>
      <Animated.View style={{ transform: [{ scale: bounceAnim }] }}>
        <Ionicons
          name={focused ? 'checkmark-done' : 'checkmark-done-outline'}
          size={22}
          color={color}
        />
      </Animated.View>
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
        </View>
      )}
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      safeAreaInsets={{ bottom: 0 }}
      screenOptions={{
        headerShown: true,
        header: () => <TopBar />,
        tabBarStyle: [styles.tabBar, { height: 72 + insets.bottom, paddingBottom: 12 + insets.bottom }],
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: styles.tabLabel,
        tabBarShowLabel: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name={focused ? 'home' : 'home-outline'} focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="fire-calculator"
        options={{
          title: 'FIRE',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name={focused ? 'flame' : 'flame-outline'} focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="spend-analyzer"
        options={{
          title: 'Insights',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name={focused ? 'bulb' : 'bulb-outline'} focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tasks',
          tabBarIcon: ({ focused, color }) => (
            <TasksTabIcon focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="advisor"
        options={{
          title: 'Advisor',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name={focused ? 'sparkles' : 'sparkles-outline'} focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name={focused ? 'person' : 'person-outline'} focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="achievements"
        options={{ href: null }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.surface,
    borderTopColor: Colors.border,
    borderTopWidth: 1,
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  tabIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  tabIconActive: {
    backgroundColor: `${Colors.primary}22`,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#FF5A5A',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: Colors.surface,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
  },
});
