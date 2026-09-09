#!/usr/bin/env python3
"""Generate and validate the production Growlybass derivative."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path


SOURCE_COMMIT = "4f483268fc66b5a6d5781d421c0d11b8d08d3fc6"
SOURCE_ROOT = (
    "https://cdn.jsdelivr.net/gh/sfzinstruments/"
    f"karoryfer.growlybass@{SOURCE_COMMIT}"
)
ANCHORS = ("e2", "gb2", "a2", "c3", "eb3", "gb3", "a3", "c4", "eb4", "gb4")
LAYERS = ("pp", "p", "f", "ff")
EXPECTED_BYTES = 65_200
EXPECTED_TOTAL_BYTES = 2_608_000
EXPECTED_DURATION = 4.0
FADE_SECONDS = 0.2
BITRATE_KBPS = 128
SAMPLE_RATE = 44_100

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "public/audio/growlybass"
MANIFEST_PATH = OUTPUT_DIR / "manifest.json"
LICENSE_PATH = OUTPUT_DIR / "LICENSE"
RUNTIME_CONTRACT_PATH = ROOT / "src/constants/growlybass.generated.ts"
CACHE_DIR = (
    Path(tempfile.gettempdir()) / "music-theory-lab-growlybass" / SOURCE_COMMIT
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url: str, destination: Path, expected_sha256: str) -> None:
    if destination.exists() and sha256(destination) == expected_sha256:
        return
    curl = shutil.which("curl")
    if not curl:
        raise SystemExit("curl é obrigatório para baixar as fontes fixadas")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".download")
    subprocess.run(
        [
            curl,
            "-L",
            "--fail",
            "--silent",
            "--show-error",
            "--remove-on-error",
            "--output",
            str(temporary),
            url,
        ],
        check=True,
    )
    if sha256(temporary) != expected_sha256:
        temporary.unlink(missing_ok=True)
        raise ValueError(f"hash da fonte fixada divergiu: {destination.name}")
    temporary.replace(destination)


def trim_and_fade(source: Path, destination: Path) -> None:
    with wave.open(str(source), "rb") as reader:
        if reader.getnchannels() != 1 or reader.getsampwidth() != 3:
            raise ValueError(f"formato-fonte inesperado: {source.name}")
        if reader.getframerate() != SAMPLE_RATE:
            raise ValueError(f"sample rate inesperado: {source.name}")
        frame_count = round(EXPECTED_DURATION * SAMPLE_RATE)
        if reader.getnframes() < frame_count:
            raise ValueError(f"fonte curta demais: {source.name}")
        params = reader.getparams()
        frames = bytearray(reader.readframes(frame_count))

    fade_frames = round(FADE_SECONDS * SAMPLE_RATE)
    fade_start = frame_count - fade_frames
    for frame in range(fade_start, frame_count):
        offset = frame * 3
        value = int.from_bytes(frames[offset : offset + 3], "little", signed=True)
        factor = (frame_count - frame) / fade_frames
        frames[offset : offset + 3] = round(value * factor).to_bytes(
            3, "little", signed=True
        )

    destination.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(destination), "wb") as writer:
        writer.setparams(params)
        writer.writeframes(frames)


def encode(lame: str, source: Path, destination: Path) -> None:
    trimmed = CACHE_DIR / "trimmed" / source.name
    trim_and_fade(source, trimmed)
    subprocess.run(
        [
            lame,
            "--silent",
            "--noreplaygain",
            "--cbr",
            "-m",
            "m",
            "-b",
            str(BITRATE_KBPS),
            str(trimmed),
            str(destination),
        ],
        check=True,
    )


def ffprobe(ffprobe_path: str, path: Path) -> dict:
    result = subprocess.run(
        [
            ffprobe_path,
            "-v",
            "error",
            "-show_entries",
            (
                "stream=codec_name,sample_rate,channels,bit_rate:"
                "format=duration,bit_rate,tags"
            ),
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def validate_mp3_frames(path: Path) -> None:
    data = path.read_bytes()
    if data.startswith(b"ID3") or data[-128:].startswith(b"TAG"):
        raise ValueError(f"metadados ID3 encontrados: {path.name}")

    offset = 0
    frames = 0
    while offset + 4 <= len(data):
        header = int.from_bytes(data[offset : offset + 4], "big")
        if header >> 21 != 0x7FF:
            raise ValueError(f"frame MP3 inválido em {path.name}:{offset}")
        version = (header >> 19) & 0b11
        layer = (header >> 17) & 0b11
        bitrate_index = (header >> 12) & 0b1111
        sample_rate_index = (header >> 10) & 0b11
        padding = (header >> 9) & 1
        channel_mode = (header >> 6) & 0b11
        if (version, layer, bitrate_index, sample_rate_index, channel_mode) != (
            0b11,
            0b01,
            9,
            0,
            0b11,
        ):
            raise ValueError(f"encoding MP3 fora do contrato: {path.name}")
        frame_bytes = (144 * 128_000) // SAMPLE_RATE + padding
        offset += frame_bytes
        frames += 1

    if offset != len(data) or frames == 0:
        raise ValueError(f"dados anexos ou frame truncado: {path.name}")


def expected_names() -> list[str]:
    return [f"{anchor}_{layer}_rr1.mp3" for anchor in ANCHORS for layer in LAYERS]


def render_runtime_contract(manifest: dict) -> str:
    anchors = "\n".join(
        f"  {{ name: '{anchor['name']}', soundingMidi: {anchor['soundingMidi']} }},"
        for anchor in manifest["anchors"]
    )
    layers = ", ".join(f"'{layer}'" for layer in manifest["layers"])
    return (
        "// Generated by scripts/generate_growlybass_assets.py from the locked manifest.\n"
        "// Do not edit by hand.\n"
        "export const GROWLYBASS_SOURCE_COMMIT =\n"
        f"  '{manifest['source']['commit']}';\n"
        "export const GROWLYBASS_ANCHORS = [\n"
        f"{anchors}\n"
        "] as const;\n"
        f"export const GROWLYBASS_LAYERS = [{layers}] as const;\n"
    )


def load_manifest() -> dict:
    if not MANIFEST_PATH.exists():
        raise ValueError("manifest.json ausente")
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def validate_manifest_contract(manifest: dict) -> None:
    if manifest["source"]["commit"] != SOURCE_COMMIT:
        raise ValueError("commit de origem incorreto")
    if manifest["anchors"] != [
        {"name": name, "soundingMidi": midi}
        for name, midi in zip(ANCHORS, (28, 30, 33, 36, 39, 42, 45, 48, 51, 54))
    ]:
        raise ValueError("anchors aprovados incorretos")
    if manifest["layers"] != list(LAYERS):
        raise ValueError("camadas aprovadas incorretas")
    expected_encoding = {
        "format": "MPEG-1 Layer III",
        "codec": "MP3",
        "channels": 1,
        "bitrateKbps": BITRATE_KBPS,
        "bitrateMode": "CBR",
        "sampleRateHz": SAMPLE_RATE,
        "durationSeconds": EXPECTED_DURATION,
        "attackOffsetSeconds": 0,
        "tailFadeSeconds": FADE_SECONDS,
        "metadata": False,
        "normalization": False,
    }
    for key, value in expected_encoding.items():
        if manifest["encoding"].get(key) != value:
            raise ValueError(f"contrato de encoding incorreto: {key}")
    if manifest["budget"] != {
        "files": 40,
        "bytesPerFile": EXPECTED_BYTES,
        "totalBytes": EXPECTED_TOTAL_BYTES,
    }:
        raise ValueError("orçamento do manifest incorreto")
    names = expected_names()
    entries = manifest["assets"]
    if [entry["name"] for entry in entries] != names:
        raise ValueError("ordem ou nomes do manifest incorretos")
    for entry in entries:
        if len(entry["sourceSha256"]) != 64 or len(entry["sha256"]) != 64:
            raise ValueError(f"hash inválido: {entry['name']}")


def generate() -> None:
    lame = shutil.which("lame")
    ffprobe_path = shutil.which("ffprobe")
    if not lame or not ffprobe_path:
        raise SystemExit("lame e ffprobe são obrigatórios")

    manifest = load_manifest()
    validate_manifest_contract(manifest)
    encoder = subprocess.run(
        [lame, "--version"], capture_output=True, text=True, check=True
    ).stdout.splitlines()[0]
    if encoder != manifest["encoding"]["encoder"]:
        raise ValueError(
            f"encoder divergente: esperado {manifest['encoding']['encoder']}, obtido {encoder}"
        )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    source_dir = CACHE_DIR / "source"
    entries = {entry["name"]: entry for entry in manifest["assets"]}
    for index, output_name in enumerate(expected_names(), start=1):
        entry = entries[output_name]
        source_name = output_name.removesuffix(".mp3") + ".wav"
        source_path = source_dir / source_name
        output_path = OUTPUT_DIR / output_name
        print(f"{index:02d}/40 · {output_name}", flush=True)
        download(
            f"{SOURCE_ROOT}/sustain/{source_name}",
            source_path,
            entry["sourceSha256"],
        )
        encode(lame, source_path, output_path)
        media = ffprobe(ffprobe_path, output_path)
        if sha256(output_path) != entry["sha256"]:
            raise ValueError(f"hash gerado incorreto: {output_name}")
        if float(media["format"]["duration"]) != entry["durationSeconds"]:
            raise ValueError(f"duração gerada incorreta: {output_name}")

    download(
        f"{SOURCE_ROOT}/LICENSE",
        LICENSE_PATH,
        manifest["source"]["licenseSha256"],
    )
    RUNTIME_CONTRACT_PATH.write_text(render_runtime_contract(manifest))
    validate()


def validate() -> None:
    ffprobe_path = shutil.which("ffprobe")
    if not ffprobe_path:
        raise SystemExit("ffprobe é obrigatório para validar os assets")
    manifest = load_manifest()
    validate_manifest_contract(manifest)
    if (
        not RUNTIME_CONTRACT_PATH.exists()
        or RUNTIME_CONTRACT_PATH.read_text() != render_runtime_contract(manifest)
    ):
        raise ValueError("contrato TypeScript gerado está desatualizado")
    if (
        not LICENSE_PATH.exists()
        or sha256(LICENSE_PATH) != manifest["source"]["licenseSha256"]
    ):
        raise ValueError("licença CC0 ausente ou alterada")

    names = expected_names()
    actual_names = sorted(path.name for path in OUTPUT_DIR.glob("*.mp3"))
    if actual_names != sorted(names):
        raise ValueError("nomes ou quantidade de assets incorretos")
    entries = manifest["assets"]

    total_bytes = 0
    for entry in entries:
        path = OUTPUT_DIR / entry["name"]
        size = path.stat().st_size
        if size != EXPECTED_BYTES or entry["bytes"] != EXPECTED_BYTES:
            raise ValueError(f"tamanho incorreto: {entry['name']}")
        if sha256(path) != entry["sha256"]:
            raise ValueError(f"hash incorreto: {entry['name']}")
        if not entry["sourcePath"].endswith("_rr1.wav"):
            raise ValueError(f"fonte não é rr1: {entry['name']}")
        validate_mp3_frames(path)
        media = ffprobe(ffprobe_path, path)
        stream = media["streams"][0]
        if (
            stream["codec_name"] != "mp3"
            or int(stream["sample_rate"]) != SAMPLE_RATE
            or int(stream["channels"]) != 1
            or int(stream["bit_rate"]) != BITRATE_KBPS * 1000
        ):
            raise ValueError(f"mídia fora do contrato: {entry['name']}")
        duration = float(media["format"]["duration"])
        if (
            duration != EXPECTED_DURATION
            or entry["durationSeconds"] != EXPECTED_DURATION
        ):
            raise ValueError(f"duração incorreta: {entry['name']} ({duration})")
        if media["format"].get("tags"):
            raise ValueError(f"metadados encontrados: {entry['name']}")
        total_bytes += size

    if total_bytes != EXPECTED_TOTAL_BYTES:
        raise ValueError(f"orçamento total incorreto: {total_bytes}")
    print(f"40 arquivos válidos · {total_bytes} bytes")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        validate()
    else:
        generate()


if __name__ == "__main__":
    main()
