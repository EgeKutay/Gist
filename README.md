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
| `POST` | `/api/recordings` | multipart field `file`. Converts, transcribes, persists. Synchronous. |
| `GET` | `/api/recordings` | list, newest first, without transcripts |
| `GET` | `/api/recordings/{id}` | one recording with transcript and summary |
| `DELETE` | `/api/recordings/{id}` | removes the row and the stored audio |

```powershell
# Upload and transcribe
Invoke-RestMethod -Uri http://localhost:8080/api/recordings -Method Post `
  -Form @{ file = Get-Item test\sample.mp4 }

# List
Invoke-RestMethod http://localhost:8080/api/recordings

# Delete
Invoke-RestMethod -Uri "http://localhost:8080/api/recordings/<id>" -Method Delete
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

## Configuration

Defaults live in `backend/src/main/resources/application.yml`; every value is
overridable by environment variable.

| Variable | Default | Purpose |
|---|---|---|
| `GROQ_API_KEY` | *(none)* | Groq key. Required from step 2 onward. |
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
- [ ] 3. Summarize endpoint
- [x] **4. Expo skeleton + recordings list** — expo-router navigation, IBM Plex fonts, list against `GET /api/recordings`; Android bundle verified
- [ ] 5. Record screen
- [ ] 6. Detail screen
