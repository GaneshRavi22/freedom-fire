import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSize, BorderRadius, Spacing } from '@/constants/theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

interface Props extends TextInputProps {
  label?: string;
  error?: string;
  icon?: IoniconsName;
  rightIcon?: React.ReactNode;
  containerStyle?: ViewStyle;
  isPassword?: boolean;
  indianFormat?: boolean;
}

export function InputField({
  label,
  error,
  icon,
  rightIcon,
  containerStyle,
  isPassword,
  indianFormat,
  ...props
}: Props) {
  const [secure, setSecure] = useState(isPassword ?? false);
  const [focused, setFocused] = useState(false); // used for border highlight

  const rawValue = props.value ?? '';
  const displayValue = indianFormat && rawValue
    ? parseInt(rawValue, 10).toLocaleString('en-IN')
    : rawValue;

  const handleChangeText = (text: string) => {
    const clean = indianFormat ? text.replace(/[^0-9]/g, '') : text;
    props.onChangeText?.(clean);
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.inputRow, focused && styles.inputFocused, error ? styles.inputError : null]}>
        {icon && (
          <Ionicons
            name={icon}
            size={18}
            color={Colors.textMuted}
            style={styles.icon}
          />
        )}
        <TextInput
          {...props}
          value={displayValue}
          onChangeText={handleChangeText}
          secureTextEntry={secure}
          style={styles.input}
          placeholderTextColor={Colors.textMuted}
          onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
        />
        {isPassword && (
          <TouchableOpacity onPress={() => setSecure(!secure)} style={styles.eyeBtn}>
            <Ionicons
              name={secure ? 'eye-outline' : 'eye-off-outline'}
              size={18}
              color={Colors.textMuted}
            />
          </TouchableOpacity>
        )}
        {rightIcon && !isPassword && rightIcon}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    marginBottom: Spacing.xs,
    fontWeight: '500',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    height: 52,
  },
  inputFocused: {
    borderColor: Colors.primary,
  },
  inputError: {
    borderColor: Colors.error,
  },
  icon: {
    marginRight: Spacing.sm,
  },
  input: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.base,
  },
  eyeBtn: {
    padding: Spacing.xs,
  },
  errorText: {
    color: Colors.error,
    fontSize: FontSize.xs,
    marginTop: 4,
  },
});
