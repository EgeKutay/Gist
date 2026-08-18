# transcribe.py

Throwaway script to check how fast Groq's Whisper API actually is. Takes an
audio file, sends it to `whisper-large-v3-turbo`, prints the transcript and the
speed ratio, and drops a `.txt` and `.json` next to the source file.

## Setup

Python 3.11+.

```powershell
pip install -r requirements.txt
```

## Set the API key

Get a key from https://console.groq.com/keys, then, for the current session:

```powershell
$env:GROQ_API_KEY = "gsk_..."
```

To persist it across new terminals (takes effect in *new* windows only):

```powershell
[Environment]::SetEnvironmentVariable("GROQ_API_KEY", "gsk_...", "User")
```

If you keep the key in `.env`, load it for the current session with:

```powershell
$env:GROQ_API_KEY = ((Get-Content .env | Select-String 'GROQ_API_KEY') -split '=', 2)[1].Trim()
```

## Run

```powershell
python transcribe.py test\sample.mp4
```

Output:

```
uploading sample.mp4 (0.68 MB)...

Hello, this is a test for my new application about saving the meetings. ...

audio 41.9s | api 0.8s | 54.4x realtime
5 segments -> sample.txt, sample.json
```

`sample.txt` holds the plain transcript; `sample.json` holds the full
`verbose_json` response, including per-segment `start`/`end` timestamps.

## Notes

- Files over 25 MB are rejected before upload (Groq free-tier limit). For
  longer recordings, downsample to 16 kHz mono first — Whisper doesn't use
  anything above that anyway:
  `ffmpeg -i in.mp4 -ar 16000 -ac 1 -c:a libmp3lame out.mp3`
- Request timeout is 300s read / 10s connect; bump `TIMEOUT` in the script for
  very long audio.
- HTTP errors print the status code and Groq's response body instead of a
  traceback. On 429 the `retry-after` header is shown when present.
