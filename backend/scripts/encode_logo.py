"""
Regenerate src/assets/farm2cook-logo.ts from farm2cook-logo.png.

The invoice PDF renderer needs a self-contained logo (no network fetch
during puppeteer render). We inline it as a base64 data URL exported
from a TS file so dev (tsx) and prod (node from dist) both pick it up
identically with zero build configuration.
"""
import base64
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src" / "assets" / "farm2cook-logo.png"
OUT = ROOT / "src" / "assets" / "farm2cook-logo.ts"

if not SRC.exists():
    raise SystemExit(f"missing source PNG: {SRC}")

data = base64.b64encode(SRC.read_bytes()).decode()
banner = (
    "// AUTO-GENERATED from farm2cook-logo.png. Run scripts/encode_logo.py to regenerate.\n"
    "// Base64-inlined so the invoice PDF renderer (puppeteer) needs no network fetch.\n\n"
)
OUT.write_text(banner + f"export const FARM2COOK_LOGO_DATA_URL = 'data:image/png;base64,{data}';\n", encoding="utf-8")
print(f"wrote {OUT.relative_to(ROOT)} ({len(data)} chars base64)")
