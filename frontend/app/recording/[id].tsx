import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  ApiError,
  emailSummary,
  getRecording,
  summarizeRecording,
  type DecisionMade,
  type Recording,
} from '../../src/api';
import { formatDate, formatDuration } from '../../src/format';
import { useAuth } from '../../src/auth';
import { colors, fonts, minHitTarget, radius, space } from '../../src/theme';

export default function RecordingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const [recording, setRecording] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summarizeError, setSummarizeError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getRecording(id)
      .then((r) => {
        if (!cancelled) {
          setRecording(r);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : 'Something went wrong.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (recording) {
      navigation.setOptions({ title: recording.title });
    }
  }, [navigation, recording]);

  const summarize = async () => {
    setSummarizing(true);
    setSummarizeError(null);
    try {
      setRecording(await summarizeRecording(id));
    } catch (e) {
      setSummarizeError(e instanceof ApiError ? e.message : 'Could not summarize this recording.');
    } finally {
      setSummarizing(false);
    }
  };

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorBody}>{error}</Text>
      </View>
    );
  }

  if (!recording) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.meta}>
        {formatDuration(recording.durationSec)} · {formatDate(recording.createdAt)}
      </Text>

      <Text style={styles.sectionLabel}>Transcript</Text>
      <View style={styles.transcriptBox}>
        <Text style={styles.transcript}>{recording.transcript ?? 'No transcript.'}</Text>
      </View>

      {recording.summary ? (
        <>
          <SummarySections summary={recording.summary} />
          <EmailPanel id={id} />
        </>
      ) : (
        <>
          <Text style={styles.hint}>
            Correct anything the transcriber misheard before summarizing — the summary is written
            from this text.
          </Text>
          {summarizeError ? <Text style={styles.errorBody}>{summarizeError}</Text> : null}
          <Pressable
            style={({ pressed }) => [styles.summarizeButton, pressed && styles.summarizeButtonPressed]}
            onPress={summarize}
            disabled={summarizing}
          >
            {summarizing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.summarizeLabel}>Summarize</Text>
            )}
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

/**
 * Sends the summary by mail. Defaults to the signed-in address; extra
 * recipients are added one at a time so a mistyped address is easy to remove.
 */
function EmailPanel({ id }: { id: string }) {
  const { user } = useAuth();
  const [extra, setExtra] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addDraft = () => {
    const address = draft.trim();
    if (!address) {
      return;
    }
    if (!extra.includes(address)) {
      setExtra([...extra, address]);
    }
    setDraft('');
  };

  const send = async () => {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      // An empty list means "just me" on the server, so only send extras.
      const { recipients } = await emailSummary(id, extra);
      setResult(`Sent to ${recipients.join(', ')}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send this summary.');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.emailPanel}>
      <Text style={styles.sectionLabel}>Email this summary</Text>

      <View style={styles.chipRow}>
        <View style={[styles.chip, styles.chipFixed]}>
          <Text style={styles.chipLabel}>{user?.email ?? 'you'}</Text>
        </View>
        {extra.map((address) => (
          <Pressable
            key={address}
            style={styles.chip}
            onPress={() => setExtra(extra.filter((a) => a !== address))}
          >
            <Text style={styles.chipLabel}>{address}</Text>
            <Text style={styles.chipRemove}>×</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.emailRow}>
        <TextInput
          style={styles.emailInput}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={addDraft}
          placeholder="Add another address"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />
        <Pressable style={styles.addButton} onPress={addDraft} disabled={!draft.trim()}>
          <Text style={styles.addLabel}>Add</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.errorBody}>{error}</Text> : null}
      {result ? <Text style={styles.successBody}>{result}</Text> : null}

      <Pressable
        style={({ pressed }) => [styles.sendButton, pressed && styles.sendButtonPressed]}
        onPress={send}
        disabled={sending}
      >
        {sending ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Text style={styles.sendLabel}>Send</Text>
        )}
      </Pressable>
    </View>
  );
}

function SummarySections({ summary }: { summary: NonNullable<Recording['summary']> }) {
  return (
    <>
      {summary.key_outcomes ? (
        <Section label="Key outcomes">
          <Text style={styles.prose}>{summary.key_outcomes}</Text>
        </Section>
      ) : null}

      {summary.decisions_made && summary.decisions_made.length > 0 ? (
        <Section label="Decisions made" count={summary.decisions_made.length}>
          <View style={styles.decisionList}>
            {summary.decisions_made.map((d: DecisionMade, i: number) => (
              <View key={i} style={styles.decisionItem}>
                <Text style={styles.decisionTitle}>{d.title}</Text>
                <Text style={styles.decisionDetail}>{d.detail}</Text>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      <BulletSection label="Completed" items={summary.completed} />
      <BulletSection label="Blockers" items={summary.blockers} />
      <BulletSection label="Pending confirmation" items={summary.pending_confirmation} />
      <BulletSection label="Open questions" items={summary.open_questions} />
      <BulletSection label="Action items" items={summary.action_items} />
      <BulletSection label="Next steps" items={summary.next_steps} />
    </>
  );
}

function BulletSection({ label, items }: { label: string; items: string[] | undefined }) {
  if (!items || items.length === 0) {
    return null;
  }
  return (
    <Section label={label} count={items.length}>
      <View style={styles.bulletList}>
        {items.map((item, i) => (
          <View key={i} style={styles.bulletRow}>
            <View style={styles.bullet} />
            <Text style={styles.bulletText}>{item}</Text>
          </View>
        ))}
      </View>
    </Section>
  );
}

function Section({
  label,
  count,
  children,
}: {
  label: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>{label}</Text>
        {count !== undefined ? <Text style={styles.sectionCount}>{count}</Text> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.bg,
  },
  content: {
    padding: space.xl,
    gap: space.md,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 36,
  },
  meta: {
    fontFamily: fonts.mono,
    fontSize: 11.5,
    color: colors.textMuted,
  },
  sectionLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 10.5,
    letterSpacing: 1.15,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  transcriptBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 16,
  },
  transcript: {
    fontFamily: fonts.sans,
    fontSize: 15.5,
    lineHeight: 25,
    color: colors.textBody,
  },
  errorBody: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  hint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  summarizeButton: {
    minHeight: minHitTarget + 6,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    marginTop: space.sm,
  },
  summarizeButtonPressed: {
    backgroundColor: colors.accentPressed,
  },
  summarizeLabel: {
    fontFamily: fonts.sansSemibold,
    fontSize: 15.5,
    color: '#FFFFFF',
  },

  section: {
    gap: space.sm,
    marginTop: space.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionCount: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.textMuted,
  },
  prose: {
    fontFamily: fonts.sans,
    fontSize: 15.5,
    lineHeight: 25,
    color: colors.textBody,
  },

  decisionList: {
    gap: space.sm,
  },
  decisionItem: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 13,
    gap: 4,
  },
  decisionTitle: {
    fontFamily: fonts.sansSemibold,
    fontSize: 15,
    color: colors.text,
  },
  decisionDetail: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },

  bulletList: {
    gap: space.sm,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
  },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.bullet,
    marginTop: 8,
  },
  emailPanel: {
    marginTop: space.xl,
    paddingTop: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: space.sm,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: radius.sm,
    backgroundColor: '#EEF2F8',
  },
  chipFixed: { opacity: 0.75 },
  chipLabel: { fontFamily: fonts.sans, fontSize: 13, color: colors.accent },
  chipRemove: { fontFamily: fonts.sans, fontSize: 15, color: colors.accent },
  emailRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  emailInput: {
    flex: 1,
    minHeight: minHitTarget,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 13,
    fontFamily: fonts.sans,
    fontSize: 14.5,
    color: colors.text,
  },
  addButton: {
    minHeight: minHitTarget,
    justifyContent: 'center',
    paddingHorizontal: 15,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  addLabel: { fontFamily: fonts.sansMedium, fontSize: 14, color: colors.textBody },
  sendButton: {
    minHeight: minHitTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    marginTop: space.xs,
  },
  sendButtonPressed: { backgroundColor: '#F4F1EC' },
  sendLabel: { fontFamily: fonts.sansSemibold, fontSize: 15, color: colors.accent },
  successBody: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.accent,
  },
  bulletText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 15,
    lineHeight: 21,
    color: colors.textBody,
  },
});
