"""Patch madmom 0.16.1 for Python 3.10+ and numpy 1.24+.

madmom hasn't been released since 2018 and uses several APIs that have been
removed from Python and numpy since:

  - ``from collections import MutableSequence``  (moved to collections.abc in Py3.3, removed Py3.10)
  - ``np.float``, ``np.int``, ``np.bool``, ``np.object``  (removed in numpy 1.24)

Running this script patches the installed madmom package in-place. Run it once
after ``pip install -r requirements.txt``. Safe to run multiple times (idempotent).

Usage:
    python patch_madmom.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path


NUMPY_ALIAS_REPLACEMENTS = [
    (re.compile(r"\bnp\.float\b(?!\d)"), "float"),
    (re.compile(r"\bnp\.int\b(?!\d|p\b)"), "int"),
    (re.compile(r"\bnp\.bool\b(?!_)"), "bool"),
    (re.compile(r"\bnp\.object\b(?!_)"), "object"),
]

COLLECTIONS_REPLACEMENTS = [
    (
        re.compile(r"^from collections import MutableSequence\b", re.MULTILINE),
        "from collections.abc import MutableSequence",
    ),
]


def patch_file(path: Path) -> bool:
    original = path.read_text()
    patched = original
    for pattern, replacement in NUMPY_ALIAS_REPLACEMENTS + COLLECTIONS_REPLACEMENTS:
        patched = pattern.sub(replacement, patched)
    if patched != original:
        path.write_text(patched)
        return True
    return False


def find_madmom_root() -> Path:
    import sysconfig
    for scheme in ("purelib", "platlib"):
        candidate = Path(sysconfig.get_paths()[scheme]) / "madmom"
        if candidate.is_dir():
            return candidate
    raise FileNotFoundError("Could not locate madmom in site-packages")


def main() -> int:
    try:
        root = find_madmom_root()
    except FileNotFoundError:
        print("madmom is not installed. Run `pip install -r requirements.txt` first.", file=sys.stderr)
        return 1

    changed = []
    for py_file in root.rglob("*.py"):
        if patch_file(py_file):
            changed.append(py_file.relative_to(root))

    if not changed:
        print(f"No files needed patching (madmom at {root} is already clean).")
    else:
        print(f"Patched {len(changed)} file(s) in {root}:")
        for p in changed:
            print(f"  {p}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
