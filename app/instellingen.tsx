// Instellingen (F-19, NF-02/NF-06-uitleg): relays toevoegen/verwijderen (minstens één, alleen wss://), privacy.
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useUi } from '../src/ui/AppContext';
import { Button, IconButton } from '../src/ui/components/basics';
import { DEFAULT_CONFIG } from '../src/config';
import { strings } from '../src/ui/strings.nl';
import { font, radius, space, touch, useTheme } from '../src/ui/theme';
import { PRIVACY_URL, SOURCE_URL, SUPPORT_URL } from '../src/ui/links';
import { Icon } from '../src/ui/components/Icon';

const VALID = /^wss:\/\/[^\s/]+(\/[^\s]*)?$/;

export default function SettingsScreen() {
  const t = useTheme();
  const ui = useUi();
  const router = useRouter();
  const [relays, setRelays] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void ui.app.relays().then(setRelays);
  }, [ui]);

  const apply = async (next: string[]) => {
    if (next.length === 0) {
      setError(strings.relayMinimum);
      return;
    }
    try {
      await ui.app.setRelays(next);
      setRelays(await ui.app.relays());
      setError(null);
    } catch {
      setError(strings.relayInvalid);
    }
  };

  const add = () => {
    const url = draft.trim();
    if (!VALID.test(url)) {
      setError(strings.relayInvalid);
      return;
    }
    setDraft('');
    void apply([...relays.filter((r) => r !== url), url]);
  };

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={[styles.h, { color: t.text }]} accessibilityRole="header">
        {strings.relaysTitle}
      </Text>
      <Text style={[styles.p, { color: t.muted }]}>{strings.relaysIntro}</Text>
      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        {relays.map((r, i) => (
          <View key={r} style={[styles.relayRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }]}>
            <Text style={[styles.relay, { color: t.text }]} numberOfLines={1}>
              {r}
            </Text>
            <IconButton icon="trash" label={strings.removeRelay(r)} color={t.danger} onPress={() => void apply(relays.filter((x) => x !== r))} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: space.s }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={strings.relayPlaceholder}
          placeholderTextColor={t.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onSubmitEditing={add}
          accessibilityLabel={strings.relayInputLabel}
          style={[styles.input, { color: t.text, backgroundColor: t.surface, borderColor: t.border }]}
        />
        <Button label={strings.addRelay} onPress={add} disabled={!draft.trim()} />
      </View>
      {error ? <Text style={[styles.error, { color: t.danger }]}>{error}</Text> : null}
      <Button label={strings.resetRelays} kind="ghost" onPress={() => void apply([...DEFAULT_CONFIG.defaultRelays])} />

      <Text style={[styles.h, { color: t.text }]} accessibilityRole="header">
        {strings.privacyTitle}
      </Text>
      <Text style={[styles.p, { color: t.text }]}>{strings.privacyBody}</Text>
      <Text style={[styles.p, { color: t.text }]}>{strings.shareWarning}</Text>

      <Text style={[styles.h, { color: t.text }]} accessibilityRole="header">
        {strings.aboutTitle}
      </Text>
      <Text style={[styles.p, { color: t.muted }]}>{strings.aboutBody}</Text>
      {/* ST-07: privacybeleid, support en licenties */}
      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        {[
          { label: strings.privacyPolicy, hint: strings.opensInBrowser, onPress: () => void Linking.openURL(PRIVACY_URL) },
          { label: strings.support, hint: strings.opensInBrowser, onPress: () => void Linking.openURL(SUPPORT_URL) },
          { label: strings.sourceCode, hint: strings.opensInBrowser, onPress: () => void Linking.openURL(SOURCE_URL) },
          { label: strings.openSourceLicenses, hint: undefined, onPress: () => router.push('/licenties') },
        ].map((l, i) => (
          <Pressable
            key={l.label}
            onPress={l.onPress}
            accessibilityRole={l.hint ? 'link' : 'button'}
            accessibilityLabel={l.label}
            accessibilityHint={l.hint}
            style={({ pressed }) => [styles.linkRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.relay, { color: t.text }]}>{l.label}</Text>
            <Icon name="chevron" color={t.muted} size={18} />
          </Pressable>
        ))}
      </View>
      <Text style={[styles.p, { color: t.muted }]}>{strings.version(Constants.expoConfig?.version ?? '')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.l, gap: space.m, paddingBottom: space.xxl * 2 },
  h: { fontSize: font.large, fontWeight: '700', marginTop: space.l },
  p: { fontSize: font.body - 1, lineHeight: 23 },
  card: { borderRadius: radius.m, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  relayRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.l, minHeight: touch.row },
  relay: { flex: 1, fontSize: font.body - 1 },
  linkRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.l, minHeight: touch.row },
  input: { flex: 1, minHeight: touch.min, borderRadius: radius.m, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.l, fontSize: font.body - 1 },
  error: { fontSize: font.body - 1 },
});
