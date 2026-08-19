# Gist — Claude Code handoff prompt

Paste everything below the line into Claude Code, run from
`C:\Users\Decard\Desktop\ClaudeProjects\Gist\Gist`.

---

## Context

I'm building **Gist**, a meeting recorder and summarizer. A working Python
prototype already exists in this repo and proves the pipeline end to end:

- `transcribe.py` — uploads audio to Groq's Whisper API, writes `.txt` + `.json`
- `summarize.py` — sends the transcript to a Groq chat model, writes
  `.summary.json`
- `prompt.txt` — the system prompt for summarization
- `models.py` — lists models available on the Groq key
- `test/sample.mp4`, `sample.txt`, `sample.json` — a working sample run

Read all of these before writing anything. They are the reference implementation
— the backend must produce the same results. Keep them; move them to
`prototype/` so they stay runnable but out of the way.

## What I want built

Restructure the repo into `backend/` and `frontend/` and implement the pipeline
as a real application.

**Backend: Java 21 + Spring Boot 3, Maven, PostgreSQL.**

**Frontend: React Native with Expo, TypeScript. Android first.**

## Architecture decisions already made — do not revisit these

- **Groq for both steps.** `whisper-large-v3-turbo` for transcription,
  `openai/gpt-oss-120b` for summarization. OpenAI-compatible endpoints at
  `https://api.groq.com/openai/v1/`. One API key for both.
- **Synchronous, no job queue.** Transcription returns in ~1 second. Do not
  build a worker, queue, or polling mechanism. A plain request with a spinner is
  correct.
- **No chunking.** The model has a 131k context window — roughly ten hours of
  speech. Transcripts always fit in one call.
- **25 MB upload cap** on Groq transcription. The backend must convert uploaded
  audio to mono 16 kHz 32 kbps AAC via ffmpeg before upload, and reject anything
  still over the cap with a clear error.
- **No speaker attribution.** The transcript has no speaker labels and the
  summary must never name a person. This is deliberate — see `prompt.txt`.
- **Two-step flow.** Transcription happens automatically on upload. Summarization
  is a *separate* user-triggered action, so the user can review and edit the
  transcript first.
- **Provider abstraction.** Put both Groq calls behind interfaces
  (`TranscriptionProvider`, `SummarizationProvider`) with one implementation
  each. Model names come from config, never hardcoded — Groq's catalog changes
  without warning.

## Backend API

- `POST /api/recordings` — multipart audio upload. Converts, transcribes,
  persists, returns the recording with its transcript.
- `GET /api/recordings` — list, newest first.
- `GET /api/recordings/{id}` — one recording with transcript and summary.
- `PATCH /api/recordings/{id}/transcript` — save an edited transcript.
- `POST /api/recordings/{id}/summarize` — summarize the *current stored*
  transcript (edited version if edited), persist and return the summary.
- `DELETE /api/recordings/{id}`

Summary JSON shape (matches `prompt.txt` exactly):
`key_outcomes` (string), `decisions_made` (array of `{title, detail}`), and
string arrays for `completed`, `blockers`, `pending_confirmation`,
`open_questions`, `action_items`, `next_steps`.

Persist the summary as JSONB. Validate the model's response against the schema
and return a clear error if it doesn't conform.

## Frontend screens

1. **Recordings list** — title, date, duration, whether it has a summary.
2. **Record** — one large record button, unmistakable recording indicator,
   elapsed timer, stop and upload. Record mono at 16 kHz to keep files small.
   Handle permission denial gracefully.
3. **Detail** — transcript in an editable text area with a save button, a
   "Summarize" button, and the summary rendered below in collapsible sections.
   **Hide sections that are empty** rather than showing empty headers.

## Constraints

- No authentication in this phase. Single user, local development.
- API key and model names in backend config, read from environment. Never
  commit secrets. `.env` is already gitignored.
- Error responses must be actionable — surface Groq's message, handle 429 with
  the retry-after header, handle 404 by suggesting the model list.
- If a dependency is missing or something needs a decision from me, stop and ask
  rather than guessing.
- Clear file names, brief comments explaining why rather than what.

## Build order — one step at a time, confirm with me between each

1. Restructure folders, move prototype scripts, set up the Spring Boot skeleton
   and Postgres schema. Verify it starts.
2. Transcription endpoint + ffmpeg conversion. Verify against `test/sample.mp4`
   — it must produce the same transcript the prototype did.
3. Summarize endpoint. Verify it produces the correct *schema*. Do NOT use any
   stored summary as a correctness oracle — the first prototype run
   hallucinated five action items from a transcript containing zero
   commitments (see `test/cases/monologue-no-commitments/`). Correctness for
   this step means: valid schema, and output matching `expected.json` for that
   case — specifically empty `action_items` and `next_steps`.
4. Expo app skeleton with navigation and the recordings list against the API.
5. Record screen with audio capture and upload.
6. Detail screen with editable transcript and summary rendering.

Give me PowerShell commands for every run step in a README at each stage.
