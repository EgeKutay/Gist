import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, minHitTarget, radius, useColors, type Palette } from './theme';

// Read once at startup and kept current, so the first frame already knows
// whether to animate instead of starting a motion and then cancelling it.
let reduceMotion = false;
const listeners = new Set<(value: boolean) => void>();
AccessibilityInfo.isReduceMotionEnabled().then((value) => {
  reduceMotion = value;
  listeners.forEach((l) => l(value));
});
AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
  reduceMotion = value;
  listeners.forEach((l) => l(value));
});

/** True when the OS asks for reduced motion. Every animation here checks it. */
export function useReducedMotion(): boolean {
  const [value, setValue] = useState(reduceMotion);
  useEffect(() => {
    listeners.add(setValue);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

/** Fades and lifts its children in once, on mount. */
export function FadeIn({
  delay = 0,
  children,
  style,
  onLayout,
}: {
  delay?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const progress = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    Animated.timing(progress, {
      toValue: 1,
      duration: 340,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress, delay]);

  return (
    <Animated.View
      onLayout={onLayout}
      style={[
        style,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** A panel that rises from the bottom over a dimmed backdrop. Tap outside to close. */
export function Sheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const c = useColors();
  const sheetStyles = useMemo(() => makeSheetStyles(c), [c]);
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      rise.setValue(0);
      return;
    }
    if (reduce) {
      rise.setValue(1);
      return;
    }
    Animated.timing(rise, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, reduce, rise]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={sheetStyles.frame} behavior="padding">
        <Pressable
          style={sheetStyles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <Animated.View
          style={[
            sheetStyles.panel,
            { paddingBottom: insets.bottom + 20 },
            {
              transform: [
                { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
              ],
            },
          ]}
        >
          <View style={sheetStyles.handle} />
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type Variant = 'primary' | 'secondary' | 'quiet';

/**
 * The one button. Primary is the filled `primary` colour, secondary is a
 * surface with a strong border, quiet is text only. All three dip slightly on
 * press. `pill` is the 52 px rounded shape used in bottom bars.
 */
export function Button({
  label,
  onPress,
  variant = 'secondary',
  disabled = false,
  busy = false,
  leading,
  pill = false,
  style,
  contentStyle,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  busy?: boolean;
  leading?: ReactNode;
  pill?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const reduce = useReducedMotion();
  const c = useColors();
  const { styles, variantStyles, pressedStyles, labelStyles } = useMemo(
    () => makeButtonStyles(c),
    [c],
  );
  const scale = useRef(new Animated.Value(1)).current;
  const inactive = disabled || busy;

  const springTo = (toValue: number) => {
    if (reduce) {
      return;
    }
    Animated.spring(scale, { toValue, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  };

  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => springTo(0.97)}
        onPressOut={() => springTo(1)}
        disabled={inactive}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: inactive, busy }}
        style={({ pressed }) => [
          styles.base,
          pill && styles.pill,
          variantStyles[variant],
          pressed && pressedStyles[variant],
          disabled && !busy && styles.disabled,
          contentStyle,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={variant === 'primary' ? c.onPrimary : c.accent} />
        ) : (
          <>
            {leading}
            <Text style={[styles.label, labelStyles[variant]]}>{label}</Text>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

function makeButtonStyles(c: Palette) {
  return {
    styles: StyleSheet.create({
      base: {
        minHeight: minHitTarget + 4,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingHorizontal: 20,
        borderRadius: radius.md,
      },
      pill: {
        minHeight: 52,
        borderRadius: radius.pill,
      },
      disabled: {
        opacity: 0.45,
      },
      label: {
        fontFamily: fonts.sansSemibold,
        fontSize: 15,
      },
    }),
    variantStyles: StyleSheet.create({
      primary: { backgroundColor: c.primary },
      secondary: {
        backgroundColor: c.surface,
        borderWidth: 1,
        borderColor: c.borderStrong,
      },
      quiet: { paddingHorizontal: 12 },
    }),
    pressedStyles: StyleSheet.create({
      primary: { backgroundColor: c.primaryPressed },
      secondary: { backgroundColor: c.pressed, borderColor: c.borderStrong },
      quiet: { backgroundColor: c.pressed },
    }),
    labelStyles: StyleSheet.create({
      primary: { color: c.onPrimary },
      secondary: { color: c.text, fontFamily: fonts.sansMedium },
      quiet: { color: c.text, fontFamily: fonts.sansMedium },
    }),
  };
}

/** A 44 px round tap target for a lone icon, as in the top bars. */
export function IconButton({
  onPress,
  accessibilityLabel,
  children,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  children: ReactNode;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
      style={({ pressed }) => [
        {
          width: minHitTarget,
          height: minHitTarget,
          borderRadius: minHitTarget / 2,
          alignItems: 'center',
          justifyContent: 'center',
        },
        pressed && { backgroundColor: c.pressed },
      ]}
    >
      {children}
    </Pressable>
  );
}

function makeSheetStyles(c: Palette) {
  return StyleSheet.create({
    backdrop: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: c.backdrop,
    },
    frame: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    panel: {
      maxHeight: '90%',
      paddingTop: 10,
      paddingHorizontal: 20,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.borderStrong,
      marginBottom: 14,
    },
  });
}
