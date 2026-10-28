import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ApiError,
  emailRecording,
  forgetSavedRecipient,
  getRecording,
  listSavedRecipients,
  summarizeRecording,
  updateTranscript,
  type Recording,
  type SavedRecipient,
  type Summary,
} from '../../src/api';
import { formatDate, formatDuration } from '../../src/format';
import { useAuth } from '../../src/auth';
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  MailIcon,
  MoreIcon,
  PencilIcon,
} from '../../src/icons';
import { RecordingActions } from '../../src/RecordingActions';
import { fonts, minHitTarget, radius, shadow, space, useColors, type Palette } from '../../src/theme';
import { Button, FadeIn, IconButton, Sheet, useReducedMotion } from '../../src/ui';

type Tab = 'summary' | 'transcript';

type Styles = ReturnType<typeof makeStyles>;

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

const LIST_SECTIONS: { key: ListKey; label: string; marker: Marker }[] = [
  { key: 'completed', label: 'Completed', marker: 'check' },
  { key: 'blockers', label: 'Blockers', marker: 'bar' },
  { key: 'pending_confirmation', label: 'Pending confirmation', marker: 'ring' },
  { key: 'open_questions', label: 'Open questions', marker: 'question' },
  { key: 'action_items', label: 'Action items', marker: 'box' },
  { key: 'next_steps', label: 'Next steps', marker: 'arrow' },
];

// Transcript first: it exists from the moment a recording does, and the
// summary is made from it.
const TAB_OPTIONS: { key: Tab; label: string }[] = [
  { key: 'transcript', label: 'Transcript' },
  { key: 'summary', label: 'Summary' },
];

// Decisions beyond this many wait behind "Show N more".
const DECISIONS_SHOWN = 3;
// A transcript with no line breaks is shown in paragraphs of this many sentences.
const SENTENCES_PER_PARAGRAPH = 4;

const PILL_HEIGHT = 52;
const BAR_TOP = 12;
const BAR_BOTTOM = 28;

export default function RecordingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summarizeError, setSummarizeError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('transcript');
  const [actionsOpen, setActionsOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailInitial, setEmailInitial] = useState<Tab>('summary');
  // null while reading; the text being edited otherwise.
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const tabsY = useRef(0);

  const editing = draft !== null;
  const dirty = editing && draft !== (recording?.transcript ?? '');

  useEffect(() => {
    let cancelled = false;
    getRecording(id)
      .then((r) => {
        if (!cancelled) {
          setRecording(r);
          // Open on the summary once there is one; until then the transcript is all there is.
          setTab(r.summary ? 'summary' : 'transcript');
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

  // Leaving with unsaved transcript edits -- by the back button, a gesture or
  // the hardware key -- asks first.
  useEffect(() => {
    if (!dirty) {
      return;
    }
    return navigation.addListener('beforeRemove', (e) => {
      e.preventDefault();
      Alert.alert('Discard changes?', 'Your edits to the transcript have not been saved.', [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => navigation.dispatch(e.data.action),
        },
      ]);
    });
  }, [navigation, dirty]);

  const summarize = async () => {
    setSummarizing(true);
    setSummarizeError(null);
    try {
      setRecording(await summarizeRecording(id));
      switchTab('summary');
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

  // Stable, so the sheet's auto-close timer isn't restarted by a re-render here.
  const closeEmail = useCallback(() => setEmailOpen(false), []);

  const openEmail = (initial: Tab) => {
    setEmailInitial(initial);
    setEmailOpen(true);
  };

  const startEditing = () => {
    setSaveError(null);
    setDraft(recording?.transcript ?? '');
  };

  const cancelEditing = () => {
    if (!dirty) {
      setDraft(null);
      return;
    }
    Alert.alert('Discard changes?', 'Your edits to the transcript have not been saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => setDraft(null) },
    ]);
  };

  const saveTranscript = async () => {
    if (draft === null) {
      return;
    }
    if (!dirty) {
      setDraft(null);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      setRecording(await updateTranscript(id, draft));
      setDraft(null);
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : 'Could not save the transcript.');
    } finally {
      setSaving(false);
    }
  };

  const topBar = (
    <View style={styles.topBar}>
      <IconButton onPress={() => router.back()} accessibilityLabel="Back">
        <ChevronLeftIcon size={22} color={c.text} />
      </IconButton>
      {recording ? (
        <IconButton onPress={() => setActionsOpen(true)} accessibilityLabel="Recording options">
          <MoreIcon size={22} color={c.text} />
        </IconButton>
      ) : null}
    </View>
  );

  if (error) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        {topBar}
        <View style={styles.centered}>
          <Text style={styles.stateBody}>{error}</Text>
        </View>
      </View>
    );
  }

  if (!recording) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        {topBar}
        <View style={styles.centered}>
          <ActivityIndicator color={c.accent} />
        </View>
      </View>
    );
  }

  const hasTranscript = !!recording.transcript?.trim();
  const barBottom = Math.max(BAR_BOTTOM, insets.bottom + space.md);
  const barHeight = BAR_TOP + PILL_HEIGHT + barBottom;

  return (
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top }]} behavior="padding">
      {topBar}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: barHeight + space.xxl }]}
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={64}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.titleBlock}>
          <Text style={styles.title} accessibilityRole="header">
            {recording.title}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaChip}>{formatDate(recording.createdAt)}</Text>
            <Text style={styles.metaChip}>{formatDuration(recording.durationSec)}</Text>
          </View>
        </View>

        <View
          style={styles.tabsWrap}
          onLayout={(e) => {
            tabsY.current = e.nativeEvent.layout.y;
          }}
        >
          <Tabs styles={styles} value={tab} onChange={switchTab} />
        </View>

        {tab === 'transcript' ? (
          <View style={styles.transcriptBody}>
            {summarizeError ? <Text style={styles.errorNotice}>{summarizeError}</Text> : null}
            {summarizing ? (
              <Text style={styles.caption}>
                Summarizing. Long meetings can take a minute, so keep reading meanwhile.
              </Text>
            ) : null}
            {editing ? (
              <>
                {saveError ? <Text style={styles.errorNotice}>{saveError}</Text> : null}
                <TextInput
                  style={styles.editor}
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  scrollEnabled={false}
                  autoFocus
                  textAlignVertical="top"
                  accessibilityLabel="Transcript"
                  placeholder="Transcript"
                  placeholderTextColor={c.textMuted}
                  selectionColor={c.accent}
                />
              </>
            ) : hasTranscript ? (
              paragraphsOf(recording.transcript!).map((p, i) => (
                <Text key={i} style={styles.paragraph} selectable>
                  {p}
                </Text>
              ))
            ) : (
              <Text style={styles.paragraph}>No transcript.</Text>
            )}
          </View>
        ) : recording.summary ? (
          <View style={styles.summaryBody}>
            {recording.summaryStale ? (
              <FadeIn style={styles.staleBox}>
                <Text style={styles.staleText}>
                  The transcript was edited after this summary was made, so it may be out of date.
                </Text>
                {summarizeError ? <Text style={styles.staleText}>{summarizeError}</Text> : null}
                <Button
                  label="Re-summarize"
                  onPress={summarize}
                  busy={summarizing}
                  contentStyle={styles.staleAction}
                />
              </FadeIn>
            ) : summarizeError ? (
              <Text style={styles.errorNotice}>{summarizeError}</Text>
            ) : null}
            <View style={recording.summaryStale && styles.dimmed}>
              <SummarySections styles={styles} summary={recording.summary} />
            </View>
          </View>
        ) : (
          <View style={styles.summaryBody}>
            <FadeIn style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No summary yet</Text>
              <Text style={styles.emptyBody}>
                Gist reads the transcript and pulls out decisions, open questions and action
                items. It works only from the transcript, so check that tab first for anything
                misheard.
              </Text>
              {summarizeError ? <Text style={styles.errorNotice}>{summarizeError}</Text> : null}
              {summarizing ? (
                <Text style={styles.caption}>Summarizing. Long meetings can take a minute.</Text>
              ) : null}
            </FadeIn>
          </View>
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: barBottom }]}>
        {tab === 'summary' ? (
          recording.summary ? (
            <Button
              label="Email summary"
              variant="primary"
              pill
              onPress={() => openEmail('summary')}
              leading={<MailIcon size={18} color={c.onPrimary} />}
              style={styles.barButton}
            />
          ) : (
            <Button
              label="Summarize"
              variant="primary"
              pill
              onPress={summarize}
              busy={summarizing}
              disabled={!hasTranscript}
              style={styles.barButton}
            />
          )
        ) : editing ? (
          <>
            <Button label="Cancel" pill onPress={cancelEditing} style={styles.barButton} />
            <Button
              label="Save"
              variant="primary"
              pill
              onPress={saveTranscript}
              busy={saving}
              leading={<CheckIcon size={18} color={c.onPrimary} />}
              style={styles.barButton}
            />
          </>
        ) : hasTranscript ? (
          <>
            <Button
              label="Edit"
              pill
              onPress={startEditing}
              leading={<PencilIcon size={18} color={c.text} />}
              accessibilityLabel="Edit transcript"
              style={styles.barButton}
            />
            <Button
              label="Email"
              pill
              onPress={() => openEmail('transcript')}
              leading={<MailIcon size={18} color={c.text} />}
              accessibilityLabel="Email transcript"
              style={styles.barButton}
            />
          </>
        ) : null}
      </View>

      <EmailSheet
        styles={styles}
        id={id}
        visible={emailOpen}
        onClose={closeEmail}
        initial={emailInitial}
        hasSummary={recording.summary !== null}
        hasTranscript={hasTranscript}
      />

      <RecordingActions
        recording={recording}
        visible={actionsOpen}
        onClose={() => setActionsOpen(false)}
        onRenamed={(title) => setRecording({ ...recording, title })}
        onDeleted={() => router.back()}
      />
    </KeyboardAvoidingView>
  );
}

/**
 * Display paragraphs. Whisper usually returns one long line, so when there
 * are no breaks of its own the text is grouped a few sentences at a time.
 * The stored transcript is never changed by this.
 */
function paragraphsOf(text: string): string[] {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length > 1) {
    return lines;
  }
  const sentences = text.trim().match(/[^.!?]+(?:[.!?]+["')\]]*|$)\s*/g) ?? [text];
  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += SENTENCES_PER_PARAGRAPH) {
    paragraphs.push(sentences.slice(i, i + SENTENCES_PER_PARAGRAPH).join('').trim());
  }
  return paragraphs.filter(Boolean);
}

function Tabs({
  styles,
  value,
  onChange,
}: {
  styles: Styles;
  value: Tab;
  onChange: (t: Tab) => void;
}) {
  const reduce = useReducedMotion();
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const thumbWidth = width / TAB_OPTIONS.length;
  const target = TAB_OPTIONS.findIndex((o) => o.key === value) * thumbWidth;

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
      {TAB_OPTIONS.map((o) => {
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

function SummarySections({ styles, summary }: { styles: Styles; summary: Summary }) {
  const decisions = summary.decisions_made ?? [];
  const lists = LIST_SECTIONS.filter((s) => (summary[s.key]?.length ?? 0) > 0);

  // Each card fades up a beat after the one above it.
  let order = 0;
  const delay = () => order++ * 60;

  return (
    <View style={styles.cards}>
      {summary.key_outcomes ? (
        <FadeIn delay={delay()} style={[styles.card, styles.outcomeCard]}>
          <CardLabel styles={styles} label="Key outcomes" />
          <Text style={styles.outcomeText} selectable>
            {summary.key_outcomes}
          </Text>
        </FadeIn>
      ) : null}

      {decisions.length > 0 ? (
        <FadeIn delay={delay()}>
          <Decisions styles={styles} decisions={decisions} />
        </FadeIn>
      ) : null}

      {lists.map((s) => (
        <FadeIn key={s.key} delay={delay()}>
          <ListCard
            styles={styles}
            label={s.label}
            marker={s.marker}
            items={summary[s.key]!}
          />
        </FadeIn>
      ))}
    </View>
  );
}

function CardLabel({ styles, label, count }: { styles: Styles; label: string; count?: number }) {
  return (
    <View style={styles.cardHeader}>
      <Text style={styles.cardLabel}>{label}</Text>
      {count !== undefined ? <Text style={styles.cardCount}>{count}</Text> : null}
    </View>
  );
}

function Decisions({
  styles,
  decisions,
}: {
  styles: Styles;
  decisions: NonNullable<Summary['decisions_made']>;
}) {
  const c = useColors();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? decisions : decisions.slice(0, DECISIONS_SHOWN);
  const hidden = decisions.length - shown.length;

  return (
    <View style={styles.card}>
      <View style={styles.decisionsHeader}>
        <CardLabel styles={styles} label="Decisions made" count={decisions.length} />
      </View>
      {shown.map((d, i) => (
        <View key={i} style={styles.decisionItem}>
          <Text style={styles.decisionNumber}>{String(i + 1).padStart(2, '0')}</Text>
          <View style={styles.decisionText}>
            <Text style={styles.decisionTitle} selectable>
              {d.title}
            </Text>
            {d.detail ? (
              <Text style={styles.decisionDetail} selectable>
                {d.detail}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
      {hidden > 0 ? (
        <Pressable
          onPress={() => setExpanded(true)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.moreRow, pressed && styles.moreRowPressed]}
        >
          <Text style={styles.moreLabel}>Show {hidden} more</Text>
          <ChevronDownIcon size={16} color={c.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Collapsed to its label and count until tapped, so a long summary stays scannable. */
function ListCard({
  styles,
  label,
  marker,
  items,
}: {
  styles: Styles;
  label: string;
  marker: Marker;
  items: string[];
}) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}, ${items.length}`}
        style={({ pressed }) => [styles.listHeader, pressed && styles.listHeaderPressed]}
      >
        <Text style={styles.cardLabel}>{label}</Text>
        <View style={styles.listHeaderEnd}>
          <Text style={styles.cardCount}>{items.length}</Text>
          <View style={open && styles.chevronOpen}>
            <ChevronDownIcon size={18} color={c.textSecondary} />
          </View>
        </View>
      </Pressable>
      {open ? (
        <View style={styles.itemList}>
          {items.map((item, i) => (
            <View key={i} style={styles.itemRow}>
              <ItemMarker styles={styles} kind={marker} />
              <Text style={styles.itemText} selectable>
                {item}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Sits in a box one text line tall, so it centres on the first line of the item. */
function ItemMarker({ styles, kind }: { styles: Styles; kind: Marker }) {
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

// How long the "sent" confirmation stays up before the sheet closes itself.
const SENT_CLOSE_MS = 2200;

/**
 * Sends the summary and/or the full transcript by mail. Defaults to the
 * signed-in address; extra recipients are added one at a time so a mistyped
 * address is easy to remove. Opened from the bottom bar, with whatever that
 * tab shows already ticked.
 */
function EmailSheet({
  styles,
  id,
  visible,
  onClose,
  initial,
  hasSummary,
  hasTranscript,
}: {
  styles: Styles;
  id: string;
  visible: boolean;
  onClose: () => void;
  initial: Tab;
  hasSummary: boolean;
  hasTranscript: boolean;
}) {
  const { user } = useAuth();
  const c = useColors();
  const reduce = useReducedMotion();
  const [includeSummary, setIncludeSummary] = useState(hasSummary);
  const [includeTranscript, setIncludeTranscript] = useState(!hasSummary && hasTranscript);
  const [extra, setExtra] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<SavedRecipient[]>([]);

  // Suggestions are a convenience, so a failure to load them just hides them.
  useEffect(() => {
    let cancelled = false;
    listSavedRecipients()
      .then((list) => !cancelled && setSuggestions(list))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Every opening starts at the form, with the tab it came from ticked.
  useEffect(() => {
    if (visible) {
      const summaryFirst = initial === 'summary' ? hasSummary : !hasTranscript;
      setIncludeSummary(summaryFirst && hasSummary);
      setIncludeTranscript(!summaryFirst && hasTranscript);
      setResult(null);
      setError(null);
      setDraft('');
    }
  }, [visible, initial, hasSummary, hasTranscript]);

  // The confirmation closes the sheet on its own, unless motion is reduced:
  // then nothing moves without being asked to.
  useEffect(() => {
    if (!result || !visible || reduce) {
      return;
    }
    const timer = setTimeout(onClose, SENT_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [result, visible, reduce, onClose]);

  const what =
    includeSummary && includeTranscript
      ? 'Summary and transcript'
      : includeTranscript
        ? 'Transcript'
        : 'Summary';
  const nothingChosen = !includeSummary && !includeTranscript;

  const own = user?.email?.toLowerCase();
  const chosen = new Set(extra.map((a) => a.toLowerCase()));
  const query = draft.trim().toLowerCase();
  const visibleSuggestions = suggestions.filter(
    (s) => s.email !== own && !chosen.has(s.email) && (!query || s.email.includes(query)),
  );

  const forget = async (suggestion: SavedRecipient) => {
    const before = suggestions;
    setSuggestions(before.filter((s) => s.id !== suggestion.id));
    try {
      await forgetSavedRecipient(suggestion.id);
    } catch (e) {
      // Put it back; the server still has it.
      setSuggestions(before);
      setError(e instanceof ApiError ? e.message : 'Could not remove that suggestion.');
    }
  };

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
      const { recipients } = await emailRecording(id, extra, {
        summary: includeSummary,
        transcript: includeTranscript,
      });
      setResult(`${what} sent to ${recipients.join(', ')}`);
      setExtra([]);
      // The server saved these too; refetch so new ones carry their ids.
      listSavedRecipients()
        .then(setSuggestions)
        .catch(() => {});
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send this email.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      {result ? (
        <FadeIn style={styles.sent}>
          <View style={styles.sentBadge}>
            <CheckIcon size={26} color={c.accent} />
          </View>
          <Text style={styles.sentTitle} accessibilityLiveRegion="polite">
            Sent
          </Text>
          <Text style={styles.sentBody}>{result}</Text>
          <Button label="Done" pill onPress={onClose} style={styles.sentDone} />
        </FadeIn>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.emailPanel}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sheetTitle}>Email this meeting</Text>

          <View style={styles.includeRow}>
            <IncludeToggle
              styles={styles}
              label="Summary"
              checked={includeSummary}
              disabled={!hasSummary}
              onToggle={() => setIncludeSummary(!includeSummary)}
            />
            <IncludeToggle
              styles={styles}
              label="Full transcript"
              checked={includeTranscript}
              disabled={!hasTranscript}
              onToggle={() => setIncludeTranscript(!includeTranscript)}
            />
          </View>

          <Text style={styles.fieldLabel}>To</Text>
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
              placeholderTextColor={c.textMuted}
              selectionColor={c.accent}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="done"
            />
            <Button label="Add" onPress={addDraft} disabled={!draft.trim()} />
          </View>

          {visibleSuggestions.length > 0 ? (
            <View style={styles.suggestions}>
              <Text style={styles.fieldLabel}>Recent</Text>
              <View style={styles.chipRow}>
                {visibleSuggestions.map((s) => (
                  <View key={s.id} style={styles.suggestion}>
                    <Pressable
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${s.email}`}
                      style={({ pressed }) => [
                        styles.suggestionAdd,
                        pressed && styles.suggestionPressed,
                      ]}
                      onPress={() => setExtra([...extra, s.email])}
                    >
                      <Text style={styles.suggestionText}>{s.email}</Text>
                    </Pressable>
                    <Pressable
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={`Forget ${s.email}`}
                      style={({ pressed }) => [
                        styles.suggestionForget,
                        pressed && styles.suggestionPressed,
                      ]}
                      onPress={() => forget(s)}
                    >
                      <Text style={styles.suggestionX}>×</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {error ? <Text style={styles.errorNotice}>{error}</Text> : null}

          <Button
            label={extra.length > 0 ? `Send to ${extra.length + 1} people` : 'Send to me'}
            variant="primary"
            pill
            onPress={send}
            busy={sending}
            disabled={nothingChosen}
            leading={<MailIcon size={18} color={c.onPrimary} />}
            style={styles.sendButton}
          />
        </ScrollView>
      )}
    </Sheet>
  );
}

function IncludeToggle({
  styles,
  label,
  checked,
  disabled,
  onToggle,
}: {
  styles: Styles;
  label: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      style={({ pressed }) => [
        styles.include,
        checked && styles.includeChecked,
        pressed && styles.includePressed,
        disabled && styles.includeDisabled,
      ]}
    >
      <View style={[styles.includeBox, checked && styles.includeBoxChecked]}>
        {checked ? <CheckIcon size={12} color={c.onAccent} /> : null}
      </View>
      <Text style={[styles.includeLabel, checked && styles.includeLabelChecked]}>{label}</Text>
    </Pressable>
  );
}

const TAB_INSET = 4;
// Line height of summary items; markers sit in a box this tall.
const ITEM_LINE = 23;

function makeStyles(c: Palette) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: c.bg,
    },
    content: {
      gap: space.lg,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 36,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: space.sm,
      paddingTop: space.xs,
    },
    stateBody: {
      fontFamily: fonts.sans,
      fontSize: 14,
      lineHeight: 21,
      color: c.textSecondary,
      textAlign: 'center',
    },
    caption: {
      fontFamily: fonts.mono,
      fontSize: 12,
      lineHeight: 18,
      color: c.textSecondary,
      textAlign: 'center',
    },

    titleBlock: {
      paddingHorizontal: space.xl,
      paddingTop: space.xs,
      gap: space.md,
    },
    title: {
      fontFamily: fonts.sansSemibold,
      fontSize: 26,
      lineHeight: 32,
      letterSpacing: -0.6,
      color: c.text,
    },
    metaRow: {
      flexDirection: 'row',
      gap: 6,
    },
    metaChip: {
      fontFamily: fonts.mono,
      fontSize: 12,
      color: c.chipText,
      backgroundColor: c.surfaceRaised,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: radius.chip,
      overflow: 'hidden',
    },

    tabsWrap: {
      paddingHorizontal: space.lg,
    },
    tabs: {
      flexDirection: 'row',
      padding: TAB_INSET,
      borderRadius: radius.track,
      backgroundColor: c.segmentTrack,
    },
    tabThumb: {
      position: 'absolute',
      top: TAB_INSET,
      bottom: TAB_INSET,
      left: TAB_INSET,
      borderRadius: radius.sm,
      backgroundColor: c.segmentActive,
      ...shadow('segment', c),
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
      color: c.textSecondary,
    },
    tabLabelSelected: {
      fontFamily: fonts.sansSemibold,
      color: c.onSegmentActive,
    },

    transcriptBody: {
      paddingHorizontal: 22,
      paddingTop: space.xs,
      gap: 18,
    },
    paragraph: {
      fontFamily: fonts.sans,
      fontSize: 17,
      lineHeight: 28,
      color: c.textBody,
    },
    editor: {
      minHeight: 240,
      marginHorizontal: -space.sm,
      paddingHorizontal: space.md,
      paddingVertical: space.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.borderStrong,
      backgroundColor: c.surface,
      fontFamily: fonts.sans,
      fontSize: 17,
      lineHeight: 28,
      color: c.textBody,
    },

    summaryBody: {
      paddingHorizontal: space.lg,
      gap: space.md,
    },
    dimmed: {
      opacity: 0.55,
    },
    staleBox: {
      padding: space.lg,
      gap: space.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.warningBorder,
      backgroundColor: c.warningBg,
    },
    staleText: {
      fontFamily: fonts.sans,
      fontSize: 14,
      lineHeight: 21,
      color: c.warningText,
    },
    staleAction: {
      alignSelf: 'flex-start',
      borderRadius: radius.pill,
    },

    emptyCard: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.lg,
      padding: space.xl,
      gap: space.md,
    },
    emptyTitle: {
      fontFamily: fonts.sansSemibold,
      fontSize: 17,
      color: c.text,
    },
    emptyBody: {
      fontFamily: fonts.sans,
      fontSize: 14.5,
      lineHeight: 22,
      color: c.textSecondary,
    },

    cards: {
      gap: space.md,
    },
    card: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.lg,
      overflow: 'hidden',
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
    },
    cardLabel: {
      fontFamily: fonts.sansMedium,
      fontSize: 13,
      color: c.accent,
    },
    cardCount: {
      fontFamily: fonts.mono,
      fontSize: 12,
      color: c.textSecondary,
    },

    outcomeCard: {
      padding: 18,
      gap: 10,
    },
    outcomeText: {
      fontFamily: fonts.sans,
      fontSize: 16,
      lineHeight: 25,
      color: c.textSummary,
    },

    decisionsHeader: {
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: space.md,
    },
    decisionItem: {
      flexDirection: 'row',
      gap: space.md,
      marginHorizontal: 18,
      paddingVertical: 14,
      borderTopWidth: 1,
      borderTopColor: c.divider,
    },
    decisionNumber: {
      fontFamily: fonts.mono,
      fontSize: 12,
      lineHeight: 21,
      color: c.textSecondary,
    },
    decisionText: {
      flex: 1,
      gap: 4,
    },
    decisionTitle: {
      fontFamily: fonts.sansSemibold,
      fontSize: 15,
      lineHeight: 21,
      color: c.text,
    },
    decisionDetail: {
      fontFamily: fonts.sans,
      fontSize: 14,
      lineHeight: 21,
      color: c.textDetail,
    },
    moreRow: {
      minHeight: minHitTarget,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderTopWidth: 1,
      borderTopColor: c.divider,
    },
    moreRowPressed: {
      backgroundColor: c.pressed,
    },
    moreLabel: {
      fontFamily: fonts.sansMedium,
      fontSize: 13,
      color: c.textSecondary,
    },

    listHeader: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
    },
    listHeaderPressed: {
      backgroundColor: c.pressed,
    },
    listHeaderEnd: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
    },
    chevronOpen: {
      transform: [{ rotate: '180deg' }],
    },
    itemList: {
      gap: 14,
      paddingHorizontal: 18,
      paddingTop: 2,
      paddingBottom: 18,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.md,
    },
    itemText: {
      flex: 1,
      fontFamily: fonts.sans,
      fontSize: 15,
      lineHeight: ITEM_LINE,
      color: c.textBody,
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
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    markCheckTick: {
      width: 7,
      height: 4,
      marginTop: -2,
      borderLeftWidth: 1.6,
      borderBottomWidth: 1.6,
      borderColor: c.onAccent,
      transform: [{ rotate: '-45deg' }],
    },
    markBar: {
      width: 3,
      height: 16,
      borderRadius: 1.5,
      backgroundColor: c.warningDot,
    },
    markRing: {
      width: 11,
      height: 11,
      borderRadius: 5.5,
      borderWidth: 1.6,
      borderColor: c.warningDot,
    },
    markBox: {
      width: 14,
      height: 14,
      borderRadius: 3.5,
      borderWidth: 1.6,
      borderColor: c.accent,
    },
    markGlyph: {
      fontFamily: fonts.monoMedium,
      fontSize: 14,
      color: c.accent,
    },

    bottomBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: space.lg,
      paddingTop: BAR_TOP,
      backgroundColor: c.bg,
    },
    barButton: {
      flex: 1,
    },

    sheetTitle: {
      fontFamily: fonts.sansSemibold,
      fontSize: 17,
      color: c.text,
    },
    fieldLabel: {
      fontFamily: fonts.sansMedium,
      fontSize: 13,
      color: c.accent,
    },
    emailPanel: {
      gap: space.md,
      paddingBottom: space.xs,
    },
    includeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    include: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      minHeight: minHitTarget,
      paddingHorizontal: 14,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.borderStrong,
      backgroundColor: c.bg,
    },
    includeChecked: {
      borderColor: c.accent,
      backgroundColor: c.accentSoft,
    },
    includePressed: { opacity: 0.75 },
    includeDisabled: { opacity: 0.4 },
    includeBox: {
      width: 18,
      height: 18,
      borderRadius: 5,
      borderWidth: 1.6,
      borderColor: c.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    includeBoxChecked: {
      borderColor: c.accent,
      backgroundColor: c.accent,
    },
    includeLabel: { fontFamily: fonts.sansMedium, fontSize: 14, color: c.textBody },
    includeLabelChecked: { color: c.text },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: radius.chip,
      backgroundColor: c.surfaceRaised,
    },
    chipPressed: { backgroundColor: c.pressed },
    chipFixed: { opacity: 0.75 },
    chipLabel: { fontFamily: fonts.mono, fontSize: 12.5, color: c.chipText },
    chipRemove: { fontFamily: fonts.sans, fontSize: 15, color: c.chipText },
    suggestions: { gap: space.sm },
    suggestion: {
      flexDirection: 'row',
      alignItems: 'stretch',
      borderRadius: radius.chip,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.bg,
      overflow: 'hidden',
    },
    suggestionAdd: { paddingLeft: 11, paddingRight: 7, paddingVertical: 7, justifyContent: 'center' },
    suggestionForget: { paddingLeft: 7, paddingRight: 11, justifyContent: 'center' },
    suggestionPressed: { backgroundColor: c.pressed },
    suggestionText: { fontFamily: fonts.mono, fontSize: 12.5, color: c.textBody },
    suggestionX: { fontFamily: fonts.sans, fontSize: 15, color: c.textSecondary },
    emailRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
    emailInput: {
      flex: 1,
      minHeight: minHitTarget + 4,
      backgroundColor: c.bg,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      paddingHorizontal: 13,
      fontFamily: fonts.sans,
      fontSize: 14.5,
      color: c.text,
    },
    emailInputFocused: {
      borderColor: c.accent,
    },
    sendButton: {
      marginTop: space.xs,
    },

    sent: {
      alignItems: 'center',
      gap: space.sm,
      paddingTop: space.md,
    },
    sentBadge: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.accentSoft,
      marginBottom: space.xs,
    },
    sentTitle: {
      fontFamily: fonts.sansSemibold,
      fontSize: 17,
      color: c.text,
    },
    sentBody: {
      fontFamily: fonts.sans,
      fontSize: 14,
      lineHeight: 21,
      color: c.textSecondary,
      textAlign: 'center',
    },
    sentDone: {
      alignSelf: 'stretch',
      marginTop: space.md,
    },

    errorNotice: {
      fontFamily: fonts.sans,
      fontSize: 13.5,
      lineHeight: 19,
      color: c.warningText,
      backgroundColor: c.warningBg,
      borderWidth: 1,
      borderColor: c.warningBorder,
      borderRadius: radius.md,
      padding: 11,
      overflow: 'hidden',
    },
  });
}
