import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  withTiming,
  withSpring,
  withDelay,
  withSequence,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { Colors } from '@/constants/theme';

const PALETTE = [Colors.primary, Colors.success, Colors.warning, Colors.accent, '#ffffff', '#FF6B35'];

// 28 dots spread across full radial range; large enough to escape the modal card.
// Radii 80-220 ensure most dots land outside a typical card (half-width ~160px).
const DOTS = Array.from({ length: 28 }, (_, i) => {
  // Spread evenly + small per-ring offset to avoid spoke artifacts
  const ring = i % 7;
  const baseAngle = (i / 28) * 360;
  const jitter = ring * (360 / 28 / 7);
  const angle = baseAngle + jitter;
  const rad = (angle * Math.PI) / 180;
  const radius = 80 + ring * 20; // 80 | 100 | 120 | 140 | 160 | 180 | 200
  return {
    x: Math.cos(rad) * radius,
    y: Math.sin(rad) * radius,
    color: PALETTE[i % PALETTE.length],
    size: 8 + (i % 4) * 4, // 8 | 12 | 16 | 20
    isRect: i % 5 === 0,
  };
});

function Dot({
  x, y, color, size, isRect, delay,
}: { x: number; y: number; color: string; size: number; isRect: boolean; delay: number }) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const rotate = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withSequence(withTiming(1, { duration: 150 }), withDelay(520, withTiming(0, { duration: 400 })))
    );
    scale.value = withDelay(delay, withSpring(1, { damping: 7, stiffness: 220 }));
    // Full radius movement — dots visibly burst beyond the modal card
    tx.value = withDelay(delay, withSpring(x, { damping: 11 }));
    ty.value = withDelay(delay, withSpring(y, { damping: 11 }));
    if (isRect) rotate.value = withDelay(delay, withTiming(45, { duration: 700 }));
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
      { rotate: `${rotate.value}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: isRect ? 2 : size / 2,
          backgroundColor: color,
          left: '50%' as any,
          top: '50%' as any,
          marginLeft: -size / 2,
          marginTop: -size / 2,
        },
        style,
      ]}
    />
  );
}

/**
 * Animated confetti burst. Drop inside a Modal backdrop — plays on mount.
 * Use a changing `key` prop on the parent to replay: <ConfettiBurst key={burstKey} />
 */
export function ConfettiBurst() {
  return (
    <View
      style={{ position: 'absolute', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
      pointerEvents="none"
    >
      {DOTS.map((dot, i) => (
        <Dot key={i} {...dot} delay={i * 32} />
      ))}
    </View>
  );
}
