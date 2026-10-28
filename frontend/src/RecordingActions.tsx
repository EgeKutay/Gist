import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError, deleteRecording, renameRecording } from './api';
import { colors, fonts, minHitTarget, radius, space } from './theme';
import { Button, Sheet } from './ui';

/**
 * Rename and delete for one recording. The list opens it on long-press and
 * the meeting screen from its header, so both behave the same.
 */
export function RecordingActions({
  recording,
  visible,
  onClose,
  onRenamed,
  onDeleted,
}: {
  recording: { id: string; title: string } | null;
  visible: boolean;
  onClose: () => void;
  onRenamed: (title: string) => void;
  onDeleted: () => void;
}) {
  const [mode, setMode] = useState<'menu' | 'rename'>('menu');
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Every opening starts at the menu, not wherever the last one was left.
  useEffect(() => {
    if (visible) {
      setMode('menu');
      setError(null);
      setDraft(recording?.title ?? '');
    }
  }, [visible, recording]);

  if (!recording) {
    return null;
  }

  const trimmed = draft.trim();
  const canSave = trimmed.length > 0 && trimmed !== recording.title;

  const save = async () => {
    if (!canSave) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await renameRecording(recording.id, trimmed);
      onRenamed(updated.title);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not rename this recording.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    // The system dialog sits over the sheet, so close the sheet first.
    onClose();
    Alert.alert(
      'Delete this recording?',
      'The audio, transcript and summary are removed for good.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteRecording(recording.id);
              onDeleted();
            } catch (e) {
              Alert.alert(
                'Could not delete',
                e instanceof ApiError ? e.message : 'Something went wrong. Try again.',
              );
            }
          },
        },
      ],
    );
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      {mode === 'menu' ? (
        <View style={styles.body}>
          <Text style={styles.heading} numberOfLines={2}>
            {recording.title}
          </Text>
          <View style={styles.menu}>
            <MenuRow label="Rename" onPress={() => setMode('rename')} />
            <View style={styles.menuDivider} />
            <MenuRow label="Delete recording" destructive onPress={confirmDelete} />
          </View>
        </View>
      ) : (
        <View style={styles.body}>
          <Text style={styles.label}>Meeting name</Text>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={save}
            autoFocus
            selectTextOnFocus
            maxLength={200}
            returnKeyType="done"
            placeholder="Meeting name"
            placeholderTextColor={colors.textMuted}
          />
          {error ? <Text style={styles.errorNotice}>{error}</Text> : null}
          <View style={styles.actions}>
            <Button label="Cancel" onPress={onClose} style={styles.action} />
            <Button
              label="Save name"
              variant="primary"
              onPress={save}
              busy={saving}
              disabled={!canSave}
              style={styles.action}
            />
          </View>
        </View>
      )}
    </Sheet>
  );
}

function MenuRow({
  label,
  onPress,
  destructive = false,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      android_ripple={{ color: colors.pressed }}
      style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
    >
      <Text style={[styles.menuLabel, destructive && styles.menuLabelDestructive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: space.md,
  },
  heading: {
    fontFamily: fonts.sansSemibold,
    fontSize: 16,
    lineHeight: 21,
    color: colors.text,
    marginBottom: space.xs,
  },
  menu: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  menuRow: {
    minHeight: minHitTarget + 8,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  menuRowPressed: {
    backgroundColor: colors.pressed,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.border,
  },
  menuLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 15.5,
    color: colors.text,
  },
  menuLabelDestructive: {
    color: colors.record,
  },
  label: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  input: {
    minHeight: minHitTarget + 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: 15,
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.text,
  },
  actions: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.xs,
  },
  action: {
    flex: 1,
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
});
