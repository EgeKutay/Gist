import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
  type Recording,
  type Summary,
} from '../../src/api';
import { formatDate, formatDuration } from '../../src/format';
import { useAuth } from '../../src/auth';
import { RecordingActions } from '../../src/RecordingActions';
import { colors, fonts, minHitTarget, radius, space } from '../../src/theme';
import { Button, FadeIn, useReducedMotion } from '../../src/ui';

type Tab = 'summary' | 'transcript';

// What each marker says about its items, so a glance at the left edge tells
// the reader what kind of list they are in.
type Marker = 'check' | 'bar' | 'ring' | 'question' | 'box' | 'arrow';

type ListKey =
  | 'completed'
  | 'blockers'
  | 'pending_confirmation'
  | 'open_questions'
  | 'action_items'
  | 'next_steps';

const LIST_SECTIONS: { key: ListKey; label: string; short: string; marker: Marker }[] = [
  { key: 'completed', label: 'Completed', short: 'Completed', marker: 'check' },
  { key: 'blockers', label: 'Blockers', short: 'Blockers', marker: 'bar' },
  { key: 'pending_confirmation', label: 'Pending confirmation', short: 'Pending', marker: 'ring' },
  { key: 'open_questions', label: 'Open questions', short: 'Questions', marker: 'question' },
  { key: 'action_items', label: 'Action items', short: 'Actions', marker: 'box' },
  { key: 'next_steps', label: 'Next steps', short: 'Next steps', marker: 'arrow' },
];

// The index row only earns its space once there is something to jump between.
const MIN_SECTIONS_FOR_INDEX = 3;

export default function RecordingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const [recording, setRecording] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summarizeError, setSummarizeError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('summary');
  const [actionsOpen, setActionsOpen] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const tabsY = useRef(0);
  const bodyY = useRef(0);

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
      navigation.setOptions({
        title: recording.title,
        headerRight: () => <OptionsButton onPress={() => setActionsOpen(true)} />,
      });
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

  const switchTab = (next: Tab) => {
    // Deep in one tab, the other would open mid-page; bring the tabs back up.
    if (scrollY.current > tabsY.current) {
      scrollRef.current?.scrollTo({ y: tabsY.current, animated: false });
    }
    setTab(next);
  };

  const jumpTo = (sectionY: number) => {
    scrollRef.current?.scrollTo({ y: bodyY.current + sectionY - space.md, animated: true });
  };

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.stateBody}>{error}</Text>
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
    <ScrollView
      ref={scrollRef}
      style={styles.screen}
      contentContainerStyle={styles.content}
      onScroll={(e) => {
        scrollY.current = e.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={64}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.meta}>
        {formatDuration(recording.durationSec)} · {formatDate(recording.createdAt)}
      </Text>

      <View
        onLayout={(e) => {
          tabsY.current = e.nativeEvent.layout.y;
        }}
      >
        <Tabs value={tab} onChange={switchTab} />
      </View>

      <View
        style={styles.body}
        onLayout={(e) => {
          bodyY.current = e.nativeEvent.layout.y;
        }}
      >
        {tab === 'transcript' ? (
          <Text style={styles.transcript} selectable>
            {recording.transcript ?? 'No transcript.'}
          </Text>
        ) : recording.summary ? (
          <>
            <SummarySections summary={recording.summary} onJump={jumpTo} />
            <EmailPanel id={id} />
          </>
        ) : (
          <FadeIn style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No summary yet</Text>
            <Text style={styles.emptyBody}>
              Gist reads the transcript and pulls out decisions, open questions and action items.
              It works only from the transcript, so check that tab first for anything misheard.
            </Text>
            {summarizeError ? <Text style={styles.errorNotice}>{summarizeError}</Text> : null}
            <Button
              label="Summarize"
              variant="primary"
              onPress={summarize}
              busy={summarizing}
              style={styles.emptyAction}
            />
            {summarizing ? (
              <Text style={styles.caption}>Summarizing. Long meetings can take a minute.</Text>
            ) : null}
          </FadeIn>
        )}
      </View>

      <RecordingActions
        recording={recording}
        visible={actionsOpen}
        onClose={() => setActionsOpen(false)}
        onRenamed={(title) => setRecording({ ...recording, title })}
        onDeleted={() => router.back()}
      />
    </ScrollView>
  );
}

/** Three dots drawn as views, so they match the design at any font scale. */
function OptionsButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Recording options"
      style={({ pressed }) => [styles.optionsButton, pressed && styles.optionsButtonPressed]}
    >
      <View style={styles.optionsDot} />
      <View style={styles.optionsDot} />
      <View style={styles.optionsDot} />
    </Pressable>
  );
}

function Tabs({ value, onChange }: { value: Tab; onChange: (t: Tab) => void }) {
  const reduce = useReducedMotion();
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const thumbWidth = width / 2;
  const target = value === 'summary' ? 0 : thumbWidth;

  useEffect(() => {
    if (reduce) {
      x.setValue(target);
    } else {
      Animated.spring(x, {
        toValue: target,
        useNativeDriver: true,
        speed: 22,
        bounciness: 0,
      }).start();
    }
  }, [x, target, reduce]);

  const options: { key: Tab; label: string }[] = [
    { key: 'summary', label: 'Summary' },
    { key: 'transcript', label: 'Transcript' },
  ];

  return (
    <View
      style={styles.tabs}
      accessibilityRole="tablist"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width - TAB_INSET * 2)}
    >
      {width > 0 ? (
        <Animated.View
          style={[styles.tabThumb, { width: thumbWidth, transform: [{ translateX: x }] }]}
        />
      ) : null}
      {options.map((o) => {
        const selected = o.key === value;
        return (
          <Pressable
            key={o.key}
            style={styles.tab}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SummarySections({
  summary,
  onJump,
}: {
  summary: Summary;
  onJump: (y: number) => void;
}) {
  // Section offsets inside this block, filled in by onLayout as they render.
  const offsets = useRef<Record<string, number>>({});
  const record = (key: string) => (e: { nativeEvent: { layout: { y: number } } }) => {
    offsets.current[key] = e.nativeEvent.layout.y;
  };

  const decisions = summary.decisions_made ?? [];
  const lists = LIST_SECTIONS.filter((s) => (summary[s.key]?.length ?? 0) > 0);

  const index = [
    ...(summary.key_outcomes ? [{ key: 'key_outcomes', short: 'Outcome', count: undefined }] : []),
    ...(decisions.length > 0
      ? [{ key: 'decisions_made', short: 'Decisions', count: decisions.length }]
      : []),
    ...lists.map((s) => ({ key: s.key, short: s.short, count: summary[s.key]!.length })),
  ];

  // Each block fades up a beat after the one above it.
  let order = 0;
  const delay = () => order++ * 60;

  return (
    <View style={styles.summary}>
      {index.length >= MIN_SECTIONS_FOR_INDEX ? (
        <FadeIn delay={delay()}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.indexRow}
          >
            {index.map((entry) => (
              <Pressable
                key={entry.key}
                onPress={() => onJump(offsets.current[entry.key] ?? 0)}
                accessibilityRole="button"
                accessibilityLabel={`Jump to ${entry.short}`}
                style={({ pressed }) => [styles.indexChip, pressed && styles.indexChipPressed]}
              >
                <Text style={styles.indexLabel}>{entry.short}</Text>
                {entry.count !== undefined ? (
                  <Text style={styles.indexCount}>{entry.count}</Text>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </FadeIn>
      ) : null}

      {summary.key_outcomes ? (
        <FadeIn delay={delay()} onLayout={record('key_outcomes')}>
          <Section label="Key outcomes">
            <View style={styles.outcome}>
              <Text style={styles.outcomeText}>{summary.key_outcomes}</Text>
            </View>
          </Section>
        </FadeIn>
      ) : null}

      {decisions.length > 0 ? (
        <FadeIn delay={delay()} onLayout={record('decisions_made')}>
          <Section label="Decisions made" count={decisions.length}>
            <View style={styles.decisionCard}>
              {decisions.map((d, i) => (
                <View key={i} style={[styles.decisionItem, i > 0 && styles.decisionDivider]}>
                  <Text style={styles.decisionTitle}>{d.title}</Text>
                  <Text style={styles.decisionDetail}>{d.detail}</Text>
                </View>
              ))}
            </View>
          </Section>
        </FadeIn>
      ) : null}

      {lists.map((s) => (
        <FadeIn key={s.key} delay={delay()} onLayout={record(s.key)}>
          <Section label={s.label} count={summary[s.key]!.length}>
            <View style={styles.itemList}>
              {summary[s.key]!.map((item, i) => (
                <View key={i} style={styles.itemRow}>
                  <ItemMarker kind={s.marker} />
                  <Text style={styles.itemText}>{item}</Text>
                </View>
              ))}
            </View>
          </Section>
        </FadeIn>
      ))}
    </View>
  );
}

/** Sits in a box one text line tall, so it centres on the first line of the item. */
function ItemMarker({ kind }: { kind: Marker }) {
  let mark;
  switch (kind) {
    case 'check':
      mark = (
        <View style={styles.markCheck}>
          <View style={styles.markCheckTick} />
        </View>
      );
      break;
    case 'bar':
      mark = <View style={styles.markBar} />;
      break;
    case 'ring':
      mark = <View style={styles.markRing} />;
      break;
    case 'box':
      mark = <View style={styles.markBox} />;
      break;
    case 'question':
      mark = <Text style={styles.markGlyph}>?</Text>;
      break;
    case 'arrow':
      mark = <Text style={styles.markGlyph}>→</Text>;
      break;
  }
  return <View style={styles.marker}>{mark}</View>;
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
  const [focused, setFocused] = useState(false);

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
      setResult(`Summary sent to ${recipients.join(', ')}`);
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
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${address}`}
            style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
            onPress={() => setExtra(extra.filter((a) => a !== address))}
          >
            <Text style={styles.chipLabel}>{address}</Text>
            <Text style={styles.chipRemove}>×</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.emailRow}>
        <TextInput
          style={[styles.emailInput, focused && styles.emailInputFocused]}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={addDraft}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Add another address"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          returnKeyType="done"
        />
        <Button label="Add" onPress={addDraft} disabled={!draft.trim()} />
      </View>

      {error ? <Text style={styles.errorNotice}>{error}</Text> : null}
      {result ? <Text style={styles.successNotice}>{result}</Text> : null}

      <Button
        label={extra.length > 0 ? `Send to ${extra.length + 1} people` : 'Send to me'}
        variant="primary"
        onPress={send}
        busy={sending}
        style={styles.sendButton}
      />
    </View>
  );
}

const TAB_INSET = 3;
// Line height of summary items; markers sit in a box this tall.
const ITEM_LINE = 24;

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: space.xl,
    paddingTop: space.xs,
    paddingBottom: 48,
    gap: space.lg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 36,
    backgroundColor: colors.bg,
  },
  optionsButton: {
    width: minHitTarget,
    height: minHitTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3.5,
    borderRadius: minHitTarget / 2,
  },
  optionsButtonPressed: {
    backgroundColor: colors.pressed,
  },
  optionsDot: {
    width: 4.5,
    height: 4.5,
    borderRadius: 2.25,
    backgroundColor: colors.textBody,
  },
  meta: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.textMuted,
  },
  stateBody: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  caption: {
    fontFamily: fonts.mono,
    fontSize: 11.5,
    color: colors.textMuted,
    textAlign: 'center',
  },
  body: {
    gap: space.lg,
  },

  tabs: {
    flexDirection: 'row',
    padding: TAB_INSET,
    borderRadius: radius.md + TAB_INSET,
    backgroundColor: '#F1EEE9',
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabThumb: {
    position: 'absolute',
    top: TAB_INSET,
    bottom: TAB_INSET,
    left: TAB_INSET,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    elevation: 1,
    shadowColor: '#1C1A17',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  tab: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.textSecondary,
  },
  tabLabelSelected: {
    fontFamily: fonts.sansSemibold,
    color: colors.text,
  },

  transcript: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 27,
    color: colors.textBody,
  },

  emptyCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space.xl,
    gap: space.md,
  },
  emptyTitle: {
    fontFamily: fonts.sansSemibold,
    fontSize: 17,
    color: colors.text,
  },
  emptyBody: {
    fontFamily: fonts.sans,
    fontSize: 14.5,
    lineHeight: 22,
    color: colors.textSecondary,
  },
  emptyAction: {
    marginTop: space.xs,
  },

  summary: {
    gap: 30,
  },
  indexRow: {
    gap: space.sm,
    paddingRight: space.xl,
  },
  indexChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 34,
    paddingHorizontal: space.md,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  indexChipPressed: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentSoft,
  },
  indexLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.textBody,
  },
  indexCount: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    color: colors.accent,
  },

  section: {
    gap: space.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  sectionCount: {
    fontFamily: fonts.mono,
    fontSize: 11.5,
    color: colors.textMuted,
  },

  outcome: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    paddingLeft: 14,
  },
  outcomeText: {
    fontFamily: fonts.sans,
    fontSize: 17,
    lineHeight: 27,
    color: colors.text,
  },

  decisionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
  },
  decisionItem: {
    paddingHorizontal: space.lg,
    paddingVertical: 14,
    gap: 5,
  },
  decisionDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  decisionTitle: {
    fontFamily: fonts.sansSemibold,
    fontSize: 15.5,
    lineHeight: 21,
    color: colors.text,
  },
  decisionDetail: {
    fontFamily: fonts.sans,
    fontSize: 14.5,
    lineHeight: 22,
    color: colors.textBody,
  },

  itemList: {
    gap: 14,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
  },
  itemText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 15.5,
    lineHeight: ITEM_LINE,
    color: colors.textBody,
  },
  marker: {
    width: 16,
    height: ITEM_LINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markCheck: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markCheckTick: {
    width: 7,
    height: 4,
    marginTop: -2,
    borderLeftWidth: 1.6,
    borderBottomWidth: 1.6,
    borderColor: '#FFFFFF',
    transform: [{ rotate: '-45deg' }],
  },
  markBar: {
    width: 3,
    height: 16,
    borderRadius: 1.5,
    backgroundColor: colors.warning,
  },
  markRing: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
    borderWidth: 1.6,
    borderColor: colors.warning,
  },
  markBox: {
    width: 14,
    height: 14,
    borderRadius: 3.5,
    borderWidth: 1.6,
    borderColor: colors.accent,
  },
  markGlyph: {
    fontFamily: fonts.monoMedium,
    fontSize: 14,
    color: colors.accent,
  },

  emailPanel: {
    marginTop: space.lg,
    padding: space.lg,
    gap: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
  },
  chipPressed: { backgroundColor: '#DFE6F1' },
  chipFixed: { opacity: 0.75 },
  chipLabel: { fontFamily: fonts.sans, fontSize: 13, color: colors.accent },
  chipRemove: { fontFamily: fonts.sans, fontSize: 15, color: colors.accent },
  emailRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  emailInput: {
    flex: 1,
    minHeight: minHitTarget + 4,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 13,
    fontFamily: fonts.sans,
    fontSize: 14.5,
    color: colors.text,
  },
  emailInputFocused: {
    borderColor: colors.accent,
    backgroundColor: colors.surface,
  },
  sendButton: {
    marginTop: space.xs,
  },
  errorNotice: {
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
  successNotice: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    padding: 11,
  },
});
