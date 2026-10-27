import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
} from '@expo-google-fonts/ibm-plex-mono';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
} from '@expo-google-fonts/ibm-plex-sans';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { AuthProvider, useAuth } from '../src/auth';
import { colors, fonts, space } from '../src/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </AuthProvider>
  );
}

function RootNavigator() {
  const { user, initializing } = useAuth();
  const segments = useSegments();
  const router = useRouter();

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

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTintColor: colors.textBody,
        headerTitleStyle: {
          fontFamily: fonts.sansSemibold,
          fontSize: 17,
          color: colors.text,
        },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen
        name="index"
        options={{ title: 'Recordings', headerLeft: () => <SignOutButton /> }}
      />
      <Stack.Screen name="recording/new" options={{ title: 'New recording' }} />
      <Stack.Screen name="recording/[id]" options={{ title: '' }} />
    </Stack>
  );
}

function SignOutButton() {
  const { signOut } = useAuth();
  return (
    <Pressable
      hitSlop={8}
      onPress={signOut}
      style={({ pressed }) => [styles.signOut, pressed && styles.signOutPressed]}
    >
      <Text style={styles.signOutLabel}>Sign out</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  signOut: { paddingHorizontal: space.sm, paddingVertical: space.sm },
  signOutPressed: { opacity: 0.6 },
  signOutLabel: { fontFamily: fonts.sans, fontSize: 15, color: colors.textSecondary },
});
