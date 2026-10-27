import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { getDocumentAsync } from 'expo-document-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError, uploadRecording } from '../../src/api';
import { ACCEPTED_LABEL, checkPickedFile, PICKER_TYPES } from '../../src/audioFormats';
import { formatDuration } from '../../src/format';
import { colors, fonts, minHitTarget, radius, space } from '../../src/theme';

type Phase = 'idle' | 'recording' | 'uploading' | 'error';

/** What goes to the server, whether it was just recorded or picked from storage. */
type AudioFile = { uri: string; name: string; mimeType: string; picked: boolean };

export default function NewRecordingScreen() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  // The last file sent, so "Try again" retries whichever source failed.
  const [pending, setPending] = useState<AudioFile | null>(null);

  const fail = (message: string) => {
    setError(message);
    setPhase('error');
  };

  const upload = async (file: AudioFile) => {
    setPending(file);
    setPhase('uploading');
    try {
      const recording = await uploadRecording(file.uri, file.name, file.mimeType);
      router.replace(`/recording/${recording.id}`);
    } catch (e) {
      fail(e instanceof ApiError ? e.message : 'Could not upload the recording.');
    }
  };

  const pickFile = async () => {
    const result = await getDocumentAsync({
      type: PICKER_TYPES,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || result.assets.length === 0) {
      return;
    }
    const asset = result.assets[0];
    const problem = checkPickedFile(asset.name, asset.size);
    if (problem) {
      setPending(null);
      fail(problem);
      return;
    }
    await upload({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? 'application/octet-stream',
      picked: true,
    });
  };

  const start = async () => {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setPending(null);
      fail('Microphone permission is required to record.');
      return;
    }
    await recorder.prepareToRecordAsync();
    recorder.record();
    setPhase('recording');
  };

  const stopAndUpload = async () => {
    await recorder.stop();
    const uri = recorder.uri;
    if (!uri) {
      setPending(null);
      fail('No recording was captured.');
      return;
    }
    await upload({
      uri,
      name: `recording-${Date.now()}.m4a`,
      mimeType: 'audio/m4a',
      picked: false,
    });
  };

  const retryOrBack = async () => {
    if (!pending) {
      // Nothing to resend (permission denied, unsupported file) -- back to idle.
      setPhase('idle');
      setError(null);
      return;
    }
    await upload(pending);
  };

  return (
    <View style={styles.screen}>
      {phase === 'idle' ? (
        <View style={styles.centered}>
          <Pressable
            style={({ pressed }) => [styles.recordButton, pressed && styles.recordButtonPressed]}
            onPress={start}
          >
            <View style={styles.recordDot} />
          </Pressable>
          <Text style={styles.hint}>Tap to start recording</Text>

          <View style={styles.orRow}>
            <View style={styles.orLine} />
            <Text style={styles.orLabel}>or</Text>
            <View style={styles.orLine} />
          </View>

          <View style={styles.uploadGroup}>
            <Pressable
              style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
              onPress={pickFile}
            >
              <Text style={styles.retryLabel}>Upload audio file</Text>
            </Pressable>
            <Text style={styles.caption}>{ACCEPTED_LABEL} · up to 110 min</Text>
          </View>
        </View>
      ) : null}

      {phase === 'recording' ? (
        <View style={styles.centered}>
          <Text style={styles.timer}>{formatDuration(state.durationMillis / 1000)}</Text>
          <Pressable
            style={({ pressed }) => [styles.stopButton, pressed && styles.stopButtonPressed]}
            onPress={stopAndUpload}
          >
            <View style={styles.stopSquare} />
          </Pressable>
          <Text style={styles.hint}>Tap to stop</Text>
        </View>
      ) : null}

      {phase === 'uploading' ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} size="large" />
          {pending?.picked ? (
            <Text style={styles.fileName} numberOfLines={2}>
              {pending.name}
            </Text>
          ) : null}
          <Text style={styles.hint}>Uploading and transcribing…</Text>
        </View>
      ) : null}

      {phase === 'error' ? (
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <Pressable
            style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
            onPress={retryOrBack}
          >
            <Text style={styles.retryLabel}>{pending ? 'Try again' : 'Back'}</Text>
          </Pressable>
        </View>
      ) : null}
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
    gap: space.xl,
    paddingHorizontal: 36,
  },

  recordButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  recordButtonPressed: {
    backgroundColor: '#F4F1EC',
  },
  recordDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#C0392B',
  },

  stopButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#C0392B',
  },
  stopButtonPressed: {
    opacity: 0.85,
  },
  stopSquare: {
    width: 26,
    height: 26,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },

  timer: {
    fontFamily: fonts.mono,
    fontSize: 34,
    letterSpacing: 0.5,
    color: colors.text,
  },
  hint: {
    fontFamily: fonts.sans,
    fontSize: 14.5,
    color: colors.textSecondary,
  },

  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    alignSelf: 'stretch',
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  orLabel: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.textMuted,
  },
  uploadGroup: {
    alignItems: 'center',
    gap: space.sm,
  },
  caption: {
    fontFamily: fonts.mono,
    fontSize: 11.5,
    color: colors.textMuted,
    textAlign: 'center',
  },
  fileName: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.text,
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
