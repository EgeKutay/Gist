import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
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
import { formatDate, formatDuration } from '../src/format';
import { RecordingActions } from '../src/RecordingActions';
import { colors, fonts, radius, space } from '../src/theme';
import { Button, FadeIn } from '../src/ui';

// Rows past this index appear together rather than trickling in.
const MAX_STAGGER = 8;

export default function RecordingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<RecordingListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Kept after the sheet closes so its fade-out still has something to show.
  const [target, setTarget] = useState<RecordingListItem | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);

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

  const recordButton = (
    <View pointerEvents="box-none" style={[styles.fabWrap, { bottom: insets.bottom + 20 }]}>
      <Button
        label="Record"
        variant="primary"
        onPress={() => router.push('/recording/new')}
        leading={<View style={styles.fabDot} />}
        style={styles.fabShadow}
        contentStyle={styles.fab}
        accessibilityLabel="New recording"
      />
    </View>
  );

  if (items === null && error === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (error !== null && items === null) {
    return (
      <View style={styles.centered}>
        <Text style={styles.stateTitle}>Can't load recordings</Text>
        <Text style={styles.stateBody}>{error}</Text>
        <Button label="Try again" onPress={() => load()} style={styles.stateAction} />
        <AccountFooter />
      </View>
    );
  }

  const list = items ?? [];

  return (
    <View style={styles.screen}>
      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          { paddingBottom: insets.bottom + 108 },
          list.length === 0 && styles.emptyContainer,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load(true)}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        ItemSeparatorComponent={() => <View style={styles.divider} />}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.stateTitle}>No recordings yet</Text>
            <Text style={styles.stateBody}>
              Tap Record to capture a meeting, or upload an audio file from there. It will be
              transcribed and listed here.
            </Text>
          </View>
        }
        ListFooterComponent={<AccountFooter showHint={list.length > 0} />}
        renderItem={({ item, index }) => (
          <FadeIn delay={Math.min(index, MAX_STAGGER) * 40}>
            <RecordingRow
              item={item}
              onPress={() => router.push(`/recording/${item.id}`)}
              onLongPress={() => openActions(item)}
            />
          </FadeIn>
        )}
      />
      {recordButton}
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
    </View>
  );
}

/** Signing out is rare, so it lives at the end of the list, not in the header. */
function AccountFooter({ showHint = false }: { showHint?: boolean }) {
  const { user, signOut } = useAuth();
  return (
    <View style={styles.footer}>
      {showHint ? (
        <Text style={styles.footerHint}>Press and hold a recording to rename or delete it</Text>
      ) : null}
      {user ? (
        <Text style={styles.footerText} numberOfLines={1}>
          Signed in as {user.email}
        </Text>
      ) : null}
      <Button label="Sign out" variant="quiet" onPress={signOut} contentStyle={styles.footerButton} />
    </View>
  );
}

function RecordingRow({
  item,
  onPress,
  onLongPress,
}: {
  item: RecordingListItem;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityHint="Press and hold to rename or delete"
      accessibilityRole="button"
      android_ripple={{ color: colors.pressed }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.rowMeta}>
          {formatDuration(item.durationSec)} · {formatDate(item.createdAt)}
        </Text>
      </View>
      {item.hasSummary ? <SummaryBadge stale={item.summaryStale} /> : null}
    </Pressable>
  );
}

/** Present only when a summary exists; amber when the transcript moved under it. */
function SummaryBadge({ stale }: { stale: boolean }) {
  return (
    <View style={[styles.badge, stale && styles.badgeStale]}>
      <View style={[styles.badgeDot, stale && styles.badgeDotStale]} />
      <Text style={[styles.badgeLabel, stale && styles.badgeLabelStale]}>
        {stale ? 'stale' : 'summary'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingVertical: 48,
    gap: space.sm,
    backgroundColor: colors.bg,
  },
  emptyContainer: {
    flexGrow: 1,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    minHeight: 72,
    paddingVertical: space.lg,
    paddingHorizontal: space.xl,
  },
  rowPressed: {
    backgroundColor: colors.pressed,
  },
  rowText: {
    flex: 1,
    gap: 6,
  },
  rowTitle: {
    fontFamily: fonts.sansSemibold,
    fontSize: 16,
    lineHeight: 21,
    letterSpacing: -0.2,
    color: colors.text,
  },
  rowMeta: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.textMuted,
  },

  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: space.xl,
  },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
  },
  badgeStale: {
    backgroundColor: colors.warningBg,
  },
  badgeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.accent,
  },
  badgeDotStale: {
    backgroundColor: colors.warning,
  },
  badgeLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 10.5,
    letterSpacing: 0.4,
    color: colors.accent,
  },
  badgeLabelStale: {
    color: colors.warning,
  },

  fabWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  fabShadow: {
    // Android draws elevation only on views that have a background.
    backgroundColor: colors.accent,
    borderRadius: 28,
    elevation: 6,
    shadowColor: '#1C1A17',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  fab: {
    minHeight: 56,
    paddingHorizontal: 28,
    borderRadius: 28,
  },
  fabDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.record,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },

  footer: {
    alignItems: 'center',
    gap: 2,
    paddingTop: 28,
    paddingHorizontal: space.xl,
  },
  footerHint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: space.md,
  },
  footerText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.textMuted,
  },
  footerButton: {
    minHeight: 40,
  },

  stateTitle: {
    fontFamily: fonts.sansSemibold,
    fontSize: 16,
    color: colors.text,
  },
  stateBody: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  stateAction: {
    marginTop: space.md,
  },
});
