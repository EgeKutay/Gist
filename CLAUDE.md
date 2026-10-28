# CLAUDE.md

Gist records meetings, transcribes them, and on request produces a structured
summary. `README.md` covers one-time setup (JWT secret, encryption key, Resend,
firewall, LAN IP) and the full config table, so read it before changing
anything to do with running the app. This file covers what the README does not:
how the code fits together and the rules that must not be broken.

## Layout

| Path | What |
|---|---|
| `backend/` | Java 21, Spring Boot 3.5, Maven wrapper, PostgreSQL 17 via Flyway |
| `frontend/` | Expo SDK 57, expo-router, React Native 0.86, TypeScript strict. Has its own `CLAUDE.md`: **read the versioned Expo v57 docs before writing frontend code**, because the APIs have changed since your training data |
| `prototype/` | Python reference implementation (`transcribe.py`, `summarize.py`, `models.py`). Gitignored but still runnable, and it is the oracle for transcription output |
| `test/` | Sample audio/transcripts and grounding eval cases. Gitignored |
| `design/` | HTML mockups the screens are built from. Gitignored |
| `HANDOFF.md` | Original build brief and the architecture decisions the user has fixed |

## Commands (PowerShell, Windows)

```powershell
docker compose up -d                       # Postgres on host port 5433 (5432 belongs to a system PG 18)
cd backend; .\mvnw spring-boot:run         # API on 0.0.0.0:8080
cd backend; .\mvnw test                    # all tests
cd backend; .\mvnw test -Dtest=FieldEncryptorTest   # one class
cd frontend; npm start                     # Expo Go over LAN
cd frontend; npx tsc --noEmit              # type-check (no lint or test scripts exist)
docker exec -it gist-postgres psql -U gist -d gist
```

Spring does **not** read the root `.env`. `GROQ_API_KEY`, `GIST_ENCRYPTION_KEY`,
`GIST_JWT_SECRET` and `RESEND_API_KEY` must be in the process environment.
Startup fails fast without the encryption key or the JWT secret. The two must be
different values.

An `UnsupportedClassVersionError` (class file version 65 vs 61) means the shell
still has `JAVA_HOME` pointing at JDK 17. Open a new terminal.

## Backend architecture

Packages live under `com.gist`, and each one has a single job:

- `recording`: controller, service, JPA entity, repository, DTOs. `RecordingService` coordinates all of it.
- `audio`: `AudioConverter` runs ffmpeg/ffprobe as subprocesses, and `AudioStorage` keeps converted `.m4a` files under `gist.storage.dir`. The DB stores only the file name.
- `transcription`, `summarization`, `email`: provider **interfaces**.
- `groq`, `resend`: their only implementations. `GroqErrors` maps Groq HTTP failures (429 with retry-after, 404 unknown model, 401 bad key, request too large, context length exceeded) to user-facing messages, worded per `Step` (transcription or summarization). A summary cut off at `finish_reason: length` is reported as such, not as invalid JSON.
- `auth`: email and password accounts in the `users` table (bcrypt). `AuthController` serves `/api/auth/register`, `/login` and `/me`. `AuthService` normalizes emails to lowercase, gives an unknown email and a wrong password the same message and the same timing, and locks an email after too many failures (in memory, 15 min window).
- `security`: `TokenService` issues and verifies 30-day HS256 JWTs signed with `GIST_JWT_SECRET`. `TokenAuthFilter` reads the `Bearer` token on every request and sets a `GistPrincipal(uid, email)` from the claims alone, with no DB read. Sessions are stateless: there is no session table, signing out means the client drops the token, and rotating the secret signs everyone out. `/api/health`, `/api/auth/register` and `/api/auth/login` are the only public routes.
- Spring beans with more than one constructor (such as `TokenService`, which has a package-private one that takes a `Clock` for tests) need `@Autowired` on the one Spring should use. Otherwise startup fails with "No default constructor found".
- `crypto`: `FieldEncryptor` (AES-256-GCM, random IV per value) plus JPA `AttributeConverter`s.
- `error`: throw `ApiException(status, message)`. `GlobalExceptionHandler` renders every error as `{status, error}`, and the client shows `error` to the user word for word.
- `config`: `GistProperties` binds `gist.*` from `application.yml`.
- `logging`: `RequestLogFilter` logs `->` on arrival and `<-` with status and duration for every request except health. README "Server logs" has the commands to read them.

Upload flow (`POST /api/recordings`): stage the multipart upload to a temp file,
ffprobe the duration, reject anything over 110 min, pick a bitrate
(`bitrateKbpsFor`, at most 64 kbps, sized to fit Groq's 25 MB cap), convert to
mono 16 kHz AAC, transcribe, save. Summarization is a separate
`POST /{id}/summarize` call. `PATCH /{id}` with `{title}` renames (trimmed, at
most 200 characters), and `DELETE /{id}` removes the row and its audio file. Email is `POST /{id}/email`, limited in memory per
user per hour.

## Invariants: do not break these

- **Ownership is enforced in the query.** `recordings.user_uid` is a `uuid` foreign key to `users.id`, with `on delete cascade`. Always load through `findByIdAndUserUid` / `findAllByUserUid...`. Never `findById` followed by a check. Another user's id must look exactly like a 404.
- **Meeting content is encrypted at rest.** `title`, `transcript`, `summary` and `summary_original` are `bytea` with `@Convert(Encrypted*Converter)`. Any new column that holds speech-derived content must be encrypted too. JPA instantiates the converters outside Spring, so they reach the key through the static `FieldEncryptor.shared()`.
- **Flyway owns the schema** and Hibernate runs `ddl-auto: validate`. A schema change means a new `V{n}__*.sql` migration. Never edit an applied migration.
- **`create()` is deliberately not `@Transactional`.** It must not hold a DB connection across ffmpeg and Groq calls that can take minutes.
- **Synchronous calls with no job queue, and no chunking.** These are user decisions, recorded in `HANDOFF.md`. Do not reopen them.
- **Model names come from config** (`GIST_TRANSCRIPTION_MODEL`, `GIST_SUMMARIZATION_MODEL`) and are never hardcoded.
- **Summary schema:** `key_outcomes` is a string, `decisions_made` is an array of `{title, detail}`, and `completed`, `blockers`, `pending_confirmation`, `open_questions`, `action_items` and `next_steps` are string arrays. `GroqSummarizationProvider.validate` enforces this. If you change it, update `frontend/src/api.ts` `Summary`, `SummaryEmailRenderer` and the detail screen together. Empty sections are hidden in both the app and the email.
- **Error messages are written for end users.** They should be actionable and mention the env var or the next step to take.

## The summarization prompt

`backend/src/main/resources/prompt.txt` is the live prompt. It has **diverged**
from `prototype/prompt.txt` (it now has richer decision details, garbled-term
merging and one-step-per-element rules). Edit the backend copy.

The prompt never names people, and its grounding rules ("description is not
commitment", "mostly empty output is often correct") exist because the model
invents action items. Re-run any prompt change against
`test/cases/monologue-no-commitments/`: it passes only if `action_items` and
`next_steps` are empty and nothing is fabricated. A previously stored summary
is not a correctness oracle.

## Frontend

- Routes live in `frontend/app/`: `_layout.tsx` (fonts, `AuthProvider`, and a redirect to `/sign-in` when signed out), `index.tsx` (list), `sign-in.tsx`, `recording/new.tsx` (record with expo-audio, then upload), and `recording/[id].tsx` (transcript, summarize, summary sections, email).
- `src/api.ts` is the only HTTP client. It attaches the session token as `Authorization: Bearer`, applies timeouts (15 s for reads, 5 min for uploads) and turns failures into `ApiError` with the backend's message. Any 401 calls `notifyExpired()`, which signs the app out. `EXPO_PUBLIC_API_URL` must be the laptop's LAN IP, not localhost. On an Android emulator, `http://10.0.2.2:8080` also works.
- `src/session.ts` keeps the session in `expo-secure-store` (Keychain or Android Keystore), not AsyncStorage, and also holds it in memory so `api.ts` can read the token synchronously.
- `src/auth.tsx` (`AuthProvider` / `useAuth`) trusts the stored session at launch so the app opens offline, then calls `/api/auth/me` and signs out only on a 401.
- `src/RecordingActions.tsx` is the rename/delete sheet. The list opens it on long-press and the meeting screen opens it from its header ⋯ button.
- `src/ui.tsx` holds the shared `Button` (primary / secondary / quiet), `Sheet`, `FadeIn`, and `useReducedMotion`. Every animation checks reduced motion.
- Do not wrap a `Pressable` with a function `style` in `<Link asChild>`. expo-router's `Slot` drops the function, and the element renders unstyled. Use `router.push` in `onPress`.
- `src/theme.ts` holds exact design tokens (IBM Plex Sans/Mono) taken from `design/`. Use the tokens and do not invent new values.

## Known gaps

- There is no `PATCH /api/recordings/{id}/transcript` yet, and the transcript is read-only on the detail screen. `summary_stale` and `summary_original` exist in the schema for this feature, but nothing sets `summary_stale` to true yet.
- There is no password reset yet. It depends on having working email first.
- Backend tests cover only `crypto/`, `TokenService` and `GroqErrors`. Nothing else has tests.
