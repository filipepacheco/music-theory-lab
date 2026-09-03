"""Sum N stem WAV files into a single WAV, peak-normalized to prevent clipping.

Used to derive a "harmonic mix" (e.g. guitar + other) from a separator run
before feeding it to a chord or key stage. Requires soundfile + numpy from
the [inference] extras.

Invocation:

    .venv\\Scripts\\python.exe scripts/sum_stems.py \\
        --output workspace/derived/come-together-harmonic.wav \\
        --peak 0.95 \\
        workspace/runs/come-together-bs-roformer-real/stages/.../guitar.wav \\
        workspace/runs/come-together-bs-roformer-real/stages/.../other.wav

All input files must share the same sample rate and channel count. The
summed samples are clipped-then-scaled so the peak of the output is
exactly ``--peak`` (default 0.95). Output is 16-bit PCM WAV.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf


def sum_stems(
    input_paths: list[Path],
    *,
    peak: float = 0.95,
) -> tuple[np.ndarray, int, int]:
    """Load, sum, and peak-normalize a list of stem WAVs.

    Returns ``(waveform_int16, sample_rate, source_peak)`` where
    ``waveform_int16`` has shape ``(frames, channels)`` and ``source_peak``
    is the max absolute float value of the summed waveform BEFORE
    normalization (useful for reporting).
    """

    if not input_paths:
        raise ValueError("at least one input path is required")
    if peak <= 0 or peak > 1.0:
        raise ValueError(f"peak must be in (0, 1], got {peak}")

    accumulated: np.ndarray | None = None
    reference_sr: int | None = None
    reference_channels: int | None = None

    for path in input_paths:
        audio, sr = sf.read(str(path), dtype="float32", always_2d=True)
        if reference_sr is None:
            reference_sr = int(sr)
            reference_channels = audio.shape[1]
            accumulated = np.zeros_like(audio, dtype=np.float64)
        else:
            if int(sr) != reference_sr:
                raise ValueError(
                    f"sample rate mismatch: {path} is {sr} Hz, expected "
                    f"{reference_sr} Hz"
                )
            if audio.shape[1] != reference_channels:
                raise ValueError(
                    f"channel-count mismatch: {path} has {audio.shape[1]} "
                    f"channels, expected {reference_channels}"
                )
            if audio.shape[0] != accumulated.shape[0]:
                # Trim or zero-pad to the shortest length.
                min_frames = min(audio.shape[0], accumulated.shape[0])
                accumulated = accumulated[:min_frames]
                audio = audio[:min_frames]
        accumulated = accumulated + audio.astype(np.float64)

    assert accumulated is not None
    assert reference_sr is not None
    assert reference_channels is not None

    source_peak = float(np.max(np.abs(accumulated))) if accumulated.size else 0.0
    if source_peak > 0:
        scale = peak / source_peak
        normalized = accumulated * scale
    else:
        normalized = accumulated

    quantized = np.round(np.clip(normalized, -1.0, 1.0) * 32767.0).astype(np.int16)
    return quantized, reference_sr, source_peak


def write_wav(path: Path, waveform: np.ndarray, sample_rate: int) -> str:
    """Write a WAV atomically and return its SHA-256."""

    path.parent.mkdir(parents=True, exist_ok=True)
    staging = path.with_suffix(path.suffix + ".part")
    # Explicit format because the .part extension defeats soundfile's inference.
    sf.write(str(staging), waveform, sample_rate, format="WAV", subtype="PCM_16")
    staging.replace(path)
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="sum_stems",
        description="Sum N stem WAV files into one peak-normalized WAV.",
    )
    parser.add_argument("inputs", nargs="+", type=Path, help="Input WAV files.")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument(
        "--peak",
        type=float,
        default=0.95,
        help="Target peak absolute sample after normalization (default: 0.95).",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    waveform, sample_rate, source_peak = sum_stems(list(args.inputs), peak=args.peak)
    sha256 = write_wav(args.output, waveform, sample_rate)
    summary = {
        "command": "sum-stems",
        "output": str(args.output),
        "sample_rate": sample_rate,
        "channels": int(waveform.shape[1]),
        "frame_count": int(waveform.shape[0]),
        "duration_seconds": waveform.shape[0] / sample_rate,
        "source_peak_before_normalization": source_peak,
        "output_sha256": sha256,
        "inputs": [str(path) for path in args.inputs],
        "ok": True,
    }
    sys.stdout.write(json.dumps(summary, indent=2, sort_keys=True))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
