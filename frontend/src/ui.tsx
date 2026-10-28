import { useEffect, useRef, useState, type ReactNode } from 'react';
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
import { colors, fonts, minHitTarget, radius } from './theme';

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
 * The one button. Primary is filled accent, secondary is a white surface with
 * a border, quiet is text only. All three dip slightly on press.
 */
export function Button({
  label,
  onPress,
  variant = 'secondary',
  disabled = false,
  busy = false,
  leading,
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
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const reduce = useReducedMotion();
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
          variantStyles[variant],
          pressed && pressedStyles[variant],
          disabled && !busy && styles.disabled,
          contentStyle,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={variant === 'primary' ? '#FFFFFF' : colors.accent} />
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

const styles = StyleSheet.create({
  base: {
    minHeight: minHitTarget + 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
    borderRadius: radius.md,
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    fontFamily: fonts.sansSemibold,
    fontSize: 15,
  },
});

const variantStyles = StyleSheet.create({
  primary: { backgroundColor: colors.accent },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  quiet: { paddingHorizontal: 12 },
});

const pressedStyles = StyleSheet.create({
  primary: { backgroundColor: colors.accentPressed },
  secondary: { backgroundColor: colors.pressed, borderColor: colors.borderStrong },
  quiet: { backgroundColor: colors.pressed },
});

const labelStyles = StyleSheet.create({
  primary: { color: '#FFFFFF' },
  secondary: { color: colors.textBody },
  quiet: { color: colors.accent, fontFamily: fonts.sansMedium },
});

const sheetStyles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(28, 26, 23, 0.32)',
  },
  frame: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  panel: {
    paddingTop: 10,
    paddingHorizontal: 20,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    backgroundColor: colors.bg,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: 14,
  },
});
