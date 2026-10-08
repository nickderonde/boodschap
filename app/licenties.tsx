// ST-07: open-source licenties van alle productie-dependencies (gegenereerd door scripts/gen-licenses.mjs).
import { useMemo } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { LICENSE_ENTRIES, LICENSE_TEXTS } from '../src/ui/licenses.generated';
import { strings } from '../src/ui/strings.nl';
import { font, space, useTheme } from '../src/ui/theme';

type Row = { key: string; title: string; sub: string; body?: string };

export default function LicensesScreen() {
  const t = useTheme();
  const sections = useMemo(
    () => [
      {
        title: strings.licensesTitle,
        data: LICENSE_ENTRIES.map((e): Row => ({ key: `${e.n}@${e.v}`, title: `${e.n} ${e.v}`, sub: e.l, body: [...e.c, ...(e.notice ? [`NOTICE:\n${e.notice}`] : [])].join('\n') || undefined })),
      },
      { title: strings.licenseTextsTitle, data: Object.entries(LICENSE_TEXTS).map(([id, text]): Row => ({ key: `text-${id}`, title: id, sub: '', body: text })) },
    ],
    [],
  );
  return (
    <SectionList
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={styles.content}
      sections={sections}
      keyExtractor={(r) => r.key}
      initialNumToRender={30}
      ListHeaderComponent={<Text style={[styles.p, { color: t.muted }]}>{strings.licensesIntro(LICENSE_ENTRIES.length)}</Text>}
      renderSectionHeader={({ section }) => (
        <Text style={[styles.h, { color: t.text, backgroundColor: t.bg }]} accessibilityRole="header">
          {section.title}
        </Text>
      )}
      renderItem={({ item }) => (
        <View style={[styles.row, { borderBottomColor: t.border }]}>
          <Text style={[styles.title, { color: t.text }]}>{item.title}</Text>
          {item.sub ? <Text style={[styles.sub, { color: t.muted }]}>{item.sub}</Text> : null}
          {item.body ? <Text style={[styles.body, { color: t.muted }]}>{item.body}</Text> : null}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: space.l, paddingBottom: space.xxl * 2 },
  h: { fontSize: font.large, fontWeight: '700', paddingVertical: space.m },
  p: { fontSize: font.body - 1, lineHeight: 23, marginBottom: space.m },
  row: { paddingVertical: space.s, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: font.body - 1, fontWeight: '600' },
  sub: { fontSize: font.small },
  body: { fontSize: font.small, marginTop: 2 },
});
