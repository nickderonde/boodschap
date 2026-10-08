// Swipe naar links met een rode actie "Verwijderen" (UX-15 items, UX-16 lijsten).
// - Een volledige swipe of een tik op de actie roept onDelete aan.
// - Volledige swipe (review S-1): gemeten aan de VINGER, niet aan de geanimeerde rij. Een eigen Pan-gesture die
//   gelijktijdig met die van ReanimatedSwipeable loopt, leest bij het loslaten de echte vingerafstand; ≥ 50% van de
//   rijbreedte (zoals Mail op iOS) is een volledige swipe. Zo maakt het niet uit dat de rij daarna al terugveert.
// - Er staat maximaal één rij tegelijk open per scherm (SwipeGroup); een tik elders of scrollen sluit de open rij.
// - De actie is alleen voor toegankelijkheid zichtbaar als de rij open staat; de rij zelf krijgt een
//   accessibility action "Verwijderen" (zie ItemRow en het lijstenoverzicht).
// - Openen/sluiten verandert alleen de state van déze rij (review K-2: andere rijen hertekenen niet).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { strings } from '../strings.nl';
import { font, space, useTheme } from '../theme';

/** Breedte van de rode actie. */
export const SWIPE_ACTION_WIDTH = 96;
/** Aandeel van de rijbreedte dat de vinger moet afleggen voor een volledige swipe (iOS Mail: ongeveer de helft). */
export const FULL_SWIPE_FRACTION = 0.5;
/** Ondergrens voor de vingerafstand, voor als de rijbreedte (nog) onbekend is: ruim voorbij de actie. */
export const FULL_SWIPE_MIN = 2 * SWIPE_ACTION_WIDTH;

/** Volledige swipe: de vinger is bij het loslaten ≥ 50% van de rijbreedte (en ≥ FULL_SWIPE_MIN) naar links. */
export function isFullSwipe(fingerDx: number, rowWidth: number): boolean {
  return -fingerDx >= Math.max(FULL_SWIPE_MIN, rowWidth * FULL_SWIPE_FRACTION);
}

export interface SwipeHandle {
  close(): void;
}

/** Houdt bij welke rij open staat: openen van een tweede rij sluit de eerste (UX-15/UX-16). */
export interface SwipeGroup {
  opened(h: SwipeHandle): void;
  closed(h: SwipeHandle): void;
  closeAll(): void;
}

export function createSwipeGroup(): SwipeGroup {
  let current: SwipeHandle | null = null;
  return {
    opened(h) {
      if (current && current !== h) current.close();
      current = h;
    },
    closed(h) {
      if (current === h) current = null;
    },
    closeAll() {
      const c = current;
      current = null;
      c?.close();
    },
  };
}

const noopGroup: SwipeGroup = {
  opened: () => {},
  closed: () => {},
  closeAll: () => {},
};
const GroupContext = createContext<SwipeGroup>(noopGroup);

/** Eén groep per scherm; de waarde is stabiel, dus rijen hertekenen er niet door. */
export function SwipeGroupProvider({ group, children }: { group: SwipeGroup; children: ReactNode }) {
  return <GroupContext.Provider value={group}>{children}</GroupContext.Provider>;
}

export function useSwipeGroup(): SwipeGroup {
  return useContext(GroupContext);
}

/** Een stabiele groep voor een scherm. */
export function useNewSwipeGroup(): SwipeGroup {
  return useMemo(() => createSwipeGroup(), []);
}

interface Props {
  /** Undefined: niet swipebaar. Krijgt de rij mee, zodat die na bijv. annuleren van een bevestiging dicht kan. */
  onDelete?: (row: SwipeHandle) => void;
  /** Accessibility-label van de actie, bijv. "Melk verwijderen". */
  actionLabel: string;
  testID?: string;
  /** Afronding van de rij (lijstkaarten), zodat de rode achtergrond tijdens het slepen netjes binnen de kaart blijft. */
  radius?: number;
  children: ReactNode;
}

export function SwipeRow({ onDelete, actionLabel, testID, radius = 0, children }: Props) {
  const t = useTheme();
  const group = useSwipeGroup();
  const ref = useRef<SwipeableMethods | null>(null);
  const width = useRef(0);
  const isOpen = useRef(false);
  const [open, setOpen] = useState(false);
  // Rood achter de rij alleen tijdens slepen/open (anders zou een rand rood door afgeronde hoeken schemeren).
  const [active, setActive] = useState(false);
  const mounted = useRef(true);

  const handle = useMemo<SwipeHandle>(
    () => ({
      close() {
        ref.current?.close();
        isOpen.current = false;
        if (mounted.current) {
          setOpen(false);
          setActive(false);
        }
      },
    }),
    [],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      group.closed(handle);
    };
  }, [group, handle]);

  const fire = useCallback(() => {
    if (onDelete) onDelete(handle);
  }, [handle, onDelete]);
  const fireRef = useRef(fire);
  fireRef.current = fire;

  // Waarnemer van de vinger (JS-thread), gelijktijdig met de Pan van ReanimatedSwipeable; zelfde activatie (10 pt).
  const observer = useMemo(() => {
    const g = Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX([-10, 10])
      .onEnd((e, success) => {
        if (!success) return;
        // Stond de rij al open, dan telt de al zichtbare actie mee.
        const dx = e.translationX - (isOpen.current ? SWIPE_ACTION_WIDTH : 0);
        if (isFullSwipe(dx, width.current)) fireRef.current();
      });
    return testID ? g.withTestId(`swipe-${testID}`) : g;
  }, [testID]);

  const renderRightActions = useCallback(() => {
    return (
      <View style={[styles.actionWrap, { backgroundColor: t.danger }]}>
        <Pressable
          onPress={fire}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          accessibilityElementsHidden={!open}
          importantForAccessibility={open ? 'yes' : 'no-hide-descendants'}
          style={({ pressed }) => [styles.action, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[styles.actionText, { color: t.dark ? '#1B1B1B' : '#FFFFFF' }]}>{strings.swipeDelete}</Text>
        </Pressable>
      </View>
    );
  }, [t.danger, t.dark, actionLabel, open, fire]);

  if (!onDelete) return <>{children}</>;

  return (
    <GestureDetector gesture={observer}>
      <View collapsable={false} onLayout={(e: LayoutChangeEvent) => (width.current = e.nativeEvent.layout.width)} testID={testID}>
        <ReanimatedSwipeable
          ref={ref}
          // Wrijving 1: de rij volgt de vinger 1-op-1 (review S-1; 1,5 vroeg ±354 pt sleepafstand).
          friction={1}
          simultaneousWithExternalGesture={observer}
          rightThreshold={SWIPE_ACTION_WIDTH / 2}
          overshootRight
          renderRightActions={renderRightActions}
          containerStyle={active ? { backgroundColor: t.danger, borderRadius: radius, overflow: 'hidden' } : undefined}
          onSwipeableOpenStartDrag={() => setActive(true)}
          onSwipeableWillOpen={() => {
            if (!mounted.current) return; // rij al weg (bijv. na een volledige swipe)
            setActive(true);
            isOpen.current = true;
            group.opened(handle);
            setOpen(true);
          }}
          onSwipeableClose={() => {
            group.closed(handle);
            isOpen.current = false;
            if (mounted.current) {
              setOpen(false);
              setActive(false);
            }
          }}
        >
          {children}
        </ReanimatedSwipeable>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  actionWrap: { width: SWIPE_ACTION_WIDTH, justifyContent: 'center', alignItems: 'center' },
  action: { width: SWIPE_ACTION_WIDTH, height: '100%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.s },
  actionText: { fontWeight: '700', fontSize: font.body },
});
