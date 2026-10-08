// Delen (F-13, NF-05, B-02): QR met de link, deeltekst via het systeem-deelmenu, code kopiëren, waarschuwing,
// en "Klaar om te koppelen" zodra ≥ 1 relay de lijst bevestigde (F-14).
import { ActivityIndicator, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { useUi, useUiState } from '../../../src/ui/AppContext';
import { Button, Snackbar } from '../../../src/ui/components/basics';
import { Icon } from '../../../src/ui/components/Icon';
import { strings } from '../../../src/ui/strings.nl';
import { font, monoFont, radius, space, useTheme } from '../../../src/ui/theme';
import { useShareInfo, type ShareInfoSource } from '../../../src/ui/hooks/useShareInfo';
import type { UiStore } from '../../../src/ui/store';

function shareSource(ui: UiStore): ShareInfoSource {
  return { share: (id) => ui.actions.share(id), shareInfo: (id) => ui.app.shareInfo(id) };
}

export default function ShareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listId = String(id);
  const t = useTheme();
  const ui = useUi();
  const status = useUiState((s) => s.status[listId]);
  const message = useUiState((s) => s.message);
  // Review N3: geen effect op het (steeds nieuwe) info-object; alleen opnieuw bij een statuswijziging tot "klaar".
  const info = useShareInfo(shareSource(ui), listId, status ? `${status.kind}:${status.pending}:${status.relaysOpen}` : '');

  if (!info) {
    return (
      <View style={[styles.center, { backgroundColor: t.bg }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  const code = info.code;
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.content}>
      <Text style={[styles.intro, { color: t.text }]}>{strings.shareIntro}</Text>
      <View style={[styles.qrBox, { backgroundColor: '#FFFFFF', borderColor: t.border }]} accessibilityLabel={strings.shareTitle}>
        <QRCode value={info.link} size={232} backgroundColor="#FFFFFF" color="#000000" ecl="M" />
      </View>
      <View style={[styles.ready, { backgroundColor: info.ready ? t.accentSoft : t.surfaceAlt }]} accessibilityLiveRegion="polite">
        {info.ready ? <Icon name="check" color={t.accent} size={20} /> : <ActivityIndicator size="small" color={t.muted} />}
        <Text style={[styles.readyText, { color: info.ready ? t.accent : t.muted }]}>{info.ready ? strings.readyToJoin : strings.notYetReady}</Text>
      </View>
      <View style={{ gap: space.m }}>
        <Button label={strings.shareSend} icon="share" onPress={() => void Share.share({ message: info.text })} />
        <Button
          label={strings.copyCode}
          icon="copy"
          kind="secondary"
          onPress={() => {
            void Clipboard.setStringAsync(info.text).then(() => ui.actions.showMessage(strings.copied));
          }}
        />
      </View>
      <View style={[styles.codeBox, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Text style={[styles.codeLabel, { color: t.muted }]}>{strings.shareCodeLabel}</Text>
        <Text style={[styles.code, { color: t.text }]} selectable>
          {code}
        </Text>
      </View>
      <View style={[styles.warning, { borderColor: t.warn }]}>
        <Icon name="warning" color={t.warn} size={20} />
        <Text style={[styles.warningText, { color: t.text }]}>{strings.shareWarning}</Text>
      </View>
    </ScrollView>
      {/* D-ET-06: bevestiging "Code gekopieerd" zichtbaar op dit scherm (modal) */}
      <Snackbar message={message} onUndo={ui.actions.undo} onClose={ui.actions.dismissMessage} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: space.l, gap: space.l, paddingBottom: space.xxl * 2 },
  intro: { fontSize: font.body, lineHeight: 24 },
  qrBox: { alignSelf: 'center', padding: space.l, borderRadius: radius.l, borderWidth: StyleSheet.hairlineWidth },
  ready: { flexDirection: 'row', alignItems: 'center', gap: space.s, padding: space.m, borderRadius: radius.m },
  readyText: { fontSize: font.body - 1, fontWeight: '600', flex: 1 },
  codeBox: { borderRadius: radius.m, borderWidth: StyleSheet.hairlineWidth, padding: space.l, gap: space.xs },
  codeLabel: { fontSize: font.small, fontWeight: '600' },
  code: { fontSize: font.body, fontFamily: monoFont, letterSpacing: 0.5 },
  warning: { flexDirection: 'row', gap: space.s, borderWidth: 1, borderRadius: radius.m, padding: space.l, alignItems: 'flex-start' },
  warningText: { flex: 1, fontSize: font.body - 1, lineHeight: 22 },
});
