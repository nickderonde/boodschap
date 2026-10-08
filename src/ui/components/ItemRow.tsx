// Eén item: de hele rij afvinken met één tik (UX-04, tikdoel ≥ 44 pt); aparte knop om te bewerken;
// swipe naar links of de accessibility action "Verwijderen" verwijdert direct, met snackbar "Ongedaan maken" (UX-15).
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ItemView } from '../../core/types';
import { itemSubtitle } from '../selectors';
import { strings } from '../strings.nl';
import { font, space, touch, useTheme } from '../theme';
import { Icon } from './Icon';
import { SwipeRow, useSwipeGroup } from './SwipeRow';

const DELETE_ACTION = [{ name: 'delete', label: strings.swipeDelete }];

interface Props {
  item: ItemView;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  /** UX-15: verwijderen via swipe of accessibility action. Zonder: de rij is niet swipebaar. */
  onDelete?: (id: string, name: string) => void;
}

export const ItemRow = memo(function ItemRow({ item, onToggle, onEdit, onDelete }: Props) {
  const t = useTheme();
  const group = useSwipeGroup();
  const sub = itemSubtitle(item);
  const del = onDelete ? () => onDelete(item.id, item.name) : undefined;
  return (
    <SwipeRow
      onDelete={
        del &&
        ((row) => {
          row.close();
          del();
        })
      }
      actionLabel={strings.swipeDeleteItem(item.name)}
      testID={`item-${item.id}`}
    >
      <View style={[styles.row, { backgroundColor: t.surface, borderBottomColor: t.border }]}>
        <Pressable
          onPress={() => {
            // Een tik sluit een open rij (UX-15) en vinkt af zoals altijd.
            group.closeAll();
            onToggle(item.id);
          }}
          accessibilityActions={del ? DELETE_ACTION : undefined}
          onAccessibilityAction={del ? (e) => e.nativeEvent.actionName === 'delete' && del() : undefined}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.checked }}
          accessibilityLabel={item.checked ? strings.uncheckItem(item.name) : strings.checkItem(item.name)}
          style={({ pressed }) => [styles.main, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Icon name={item.checked ? 'circle-check' : 'circle'} color={item.checked ? t.checked : t.accent} size={28} />
          <View style={styles.texts}>
            <Text style={[styles.name, { color: item.checked ? t.checked : t.text }, item.checked && styles.done]} numberOfLines={2}>
              {item.name}
            </Text>
            {sub ? (
              <Text style={[styles.sub, { color: t.muted }]} numberOfLines={1}>
                {sub}
              </Text>
            ) : null}
          </View>
        </Pressable>
        <Pressable onPress={() => onEdit(item.id)} accessibilityRole="button" accessibilityLabel={strings.editItem(item.name)} style={({ pressed }) => [styles.edit, { opacity: pressed ? 0.5 : 1 }]} hitSlop={4}>
          <Icon name="chevron" color={t.muted} size={20} />
        </Pressable>
      </View>
    </SwipeRow>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: StyleSheet.hairlineWidth, minHeight: touch.row },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.m, paddingLeft: space.l, paddingVertical: space.s },
  texts: { flex: 1 },
  name: { fontSize: font.body + 1 },
  done: { textDecorationLine: 'line-through' },
  sub: { fontSize: font.small + 1, marginTop: 2 },
  edit: { width: touch.row, alignItems: 'center', justifyContent: 'center' },
});
