// Basiscomponenten: knoppen, lege toestand, sync-balk en snackbar.
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { SyncStatus } from '../../sync/engine/status';
import { statusText, type StatusTone } from '../statusText';
import { font, radius, space, touch, useTheme, type Theme } from '../theme';
import { strings } from '../strings.nl';
import { Icon, type IconName } from './Icon';
import type { Message } from '../store';

export function Button({
  label, onPress, icon, kind = 'primary', disabled, style, accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.accent : kind === 'secondary' ? t.surfaceAlt : 'transparent';
  const fg = kind === 'primary' ? t.accentText : kind === 'danger' ? t.danger : kind === 'ghost' ? t.accent : t.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.75 : 1, borderColor: kind === 'danger' ? t.danger : 'transparent' },
        kind === 'danger' && { borderWidth: 1 },
        style,
      ]}
    >
      {icon ? <Icon name={icon} color={fg} size={20} /> : null}
      <Text style={[styles.buttonText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, color }: { icon: IconName; onPress: () => void; label: string; color?: string }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.6 : 1 }]}>
      <Icon name={icon} color={color ?? t.text} size={24} />
    </Pressable>
  );
}

export function EmptyState({ title, body, icon, children }: { title: string; body: string; icon?: IconName; children?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.empty} accessibilityRole="summary">
      <View style={[styles.emptyIcon, { backgroundColor: t.accentSoft }]}>
        <Icon name={icon ?? 'list'} color={t.accent} size={30} />
      </View>
      <Text style={[styles.emptyTitle, { color: t.text }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: t.muted }]}>{body}</Text>
      {children}
    </View>
  );
}

function toneColor(t: Theme, tone: StatusTone): string {
  return tone === 'ok' ? t.ok : tone === 'error' ? t.danger : tone === 'warn' ? t.warn : t.muted;
}

/** Altijd zichtbare sync-indicator (UX-02): tekst én icoon. */
export function SyncBar({ status }: { status: SyncStatus }) {
  const t = useTheme();
  const d = statusText(status);
  const c = toneColor(t, d.tone);
  return (
    <View style={[styles.syncBar, { backgroundColor: t.surface, borderBottomColor: t.border }]} accessibilityRole="text" accessibilityLiveRegion="polite" accessibilityLabel={d.sub ? `${d.text}. ${d.sub}` : d.text}>
      {d.tone === 'busy' ? <ActivityIndicator size="small" color={c} /> : <Icon name={d.icon} color={c} size={18} />}
      <View style={{ flex: 1 }}>
        <Text style={[styles.syncText, { color: d.tone === 'neutral' ? t.muted : c }]} numberOfLines={1}>
          {d.text}
        </Text>
        {d.sub ? (
          <Text style={[styles.syncSub, { color: t.muted }]} numberOfLines={2}>
            {d.sub}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Snackbar met optioneel "Ongedaan maken" (F-07, UX-07). */
export function Snackbar({ message, onUndo, onClose }: { message: Message | null; onUndo: () => void; onClose: () => void }) {
  const t = useTheme();
  if (!message) return null;
  const bg = t.dark ? '#F1F1EF' : '#1B1C1E';
  const fg = t.dark ? '#111214' : '#FFFFFF';
  return (
    <View style={[styles.snack, { backgroundColor: message.tone === 'error' ? t.danger : bg }]} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <Text style={[styles.snackText, { color: message.tone === 'error' ? '#FFFFFF' : fg }]} numberOfLines={3}>
        {message.text}
      </Text>
      {message.undo ? (
        <Pressable onPress={onUndo} accessibilityRole="button" accessibilityLabel={strings.undo} style={styles.snackAction}>
          <Text style={[styles.snackActionText, { color: message.tone === 'error' ? '#FFFFFF' : t.dark ? t.accentText : '#7CE0B0' }]}>{strings.undo}</Text>
        </Pressable>
      ) : (
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={strings.done} style={styles.snackAction}>
          <Icon name="close" color={message.tone === 'error' ? '#FFFFFF' : fg} size={20} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: touch.min, paddingHorizontal: space.l, borderRadius: radius.m, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s },
  buttonText: { fontSize: font.body, fontWeight: '600' },
  iconButton: { width: touch.min, height: touch.min, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: space.xxl, paddingVertical: space.xxl * 1.5, gap: space.m },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: space.s },
  emptyTitle: { fontSize: font.large, fontWeight: '700', textAlign: 'center' },
  emptyBody: { fontSize: font.body, textAlign: 'center', lineHeight: 24 },
  syncBar: { flexDirection: 'row', alignItems: 'center', gap: space.s, paddingHorizontal: space.l, paddingVertical: space.s + 2, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 40 },
  syncText: { fontSize: font.small + 1, fontWeight: '600' },
  syncSub: { fontSize: font.small, marginTop: 2 },
  snack: { position: 'absolute', left: space.m, right: space.m, bottom: space.m, borderRadius: radius.m, paddingLeft: space.l, flexDirection: 'row', alignItems: 'center', minHeight: 52, elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  snackText: { flex: 1, fontSize: font.body - 1, paddingVertical: space.m },
  snackAction: { minHeight: touch.min, minWidth: touch.min, paddingHorizontal: space.l, alignItems: 'center', justifyContent: 'center' },
  snackActionText: { fontSize: font.body - 1, fontWeight: '700' },
});
