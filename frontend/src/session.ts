import * as SecureStore from 'expo-secure-store';

/**
 * The signed-in session, kept in the platform keystore (Keychain / Android
 * Keystore) rather than AsyncStorage, which is plain files on disk.
 *
 * Held in memory as well so api.ts can attach the token synchronously.
 */

export type SessionUser = { id: string; email: string };
export type Session = { token: string; user: SessionUser };

const KEY = 'gist.session';

let current: Session | null = null;
let onExpired: (() => void) | null = null;

export function currentToken(): string | null {
  return current?.token ?? null;
}

export async function loadSession(): Promise<Session | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    current = raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    current = null;
  }
  return current;
}

export async function saveSession(session: Session): Promise<void> {
  current = session;
  await SecureStore.setItemAsync(KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  current = null;
  await SecureStore.deleteItemAsync(KEY);
}

/** AuthProvider registers here so a 401 anywhere signs the app out. */
export function setExpiredHandler(handler: (() => void) | null): void {
  onExpired = handler;
}

export function notifyExpired(): void {
  if (current) {
    onExpired?.();
  }
}
