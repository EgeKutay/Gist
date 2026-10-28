import {
  RecordingPresets,
  type RecordingOptions,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { getDocumentAsync } from 'expo-document-picker';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError, uploadRecording } from '../../src/api';
import { ACCEPTED_LABEL, checkPickedFile, PICKER_TYPES } from '../../src/audioFormats';
import { formatDuration } from '../../src/format';
import { colors, fonts, space } from '../../src/theme';
import { Button } from '../../src/ui';

// Metering on, so the screen can show whether the microphone hears anything.
const RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

// How often the level is read; each reading becomes one bar of the meter.
const METER_INTERVAL_MS = 100;
const METER_BARS = 40;
// Input level in dBFS. Room hum on a phone sits around -50 to -60; speech
// near the phone lands around -35 to -15.
const METER_FLOOR_DB = -60;
const METER_RANGE_DB = 45;
const SOUND_DB = -42;
// Meetings have pauses, so only call out silence once it has lasted a while.
const QUIET_WARNING_MS = 5000;

type Phase = 'idle' | 'recording' | 'uploading' | 'error';

/** What goes to the server, whether it was just recorded or picked from storage. */
type AudioFile = { uri: string; name: string; mimeType: string; picked: boolean };

export default function NewRecordingScreen() {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const state = useAudioRecorderState(recorder, METER_INTERVAL_MS);
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
            accessibilityRole="button"
            accessibilityLabel="Start recording"
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
            <Button label="Upload audio file" onPress={pickFile} />
            <Text style={styles.caption}>{ACCEPTED_LABEL} · up to 110 min</Text>
          </View>
        </View>
      ) : null}

      {phase === 'recording' ? (
        <View style={styles.centered}>
          <Text style={styles.timer}>{formatDuration(state.durationMillis / 1000)}</Text>
          <VoiceMeter metering={state.metering} durationMillis={state.durationMillis} />
          <Pressable
            style={({ pressed }) => [styles.stopButton, pressed && styles.stopButtonPressed]}
            onPress={stopAndUpload}
            accessibilityRole="button"
            accessibilityLabel="Stop and upload"
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
          <Button label={pending ? 'Try again' : 'Back'} onPress={retryOrBack} />
        </View>
      ) : null}
    </View>
  );
}

function levelOf(db: number | undefined): number {
  if (db == null) {
    return 0;
  }
  return Math.min(1, Math.max(0, (db - METER_FLOOR_DB) / METER_RANGE_DB));
}

/**
 * The last few seconds of microphone level, newest bar on the right. Bars turn
 * accent when they carry sound, and a note appears after a long silence.
 */
function VoiceMeter({
  metering,
  durationMillis,
}: {
  metering: number | undefined;
  durationMillis: number;
}) {
  const [bars, setBars] = useState<{ level: number; sound: boolean }[]>(() =>
    Array.from({ length: METER_BARS }, () => ({ level: 0, sound: false })),
  );
  // Recording time of the last reading with sound in it; 0 means none yet.
  const lastSoundAt = useRef(0);

  // durationMillis is the tick: it moves on every reading, even when the
  // level repeats.
  useEffect(() => {
    const sound = metering != null && metering > SOUND_DB;
    if (sound) {
      lastSoundAt.current = durationMillis;
    }
    setBars((prev) => [...prev.slice(1), { level: levelOf(metering), sound }]);
  }, [metering, durationMillis]);

  const quiet = durationMillis - lastSoundAt.current > QUIET_WARNING_MS;

  return (
    <View style={styles.meter}>
      <View
        style={styles.meterBars}
        accessible
        accessibilityLabel={quiet ? 'No sound picked up' : 'Microphone is picking up sound'}
      >
        {bars.map((bar, i) => (
          <View
            key={i}
            style={[
              styles.meterBar,
              { height: 4 + bar.level * 52 },
              bar.sound && styles.meterBarSound,
            ]}
          />
        ))}
      </View>
      <Text style={[styles.meterStatus, quiet && styles.meterStatusQuiet]}>
        {quiet
          ? 'No sound for a while. If people are talking, check that nothing covers the microphone.'
          : 'Picking up sound'}
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
    backgroundColor: colors.pressed,
    transform: [{ scale: 0.96 }],
  },
  recordDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.record,
  },

  stopButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.record,
  },
  stopButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },

  meter: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: space.md,
  },
  meterBars: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  meterBar: {
    width: 3.5,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
  },
  meterBarSound: {
    backgroundColor: colors.accent,
  },
  meterStatus: {
    minHeight: 40,
    fontFamily: fonts.sans,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  meterStatusQuiet: {
    color: colors.warningText,
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
});
