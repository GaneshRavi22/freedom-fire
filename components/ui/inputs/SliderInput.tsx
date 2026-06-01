import React, { useMemo, useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { Colors, FontSize, FontWeight, Spacing, BorderRadius } from '@/constants/theme';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onValueChange: (value: number) => void;
  style?: ViewStyle;
  formatValue?: (v: number) => string;
  editable?: boolean;
}

const TRACK_WIDTH = 280;
const THUMB_SIZE = 22;

export function SliderInput({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onValueChange,
  style,
  formatValue,
  editable = false,
}: Props) {
  const thumbX = useSharedValue(((value - min) / (max - min)) * TRACK_WIDTH);
  const startX = useSharedValue(0);
  const formatIndian = (n: number) => n.toLocaleString('en-IN');
  const [inputText, setInputText] = useState(formatIndian(value));

  // Sync thumb and input text when value is updated externally (e.g. slider drag)
  useEffect(() => {
    thumbX.value = ((value - min) / (max - min)) * TRACK_WIDTH;
    setInputText(formatIndian(value));
  }, [value, min, max]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          startX.value = thumbX.value;
        })
        .onUpdate((e) => {
          const newX = startX.value + e.translationX;
          const clamped = Math.max(0, Math.min(newX, TRACK_WIDTH));
          thumbX.value = clamped;
          const ratio = clamped / TRACK_WIDTH;
          const rawValue = min + ratio * (max - min);
          const stepped = Math.round(rawValue / step) * step;
          const finalValue = Math.max(min, Math.min(max, stepped));
          runOnJS(onValueChange)(finalValue);
        }),
    [min, max, step, onValueChange]
  );

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: thumbX.value - THUMB_SIZE / 2 }],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    width: thumbX.value,
  }));

  const clampAndNotify = (raw: string) => {
    const numeric = parseInt(raw.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(numeric)) {
      const stepped = Math.round(Math.max(min, Math.min(max, numeric)) / step) * step;
      onValueChange(stepped);
    }
  };

  const displayValue = formatValue ? formatValue(value) : `${value}${unit}`;
  const displayMin = formatValue ? formatValue(min) : `${min}${unit}`;
  const displayMax = formatValue ? formatValue(max) : `${max}${unit}`;

  return (
    <View style={[styles.container, style]}>
      {editable && (
        <TextInput
          style={styles.editableInput}
          value={inputText}
          onFocus={() => setInputText(String(value))}
          onChangeText={(text) => {
            setInputText(text);
            clampAndNotify(text);
          }}
          onBlur={() => setInputText(formatIndian(value))}
          keyboardType="numeric"
          selectTextOnFocus
        />
      )}
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        {!editable && (
          <View style={styles.valueBadge}>
            <Text style={styles.valueText}>{displayValue}</Text>
          </View>
        )}
      </View>
      <View style={styles.trackWrapper}>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, fillStyle]} />
          <GestureDetector gesture={gesture}>
            <Animated.View style={[styles.thumb, thumbStyle]} />
          </GestureDetector>
        </View>
      </View>
      <View style={[styles.row, { width: TRACK_WIDTH }]}>
        <Text style={styles.minMax}>{displayMin}</Text>
        <Text style={styles.minMax}>{displayMax}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  editableInput: {
    backgroundColor: Colors.surfaceHigh,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
    textAlign: 'right',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  valueBadge: {
    backgroundColor: Colors.surfaceHigh,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  valueText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
  },
  trackWrapper: {
    paddingHorizontal: THUMB_SIZE / 2,
    paddingVertical: THUMB_SIZE / 2,
    marginBottom: 4,
  },
  track: {
    height: 4,
    width: TRACK_WIDTH,
    backgroundColor: Colors.border,
    borderRadius: 2,
    position: 'relative',
    justifyContent: 'center',
  },
  fill: {
    height: 4,
    backgroundColor: Colors.primary,
    borderRadius: 2,
    position: 'absolute',
    left: 0,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: Colors.primary,
    position: 'absolute',
    top: -(THUMB_SIZE / 2 - 2),
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
  minMax: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
  },
});
