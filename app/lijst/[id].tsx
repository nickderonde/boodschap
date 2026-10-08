// Lijstscherm (F-02..F-12, F-17, UX-02..05, UX-07, UX-13): per categorie in supermarktvolgorde, afgevinkt onderaan,
// altijd zichtbare sync-status, snel achter elkaar invoeren met suggesties, pull-to-refresh, undo-snackbar.
import { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUi, useUiState } from '../../src/ui/AppContext';
import { AddBar } from '../../src/ui/components/AddBar';
import { Button, EmptyState, IconButton, Snackbar, SyncBar } from '../../src/ui/components/basics';
import { ItemRow } from '../../src/ui/components/ItemRow';
import { SwipeGroupProvider, useNewSwipeGroup } from '../../src/ui/components/SwipeRow';
import { nativeAlert } from '../../src/ui/AppContext';
import { strings } from '../../src/ui/strings.nl';
import { font, radius, space, touch, useTheme } from '../../src/ui/theme';
import type { CategoryId, ItemView } from '../../src/core/types';

export default function ListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listId = String(id);
  const t = useTheme();
  const ui = useUi();
  const app = ui.app;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const version = useUiState((s) => s.version);
  const lists = useUiState((s) => s.lists);
  const liveStatus = useUiState((s) => s.status[listId]);
  const message = useUiState((s) => s.message);
  const [refreshing, setRefreshing] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);

  const summary = lists.find((l) => l.id === listId);
  const view = useMemo(() => {
    try {
      return summary ? app.view(listId) : null;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId, version, summary]);
  const status = liveStatus ?? app.syncStatus(listId);
  // Review K-2: secties alleen opnieuw opbouwen als de view verandert; de ItemView-objecten zelf zijn stabiel per item.
  const sections = useMemo(
    () => (view ? view.sections.map((s) => ({ key: s.key, title: s.key === 'afgevinkt' ? strings.checkedSection : (strings.categories[s.key as CategoryId] ?? s.title), data: s.items })) : []),
    [view],
  );

  const onToggle = useCallback((itemId: string) => ui.actions.toggle(listId, itemId), [ui, listId]);
  const onEdit = useCallback((itemId: string) => router.push(`/lijst/${listId}/item/${itemId}`), [router, listId]);
  // UX-15: swipe of accessibility action → bestaande deleteItem (direct, snackbar "Ongedaan maken", geen dialoog).
  const onDelete = useCallback((itemId: string, name: string) => ui.actions.deleteItem(listId, itemId, name), [ui, listId]);
  const swipeGroup = useNewSwipeGroup();
  const suggest = useCallback((p: string) => app.suggest(p), [app]);
  const renderItem = useCallback(({ item }: { item: ItemView }) => <ItemRow item={item} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />, [onToggle, onEdit, onDelete]);

  if (!summary || !view) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <EmptyState title={strings.listsEmptyTitle} body={strings.listsEmptyBody} />
      </View>
    );
  }

  const openMenu = () =>
    nativeAlert(view.name, '', [
      { text: strings.cancel, style: 'cancel' },
      { text: strings.rename, onPress: () => setRenaming(view.name) },
      ...(summary.shared ? [{ text: strings.leaveList, onPress: () => void ui.actions.leaveList(listId).then((gone) => gone && router.back()) }] : []),
      {
        text: strings.deleteList,
        style: 'destructive' as const,
        onPress: () => void ui.actions.deleteList(listId).then((done) => done && !app.lists().some((l) => l.id === listId) && router.back()),
      },
    ]);

  const refresh = async () => {
    setRefreshing(true);
    await ui.actions.syncNow(listId);
    setRefreshing(false);
  };

  const fetching = status.fetching;
  const empty = view.sections.length === 0;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
      <Stack.Screen
        options={{
          title: view.name,
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              <IconButton icon="share" label={strings.share} onPress={() => router.push(`/lijst/${listId}/delen`)} />
              <IconButton icon="more" label={strings.menu} onPress={openMenu} />
            </View>
          ),
        }}
      />
      <SyncBar status={status} />
      <SwipeGroupProvider group={swipeGroup}>
        <SectionList
          sections={sections}
          keyExtractor={(i: ItemView) => i.id}
          renderItem={renderItem}
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeader, { backgroundColor: t.bg }]}>
              <Text style={[styles.sectionTitle, { color: section.key === 'afgevinkt' ? t.muted : t.text }]} accessibilityRole="header">
                {section.title}
              </Text>
              {section.key === 'afgevinkt' ? (
                <Pressable onPress={() => ui.actions.clearChecked(listId)} accessibilityRole="button" accessibilityLabel={strings.clearChecked} style={styles.sectionAction}>
                  <Text style={[styles.sectionActionText, { color: t.accent }]}>{strings.clearChecked}</Text>
                </Pressable>
              ) : null}
            </View>
          )}
          stickySectionHeadersEnabled
          onScrollBeginDrag={swipeGroup.closeAll}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.accent} colors={[t.accent]} />}
          contentContainerStyle={{ paddingBottom: space.xxl * 2 }}
          initialNumToRender={30}
          windowSize={11}
          ListEmptyComponent={
            fetching ? (
              <EmptyState title={strings.fetchingTitle} body={strings.fetchingBody} icon="sync" />
            ) : summary.shared && view.total === 0 && status.kind !== 'lokaal' && view.name === strings.sharedListPlaceholderName ? (
              <EmptyState title={strings.nothingFoundTitle} body={strings.nothingFoundBody} icon="sync" />
            ) : empty ? (
              <EmptyState title={strings.listEmptyTitle} body={strings.listEmptyBody} />
            ) : null
          }
        />
      </SwipeGroupProvider>
      <View>
        <Snackbar message={message} onUndo={ui.actions.undo} onClose={ui.actions.dismissMessage} />
      </View>
      <AddBar suggest={suggest} onAdd={(text, extra) => ui.actions.addItem(listId, text, extra)} bottomInset={insets.bottom} />
      <Modal visible={renaming !== null} transparent animationType="fade" onRequestClose={() => setRenaming(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBg}>
          <View style={[styles.dialog, { backgroundColor: t.surface }]}>
            <Text style={[styles.dialogTitle, { color: t.text }]}>{strings.rename}</Text>
            <TextInput
              value={renaming ?? ''}
              onChangeText={setRenaming}
              autoFocus
              maxLength={40}
              accessibilityLabel={strings.newListPlaceholder}
              style={[styles.input, { color: t.text, backgroundColor: t.surfaceAlt }]}
            />
            <View style={styles.dialogButtons}>
              <Button label={strings.cancel} kind="ghost" onPress={() => setRenaming(null)} style={{ flex: 1 }} />
              <Button
                label={strings.save}
                disabled={!renaming?.trim()}
                onPress={() => {
                  if (renaming && ui.actions.renameList(listId, renaming)) setRenaming(null);
                }}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.l, paddingTop: space.l, paddingBottom: space.xs, minHeight: 40 },
  sectionTitle: { fontSize: font.small + 1, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  sectionAction: { minHeight: touch.min, justifyContent: 'center', paddingLeft: space.l },
  sectionActionText: { fontSize: font.small + 2, fontWeight: '700' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: space.xl },
  dialog: { borderRadius: radius.l, padding: space.xl, gap: space.l },
  dialogTitle: { fontSize: font.large, fontWeight: '700' },
  dialogButtons: { flexDirection: 'row', gap: space.m },
  input: { minHeight: touch.row - 4, borderRadius: radius.m, paddingHorizontal: space.l, fontSize: font.body },
});
