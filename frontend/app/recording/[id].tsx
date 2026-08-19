import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ApiError, getRecording, type Recording } from '../../src/api';
import { formatDate, formatDuration } from '../../src/format';
import { colors, fonts, space } from '../../src/theme';

/**
 * Placeholder detail screen: enough to prove navigation and the API round-trip.
 * The editable transcript, Summarize action and summary sections land in step 6,
 * against the canvas mockup.
 */
export default function RecordingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const [recording, setRecording] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    </ScrollView>
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
});
