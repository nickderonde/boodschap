// Snel achter elkaar invoeren (UX-03): het veld blijft gefocust en leeg na toevoegen; suggesties tijdens typen (F-11).
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { CategoryId } from '../../core/types';
import type { Suggestion } from '../../core/suggest';
import { strings } from '../strings.nl';
import { font, radius, space, touch, useTheme } from '../theme';
import { Icon } from './Icon';

export function AddBar({ suggest, onAdd, bottomInset }: {
  suggest: (prefix: string) => Suggestion[];
  onAdd: (text: string, extra?: { category?: CategoryId; unit?: string | null }) => void;
  bottomInset: number;
}) {
  const t = useTheme();
  const [text, setText] = useState('');
  const input = useRef<TextInput>(null);
  const suggestions = useMemo(() => (text.trim() ? suggest(text.trim()) : []), [text, suggest]);

  const submit = () => {
    const v = text.trim();
    if (!v) return;
    onAdd(v);
    setText('');
    input.current?.focus();
  };

  return (
    <View style={[styles.wrap, { backgroundColor: t.surface, borderTopColor: t.border, paddingBottom: Math.max(bottomInset, space.s) }]}>
      {suggestions.length > 0 ? (
        <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {suggestions.map((s) => (
            <Pressable
              key={`${s.source}:${s.name}`}
              onPress={() => {
                onAdd(s.name, { category: s.category as CategoryId, unit: s.unit });
                setText('');
                input.current?.focus();
              }}
              accessibilityRole="button"
              accessibilityLabel={strings.suggestionLabel(s.name)}
              style={({ pressed }) => [styles.chip, { backgroundColor: s.source === 'historie' ? t.accentSoft : t.surfaceAlt, opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[styles.chipText, { color: t.text }]} numberOfLines={1}>
                {s.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.inputRow}>
        <TextInput
          ref={input}
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          submitBehavior="submit"
          blurOnSubmit={false}
          returnKeyType="done"
          returnKeyLabel={strings.add}
          placeholder={strings.addPlaceholder}
          placeholderTextColor={t.muted}
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel={strings.addPlaceholder}
          style={[styles.input, { color: t.text, backgroundColor: t.surfaceAlt }]}
          maxLength={100}
        />
        <Pressable
          onPress={submit}
          accessibilityRole="button"
          accessibilityLabel={strings.add}
          disabled={!text.trim()}
          style={({ pressed }) => [styles.addButton, { backgroundColor: t.accent, opacity: !text.trim() ? 0.4 : pressed ? 0.7 : 1 }]}
        >
          <Icon name="plus" color={t.accentText} size={26} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.s },
  chips: { paddingHorizontal: space.m, gap: space.s, paddingBottom: space.s },
  chip: { borderRadius: radius.pill, paddingHorizontal: space.l, minHeight: 40, justifyContent: 'center', maxWidth: 220 },
  chipText: { fontSize: font.body - 1 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: space.s, paddingHorizontal: space.m },
  input: { flex: 1, minHeight: touch.row - 4, borderRadius: radius.m, paddingHorizontal: space.l, fontSize: font.body },
  addButton: { width: touch.row - 4, height: touch.row - 4, borderRadius: radius.m, alignItems: 'center', justifyContent: 'center' },
});
