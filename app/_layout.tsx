// Stack, start van de app en lifecycle-bedrading (§3, §11).
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../src/ui/AppContext';
import { Button } from '../src/ui/components/basics';
import { strings } from '../src/ui/strings.nl';
import { font, space, useTheme } from '../src/ui/theme';

function Splash({ state, retry }: { state: 'loading' | 'error'; retry: () => void }) {
  const t = useTheme();
  return (
    <View style={[styles.splash, { backgroundColor: t.bg }]}>
      {state === 'loading' ? <ActivityIndicator color={t.accent} /> : null}
      <Text style={[styles.splashText, { color: state === 'error' ? t.danger : t.muted }]}>{state === 'loading' ? strings.loading : strings.startError}</Text>
      {state === 'error' ? <Button label={strings.retry} onPress={retry} /> : null}
    </View>
  );
}

export default function RootLayout() {
  const t = useTheme();
  return (
    // UX-15/UX-16: swipe-rijen hebben bovenaan een GestureHandlerRootView nodig.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={t.dark ? 'light' : 'dark'} />
        <AppProvider fallback={(s, retry) => <Splash state={s} retry={retry} />}>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: t.surface },
              headerTintColor: t.text,
              headerTitleStyle: { fontWeight: '700' },
              headerShadowVisible: false,
              contentStyle: { backgroundColor: t.bg },
              headerBackTitle: strings.listsTitle,
            }}
          >
            <Stack.Screen name="index" options={{ title: strings.listsTitle }} />
            <Stack.Screen name="lijst/[id]" options={{ title: '' }} />
            <Stack.Screen name="lijst/[id]/item/[itemId]" options={{ title: strings.editTitle, presentation: 'modal' }} />
            <Stack.Screen name="lijst/[id]/delen" options={{ title: strings.shareTitle, presentation: 'modal' }} />
            <Stack.Screen name="koppelen" options={{ title: strings.joinTitle, presentation: 'modal' }} />
            <Stack.Screen name="instellingen" options={{ title: strings.settingsTitle }} />
            <Stack.Screen name="licenties" options={{ title: strings.licensesTitle }} />
          </Stack>
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.m, padding: space.xl },
  splashText: { fontSize: font.body },
});
