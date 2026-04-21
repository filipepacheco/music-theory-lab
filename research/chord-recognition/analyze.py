"""Run madmom's chord recognizer on an mp3 and print the resulting segments.

Usage:
    python analyze.py samples/your-song.mp3

Output:
    - Prints (start, end, label) segments to stdout
    - Writes the same to outputs/<basename>.chords.txt (tab-separated, mir_eval-friendly)
"""

from __future__ import annotations

import sys
from pathlib import Path


def analyze(audio_path: Path) -> list[tuple[float, float, str]]:
    from madmom.features.chords import (
        CNNChordFeatureProcessor,
        CRFChordRecognitionProcessor,
    )

    feat = CNNChordFeatureProcessor()(str(audio_path))
    segments = CRFChordRecognitionProcessor()(feat)
    return [(float(s), float(e), str(label)) for s, e, label in segments]


def write_lab(segments: list[tuple[float, float, str]], out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w") as f:
        for start, end, label in segments:
            f.write(f"{start:.3f}\t{end:.3f}\t{label}\n")


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 1

    audio_path = Path(sys.argv[1])
    if not audio_path.exists():
        print(f"File not found: {audio_path}", file=sys.stderr)
        return 1

    segments = analyze(audio_path)

    for start, end, label in segments:
        print(f"{start:7.3f}  {end:7.3f}  {label}")

    out_path = Path(__file__).parent / "outputs" / f"{audio_path.stem}.chords.txt"
    write_lab(segments, out_path)
    print(f"\nWrote {len(segments)} segments to {out_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
