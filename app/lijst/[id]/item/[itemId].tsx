// Item bewerken (F-04, F-09): naam, hoeveelheid, eenheid, notitie en categorie; verwijderen met undo.
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUi } from '../../../../src/ui/AppContext';
import { Button } from '../../../../src/ui/components/basics';
import { CATEGORIES } from '../../../../src/core/categorize/categories';
import { formatQuantity } from '../../../../src/ui/selectors';
import { strings } from '../../../../src/ui/strings.nl';
import { font, radius, space, touch, useTheme } from '../../../../src/ui/theme';
import type { CategoryId } from '../../../../src/core/types';

export default function EditItemScreen() {
  const { id, itemId } = useLocalSearchParams<{ id: string; itemId: string }>();
  const listId = String(id);
  const t = useTheme();
  const ui = useUi();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const item = useMemo(() => {
    try {
      return ui.app.view(listId).sections.flatMap((s) => s.items).find((i) => i.id === itemId) ?? null;
    } catch {
      return null;
    }
  }, [ui, listId, itemId]);
  const [name, setName] = useState(item?.name ?? '');
  const [qty, setQty] = useState(item?.quantity !== null && item?.quantity !== undefined ? formatQuantity(item.quantity) : '');
  const [unit, setUnit] = useState(item?.unit ?? '');
  const [note, setNote] = useState(item?.note ?? '');
  const [category, setCategory] = useState<CategoryId>((item?.category as CategoryId) ?? 'overig');

  if (!item) return <View style={{ flex: 1, backgroundColor: t.bg }} />;

  const save = () => {
    const q = qty.trim() === '' ? null : Number(qty.replace(',', '.'));
    const patch = {
      ...(name.trim() !== item.name ? { name } : {}),
      ...(q !== item.quantity ? { quantity: Number.isNaN(q as number) ? -1 : q } : {}),
      ...((unit.trim() || null) !== item.unit ? { unit: unit.trim() || null } : {}),
      ...((note.trim() || null) !== item.note ? { note: note.trim() || null } : {}),
      ...(category !== item.category ? { category } : {}),
    };
    if (Object.keys(patch).length === 0 || ui.actions.updateItem(listId, item.id, patch)) router.back();
  };

  const field = (label: string, value: string, set: (v: string) => void, extra?: object) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: t.muted }]}>{label}</Text>
      <TextInput value={value} onChangeText={set} accessibilityLabel={label} placeholderTextColor={t.muted} style={[styles.input, { color: t.text, backgroundColor: t.surfaceAlt }]} {...extra} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ padding: space.l, gap: space.l, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        {field(strings.name, name, setName, { maxLength: 80 })}
        <View style={{ flexDirection: 'row', gap: space.m }}>
          <View style={{ flex: 1 }}>{field(strings.quantity, qty, setQty, { keyboardType: 'decimal-pad', maxLength: 10 })}</View>
          <View style={{ flex: 1 }}>{field(strings.unit, unit, setUnit, { maxLength: 20, autoCapitalize: 'none' })}</View>
        </View>
        <View style={styles.chips}>
          {strings.units.map((u) => (
            <Pressable key={u} onPress={() => setUnit(unit === u ? '' : u)} accessibilityRole="button" accessibilityState={{ selected: unit === u }} accessibilityLabel={`${strings.unit} ${u}`} style={[styles.chip, { backgroundColor: unit === u ? t.accent : t.surfaceAlt }]}>
              <Text style={{ color: unit === u ? t.accentText : t.text, fontSize: font.body - 1 }}>{u}</Text>
            </Pressable>
          ))}
        </View>
        {field(strings.note, note, setNote, { maxLength: 200, multiline: true, placeholder: strings.notePlaceholder })}
        <View style={styles.field}>
          <Text style={[styles.label, { color: t.muted }]}>{strings.category}</Text>
          <View style={styles.chips}>
            {CATEGORIES.map((c) => (
              <Pressable key={c.id} onPress={() => setCategory(c.id)} accessibilityRole="radio" accessibilityState={{ selected: category === c.id }} accessibilityLabel={strings.categories[c.id]} style={[styles.chip, { backgroundColor: category === c.id ? t.accent : t.surfaceAlt }]}>
                <Text style={{ color: category === c.id ? t.accentText : t.text, fontSize: font.body - 2 }}>{strings.categories[c.id]}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, space.l), backgroundColor: t.bg, borderTopColor: t.border }]}>
        <Button
          label={strings.deleteItem}
          icon="trash"
          kind="danger"
          onPress={() => {
            ui.actions.deleteItem(listId, item.id, item.name);
            router.back();
          }}
          style={{ flex: 1 }}
        />
        <Button label={strings.save} onPress={save} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.xs },
  label: { fontSize: font.small + 1, fontWeight: '600' },
  input: { minHeight: touch.row - 4, borderRadius: radius.m, paddingHorizontal: space.l, paddingVertical: space.s, fontSize: font.body },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  chip: { borderRadius: radius.pill, paddingHorizontal: space.l, minHeight: 40, justifyContent: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: space.m, paddingHorizontal: space.l, paddingTop: space.m, borderTopWidth: StyleSheet.hairlineWidth },
});
