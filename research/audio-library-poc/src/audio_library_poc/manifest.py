from pathlib import Path

import yaml

from audio_library_poc.models import CorpusManifest, PipelineManifest


class ManifestEncodingError(RuntimeError):
    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        super().__init__(f"manifest is not valid UTF-8: {self.path}")


def _load_yaml(path: Path):
    manifest_path = Path(path)
    try:
        with manifest_path.open("r", encoding="utf-8") as source:
            return yaml.safe_load(source)
    except UnicodeDecodeError as exc:
        raise ManifestEncodingError(manifest_path) from exc


def load_corpus_manifest(path: Path) -> CorpusManifest:

    payload = _load_yaml(path)
    return CorpusManifest.model_validate(payload)


def load_pipeline_manifest(path: Path) -> PipelineManifest:

    payload = _load_yaml(path)
    return PipelineManifest.model_validate(payload)


def resolve_source_path(manifest_path: Path, source_path: str) -> Path:

    candidate = Path(source_path)
    if not candidate.is_absolute():
        candidate = Path(manifest_path).parent / candidate
    return candidate.resolve()
