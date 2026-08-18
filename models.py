"""List the models your Groq key can actually reach.

Free-tier catalogs change without warning, so don't guess a model name -- ask.
Usage: python models.py
"""

import os
import sys
from pathlib import Path

import requests

API_URL = "https://api.groq.com/openai/v1/models"


def load_dotenv():
    """Read KEY=VALUE lines from .env next to this script, if it exists."""
    env_path = Path(__file__).with_name(".env")
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    load_dotenv()

    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not api_key:
        print("error: GROQ_API_KEY is not set", file=sys.stderr)
        sys.exit(1)

    response = requests.get(
        API_URL, headers={"Authorization": f"Bearer {api_key}"}, timeout=(10, 30)
    )
    if not response.ok:
        print(f"error: HTTP {response.status_code}\n{response.text}", file=sys.stderr)
        sys.exit(1)

    models = response.json().get("data", [])

    # Split the speech models out -- whisper goes in transcribe.py, the rest
    # are candidates for summarize.py.
    speech, chat = [], []
    for m in models:
        (speech if "whisper" in m["id"].lower() else chat).append(m)

    print(f"CHAT MODELS ({len(chat)})")
    for m in sorted(chat, key=lambda m: m["id"]):
        window = m.get("context_window")
        window_str = f"{window:,} ctx" if window else "unknown ctx"
        print(f"  {m['id']:<40} {window_str}")

    print(f"\nSPEECH MODELS ({len(speech)})")
    for m in sorted(speech, key=lambda m: m["id"]):
        print(f"  {m['id']}")


if __name__ == "__main__":
    main()
