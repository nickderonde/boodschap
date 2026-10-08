// Overzicht van lijsten (F-01, UX-10, UX-11). Swipe naar links → verwijderen, altijd met bevestiging (UX-16).
import { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUi, useUiState } from '../src/ui/AppContext';
import { Button, EmptyState, IconButton, Snackbar } from '../src/ui/components/basics';
import { Icon } from '../src/ui/components/Icon';
import { SwipeGroupProvider, SwipeRow, useNewSwipeGroup, type SwipeHandle } from '../src/ui/components/SwipeRow';
import { progressFraction, progressText } from '../src/ui/selectors';
import { strings } from '../src/ui/strings.nl';
import { font, radius, space, touch, useTheme } from '../src/ui/theme';
import type { ListSummary } from '../src/service/types';

export default function ListsScreen() {
  const t = useTheme();
  const ui = useUi();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const lists = useUiState((s) => s.lists);
  const message = useUiState((s) => s.message);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const swipeGroup = useNewSwipeGroup();

  // UX-16: altijd de bestaande bevestiging (UX-07; gedeeld: ook "Lijst verlaten"); daarna (ook bij annuleren) klapt de rij dicht.
  const swipeDelete = (id: string) => (row: SwipeHandle) => {
    void ui.actions.deleteList(id).finally(() => row.close());
  };

  const create = () => {
    const id = ui.actions.createList(name);
    if (!id) return;
    setCreating(false);
    setName('');
    router.push(`/lijst/${id}`);
  };

  const renderItem = ({ item }: { item: ListSummary }) => (
    <SwipeRow onDelete={swipeDelete(item.id)} actionLabel={strings.swipeDeleteList(item.name)} radius={radius.l} testID={`list-${item.id}`}>
      <Pressable
        onPress={() => {
          swipeGroup.closeAll();
          router.push(`/lijst/${item.id}`);
        }}
        accessibilityActions={[{ name: 'delete', label: strings.swipeDelete }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'delete') void ui.actions.deleteList(item.id);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${progressText(item)}${item.shared ? `, ${strings.shared}` : ''}`}
        style={({ pressed }) => [styles.card, { backgroundColor: t.surface, borderColor: t.border, opacity: pressed ? 0.7 : 1 }]}
      >
        <View style={{ flex: 1, gap: space.xs }}>
          <View style={styles.cardTop}>
            <Text style={[styles.cardTitle, { color: t.text }]} numberOfLines={1}>
              {item.name}
            </Text>
            {item.shared ? (
              <View style={[styles.badge, { backgroundColor: t.accentSoft }]}>
                <Text style={[styles.badgeText, { color: t.accent }]}>{strings.shared}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.cardSub, { color: t.muted }]}>{progressText(item)}</Text>
          <View style={[styles.bar, { backgroundColor: t.surfaceAlt }]}>
            <View style={[styles.barFill, { backgroundColor: t.accent, width: `${Math.round(progressFraction(item) * 100)}%` }]} />
          </View>
        </View>
        <Icon name="chevron" color={t.muted} size={20} />
      </Pressable>
    </SwipeRow>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ headerRight: () => <IconButton icon="gear" label={strings.settings} onPress={() => router.push('/instellingen')} /> }} />
      <SwipeGroupProvider group={swipeGroup}>
        <FlatList
          data={lists}
          keyExtractor={(l) => l.id}
          renderItem={renderItem}
          onScrollBeginDrag={swipeGroup.closeAll}
          contentContainerStyle={{ padding: space.l, gap: space.m, paddingBottom: 140 }}
          ListEmptyComponent={<EmptyState title={strings.listsEmptyTitle} body={strings.listsEmptyBody} />}
        />
      </SwipeGroupProvider>
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, space.l), backgroundColor: t.bg }]}>
        <Button label={strings.addSharedList} icon="scan" kind="secondary" onPress={() => router.push('/koppelen')} style={{ flex: 1 }} />
        <Button label={strings.newList} icon="plus" onPress={() => setCreating(true)} style={{ flex: 1 }} />
      </View>
      <Snackbar message={message} onUndo={ui.actions.undo} onClose={ui.actions.dismissMessage} />
      <Modal visible={creating} transparent animationType="fade" onRequestClose={() => setCreating(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBg}>
          <View style={[styles.dialog, { backgroundColor: t.surface }]}>
            <Text style={[styles.dialogTitle, { color: t.text }]}>{strings.newList}</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={strings.newListPlaceholder}
              placeholderTextColor={t.muted}
              autoFocus
              maxLength={40}
              onSubmitEditing={create}
              returnKeyType="done"
              accessibilityLabel={strings.newListPlaceholder}
              style={[styles.input, { color: t.text, backgroundColor: t.surfaceAlt }]}
            />
            <View style={styles.dialogButtons}>
              <Button label={strings.cancel} kind="ghost" onPress={() => setCreating(false)} style={{ flex: 1 }} />
              <Button label={strings.create} onPress={create} disabled={!name.trim()} style={{ flex: 1 }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: space.m, padding: space.l, borderRadius: radius.l, borderWidth: StyleSheet.hairlineWidth, minHeight: 84 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  cardTitle: { fontSize: font.large, fontWeight: '700', flexShrink: 1 },
  cardSub: { fontSize: font.small + 1 },
  badge: { borderRadius: radius.pill, paddingHorizontal: space.s, paddingVertical: 2 },
  badgeText: { fontSize: font.small - 1, fontWeight: '700' },
  bar: { height: 4, borderRadius: 2, overflow: 'hidden', marginTop: space.xs },
  barFill: { height: 4, borderRadius: 2 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: space.m, paddingHorizontal: space.l, paddingTop: space.m },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: space.xl },
  dialog: { borderRadius: radius.l, padding: space.xl, gap: space.l },
  dialogTitle: { fontSize: font.large, fontWeight: '700' },
  dialogButtons: { flexDirection: 'row', gap: space.m },
  input: { minHeight: touch.row - 4, borderRadius: radius.m, paddingHorizontal: space.l, fontSize: font.body },
});
