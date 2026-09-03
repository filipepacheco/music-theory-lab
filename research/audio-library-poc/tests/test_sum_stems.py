"""Tests for scripts/sum_stems.py."""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

PACKAGE_ROOT = Path(__file__).parents[1]
SCRIPT_PATH = PACKAGE_ROOT / "scripts" / "sum_stems.py"


def _load_script():
    spec = importlib.util.spec_from_file_location("sum_stems", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules["sum_stems"] = module
    spec.loader.exec_module(module)
    return module


sum_stems_module = _load_script()


def _write_wav(path: Path, waveform: np.ndarray, sample_rate: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # Explicit PCM_16 write via wave to keep the fixture deterministic and
    # independent of soundfile default subtype choices.
    with wave.open(str(path), "wb") as sink:
        sink.setnchannels(waveform.shape[1] if waveform.ndim == 2 else 1)
        sink.setsampwidth(2)
        sink.setframerate(sample_rate)
        sink.writeframes(waveform.astype("<i2").tobytes())


def test_sum_normalizes_summed_audio_to_target_peak(tmp_path: Path) -> None:
    # Two stereo stems, both ±0.6 → summed peak 1.2 → normalized to 0.95.
    sr = 22050
    frames = 4096
    a = np.full((frames, 2), 0.6 * 32767, dtype=np.int16)
    b = np.full((frames, 2), 0.6 * 32767, dtype=np.int16)
    _write_wav(tmp_path / "a.wav", a, sr)
    _write_wav(tmp_path / "b.wav", b, sr)

    waveform, out_sr, source_peak = sum_stems_module.sum_stems(
        [tmp_path / "a.wav", tmp_path / "b.wav"], peak=0.95
    )

    assert out_sr == sr
    assert waveform.dtype == np.int16
    assert waveform.shape == (frames, 2)
    assert source_peak == pytest.approx(1.2, rel=1e-3)
    peak_after = float(np.max(np.abs(waveform))) / 32767.0
    assert peak_after == pytest.approx(0.95, rel=1e-3)


def test_sum_rejects_sample_rate_mismatch(tmp_path: Path) -> None:
    _write_wav(tmp_path / "a.wav", np.zeros((1000, 2), dtype=np.int16), 22050)
    _write_wav(tmp_path / "b.wav", np.zeros((1000, 2), dtype=np.int16), 44100)
    with pytest.raises(ValueError, match="sample rate mismatch"):
        sum_stems_module.sum_stems([tmp_path / "a.wav", tmp_path / "b.wav"], peak=0.95)


def test_sum_rejects_channel_mismatch(tmp_path: Path) -> None:
    _write_wav(tmp_path / "a.wav", np.zeros((1000, 2), dtype=np.int16), 22050)
    _write_wav(tmp_path / "b.wav", np.zeros((1000, 1), dtype=np.int16), 22050)
    with pytest.raises(ValueError, match="channel-count mismatch"):
        sum_stems_module.sum_stems([tmp_path / "a.wav", tmp_path / "b.wav"], peak=0.95)


def test_sum_trims_to_shortest_input(tmp_path: Path) -> None:
    sr = 22050
    long_audio = np.full((10_000, 2), 1000, dtype=np.int16)
    short_audio = np.full((5_000, 2), 500, dtype=np.int16)
    _write_wav(tmp_path / "long.wav", long_audio, sr)
    _write_wav(tmp_path / "short.wav", short_audio, sr)

    waveform, _sr, _peak = sum_stems_module.sum_stems(
        [tmp_path / "long.wav", tmp_path / "short.wav"], peak=0.95
    )
    assert waveform.shape[0] == 5_000


def test_sum_rejects_out_of_range_peak(tmp_path: Path) -> None:
    _write_wav(tmp_path / "a.wav", np.zeros((100, 2), dtype=np.int16), 22050)
    with pytest.raises(ValueError):
        sum_stems_module.sum_stems([tmp_path / "a.wav"], peak=1.5)
    with pytest.raises(ValueError):
        sum_stems_module.sum_stems([tmp_path / "a.wav"], peak=0.0)


def test_sum_handles_single_input(tmp_path: Path) -> None:
    sr = 22050
    audio = np.full((2048, 2), int(0.3 * 32767), dtype=np.int16)
    _write_wav(tmp_path / "solo.wav", audio, sr)

    waveform, _sr, source_peak = sum_stems_module.sum_stems(
        [tmp_path / "solo.wav"], peak=0.95
    )
    # Solo input still gets peak-normalized to 0.95 (from ~0.3).
    peak_after = float(np.max(np.abs(waveform))) / 32767.0
    assert peak_after == pytest.approx(0.95, rel=1e-3)
    assert source_peak == pytest.approx(0.3, rel=1e-3)


def test_sum_requires_at_least_one_input() -> None:
    with pytest.raises(ValueError, match="at least one input path"):
        sum_stems_module.sum_stems([], peak=0.95)


def test_write_wav_returns_sha256_and_replaces_atomically(tmp_path: Path) -> None:
    waveform = np.full((512, 2), 1000, dtype=np.int16)
    output = tmp_path / "nested" / "out.wav"
    sha256 = sum_stems_module.write_wav(output, waveform, 22050)
    assert len(sha256) == 64
    assert output.is_file()
    # Round-trip through soundfile to confirm the file is valid PCM_16 WAV.
    round_trip, sr = sf.read(str(output), dtype="int16", always_2d=True)
    assert sr == 22050
    assert round_trip.shape == waveform.shape
    assert np.array_equal(round_trip, waveform)


def test_main_writes_json_summary(tmp_path: Path) -> None:
    sr = 22050
    audio = np.full((1024, 2), int(0.4 * 32767), dtype=np.int16)
    _write_wav(tmp_path / "a.wav", audio, sr)
    _write_wav(tmp_path / "b.wav", audio, sr)
    output = tmp_path / "sum.wav"

    completed = subprocess.run(
        [
            sys.executable,
            str(SCRIPT_PATH),
            "--output",
            str(output),
            str(tmp_path / "a.wav"),
            str(tmp_path / "b.wav"),
        ],
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    assert completed.returncode == 0, completed.stderr
    summary = json.loads(completed.stdout)
    assert summary["ok"] is True
    assert summary["sample_rate"] == 22050
    assert summary["channels"] == 2
    assert summary["frame_count"] == 1024
    assert len(summary["output_sha256"]) == 64
    assert output.is_file()


def teardown_module(_module) -> None:
    sys.modules.pop("sum_stems", None)
