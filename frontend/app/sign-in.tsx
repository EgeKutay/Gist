import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { authErrorMessage, useAuth } from '../src/auth';
import { colors, fonts, minHitTarget, radius, space } from '../src/theme';

export default function SignInScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signIn') {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }
      // No navigation here: the layout redirects once auth state changes.
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Gist</Text>
          <Text style={styles.body}>
            {mode === 'signIn'
              ? 'Sign in to reach your recordings.'
              : 'Create an account to start recording.'}
          </Text>
        </View>

        <View style={styles.fields}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="you@example.com"
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            textContentType={mode === 'signIn' ? 'password' : 'newPassword'}
            placeholder={mode === 'signUp' ? 'At least 8 characters' : ''}
            placeholderTextColor={colors.textMuted}
            onSubmitEditing={submit}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
          onPress={submit}
          disabled={busy || !email || !password}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryLabel}>
              {mode === 'signIn' ? 'Sign in' : 'Create account'}
            </Text>
          )}
        </Pressable>

        <View style={styles.footer}>
          <Pressable
            hitSlop={8}
            onPress={() => {
              setMode(mode === 'signIn' ? 'signUp' : 'signIn');
              setError(null);
            }}
          >
            <Text style={styles.link}>
              {mode === 'signIn' ? 'Create an account' : 'I already have an account'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, justifyContent: 'center', padding: 28, gap: space.lg },
  header: { gap: 6, marginBottom: space.sm },
  title: {
    fontFamily: fonts.sansSemibold,
    fontSize: 28,
    letterSpacing: -0.6,
    color: colors.text,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: 14.5,
    lineHeight: 21,
    color: colors.textSecondary,
  },
  fields: { gap: 6 },
  label: {
    fontFamily: fonts.monoMedium,
    fontSize: 10.5,
    letterSpacing: 1.15,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginTop: space.sm,
  },
  input: {
    minHeight: minHitTarget + 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 15,
    fontFamily: fonts.sans,
    fontSize: 15.5,
    color: colors.text,
  },
  primary: {
    minHeight: minHitTarget + 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    marginTop: space.sm,
  },
  primaryPressed: { backgroundColor: colors.accentPressed },
  primaryLabel: {
    fontFamily: fonts.sansSemibold,
    fontSize: 15.5,
    color: '#FFFFFF',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space.xs,
  },
  link: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.accent },
  error: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.warningText,
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    borderRadius: radius.sm,
    padding: 11,
  },
});
