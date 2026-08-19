/**
 * Client for the Gist backend.
 *
 * The base URL comes from EXPO_PUBLIC_API_URL because a phone on the LAN
 * cannot reach the laptop's localhost -- see the README.
 */

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080';

/** Transcription of a long recording can hold the request open for minutes. */
const UPLOAD_TIMEOUT_MS = 300_000;
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

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { ...init, signal: controller.signal });
  } catch (e) {
    // An aborted fetch and an unreachable host land here alike; the phone
    // being on the wrong network is by far the likeliest cause.
    if (e instanceof Error && e.name === 'AbortError') {
      throw new ApiError('The server took too long to respond.', 0);
    }
    throw new ApiError(
      `Cannot reach the server at ${BASE_URL}. Check that the backend is running and that this device is on the same Wi-Fi.`,
      0,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const body = await response.json();
      if (body?.error) {
        message = body.error;
      }
    } catch {
      // Non-JSON error body; the generic message stands.
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
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

export function uploadRecording(uri: string, fileName: string): Promise<Recording> {
  const form = new FormData();
  // React Native's FormData takes this shape for a file; the cast keeps
  // TypeScript's DOM-flavoured FormData types quiet.
  form.append('file', {
    uri,
    name: fileName,
    type: 'audio/m4a',
  } as unknown as Blob);

  return request<Recording>('/api/recordings', { method: 'POST', body: form }, UPLOAD_TIMEOUT_MS);
}

export { BASE_URL };
