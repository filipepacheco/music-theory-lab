#!/usr/bin/env python3
"""Generate the throwaway Growlybass transfer-budget audition."""

from __future__ import annotations

import base64
import json
import shutil
import subprocess
import wave
from pathlib import Path


PIN = "4f483268fc66b5a6d5781d421c0d11b8d08d3fc6"
SOURCE_ROOT = (
    "https://cdn.jsdelivr.net/gh/sfzinstruments/"
    f"karoryfer.growlybass@{PIN}/sustain"
)
ANCHORS = ("e2", "gb2", "a2", "c3", "eb3", "gb3", "a3", "c4", "eb4", "gb4")
LAYERS = ("pp", "p", "f", "ff")
AUDITION_FILES = (
    "e2_pp_rr1",
    "e2_p_rr1",
    "e2_f_rr1",
    "e2_ff_rr1",
    "a2_ff_rr1",
)
CANDIDATES = {
    "A": {
        "name": "Enxuto universal",
        "codec": "MP3",
        "mime": "audio/mpeg",
        "extension": "mp3",
        "bitrate": 64,
        "seconds": 2.25,
        "fade": 0.15,
    },
    "B": {
        "name": "Equilíbrio universal",
        "codec": "MP3",
        "mime": "audio/mpeg",
        "extension": "mp3",
        "bitrate": 96,
        "seconds": 3.0,
        "fade": 0.15,
    },
    "C": {
        "name": "Conservador universal",
        "codec": "MP3",
        "mime": "audio/mpeg",
        "extension": "mp3",
        "bitrate": 128,
        "seconds": 4.0,
        "fade": 0.2,
    },
}


ROOT = Path(__file__).resolve().parents[1]
CACHE = Path("/private/tmp/growlybass-transfer-cache")
SOURCE_DIR = CACHE / "source"
OUTPUT_DIR = CACHE / "encoded"
TEMPLATE = ROOT / "src/components/instruments/BassTransferBudgetPrototype.template.html"
HTML_OUTPUT = ROOT / "src/components/instruments/BassTransferBudgetPrototype.html"
MANIFEST_OUTPUT = ROOT / "src/components/instruments/BassTransferBudgetPrototype.manifest.json"


def download(curl: str, url: str, destination: Path) -> None:
    if destination.exists() and destination.stat().st_size > 100_000:
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [curl, "-L", "--fail", "--silent", "--show-error", "--output", str(destination), url],
        check=True,
    )


def trim_wav(source: Path, destination: Path, seconds: float, fade: float) -> None:
    with wave.open(str(source), "rb") as reader:
        channels = reader.getnchannels()
        sample_width = reader.getsampwidth()
        frame_rate = reader.getframerate()
        frame_count = min(reader.getnframes(), round(seconds * frame_rate))
        frames = bytearray(reader.readframes(frame_count))
        params = reader.getparams()
    if channels != 1 or sample_width != 3:
        raise ValueError(f"formato-fonte inesperado: {channels} canais, {sample_width * 8} bits")
    fade_frames = round(fade * frame_rate)
    fade_start = max(0, frame_count - fade_frames)
    for frame in range(fade_start, frame_count):
        offset = frame * sample_width
        value = int.from_bytes(frames[offset : offset + 3], "little", signed=True)
        factor = (frame_count - frame) / max(1, fade_frames)
        frames[offset : offset + 3] = round(value * factor).to_bytes(
            3, "little", signed=True
        )
    destination.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(destination), "wb") as writer:
        writer.setparams(params)
        writer.writeframes(frames)


def encode(lame: str, source: Path, destination: Path, candidate: dict) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    trimmed = CACHE / "trimmed" / destination.parent.name / f"{source.stem}.wav"
    trim_wav(source, trimmed, candidate["seconds"], candidate["fade"])
    command = [
        lame,
        "--silent",
        "--noreplaygain",
        "--cbr",
        "-m",
        "m",
        "-b",
        str(candidate["bitrate"]),
        str(trimmed),
        str(destination),
    ]
    subprocess.run(command, check=True)


def main() -> None:
    lame = shutil.which("lame")
    if not lame:
        raise SystemExit("lame não encontrado")
    curl = shutil.which("curl")
    if not curl:
        raise SystemExit("curl não encontrado")

    source_names = [f"{anchor}_{layer}_rr1" for anchor in ANCHORS for layer in LAYERS]
    for index, name in enumerate(source_names, start=1):
        print(f"fonte {index:02d}/40 · {name}", flush=True)
        download(curl, f"{SOURCE_ROOT}/{name}.wav", SOURCE_DIR / f"{name}.wav")

    manifest = {
        "source": {
            "name": "Karoryfer Growlybass",
            "pin": PIN,
            "files": 40,
            "policy": "Preservar níveis relativos; sem normalização por arquivo.",
        },
        "candidates": {},
    }
    embedded = {}
    for key, candidate in CANDIDATES.items():
        total = 0
        sizes = []
        embedded[key] = {}
        print(f"codificando {key} · {candidate['name']}", flush=True)
        for name in source_names:
            destination = OUTPUT_DIR / key / f"{name}.{candidate['extension']}"
            encode(lame, SOURCE_DIR / f"{name}.wav", destination, candidate)
            size = destination.stat().st_size
            total += size
            sizes.append(size)
            if name in AUDITION_FILES:
                embedded[key][name] = {
                    "mime": candidate["mime"],
                    "bytes": size,
                    "base64": base64.b64encode(destination.read_bytes()).decode("ascii"),
                }
        manifest["candidates"][key] = {
            **candidate,
            "files": 40,
            "totalBytes": total,
            "averageBytes": round(total / 40),
            "minimumBytes": min(sizes),
            "maximumBytes": max(sizes),
        }

    payload = {"manifest": manifest, "audio": embedded}
    html = TEMPLATE.read_text().replace(
        "__PROTOTYPE_DATA__",
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
    )
    HTML_OUTPUT.write_text(html)
    MANIFEST_OUTPUT.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"protótipo: {HTML_OUTPUT}")
    for key, candidate in manifest["candidates"].items():
        print(f"{key}: {candidate['totalBytes'] / 1_000_000:.2f} MB / 40 arquivos")


if __name__ == "__main__":
    main()
