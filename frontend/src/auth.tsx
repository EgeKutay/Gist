import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, login, me, register, type SessionResponse } from './api';
import {
  clearSession,
  loadSession,
  saveSession,
  setExpiredHandler,
  type SessionUser,
} from './session';

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

    (async () => {
      const stored = await loadSession();
      // Trust the stored session straight away so the app opens offline; the
      // check below signs out only if the server positively rejects it.
      setUser(stored?.user ?? null);
      setInitializing(false);
      if (stored) {
        me().catch((e) => {
          if (e instanceof ApiError && e.status === 401) {
            expire();
          }
        });
      }
    })();

    return () => setExpiredHandler(null);
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
