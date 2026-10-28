import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, listRecordings, type RecordingListItem } from '../src/api';
import { useAuth } from '../src/auth';
import { formatDuration } from '../src/format';
import { MicIcon, UploadIcon } from '../src/icons';
import { RecordingActions } from '../src/RecordingActions';
import { fonts, minHitTarget, radius, shadow, space, useColors, type Palette } from '../src/theme';
import { Button, FadeIn, Sheet } from '../src/ui';

// Rows past this index appear together rather than trickling in.
const MAX_STAGGER = 8;

type Styles = ReturnType<typeof makeStyles>;

export default function RecordingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [items, setItems] = useState<RecordingListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Kept after the sheet closes so its fade-out still has something to show.
  const [target, setTarget] = useState<RecordingListItem | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const openActions = (item: RecordingListItem) => {
    setTarget(item);
    setActionsOpen(true);
  };

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    }
    try {
      setItems(await listRecordings());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Reload on every focus so a new recording appears without a manual pull.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const topBar = <TopBar styles={styles} onAccount={() => setAccountOpen(true)} />;
  const accountSheet = (
    <AccountSheet styles={styles} visible={accountOpen} onClose={() => setAccountOpen(false)} />
  );

  if (items === null && error === null) {
    return (
      <View style={[styles.screen, styles.padded, { paddingTop: insets.top }]}>
        {topBar}
        <View style={styles.centered}>
          <ActivityIndicator color={c.accent} />
        </View>
        {accountSheet}
      </View>
    );
  }

  if (error !== null && items === null) {
    return (
      <View style={[styles.screen, styles.padded, { paddingTop: insets.top }]}>
        {topBar}
        <View style={styles.centered}>
          <Text style={styles.stateTitle}>Can't load recordings</Text>
          <Text style={styles.stateBody}>{error}</Text>
          <Button label="Try again" onPress={() => load()} style={styles.stateAction} />
        </View>
        {accountSheet}
      </View>
    );
  }

  const list = items ?? [];
  const totalMinutes = Math.round(list.reduce((sum, i) => sum + (i.durationSec ?? 0), 0) / 60);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={c.accent}
            colors={[c.accent]}
            progressBackgroundColor={c.surface}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            {topBar}
            <RecordCard
              styles={styles}
              onRecord={() => router.push('/recording/new')}
              onUpload={() => router.push('/recording/new?pick=1')}
            />
            {list.length > 0 ? (
              <View style={styles.recentHeader}>
                <Text style={styles.recentTitle}>Recent</Text>
                <Text style={styles.recentCount}>
                  {list.length} · {totalMinutes} min
                </Text>
              </View>
            ) : null}
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.rowGap} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.stateTitle}>No recordings yet</Text>
            <Text style={styles.stateBody}>
              Tap Record to capture a meeting, or upload an audio file from there. It will be
              transcribed and listed here.
            </Text>
            <Text style={styles.hint}>Press and hold a recording to rename or delete it</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <FadeIn delay={Math.min(index, MAX_STAGGER) * 40}>
            <RecordingRow
              styles={styles}
              item={item}
              onPress={() => router.push(`/recording/${item.id}`)}
              onLongPress={() => openActions(item)}
            />
          </FadeIn>
        )}
      />
      <RecordingActions
        recording={target}
        visible={actionsOpen}
        onClose={() => setActionsOpen(false)}
        onRenamed={(title) =>
          setItems((current) =>
            (current ?? []).map((i) => (i.id === target?.id ? { ...i, title } : i)),
          )
        }
        onDeleted={() =>
          setItems((current) => (current ?? []).filter((i) => i.id !== target?.id))
        }
      />
      {accountSheet}
    </View>
  );
}

function TopBar({ styles, onAccount }: { styles: Styles; onAccount: () => void }) {
  const { user } = useAuth();
  const initial = user?.email?.charAt(0).toUpperCase() ?? '?';
  return (
    <View style={styles.topBar}>
      <Text style={styles.wordmark}>Gist</Text>
      <Pressable
        onPress={onAccount}
        accessibilityRole="button"
        accessibilityLabel="Account"
        style={({ pressed }) => [styles.avatar, pressed && styles.avatarPressed]}
      >
        <Text style={styles.avatarLetter}>{initial}</Text>
      </Pressable>
    </View>
  );
}

/** Signing out is rare, so it sits behind the account button rather than on screen. */
function AccountSheet({
  styles,
  visible,
  onClose,
}: {
  styles: Styles;
  visible: boolean;
  onClose: () => void;
}) {
  const { user, signOut } = useAuth();
  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.sheetBody}>
        {user ? (
          <Text style={styles.sheetText} numberOfLines={1}>
            Signed in as {user.email}
          </Text>
        ) : null}
        <Button
          label="Sign out"
          pill
          onPress={() => {
            onClose();
            signOut();
          }}
        />
      </View>
    </Sheet>
  );
}

function RecordCard({
  styles,
  onRecord,
  onUpload,
}: {
  styles: Styles;
  onRecord: () => void;
  onUpload: () => void;
}) {
  const c = useColors();
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>New recording</Text>
          <Text style={styles.cardBody}>Capture a meeting. Transcript arrives when you stop.</Text>
        </View>
        <Pressable
          onPress={onRecord}
          accessibilityRole="button"
          accessibilityLabel="Start recording"
          style={({ pressed }) => [styles.recordDisc, pressed && styles.recordDiscPressed]}
        >
          <MicIcon size={26} color={c.onRecord} />
        </Pressable>
      </View>
      <Pressable
        onPress={onUpload}
        accessibilityRole="button"
        accessibilityLabel="Upload audio file"
        style={({ pressed }) => [styles.uploadButton, pressed && styles.uploadButtonPressed]}
      >
        <UploadIcon size={18} color={c.text} />
        <Text style={styles.uploadLabel}>Upload audio file</Text>
      </Pressable>
    </View>
  );
}

function RecordingRow({
  styles,
  item,
  onPress,
  onLongPress,
}: {
  styles: Styles;
  item: RecordingListItem;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const c = useColors();
  const status = item.summaryStale
    ? { dot: c.warningDot, label: 'Summary out of date' }
    : item.hasSummary
      ? { dot: c.accentDot, label: 'Summary ready' }
      : { dot: c.bullet, label: 'Transcript only' };
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityHint="Press and hold to rename or delete"
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.durationTile}>
        <Text style={styles.durationText}>{formatDuration(item.durationSec)}</Text>
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.status}>
          <View style={[styles.statusDot, { backgroundColor: status.dot }]} />
          <Text style={styles.statusLabel}>{status.label}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: c.bg,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 36,
      paddingVertical: 48,
      gap: space.sm,
    },
    padded: {
      paddingHorizontal: space.lg,
    },
    listContent: {
      paddingHorizontal: space.lg,
    },
    header: {
      gap: space.xl,
      paddingBottom: space.md,
    },

    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: space.md,
    },
    wordmark: {
      fontFamily: fonts.sansSemibold,
      fontSize: 20,
      letterSpacing: -0.4,
      color: c.text,
    },
    avatar: {
      width: minHitTarget,
      height: minHitTarget,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.avatar,
    },
    avatarPressed: {
      opacity: 0.8,
    },
    avatarLetter: {
      fontFamily: fonts.sansMedium,
      fontSize: 15,
      color: c.text,
    },

    card: {
      padding: space.xl,
      gap: 18,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      ...shadow('card', c),
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.lg,
    },
    cardText: {
      flex: 1,
      gap: 6,
    },
    cardTitle: {
      fontFamily: fonts.sansSemibold,
      fontSize: 22,
      letterSpacing: -0.4,
      color: c.text,
    },
    cardBody: {
      fontFamily: fonts.sans,
      fontSize: 14,
      lineHeight: 20,
      color: c.textSecondary,
    },
    recordDisc: {
      width: 76,
      height: 76,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.record,
      borderWidth: 6,
      borderColor: c.recordRing,
    },
    recordDiscPressed: {
      transform: [{ scale: 0.96 }],
    },
    uploadButton: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.borderStrong,
    },
    uploadButtonPressed: {
      backgroundColor: c.pressed,
    },
    uploadLabel: {
      fontFamily: fonts.sansMedium,
      fontSize: 15,
      color: c.text,
    },

    recentHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      paddingTop: space.xs,
    },
    recentTitle: {
      fontFamily: fonts.sansSemibold,
      fontSize: 15,
      color: c.text,
    },
    recentCount: {
      fontFamily: fonts.mono,
      fontSize: 12,
      color: c.textSecondary,
    },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      minHeight: 68,
      marginHorizontal: -space.sm,
      paddingHorizontal: space.sm,
      paddingVertical: 6,
      borderRadius: radius.md,
    },
    rowPressed: {
      backgroundColor: c.pressed,
    },
    rowGap: {
      height: 2,
    },
    durationTile: {
      width: 56,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    durationText: {
      fontFamily: fonts.mono,
      fontSize: 12,
      color: c.durationText,
    },
    rowText: {
      flex: 1,
      gap: 4,
    },
    rowTitle: {
      fontFamily: fonts.sansMedium,
      fontSize: 16,
      lineHeight: 21,
      color: c.text,
    },
    status: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    statusLabel: {
      fontFamily: fonts.sans,
      fontSize: 13,
      color: c.textSecondary,
    },

    empty: {
      alignItems: 'center',
      gap: space.sm,
      paddingHorizontal: space.xl,
      paddingVertical: 40,
    },
    hint: {
      fontFamily: fonts.sans,
      fontSize: 13,
      color: c.textSecondary,
      textAlign: 'center',
      marginTop: space.md,
    },
    stateTitle: {
      fontFamily: fonts.sansSemibold,
      fontSize: 16,
      color: c.text,
    },
    stateBody: {
      fontFamily: fonts.sans,
      fontSize: 14,
      lineHeight: 21,
      color: c.textSecondary,
      textAlign: 'center',
    },
    stateAction: {
      marginTop: space.md,
    },

    sheetBody: {
      gap: space.lg,
    },
    sheetText: {
      fontFamily: fonts.sans,
      fontSize: 14,
      color: c.textSecondary,
      textAlign: 'center',
    },
  });
}
