// D-52 (D-ET-12): invoer boven het toetsenbord houden, ook op Android met edge-to-edge (SDK 57, Android 15+).
// - iOS: ongewijzigd. Of React Natives KeyboardAvoidingView met `behavior="padding"` en de opgegeven offset, of
//   (ios="none") helemaal geen extra laag.
// - Android: het venster resizet bij edge-to-edge niet meer (adjustResize werkt niet), en KeyboardAvoidingView met
//   behavior undefined doet niets. We luisteren naar keyboardDidShow/keyboardDidHide; React Native geeft daar de hoogte
//   van het toetsenbord *zonder* de navigatiebalk (ime.bottom − systemBars.bottom). Die hoogte wordt paddingBottom van
//   de container. Het stuk van het toetsenbord over de navigatiebalk (safe-area onderin, 3 knoppen of gebaren) komt
//   erbij, tenzij de inhoud die ruimte zelf al vrijhoudt (`ownsBottomInset`: AddBar, knoppenbalk onderin). Zo staat de
//   invoer direct boven het toetsenbord, en boven de navigatiebalk als het toetsenbord dicht is.
import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Android: hoogte van het toetsenbord boven de navigatiebalk (0 als het dicht is). iOS: altijd 0. */
export function useAndroidKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setHeight(Math.max(0, e?.endCoordinates?.height ?? 0)));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

interface Props {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  /** iOS-gedrag: 'padding' (KeyboardAvoidingView, zoals voorheen) of 'none' (geen extra laag, zoals voorheen). */
  ios?: 'padding' | 'none';
  /** keyboardVerticalOffset op iOS (bijv. de hoogte van de kop). */
  iosOffset?: number;
  /** Android: de inhoud houdt onderin zelf de safe-area vrij (insets.bottom), dus die niet nog eens optellen. */
  ownsBottomInset?: boolean;
  testID?: string;
}

export function KeyboardSafeView({ style, children, ios = 'padding', iosOffset = 0, ownsBottomInset = false, testID }: Props) {
  const kb = useAndroidKeyboardHeight();
  const insets = useSafeAreaInsets();
  if (Platform.OS === 'ios') {
    if (ios === 'none') return <>{children}</>;
    return (
      <KeyboardAvoidingView style={style} behavior="padding" keyboardVerticalOffset={iosOffset} testID={testID}>
        {children}
      </KeyboardAvoidingView>
    );
  }
  const pad = kb > 0 ? kb + (ownsBottomInset ? 0 : insets.bottom) : 0;
  return (
    <View style={[style, ios === 'none' ? { flex: 1 } : null, pad > 0 ? { paddingBottom: pad } : null]} testID={testID}>
      {children}
    </View>
  );
}
