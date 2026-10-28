import {
  RecordingPresets,
  type RecordingOptions,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { getDocumentAsync } from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, uploadRecording } from '../../src/api';
import { ACCEPTED_EXTENSIONS, checkPickedFile, PICKER_TYPES } from '../../src/audioFormats';
import { CloseIcon, PauseIcon, UploadIcon } from '../../src/icons';
import { fonts, minHitTarget, radius, shadow, space, useColors, type Palette } from '../../src/theme';
import { Button, IconButton, useReducedMotion } from '../../src/ui';

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

type Phase = 'idle' | 'recording' | 'paused' | 'uploading' | 'error';

type Styles = ReturnType<typeof makeStyles>;

const FORMATS_LINE = `${ACCEPTED_EXTENSIONS.map((ext) => ext.toUpperCase()).join(' ')} · up to 110 min`;

/** What goes to the server, whether it was just recorded or picked from storage. */
type AudioFile = { uri: string; name: string; mimeType: string; picked: boolean };

export default function NewRecordingScreen() {
  const { pick } = useLocalSearchParams<{ pick?: string }>();
  const insets = useSafeAreaInsets();
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
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

  // Resuming appends to the same file, so the break never reaches the upload.
  const pause = () => {
    recorder.pause();
    setPhase('paused');
  };

  const resume = () => {
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

  // Home's "Upload audio file" lands here with ?pick=1 so both entry points
  // share one upload flow; open the picker straight away.
  useEffect(() => {
    if (pick === '1') {
      pickFile();
    }
    // Once, on arrival -- not again if the screen re-renders.
  }, []);

  const paused = phase === 'paused';
  // Recording or paused: a take is in progress either way.
  const live = phase === 'recording' || paused;

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom + 32 }]}>
      <View style={styles.topBar}>
        <IconButton onPress={() => router.back()} accessibilityLabel="Close">
          <CloseIcon size={22} color={c.text} />
        </IconButton>
        <Text style={styles.topTitle} accessibilityRole="header">
          New recording
        </Text>
        <View style={styles.topSpacer} />
      </View>

      {phase === 'idle' || live ? (
        <>
          <View style={styles.centered}>
            <View style={styles.clock}>
              <Text style={styles.timer}>{formatClock(state.durationMillis)}</Text>
              <Text style={styles.stateLabel}>
                {paused ? 'Paused' : live ? 'Recording' : 'Standby'}
              </Text>
            </View>

            {live ? (
              <VoiceMeter
                styles={styles}
                paused={paused}
                metering={state.metering}
                durationMillis={state.durationMillis}
              />
            ) : (
              <View style={styles.meter}>
                <View style={styles.meterArea}>
                  <View style={styles.idleLine} />
                </View>
                <View style={styles.meterStatusSpace} />
              </View>
            )}

            <View style={styles.controls}>
              <View style={styles.sideSlot}>
                {live ? (
                  <Pressable
                    style={({ pressed }) => [styles.pauseButton, pressed && styles.pauseButtonPressed]}
                    onPress={paused ? resume : pause}
                    accessibilityRole="button"
                    accessibilityLabel={paused ? 'Resume recording' : 'Pause recording'}
                  >
                    {paused ? (
                      <View style={styles.resumeDot} />
                    ) : (
                      <PauseIcon size={22} color={c.text} />
                    )}
                  </Pressable>
                ) : null}
              </View>
              <RecordButton
                styles={styles}
                recording={live}
                onPress={live ? stopAndUpload : start}
              />
              <View style={styles.sideSlot} />
            </View>
          </View>

          <View style={styles.bottom}>
            {live ? null : (
              <Button
                label="Upload audio file instead"
                pill
                onPress={pickFile}
                leading={<UploadIcon size={18} color={c.text} />}
                contentStyle={styles.uploadPill}
              />
            )}
            <Text style={styles.formats}>{FORMATS_LINE}</Text>
          </View>
        </>
      ) : null}

      {phase === 'uploading' ? (
        <View style={styles.centered}>
          <ActivityIndicator color={c.accent} size="large" />
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
          <Button label={pending ? 'Try again' : 'Back'} pill onPress={retryOrBack} />
        </View>
      ) : null}
    </View>
  );
}

/** "00:00", growing to "75:00" past the hour -- the recorder's big mono clock. */
function formatClock(millis: number): string {
  const total = Math.floor(millis / 1000);
  const minutes = Math.floor(total / 60);
  return `${String(minutes).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * The 112 px button. Its red disc folds into a rounded square while
 * recording, which is the stop control.
 */
function RecordButton({
  styles,
  recording,
  onPress,
}: {
  styles: Styles;
  recording: boolean;
  onPress: () => void;
}) {
  const reduce = useReducedMotion();
  const morph = useRef(new Animated.Value(recording ? 1 : 0)).current;

  useEffect(() => {
    const toValue = recording ? 1 : 0;
    if (reduce) {
      morph.setValue(toValue);
      return;
    }
    // Size and corner radius are layout props, which the native driver can't animate.
    Animated.timing(morph, {
      toValue,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [recording, reduce, morph]);

  const size = morph.interpolate({ inputRange: [0, 1], outputRange: [84, 36] });
  const corner = morph.interpolate({ inputRange: [0, 1], outputRange: [42, 8] });

  return (
    <Pressable
      style={({ pressed }) => [styles.recordButton, pressed && styles.recordButtonPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={recording ? 'Stop and upload' : 'Start recording'}
    >
      <Animated.View
        style={[styles.recordDisc, { width: size, height: size, borderRadius: corner }]}
      />
    </Pressable>
  );
}

function levelOf(db: number | undefined): number {
  if (db == null) {
    return 0;
  }
  return Math.min(1, Math.max(0, (db - METER_FLOOR_DB) / METER_RANGE_DB));
}

/**
 * The last few seconds of microphone level, newest bar on the right. Bars
 * darken when they carry sound, and a note appears after a long silence.
 */
function VoiceMeter({
  styles,
  paused,
  metering,
  durationMillis,
}: {
  styles: Styles;
  paused: boolean;
  metering: number | undefined;
  durationMillis: number;
}) {
  const [bars, setBars] = useState<{ level: number; sound: boolean }[]>(() =>
    Array.from({ length: METER_BARS }, () => ({ level: 0, sound: false })),
  );
  // Recording time of the last reading with sound in it; 0 means none yet.
  const lastSoundAt = useRef(0);

  // durationMillis is the tick: it moves on every reading, even when the
  // level repeats. While paused the bars hold still -- nothing is being kept.
  useEffect(() => {
    if (paused) {
      return;
    }
    const sound = metering != null && metering > SOUND_DB;
    if (sound) {
      lastSoundAt.current = durationMillis;
    }
    setBars((prev) => [...prev.slice(1), { level: levelOf(metering), sound }]);
  }, [paused, metering, durationMillis]);

  const quiet = !paused && durationMillis - lastSoundAt.current > QUIET_WARNING_MS;

  return (
    <View style={styles.meter}>
      <View
        accessible
        accessibilityLabel={
          paused ? 'Paused' : quiet ? 'No sound picked up' : 'Microphone is picking up sound'
        }
        style={[styles.meterArea, paused && styles.meterPaused]}
      >
        {bars.map((bar, i) => (
          <View
            key={i}
            style={[
              styles.meterBar,
              { height: 2 + bar.level * 38 },
              bar.sound && styles.meterBarSound,
            ]}
          />
        ))}
      </View>
      <Text style={[styles.meterStatus, quiet && styles.meterStatusQuiet]}>
        {paused
          ? 'Paused. Nothing is recorded until you resume.'
          : quiet
          ? 'No sound for a while. If people are talking, check that nothing covers the microphone.'
          : 'Picking up sound'}
      </Text>
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: c.bg,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: space.sm,
      paddingTop: space.sm,
    },
    topTitle: {
      fontFamily: fonts.sansMedium,
      fontSize: 15,
      color: c.chipText,
    },
    topSpacer: {
      width: minHitTarget,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 28,
      paddingHorizontal: 36,
    },

    clock: {
      alignItems: 'center',
      gap: space.xs,
    },
    timer: {
      fontFamily: fonts.mono,
      fontSize: 72,
      lineHeight: 80,
      letterSpacing: -2,
      color: c.text,
    },
    stateLabel: {
      fontFamily: fonts.mono,
      fontSize: 12,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: c.textSecondary,
    },

    meter: {
      alignSelf: 'stretch',
      alignItems: 'center',
      gap: space.sm,
    },
    meterArea: {
      alignSelf: 'stretch',
      height: 40,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
    },
    idleLine: {
      flex: 1,
      height: 2,
      borderRadius: 1,
      backgroundColor: c.borderStrong,
    },
    meterBar: {
      width: 3.5,
      borderRadius: 2,
      backgroundColor: c.borderStrong,
    },
    meterBarSound: {
      backgroundColor: c.text,
    },
    meterStatus: {
      minHeight: 40,
      fontFamily: fonts.sans,
      fontSize: 13.5,
      lineHeight: 20,
      color: c.textSecondary,
      textAlign: 'center',
    },
    // As tall as the status line under the bars, so starting a recording doesn't move the button.
    meterStatusSpace: {
      height: 40,
    },
    meterPaused: {
      opacity: 0.4,
    },
    meterStatusQuiet: {
      color: c.warningText,
    },

    controls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 28,
    },
    // Equal slots either side keep the record button centred.
    sideSlot: {
      width: 56,
      height: 56,
    },
    pauseButton: {
      width: 56,
      height: 56,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.borderStrong,
    },
    pauseButtonPressed: {
      backgroundColor: c.pressed,
    },
    resumeDot: {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: c.record,
    },
    recordButton: {
      width: 112,
      height: 112,
      borderRadius: 56,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.recordButtonFill,
      borderWidth: 2,
      borderColor: c.recordRingStrong,
      ...shadow('recordButton', c),
    },
    recordButtonPressed: {
      transform: [{ scale: 0.96 }],
    },
    recordDisc: {
      backgroundColor: c.record,
    },

    bottom: {
      paddingHorizontal: space.lg,
      gap: space.md,
    },
    uploadPill: {
      backgroundColor: c.recorderUploadFill,
    },
    formats: {
      fontFamily: fonts.mono,
      fontSize: 11,
      color: c.textSecondary,
      textAlign: 'center',
    },

    hint: {
      fontFamily: fonts.sans,
      fontSize: 14.5,
      color: c.textSecondary,
    },
    fileName: {
      fontFamily: fonts.sansMedium,
      fontSize: 15,
      color: c.text,
      textAlign: 'center',
    },
    errorTitle: {
      fontFamily: fonts.sansSemibold,
      fontSize: 16,
      color: c.text,
    },
    errorBody: {
      fontFamily: fonts.sans,
      fontSize: 14,
      lineHeight: 20,
      color: c.textSecondary,
      textAlign: 'center',
    },
  });
}
