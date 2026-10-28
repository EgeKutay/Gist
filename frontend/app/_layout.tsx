import {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
} from '@expo-google-fonts/geist';
import { GeistMono_400Regular, GeistMono_500Medium } from '@expo-google-fonts/geist-mono';
import { useFonts } from 'expo-font';
import { NavigationBar } from 'expo-navigation-bar';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../src/auth';
import { fonts, useColors } from '../src/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const c = useColors();
  const [fontsLoaded, fontError] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    GeistMono_400Regular,
    GeistMono_500Medium,
  });

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <AuthProvider>
      <StatusBar style={c.statusBar} />
      {/* Edge-to-edge: the app's own background shows through, so only the buttons need styling. */}
      <NavigationBar style={c.navigationBar} />
      <RootNavigator />
    </AuthProvider>
  );
}

function RootNavigator() {
  const { user, initializing } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const c = useColors();

  useEffect(() => {
    if (initializing) {
      return;   // hold the splash until the stored session is restored
    }
    SplashScreen.hideAsync();

    const onSignIn = segments[0] === 'sign-in';
    if (!user && !onSignIn) {
      router.replace('/sign-in');
    } else if (user && onSignIn) {
      router.replace('/');
    }
  }, [user, initializing, segments, router]);

  // Every screen draws its own top bar, as in the mockups; the native header
  // stays configured only so a pushed screen never flashes the wrong colour.
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: c.bg },
        headerShadowVisible: false,
        headerTintColor: c.text,
        headerTitleStyle: {
          fontFamily: fonts.sansMedium,
          fontSize: 15,
          color: c.text,
        },
        contentStyle: { backgroundColor: c.bg },
      }}
    >
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="index" options={{ title: 'Recordings' }} />
      <Stack.Screen name="recording/new" options={{ title: 'New recording' }} />
      <Stack.Screen name="recording/[id]" options={{ title: '' }} />
    </Stack>
  );
}
