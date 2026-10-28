/**
 * Client for the Gist backend.
 *
 * The base URL comes from EXPO_PUBLIC_API_URL because a phone on the LAN
 * cannot reach the laptop's localhost -- see the README.
 */

import { currentToken, notifyExpired, type SessionUser } from './session';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080';

/**
 * Covers sending the file as well as converting and transcribing it. A
 * 45-minute recording took ~4 min to upload over mobile data plus ~1 min on
 * the server, which overran the old 5-minute limit.
 */
const UPLOAD_TIMEOUT_MS = 20 * 60_000;
const READ_TIMEOUT_MS = 15_000;

export type RecordingListItem = {
  id: string;
  title: string;
  createdAt: string;
  durationSec: number | null;
  hasSummary: boolean;
  summaryStale: boolean;
};

export type DecisionMade = {
  title: string;
  detail: string;
};

export type Summary = {
  key_outcomes?: string;
  decisions_made?: DecisionMade[];
  completed?: string[];
  blockers?: string[];
  pending_confirmation?: string[];
  open_questions?: string[];
  action_items?: string[];
  next_steps?: string[];
};

export type Recording = {
  id: string;
  title: string;
  createdAt: string;
  durationSec: number | null;
  transcript: string | null;
  summary: Summary | null;
  summaryStale: boolean;
};

/** Carries the backend's own message, which is written to be shown to a user. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = READ_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers = new Headers(init?.headers);
  const token = currentToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { ...init, headers, signal: controller.signal });
  } catch (e) {
    // An aborted fetch and an unreachable host land here alike. Ask the
    // signal, not the error: Expo's fetch rejects an abort with a plain
    // FetchError, not one named AbortError.
    if (controller.signal.aborted) {
      throw new ApiError('The server took too long to respond.', 0);
    }
    throw unreachable(`fetch ${init?.method ?? 'GET'} ${path}`, e);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw errorFromResponse(path, response.status, await response.text());
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

function unreachable(what: string, cause: unknown): ApiError {
  if (__DEV__) {
    // The user-facing message hides the cause; keep it visible while developing.
    console.warn(`${what} failed:`, cause);
  }
  return new ApiError(
    `Cannot reach the server at ${BASE_URL}. Check that the backend is running and that this device is on the same Wi-Fi.`,
    0,
  );
}

function errorFromResponse(path: string, status: number, bodyText: string): ApiError {
  // A rejected token means the session expired; the sign-in routes return
  // 401 for a wrong password, which is not that.
  if (status === 401 && !path.startsWith('/api/auth/')) {
    notifyExpired();
  }
  let message = `Request failed (${status}).`;
  try {
    const body = JSON.parse(bodyText);
    if (body?.error) {
      message = body.error;
    }
  } catch {
    // Non-JSON error body; the generic message stands.
  }
  return new ApiError(message, status);
}

export type SessionResponse = { token: string; expiresAt: string; user: SessionUser };

export function register(email: string, password: string): Promise<SessionResponse> {
  return request<SessionResponse>('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

export function login(email: string, password: string): Promise<SessionResponse> {
  return request<SessionResponse>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

export function me(): Promise<SessionUser> {
  return request<SessionUser>('/api/auth/me');
}

export function listRecordings(): Promise<RecordingListItem[]> {
  return request<RecordingListItem[]>('/api/recordings');
}

export function getRecording(id: string): Promise<Recording> {
  return request<Recording>(`/api/recordings/${id}`);
}

export function deleteRecording(id: string): Promise<void> {
  return request<void>(`/api/recordings/${id}`, { method: 'DELETE' });
}

export function summarizeRecording(id: string): Promise<Recording> {
  return request<Recording>(`/api/recordings/${id}/summarize`, { method: 'POST' });
}

export function emailSummary(id: string, to?: string[]): Promise<{ recipients: string[] }> {
  return request<{ recipients: string[] }>(`/api/recordings/${id}/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: to ?? [] }),
  });
}

export function uploadRecording(
  uri: string,
  fileName: string,
  mimeType = 'audio/m4a',
): Promise<Recording> {
  // Not fetch: Expo's global fetch rejects React Native's { uri, name, type }
  // file parts ("Unsupported FormDataPart implementation"), and reading the
  // file into JS instead fails in Expo Go for picked files (no READ
  // permission outside the app's own folders). React Native's XHR streams the
  // file from disk natively, so neither problem applies. The backend goes by
  // the file name's extension, so the name must be the original one.
  const form = new FormData();
  form.append('file', { uri, name: fileName, type: mimeType } as unknown as Blob);

  const path = '/api/recordings';
  return new Promise<Recording>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE_URL}${path}`);
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    const token = currentToken();
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as Recording);
        } catch {
          reject(new ApiError('The server sent a response the app could not read.', xhr.status));
        }
      } else {
        reject(errorFromResponse(path, xhr.status, xhr.responseText));
      }
    };
    // The server keeps working after the app stops waiting, so the recording
    // often appears anyway; uploading again would make a duplicate.
    xhr.ontimeout = () =>
      reject(
        new ApiError(
          'The upload is taking longer than expected. The server may still finish it, so check the list in a few minutes before trying again.',
          0,
        ),
      );
    xhr.onerror = () => reject(unreachable(`upload ${path}`, xhr.responseText || 'network error'));
    xhr.send(form);
  });
}

export { BASE_URL };
