import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { Colors, FontSize, FontWeight, Spacing } from '@/constants/theme';
import { GradientButton } from '@/components/ui/layout/GradientButton';
import { FunanceLogo } from '@/components/ui/layout/FunanceLogo';

const { width, height } = Dimensions.get('window');

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function FloatingIcon({
  iconName,
  iconColor,
  x,
  delay,
}: {
  iconName: IoniconsName;
  iconColor: string;
  x: number;
  delay: number;
}) {
  const translateY = useSharedValue(height * 0.8);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(height * 0.1, { duration: 4000, easing: Easing.out(Easing.quad) }),
          withTiming(height * 0.8, { duration: 0 })
        ),
        -1,
        false
      )
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.6, { duration: 500 }),
          withTiming(0.6, { duration: 3000 }),
          withTiming(0, { duration: 500 })
        ),
        -1,
        false
      )
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
    position: 'absolute',
    left: x,
  }));

  return (
    <Animated.View style={style}>
      <Ionicons name={iconName} size={28} color={iconColor} />
    </Animated.View>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const logoScale = useSharedValue(0.8);
  const logoOpacity = useSharedValue(0);

  useEffect(() => {
    logoScale.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.back(1.5)) });
    logoOpacity.value = withTiming(1, { duration: 700 });
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
    opacity: logoOpacity.value,
  }));

  const floaters: { iconName: IoniconsName; iconColor: string; x: number; delay: number }[] = [
    { iconName: 'wallet-outline', iconColor: Colors.primary, x: width * 0.1, delay: 0 },
    { iconName: 'trending-up-outline', iconColor: Colors.success, x: width * 0.35, delay: 800 },
    { iconName: 'cash-outline', iconColor: Colors.accent, x: width * 0.6, delay: 400 },
    { iconName: 'bar-chart-outline', iconColor: Colors.warning, x: width * 0.8, delay: 1200 },
  ];

  return (
    <View style={styles.container}>
      {floaters.map((f, i) => (
        <FloatingIcon key={i} {...f} />
      ))}

      <Animated.View style={[styles.logoSection, logoStyle]}>
        <FunanceLogo size={96} showText textSize={FontSize.xxxl} />
        <Text style={styles.tagline}>Retire Early. Live Free.</Text>
        <Text style={styles.subtitle}>
          Your path to Financial freedom & Retirement,{'\n'}made fun!
        </Text>
      </Animated.View>

      <View style={styles.actions}>
        <GradientButton
          title="Get Started  →"
          onPress={() => router.push('/(auth)/onboarding')}
          style={styles.ctaButton}
        />
        <TouchableOpacity
          onPress={() => router.push('/(auth)/login')}
          style={styles.loginLink}
        >
          <Text style={styles.loginLinkText}>
            Already have an account?{' '}
            <Text style={styles.loginLinkBold}>Log In</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: Spacing.xxl * 1.5,
  },
  tagline: {
    fontSize: FontSize.base,
    color: Colors.primary,
    fontWeight: FontWeight.medium,
    marginBottom: Spacing.md,
  },
  subtitle: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  actions: {
    width: '100%',
    alignItems: 'center',
  },
  ctaButton: {
    width: '100%',
    marginBottom: Spacing.md,
  },
  loginLink: {
    paddingVertical: Spacing.sm,
  },
  loginLinkText: {
    color: Colors.textSecondary,
    fontSize: FontSize.base,
  },
  loginLinkBold: {
    color: Colors.primary,
    fontWeight: FontWeight.semiBold,
  },
});
