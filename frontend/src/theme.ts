/**
 * Design tokens lifted from the detail-screen canvas.
 *
 * Values are exact rather than rounded to a 4/8 grid -- the mockup was built
 * at these numbers and the screens are meant to match it.
 */
export const colors = {
  bg: '#FBFAF8',
  surface: '#FFFFFF',
  border: '#E8E4DE',
  borderStrong: '#DAD4CB',

  text: '#1C1A17',
  textBody: '#3A362F',
  textSecondary: '#6B655C',
  textMuted: '#9A938A',
  bullet: '#C4BDB2',

  accent: '#3A5A8C',
  accentPressed: '#2C4569',
  accentSoft: '#EEF2F8',

  // Pressed fill for quiet surfaces (rows, secondary buttons).
  pressed: '#F4F1EC',
  record: '#C0392B',

  // Stale / warning. Same lightness and chroma as the accent, different hue.
  warning: '#8A6320',
  warningText: '#6B4E19',
  warningBg: '#FBF4E6',
  warningBorder: '#EBDCBD',
} as const;

export const fonts = {
  sans: 'IBMPlexSans_400Regular',
  sansMedium: 'IBMPlexSans_500Medium',
  sansSemibold: 'IBMPlexSans_600SemiBold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const radius = {
  sm: 7,
  md: 9,
  lg: 12,
} as const;

/** Android hit targets: never below 44. */
export const minHitTarget = 44;
