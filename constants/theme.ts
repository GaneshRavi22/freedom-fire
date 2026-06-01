export const Colors = {
  primary: '#FF6B00',
  accent: '#FFD166',
  success: '#06D6A0',
  warning: '#FFB547',
  error: '#FF5A5A',

  background: '#0D0D0D',
  surface: '#1A1208',
  surfaceHigh: '#251A0A',
  border: '#3D2A10',

  textPrimary: '#FFFFFF',
  textSecondary: '#C4A882',
  textMuted: '#7A6040',

  gradientStart: '#FF6B00',
  gradientEnd: '#FFD166',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const FontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  xxl: 30,
  xxxl: 38,
};

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semiBold: '600' as const,
  bold: '700' as const,
  extraBold: '800' as const,
};

export const categoryColors: Record<string, string> = {
  food: '#FF6584',
  transport: '#6C63FF',
  shopping: '#FFB547',
  health: '#43D9AD',
  entertainment: '#FF9F43',
  utilities: '#A0A3BD',
  other: '#5A5880',
};

export const categoryLabels: Record<string, string> = {
  food: 'Food & Dining',
  transport: 'Transport',
  shopping: 'Shopping',
  health: 'Health',
  entertainment: 'Entertainment',
  utilities: 'Utilities',
  other: 'Other',
};

export const categoryIcons: Record<string, string> = {
  food: 'restaurant-outline',
  transport: 'car-outline',
  shopping: 'bag-handle-outline',
  health: 'medkit-outline',
  entertainment: 'film-outline',
  utilities: 'bulb-outline',
  other: 'apps-outline',
};
