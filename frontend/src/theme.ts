import { Platform, useColorScheme, type ViewStyle } from 'react-native';

/**
 * Design tokens for the "Tape" design, in a dark and a light palette.
 *
 * Both palettes have the same keys, so components never branch on the theme
 * name: anything that differs between them, shadows included, is a value
 * here. Values are exact rather than rounded to a 4/8 grid -- the mockups
 * were built at these numbers and the screens are meant to match them.
 */
export const darkColors = {
  bg: '#141310', // screen background
  surface: '#1E1D19', // cards, outline-button fill, duration tiles
  surfaceRaised: '#22211C', // meta chips (date, duration)
  chipText: '#D6D1C7', // text on meta chips
  durationText: '#D6D1C7', // text on list duration tiles
  avatar: '#2A2823', // account button fill
  border: '#2E2C27', // card borders
  divider: '#2E2C27', // lines between items inside a card
  borderStrong: '#3A3832', // outline buttons, idle level line

  text: '#F2EFE8', // titles, primary text
  textBody: '#E0DBD2', // transcript reading text
  textSummary: '#E6E2DA', // key-outcomes paragraph
  textDetail: '#C9C4BA', // decision detail lines
  textSecondary: '#A39E93', // meta, captions, inactive tabs, counts
  textMuted: '#8A857B', // decorative only; never for essential info
  bullet: '#5A564E',

  accent: '#E9B35B', // section labels (text), links
  accentDot: '#E9B35B', // "Summary ready" dot
  accentPressed: '#F3C77A',
  accentSoft: '#2A2418',
  onAccent: '#141310', // tick on an accent fill

  primary: '#F2EFE8', // primary pill button fill (e.g. "Email summary")
  onPrimary: '#141310', // text/icon on primary
  primaryPressed: '#D6D1C7',

  segmentTrack: '#1E1D19', // segmented-control track
  segmentActive: '#F2EFE8', // active segment fill
  onSegmentActive: '#141310',
  segmentActiveShadow: false,

  pressed: '#26241F', // pressed state for rows and quiet buttons
  record: '#F2553A', // record disc
  recordRing: '#3A221B', // ring around the home record disc
  recordRingStrong: '#4A2A21', // ring on the recorder screen
  recordButtonFill: '#1E1D19', // fill of the 112 px recorder button around the disc
  recordButtonShadow: false,
  onRecord: '#1A0A06', // mic glyph on the home record disc
  cardShadow: false,
  recorderUploadFill: 'transparent', // "Upload audio file instead" pill

  warningDot: '#E9B35B',
  warningText: '#F0D4A0',
  warningBg: '#2B2316',
  warningBorder: '#4A3B22',

  backdrop: 'rgba(0, 0, 0, 0.55)', // behind sheets
  shadow: '#000000',

  statusBar: 'light' as 'light' | 'dark', // content colour on the status bar
  navigationBar: 'dark' as 'light' | 'dark', // bar style; 'dark' means light buttons
};

export type Palette = typeof darkColors;

export const lightColors: Palette = {
  bg: '#F7F5F0',
  surface: '#FFFFFF',
  surfaceRaised: '#EEEBE4',
  chipText: '#4A463E',
  durationText: '#3A362F',
  avatar: '#EAE6DE',
  border: '#E6E1D8',
  divider: '#EEEAE2',
  borderStrong: '#D3CCC0',

  text: '#1A1914',
  textBody: '#2E2B25',
  textSummary: '#2A2721',
  textDetail: '#4A463E',
  textSecondary: '#67615A',
  textMuted: '#8A847A',
  bullet: '#C4BDB2',

  accent: '#9A5E0E', // darker amber so label TEXT passes contrast on white
  accentDot: '#D9952B', // the dot can stay bright
  accentPressed: '#7A4A0A',
  accentSoft: '#FBF1DF',
  onAccent: '#FFFFFF',

  primary: '#1A1914', // black primary pill
  onPrimary: '#F7F5F0',
  primaryPressed: '#3A362F',

  segmentTrack: '#EDEAE3',
  segmentActive: '#FFFFFF', // white segment with a soft shadow (not black)
  onSegmentActive: '#1A1914',
  segmentActiveShadow: true,

  pressed: '#EFECE6',
  record: '#E5482D',
  recordRing: '#FBE3DC',
  recordRingStrong: '#F3C9BE',
  recordButtonFill: '#FFFFFF',
  recordButtonShadow: true,
  onRecord: '#FFFFFF', // white mic glyph
  cardShadow: true,
  recorderUploadFill: '#FFFFFF',

  warningDot: '#B07A1E',
  warningText: '#6B4E19',
  warningBg: '#FBF4E6',
  warningBorder: '#EBDCBD',

  backdrop: 'rgba(26, 25, 20, 0.32)',
  shadow: '#1A1914',

  statusBar: 'dark',
  navigationBar: 'light',
};

/** The palette for the phone's current setting. Dark is the fallback. */
export function useColors(): Palette {
  return useColorScheme() === 'light' ? lightColors : darkColors;
}

/**
 * Soft shadows from the mockups. iOS draws shadow*, Android only elevation,
 * so both are produced here and each platform reads its own. Returns nothing
 * when the palette has the shadow switched off (dark theme).
 */
export function shadow(kind: 'card' | 'segment' | 'recordButton', c: Palette): ViewStyle {
  const on =
    kind === 'card'
      ? c.cardShadow
      : kind === 'segment'
        ? c.segmentActiveShadow
        : c.recordButtonShadow;
  if (!on) {
    return {};
  }
  const spec = {
    card: { color: c.shadow, opacity: 0.04, radius: 2, y: 1, elevation: 1 },
    segment: { color: c.shadow, opacity: 0.1, radius: 3, y: 1, elevation: 1 },
    recordButton: { color: c.record, opacity: 0.12, radius: 20, y: 6, elevation: 4 },
  }[kind];
  return Platform.OS === 'android'
    ? { elevation: spec.elevation, shadowColor: spec.color }
    : {
        shadowColor: spec.color,
        shadowOpacity: spec.opacity,
        shadowRadius: spec.radius / 2,
        shadowOffset: { width: 0, height: spec.y },
      };
}

export const fonts = {
  sans: 'Geist_400Regular',
  sansMedium: 'Geist_500Medium',
  sansSemibold: 'Geist_600SemiBold',
  mono: 'GeistMono_400Regular',
  monoMedium: 'GeistMono_500Medium',
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
  chip: 6, // meta chips
  sm: 10, // segment buttons
  md: 12, // outline buttons, duration tiles
  lg: 16, // cards
  xl: 20, // home record card
  track: 14, // segmented-control track
  pill: 999, // bottom-bar buttons, avatar, record disc
} as const;

/** Android hit targets: never below 44. */
export const minHitTarget = 44;
