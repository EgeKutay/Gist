import { useMemo, useState } from 'react';
import {
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
import { fonts, minHitTarget, radius, space, useColors, type Palette } from '../src/theme';
import { Button } from '../src/ui';

export default function SignInScreen() {
  const { signIn, signUp } = useAuth();
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState<'email' | 'password' | null>(null);

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
            style={[styles.input, focused === 'email' && styles.inputFocused]}
            onFocus={() => setFocused('email')}
            onBlur={() => setFocused(null)}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="you@example.com"
            placeholderTextColor={c.textMuted}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={[styles.input, focused === 'password' && styles.inputFocused]}
            onFocus={() => setFocused('password')}
            onBlur={() => setFocused(null)}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            textContentType={mode === 'signIn' ? 'password' : 'newPassword'}
            placeholder={mode === 'signUp' ? 'At least 8 characters' : ''}
            placeholderTextColor={c.textMuted}
            onSubmitEditing={submit}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          label={mode === 'signIn' ? 'Sign in' : 'Create account'}
          variant="primary"
          onPress={submit}
          busy={busy}
          pill
          disabled={!email || !password}
          style={styles.primary}
        />

        <View style={styles.footer}>
          <Pressable
            hitSlop={8}
            style={({ pressed }) => pressed && styles.linkPressed}
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

function makeStyles(c: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { flexGrow: 1, justifyContent: 'center', padding: 28, gap: space.lg },
    header: { gap: 6, marginBottom: space.sm },
    title: {
      fontFamily: fonts.sansSemibold,
      fontSize: 28,
      letterSpacing: -0.6,
      color: c.text,
    },
    body: {
      fontFamily: fonts.sans,
      fontSize: 14.5,
      lineHeight: 21,
      color: c.textSecondary,
    },
    fields: { gap: 6 },
    label: {
      fontFamily: fonts.sansMedium,
      fontSize: 13,
      color: c.textSecondary,
      marginTop: space.sm,
    },
    input: {
      minHeight: minHitTarget + 6,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      paddingHorizontal: 15,
      fontFamily: fonts.sans,
      fontSize: 15.5,
      color: c.text,
    },
    inputFocused: { borderColor: c.accent },
    primary: { marginTop: space.sm },
    footer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: space.xs,
    },
    linkPressed: { opacity: 0.6 },
    link: { fontFamily: fonts.sansMedium, fontSize: 14, color: c.accent },
    error: {
      fontFamily: fonts.sans,
      fontSize: 13.5,
      lineHeight: 19,
      color: c.warningText,
      backgroundColor: c.warningBg,
      borderWidth: 1,
      borderColor: c.warningBorder,
      borderRadius: radius.md,
      padding: 11,
    },
  });
}
