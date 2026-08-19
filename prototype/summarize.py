"""Summarize a meeting transcript with Groq's chat API.

Throwaway validation script, second half of the pipeline:
    python transcribe.py test/sample.mp4   ->  test/sample.txt
    python summarize.py test/sample.txt    ->  test/sample.summary.json

The system prompt lives in prompt.txt so it can be edited without touching code.
Usage: python summarize.py <transcript.txt> [--names Ege,Fredrik,Maksym]
"""

import json
import os
import re
import sys
import time
from pathlib import Path

import requests

# --- Constants -------------------------------------------------------------
API_URL = "https://api.groq.com/openai/v1/chat/completions"
# Groq's free catalog churns -- run models.py, then override with GROQ_MODEL
# in .env or --model. Alternatives seen: openai/gpt-oss-20b, qwen/qwen3.6-27b.
DEFAULT_MODEL = "openai/gpt-oss-120b"
PROMPT_FILE = Path(__file__).with_name("prompt.txt")
TIMEOUT = (10, 180)

# Keys the prompt promises. Anything missing means the model went off-script.
LIST_KEYS = [
    "decisions_made",
    "completed",
    "blockers",
    "pending_confirmation",
    "open_questions",
    "action_items",
    "next_steps",
]


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


def parse_args(argv):
    """Return (transcript_path, [names], model) from a small hand-rolled parser."""
    path = None
    names = []
    model = None
    i = 0
    while i < len(argv):
        arg = argv[i]
        if arg == "--names":
            i += 1
            if i >= len(argv):
                die("--names needs a comma-separated list, e.g. --names Ege,Fredrik")
            names = [n.strip() for n in argv[i].split(",") if n.strip()]
        elif arg == "--model":
            i += 1
            if i >= len(argv):
                die("--model needs a model id -- run models.py to see what's available")
            model = argv[i]
        elif arg.startswith("-"):
            die(f"unknown option: {arg}")
        elif path is None:
            path = arg
        else:
            die("only one transcript file at a time")
        i += 1
    if path is None:
        die(f"usage: python {Path(sys.argv[0]).name} <transcript.txt> [--names A,B] [--model id]")
    return Path(path), names, model


def find_names(summary, names):
    """Return which participant names leaked into the output, whole-word only.

    The no-attribution rule is the part of the prompt most likely to slip, so
    check it rather than trusting it.
    """
    blob = json.dumps(summary, ensure_ascii=False)
    return [n for n in names if re.search(rf"\b{re.escape(n)}\b", blob, re.I)]


def render(summary):
    """Print the summary as readable text instead of raw JSON."""
    outcomes = (summary.get("key_outcomes") or "").strip()
    if outcomes:
        print("KEY OUTCOMES")
        print(outcomes)
        print()

    for key in LIST_KEYS:
        items = summary.get(key) or []
        if not items:
            continue  # empty sections are expected -- don't print bare headers
        print(key.replace("_", " ").upper())
        for item in items:
            if isinstance(item, dict):
                # decisions_made entries are {title, detail}
                print(f"  - {item.get('title', '')}")
                detail = (item.get("detail") or "").strip()
                if detail:
                    print(f"    {detail}")
            else:
                print(f"  - {item}")
        print()


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    transcript_path, names, model_arg = parse_args(sys.argv[1:])

    if not transcript_path.is_file():
        die(f"no such file: {transcript_path}")
    if not PROMPT_FILE.is_file():
        die(f"missing prompt file: {PROMPT_FILE}")

    transcript = transcript_path.read_text(encoding="utf-8").strip()
    if not transcript:
        die(f"{transcript_path.name} is empty -- did transcribe.py actually run?")
    system_prompt = PROMPT_FILE.read_text(encoding="utf-8")

    # --- API key -----------------------------------------------------------
    load_dotenv()
    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not api_key:
        die(
            "GROQ_API_KEY is not set. Put it in .env as GROQ_API_KEY=gsk_...\n"
            'or in PowerShell:  $env:GROQ_API_KEY = "gsk_..."'
        )

    # --- Model: --model wins, then GROQ_MODEL, then the default -------------
    model = model_arg or os.environ.get("GROQ_MODEL", "").strip() or DEFAULT_MODEL

    # Rough gauge only: ~4 chars per token. Real count comes back in `usage`.
    print(
        f"summarizing {transcript_path.name} "
        f"({len(transcript):,} chars, ~{len(transcript) // 4:,} tokens) "
        f"with {model}..."
    )

    # --- The API call ------------------------------------------------------
    # temperature 0.2: we want the same transcript to give the same summary,
    # which matters once these runs become eval cases.
    started = time.perf_counter()
    try:
        response = requests.post(
            API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": transcript},
                ],
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
            },
            timeout=TIMEOUT,
        )
    except requests.exceptions.Timeout:
        die(f"request timed out after {TIMEOUT[1]}s")
    except requests.exceptions.ConnectionError as e:
        die(f"could not reach Groq: {e}")
    elapsed = time.perf_counter() - started

    # --- HTTP errors -------------------------------------------------------
    if response.status_code == 429:
        retry_after = response.headers.get("retry-after")
        hint = f" retry after {retry_after}s." if retry_after else ""
        die(f"429 rate limited.{hint}\n{response.text}")
    if response.status_code == 404:
        die(
            f"404 -- model '{model}' is not available on your key.\n"
            "Run `python models.py` to see what is, then pass --model <id>\n"
            "or set GROQ_MODEL in .env."
        )
    if response.status_code == 413:
        die(
            "413 payload too large -- this transcript exceeds the model's "
            "context window. Chunk it or use a longer-context model.\n"
            f"{response.text}"
        )
    if not response.ok:
        die(f"HTTP {response.status_code} {response.reason}\n{response.text}")

    try:
        body = response.json()
        content = body["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError):
        die(f"unexpected response shape:\n{response.text[:1000]}")

    # --- Parse and validate ------------------------------------------------
    # json_object mode should make fences impossible, but strip them anyway --
    # cheaper than debugging it at 1am.
    content = re.sub(r"^```(?:json)?|```$", "", content.strip()).strip()
    try:
        summary = json.loads(content)
    except json.JSONDecodeError as e:
        die(f"model did not return valid JSON ({e}):\n{content[:1000]}")

    missing = [k for k in ["key_outcomes", *LIST_KEYS] if k not in summary]
    if missing:
        print(f"warning: missing keys in response: {', '.join(missing)}",
              file=sys.stderr)

    # --- Write output ------------------------------------------------------
    # .with_suffix would eat the .txt, so build the name explicitly.
    out_path = transcript_path.with_name(transcript_path.stem + ".summary.json")
    out_path.write_text(
        json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    # --- Report ------------------------------------------------------------
    print()
    render(summary)

    if names:
        leaked = find_names(summary, names)
        if leaked:
            print(
                f"warning: participant names leaked into output: "
                f"{', '.join(leaked)}",
                file=sys.stderr,
            )
        else:
            print(f"no-attribution check passed ({len(names)} names checked)")

    usage = body.get("usage") or {}
    prompt_tokens = usage.get("prompt_tokens")
    completion_tokens = usage.get("completion_tokens")
    if prompt_tokens is not None:
        print(
            f"api {elapsed:.1f}s | {prompt_tokens:,} in / "
            f"{completion_tokens:,} out tokens"
        )
    else:
        print(f"api {elapsed:.1f}s")
    print(f"-> {out_path.name}")


if __name__ == "__main__":
    main()
