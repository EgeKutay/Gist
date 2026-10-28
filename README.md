# Gist

Meeting recorder and summarizer. Audio goes in, a transcript comes back, and a
structured summary is generated on request.

- **backend/** — Java 21 + Spring Boot 3.5, Maven, PostgreSQL
- **frontend/** — React Native + Expo, TypeScript (not built yet)
- **prototype/** — the Python scripts that proved the pipeline; still runnable
- **test/** — sample audio and the grounding eval cases

## Prerequisites

Already present on this machine: JDK 21, Maven, Docker Desktop, ffmpeg, Node 22,
Android SDK.

`JAVA_HOME` is set to JDK 21 at user scope. Confirm in a **new** terminal:

```powershell
$env:JAVA_HOME
# C:\Program Files\Java\jdk-21.0.10
```

## Run the backend

Start Docker Desktop first, then:

```powershell
# 1. Database (host port 5433 -- 5432 belongs to the machine-wide PostgreSQL 18 service)
docker compose up -d

# 2. Backend
cd backend
.\mvnw spring-boot:run
```

Verify it's alive — this hits the database, so a reply proves the whole chain:

```powershell
Invoke-RestMethod http://localhost:8080/api/health
# status recordings
# ------ ----------
# ok              0
```

Stop everything:

```powershell
# Ctrl+C in the backend terminal, then
docker compose down          # keeps data
docker compose down -v       # also wipes the database
```

### If startup fails with `UnsupportedClassVersionError`

```
class file version 65.0 ... only recognizes class file versions up to 61.0
```

The terminal predates the `JAVA_HOME` change and still points at JDK 17 (61.0)
while the classes were built with JDK 21 (65.0). Open a new terminal, or set it
for the session:

```powershell
$env:JAVA_HOME = "C:\Program Files\Java\jdk-21.0.10"
```

## API

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/auth/register` | `{"email","password"}` → `{token, expiresAt, user}`. Password ≥ 8 chars. |
| `POST` | `/api/auth/login` | same body and response; 10 wrong passwords per email locks it for 15 min |
| `GET` | `/api/auth/me` | the signed-in user; 401 once the token has expired |
| `POST` | `/api/recordings` | multipart field `file`. Converts, transcribes, persists. Synchronous. |
| `GET` | `/api/recordings` | list, newest first, without transcripts |
| `GET` | `/api/recordings/{id}` | one recording with transcript and summary |
| `POST` | `/api/recordings/{id}/summarize` | summarizes the current stored transcript, persists and returns it. Synchronous. |
| `DELETE` | `/api/recordings/{id}` | removes the row and the stored audio |
| `PATCH` | `/api/recordings/{id}` | rename; `{"title":"..."}` |
| `POST` | `/api/recordings/{id}/email` | mail the summary and/or transcript; `{"to":[...], "includeSummary":true, "includeTranscript":false}`, all optional |

Every route except `/api/health`, register and login requires `Authorization: Bearer <token>` and only ever returns the caller's own recordings. Tokens last 30 days; there is no server-side session, so signing out just discards the token.

```powershell
# Sign up once (or /login afterwards) and keep the token
$s = Invoke-RestMethod -Uri http://localhost:8080/api/auth/register -Method Post `
  -ContentType application/json -Body '{"email":"me@example.com","password":"correct horse"}'
$h = @{ Authorization = "Bearer $($s.token)" }

# Upload and transcribe
Invoke-RestMethod -Uri http://localhost:8080/api/recordings -Method Post -Headers $h `
  -Form @{ file = Get-Item test\sample.mp4 }

# List
Invoke-RestMethod http://localhost:8080/api/recordings -Headers $h

# Summarize (uses the id returned by the upload or the list)
Invoke-RestMethod -Uri "http://localhost:8080/api/recordings/<id>/summarize" -Method Post -Headers $h

# Delete
Invoke-RestMethod -Uri "http://localhost:8080/api/recordings/<id>" -Method Delete -Headers $h
```

### Audio conversion

Uploads are re-encoded to mono 16 kHz AAC before going to Groq. The bitrate is
chosen per recording as the highest that still fits Groq's 25 MB cap, capped at
64 kbps:

| Meeting length | Bitrate |
|---|---|
| up to 49 min | 64 kbps |
| 60 min | 52 kbps |
| 90 min | 35 kbps |
| 110 min | 29 kbps |
| over 110 min | rejected before conversion |

64 kbps is the cap because it was the lowest bitrate that reproduced the
prototype's transcript exactly; below it Whisper stays confident but introduces
sentence-boundary artifacts. Opus was measured and rejected -- better fidelity
per byte, noticeably worse transcription.

## Accounts, encryption and email — one-time setup

Everything here is free-tier.

### 1. Accounts

Email + password, handled by the backend itself: bcrypt hashes in the `users`
table, 30-day HS256 tokens signed with `GIST_JWT_SECRET` (already generated into
`.env`; make another the same way as the encryption key below, but never reuse
it). Changing the secret signs everyone out. There is no password reset yet --
it needs working email first.

### 2. Encryption key

Already generated into `.env`. To make another:

```powershell
$rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
$b = New-Object byte[] 32
$rng.GetBytes($b)
[Convert]::ToBase64String($b)
```

Do **not** use `[RandomNumberGenerator]::Fill()` — it does not exist in Windows
PowerShell 5.1 and fails silently into an all-zeros key. The backend now refuses
to start on such a key, but only after it has been written.

**Losing this key makes every stored transcript permanently unreadable.** Back it
up outside the repo.

### 3. Resend (email)

1. Sign up at resend.com, create an API key → `RESEND_API_KEY`.
2. **Verify a sending domain** (Domains → add the SPF/DKIM records). Until then
   Resend delivers **only to your own account address**, so sending to a
   colleague fails with a 422. Set `GIST_MAIL_FROM` to an address at the
   verified domain once done.

**Or send through Gmail** (any recipient, no domain needed, ~500 mails/day):

1. Turn on 2-Step Verification for the Google account.
2. Create an app password at myaccount.google.com/apppasswords.
3. Set `GIST_MAIL_PROVIDER=smtp`, `GIST_SMTP_USERNAME=<the gmail address>` and
   `GIST_SMTP_PASSWORD=<the 16-character app password>`. Mail is sent from
   that address; `GIST_MAIL_FROM` and `RESEND_API_KEY` are ignored.

## Run the app

Android, on a physical phone over Wi-Fi. The phone cannot reach the laptop's
`localhost`, so the API address is the machine's LAN IP.

**One-time: allow port 8080 through the firewall.** Run PowerShell **as
Administrator**:

```powershell
New-NetFirewallRule -DisplayName "Gist API (8080)" -Direction Inbound `
  -LocalPort 8080 -Protocol TCP -Action Allow -Profile Private
```

**One-time: point the app at this machine.** `frontend/.env` holds the address;
re-check it whenever you change Wi-Fi networks:

```powershell
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.InterfaceAlias -eq "Wi-Fi" } | Select-Object IPAddress
# then set EXPO_PUBLIC_API_URL=http://<that address>:8080 in frontend\.env
```

**Every run** — backend and database first, then the app:

```powershell
docker compose up -d
cd backend; .\mvnw spring-boot:run     # leave running
```

```powershell
cd frontend
npm start                              # scan the QR code with Expo Go
```

Install **Expo Go** from the Play Store, put the phone on the same Wi-Fi, and
scan the QR code that `npm start` prints.

### Troubleshooting

| Symptom | Cause |
|---|---|
| "Cannot reach the server at ..." | Backend not running, phone on a different network, or the firewall rule is missing |
| List loads on the laptop but not the phone | Almost always the firewall rule |
| Worked yesterday, not today | The LAN IP changed — update `frontend\.env` |
| "The upload is taking longer than expected" | The app stopped waiting, but the server usually finishes. Check the list before uploading again |

### Server logs

Run these on the server (`ssh root@<server IP>`). The backend logs one `->`
line when a request arrives and one `<-` line with its status and duration
when it finishes. For an upload, the gap between `->` and `Converting` is the
time spent sending the file.

```bash
cd /opt/gist/deploy

# Follow the backend live, then reproduce the problem on the phone
docker compose logs -f --tail 50 backend

# Last hour, without stack-trace noise
docker compose logs --since 1h backend | grep -v '^\s*at '

# Just the upload pipeline: arrival, conversion, transcription, result
docker compose logs --since 3h backend | grep -E 'POST /api/recordings|Convert|Transcribed|disconnected|ERROR'

# Errors only
docker compose logs --since 24h backend | grep -E 'ERROR|WARN' | grep -v '^\s*at '

# Caddy access log: what the proxy saw, including requests the backend never answered
docker compose logs --since 1h caddy | grep '"uri"' | tail -20

# Container health and restarts
docker compose ps
```

`Client disconnected before the response was sent` means the app gave up
first. The work itself usually completed, so check the list.

## Configuration

Defaults live in `backend/src/main/resources/application.yml`; every value is
overridable by environment variable.

| Variable | Default | Purpose |
|---|---|---|
| `GROQ_API_KEY` | *(none)* | Groq key |
| `GIST_JWT_SECRET` | *(none)* | Base64 of 32+ random bytes; signs session tokens. **Required to start.** |
| `GIST_ENCRYPTION_KEY` | *(none)* | Base64 of 32 random bytes. **Required to start.** |
| `RESEND_API_KEY` | *(none)* | Mail API key; email is disabled without it |
| `GIST_MAIL_FROM` | `Gist <onboarding@resend.dev>` | Sender address (Resend only) |
| `GIST_MAIL_PROVIDER` | `resend` | `resend` or `smtp` |
| `GIST_SMTP_USERNAME` / `GIST_SMTP_PASSWORD` | *(none)* | SMTP login; for Gmail, the address and an app password |
| `GIST_SMTP_HOST` / `GIST_SMTP_PORT` | `smtp.gmail.com` / `587` | SMTP server (STARTTLS) |
| `GIST_DB_URL` | `jdbc:postgresql://localhost:5433/gist` | Database |
| `GIST_DB_USER` / `GIST_DB_PASSWORD` | `gist` / `gist` | Local dev credentials |
| `GIST_STORAGE_DIR` | `./storage` | Where converted audio is kept |
| `GIST_FFMPEG_PATH` / `GIST_FFPROBE_PATH` | `ffmpeg` / `ffprobe` | Override if not on PATH |
| `GIST_TRANSCRIPTION_MODEL` | `whisper-large-v3-turbo` | |
| `GIST_SUMMARIZATION_MODEL` | `openai/gpt-oss-120b` | |

The key lives in `.env` at the repo root, which is gitignored. To load it into
the current session:

```powershell
$env:GROQ_API_KEY = ((Get-Content .env | Select-String 'GROQ_API_KEY') -split '=', 2)[1].Trim()
```

## Database

Schema is owned by Flyway (`backend/src/main/resources/db/migration/`).
Hibernate runs with `ddl-auto: validate`, so a mismatch between the entities and
the migrations fails startup rather than silently altering tables.

```powershell
# Open a psql shell in the container
docker exec -it gist-postgres psql -U gist -d gist
```

## Prototype

The reference implementation. It reads `.env` from the repo root, so it runs
from anywhere:

```powershell
python prototype\transcribe.py test\sample.mp4
python prototype\summarize.py test\sample.txt
python prototype\models.py
```

## Build status

- [x] **1. Structure, schema, skeleton** — backend starts, Flyway migrates, health endpoint reaches Postgres
- [x] **2. Transcription endpoint + ffmpeg conversion** — verified against `test/sample.mp4`: transcript matches the prototype exactly
- [x] **3. Summarize endpoint** — `POST /api/recordings/{id}/summarize`, schema-validated against the shape in `prompt.txt`; verified against `test/sample_v2.mp4` end to end
- [x] **4. Expo skeleton + recordings list** — expo-router navigation, IBM Plex fonts, list against `GET /api/recordings`; Android bundle verified
- [ ] 5. Record screen
- [ ] 6. Detail screen
