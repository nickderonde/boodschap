// Koppelen (F-14, F-15, UX-06, UX-11): QR scannen in de app (camera pas hier gevraagd) of code plakken.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import { useUi } from '../src/ui/AppContext';
import { Button } from '../src/ui/components/basics';
import { Icon } from '../src/ui/components/Icon';
import { takePendingJoin } from '../src/ui/pendingJoin';
import { clearShareCodeFromClipboard } from '../src/ui/clipboard';
import { createScanGate } from '../src/ui/scanGate';
import { wallClock } from '../src/ui/platform/timers';
import { strings } from '../src/ui/strings.nl';
import { font, radius, space, touch, useTheme } from '../src/ui/theme';

type Tab = 'scan' | 'paste';

export default function JoinScreen() {
  const t = useTheme();
  const ui = useUi();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('scan');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const gate = useMemo(() => createScanGate(wallClock, 2000), []);

  useEffect(() => {
    const pending = takePendingJoin();
    if (pending) {
      setTab('paste');
      setText(pending);
    }
  }, []);

  const join = async (input: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await ui.actions.join(input);
    setBusy(false);
    if (r.kind === 'error') {
      setError(strings.joinErrors[r.code]);
      gate.failed(); // review K-4: pas na 2 s weer scannen
      return;
    }
    gate.release();
    // Review K-1: de deelcode is een geheim; niet op het klembord laten staan.
    void clearShareCodeFromClipboard(Clipboard);
    if (r.kind === 'already-present') ui.actions.showMessage(strings.alreadyPresent);
    router.replace(`/lijst/${r.listId}`);
  };

  const segment = (key: Tab, label: string) => (
    <Pressable
      onPress={() => {
        setTab(key);
        setError(null);
      }}
      accessibilityRole="tab"
      accessibilityState={{ selected: tab === key }}
      accessibilityLabel={label}
      style={[styles.segment, { backgroundColor: tab === key ? t.surface : 'transparent' }]}
    >
      <Text style={[styles.segmentText, { color: tab === key ? t.text : t.muted }]}>{label}</Text>
    </Pressable>
  );

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={[styles.segments, { backgroundColor: t.surfaceAlt }]} accessibilityRole="tablist">
        {segment('scan', strings.scanTab)}
        {segment('paste', strings.pasteTab)}
      </View>

      {tab === 'scan' ? (
        !permission ? (
          <ActivityIndicator color={t.accent} />
        ) : permission.granted ? (
          <View style={{ gap: space.m }}>
            <View style={[styles.camera, { borderColor: t.border }]}>
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={({ data }) => {
                  if (!gate.tryAcquire()) return;
                  void join(data);
                }}
              />
            </View>
            <Text style={[styles.hint, { color: t.muted }]}>{strings.scanHint}</Text>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: t.surface }]}>
            <Icon name="scan" color={t.accent} size={32} />
            <Text style={[styles.cardText, { color: t.text }]}>{permission.canAskAgain ? strings.cameraNeeded : strings.cameraDenied}</Text>
            {permission.canAskAgain ? <Button label={strings.allowCamera} onPress={() => void requestPermission()} /> : null}
            <Button label={strings.usePaste} kind="secondary" icon="paste" onPress={() => setTab('paste')} />
          </View>
        )
      ) : (
        <View style={{ gap: space.m }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={strings.pastePlaceholder}
            placeholderTextColor={t.muted}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel={strings.pastePlaceholder}
            style={[styles.paste, { color: t.text, backgroundColor: t.surface, borderColor: t.border }]}
          />
          <View style={{ flexDirection: 'row', gap: space.m }}>
            <Button
              label={strings.pasteFromClipboard}
              icon="paste"
              kind="secondary"
              onPress={() => void Clipboard.getStringAsync().then((s) => setText(s))}
              style={{ flex: 1 }}
            />
            <Button label={busy ? strings.joining : strings.join} onPress={() => void join(text)} disabled={!text.trim() || busy} style={{ flex: 1 }} />
          </View>
        </View>
      )}

      {error ? (
        <View style={[styles.error, { borderColor: t.danger }]} accessibilityRole="alert">
          <Icon name="warning" color={t.danger} size={20} />
          <Text style={[styles.errorText, { color: t.text }]}>{error}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.l, gap: space.l, paddingBottom: space.xxl * 2 },
  segments: { flexDirection: 'row', borderRadius: radius.m, padding: 4 },
  segment: { flex: 1, minHeight: touch.min - 4, borderRadius: radius.s, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: font.body - 1, fontWeight: '600' },
  camera: { height: 320, borderRadius: radius.l, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  hint: { fontSize: font.body - 1, textAlign: 'center' },
  card: { borderRadius: radius.l, padding: space.xl, gap: space.l, alignItems: 'stretch' },
  cardText: { fontSize: font.body, lineHeight: 24 },
  paste: { minHeight: 140, borderRadius: radius.m, borderWidth: StyleSheet.hairlineWidth, padding: space.l, fontSize: font.body, textAlignVertical: 'top' },
  error: { flexDirection: 'row', gap: space.s, borderWidth: 1, borderRadius: radius.m, padding: space.l, alignItems: 'flex-start' },
  errorText: { flex: 1, fontSize: font.body - 1, lineHeight: 22 },
});
