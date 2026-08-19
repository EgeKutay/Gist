import { Link, useFocusEffect } from 'expo-router';
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
import { ApiError, listRecordings, type RecordingListItem } from '../src/api';
import { formatDate, formatDuration } from '../src/format';
import { colors, fonts, minHitTarget, radius, space } from '../src/theme';

export default function RecordingsScreen() {
  const [items, setItems] = useState<RecordingListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
        <Text style={styles.errorTitle}>Can't load recordings</Text>
        <Text style={styles.errorBody}>{error}</Text>
        <Pressable
          style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
          onPress={() => load()}
        >
          <Text style={styles.retryLabel}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      data={items ?? []}
      keyExtractor={(item) => item.id}
      style={styles.list}
      contentContainerStyle={(items ?? []).length === 0 && styles.emptyContainer}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load(true)}
          tintColor={colors.accent}
        />
      }
      ItemSeparatorComponent={() => <View style={styles.divider} />}
      ListEmptyComponent={
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No recordings yet</Text>
          <Text style={styles.emptyBody}>
            Recordings you make will be transcribed and listed here.
          </Text>
        </View>
      }
      renderItem={({ item }) => <RecordingRow item={item} />}
    />
  );
}

function RecordingRow({ item }: { item: RecordingListItem }) {
  return (
    <Link href={`/recording/${item.id}`} asChild>
      <Pressable style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
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
    </Link>
  );
}

/** Present only when a summary exists; amber when the transcript moved under it. */
function SummaryBadge({ stale }: { stale: boolean }) {
  return (
    <View style={[styles.badge, stale && styles.badgeStale]}>
      <Text style={[styles.badgeLabel, stale && styles.badgeLabelStale]}>
        {stale ? 'stale' : 'summary'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    backgroundColor: colors.bg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    gap: space.sm,
  },
  emptyContainer: {
    flexGrow: 1,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: minHitTarget + 20,
    paddingVertical: 15,
    paddingHorizontal: space.xl,
  },
  rowPressed: {
    backgroundColor: '#F4F1EC',
  },
  rowText: {
    flex: 1,
    gap: 4,
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
    fontSize: 11.5,
    color: colors.textMuted,
  },

  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: space.xl,
  },

  badge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: '#EEF2F8',
  },
  badgeStale: {
    backgroundColor: colors.warningBg,
  },
  badgeLabel: {
    fontFamily: fonts.monoMedium,
    fontSize: 10,
    letterSpacing: 0.4,
    color: colors.accent,
  },
  badgeLabelStale: {
    color: colors.warning,
  },

  emptyTitle: {
    fontFamily: fonts.sansSemibold,
    fontSize: 16,
    color: colors.text,
  },
  emptyBody: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  errorTitle: {
    fontFamily: fonts.sansSemibold,
    fontSize: 16,
    color: colors.text,
  },
  errorBody: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  retry: {
    marginTop: space.md,
    minHeight: minHitTarget,
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  retryPressed: {
    backgroundColor: '#F4F1EC',
  },
  retryLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 14.5,
    color: colors.textBody,
  },
});
