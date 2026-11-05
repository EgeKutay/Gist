import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { ApiError, login, refreshSession, register, type SessionResponse } from './api';
import {
  clearSession,
  currentToken,
  loadSession,
  saveSession,
  setExpiredHandler,
  type SessionUser,
} from './session';

/** Coming back to the foreground renews the token at most this often. */
const REFRESH_EVERY_MS = 60 * 60_000;

type AuthState = {
  user: SessionUser | null;
  /** True until the stored session has been read from the keystore. */
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const expire = () => {
      clearSession();
      setUser(null);
    };
    setExpiredHandler(expire);

    // Renewing on every launch and resume makes the session last as long as
    // the app is used. Only a positive 401 signs out; offline just keeps the
    // current token.
    let lastRefresh = 0;
    const refresh = async () => {
      const sent = currentToken();
      if (!sent) {
        return;
      }
      lastRefresh = Date.now();
      try {
        const fresh = await refreshSession();
        // Signed out or into another account while this was in flight.
        if (currentToken() === sent) {
          await saveSession({ token: fresh.token, user: fresh.user });
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 401 && currentToken() === sent) {
          expire();
        }
      }
    };

    (async () => {
      const stored = await loadSession();
      // Trust the stored session straight away so the app opens offline.
      setUser(stored?.user ?? null);
      setInitializing(false);
      refresh();
    })();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - lastRefresh > REFRESH_EVERY_MS) {
        refresh();
      }
    });

    return () => {
      subscription.remove();
      setExpiredHandler(null);
    };
  }, []);

  const value = useMemo<AuthState>(() => {
    const adopt = async ({ token, user: next }: SessionResponse) => {
      await saveSession({ token, user: next });
      setUser(next);
    };
    return {
      user,
      initializing,
      signIn: async (email, password) => adopt(await login(email.trim(), password)),
      signUp: async (email, password) => adopt(await register(email.trim(), password)),
      signOut: async () => {
        await clearSession();
        setUser(null);
      },
    };
  }, [user, initializing]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}

/** The backend's messages are already written for people; fall back otherwise. */
export function authErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return (error as Error)?.message ?? 'Could not sign in.';
}
