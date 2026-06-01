import React from 'react';
import { Image, View, Text, StyleSheet } from 'react-native';
import { Colors, FontSize, FontWeight } from '@/constants/theme';

interface Props {
  size?: number;
  showText?: boolean;
  textSize?: number;
}

export function FunanceLogo({ size = 48, showText = false, textSize }: Props) {
  return (
    <View style={showText ? styles.withText : undefined}>
      <Image
        source={require('../../../assets/icon.png')}
        style={{ width: size, height: size, borderRadius: size * 0.22 }}
      />
      {showText && (
        <Text style={[styles.label, textSize ? { fontSize: textSize } : undefined]}>
          <Text style={styles.freedom}>Freedom</Text>
          <Text style={styles.fire}>Fire</Text>
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  withText: {
    alignItems: 'center',
    gap: 10,
  },
  label: {
    fontSize: FontSize.xxl,
    letterSpacing: -0.5,
  },
  freedom: {
    color: Colors.textPrimary,
    fontWeight: FontWeight.extraBold,
  },
  fire: {
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
});
