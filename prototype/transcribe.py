"""Transcribe an audio file with Groq's Whisper API and report how fast it ran.

Throwaway validation script: one file, no classes, no config.
Usage: python transcribe.py <audio-file>
"""

import json
import os
import sys
import time
from pathlib import Path

import requests

# --- Constants -------------------------------------------------------------
API_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
MODEL = "whisper-large-v3-turbo"
MAX_BYTES = 25 * 1024 * 1024  # Groq free-tier upload limit
# (connect timeout, read timeout) -- transcription of a long file can take a while
TIMEOUT = (10, 300)


def die(message):
    """Print an error to stderr and bail out without a traceback."""
    print(f"error: {message}", file=sys.stderr)
    sys.exit(1)


def load_dotenv():
    """Read KEY=VALUE lines from .env from the repo root, if present.

    Existing environment variables win, so `$env:GROQ_API_KEY = "..."` in the
    shell still overrides the file.
    """
    # .env sits at the repo root, a level above prototype/ -- walk upward so
    # these scripts run from either location.
    env_path = next(
        (p / ".env" for p in Path(__file__).resolve().parents
         if (p / ".env").is_file()),
        None,
    )
    if env_path is None:
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def main():
    # Non-ASCII transcripts should survive being piped to a file on Windows.
    sys.stdout.reconfigure(encoding="utf-8")

    # --- Arguments ---------------------------------------------------------
    if len(sys.argv) != 2:
        die(f"usage: python {Path(sys.argv[0]).name} <audio-file>")

    audio_path = Path(sys.argv[1])
    if not audio_path.is_file():
        die(f"no such file: {audio_path}")

    # --- API key -----------------------------------------------------------
    load_dotenv()
    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not api_key:
        die(
            "GROQ_API_KEY is not set. Put it in .env as GROQ_API_KEY=gsk_...\n"
            'or in PowerShell:  $env:GROQ_API_KEY = "gsk_..."'
        )

    # --- Size check (before we waste time uploading) ------------------------
    size = audio_path.stat().st_size
    if size > MAX_BYTES:
        die(
            f"{audio_path.name} is {size / 1024 / 1024:.1f} MB, over Groq's "
            f"{MAX_BYTES // 1024 // 1024} MB limit. Compress it or split it up."
        )
    print(f"uploading {audio_path.name} ({size / 1024 / 1024:.2f} MB)...")

    # --- The API call ------------------------------------------------------
    # verbose_json + segment granularity gives us per-segment timestamps and,
    # usefully, the audio duration -- so we don't need ffprobe just to time it.
    started = time.perf_counter()
    try:
        with audio_path.open("rb") as f:
            response = requests.post(
                API_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                files={"file": (audio_path.name, f)},
                data={
                    "model": MODEL,
                    "response_format": "verbose_json",
                    "timestamp_granularities[]": "segment",
                },
                timeout=TIMEOUT,
            )
    except requests.exceptions.Timeout:
        die(
            f"request timed out after {TIMEOUT[1]}s -- the file may be too long, "
            "or Groq is slow right now"
        )
    except requests.exceptions.ConnectionError as e:
        die(f"could not reach Groq: {e}")
    elapsed = time.perf_counter() - started

    # --- HTTP errors -------------------------------------------------------
    # Show the status and the body Groq sent back; it usually explains itself.
    if response.status_code == 429:
        retry_after = response.headers.get("retry-after")
        hint = f" retry after {retry_after}s." if retry_after else ""
        die(f"429 rate limited.{hint}\n{response.text}")
    if not response.ok:
        die(f"HTTP {response.status_code} {response.reason}\n{response.text}")

    try:
        result = response.json()
    except ValueError:
        die(f"response was not JSON:\n{response.text[:1000]}")

    transcript = result.get("text", "").strip()

    # --- Write outputs next to the source audio ----------------------------
    txt_path = audio_path.with_suffix(".txt")
    json_path = audio_path.with_suffix(".json")
    txt_path.write_text(transcript + "\n", encoding="utf-8")
    json_path.write_text(
        json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    # --- Report ------------------------------------------------------------
    print()
    print(transcript)
    print()

    duration = result.get("duration")
    segments = result.get("segments") or []
    if duration:
        # Ratio > 1 means we transcribed faster than the audio plays back.
        print(
            f"audio {duration:.1f}s | api {elapsed:.1f}s | "
            f"{duration / elapsed:.1f}x realtime"
        )
    else:
        # Shouldn't happen with verbose_json, but don't crash the run over it.
        print(f"api {elapsed:.1f}s (no duration in response)")
    print(f"{len(segments)} segments -> {txt_path.name}, {json_path.name}")


if __name__ == "__main__":
    main()
