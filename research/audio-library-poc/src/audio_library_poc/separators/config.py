"""Shared config surface every separator stage extends."""

from __future__ import annotations

from pydantic import Field, field_validator

from audio_library_poc.models import ContractModel
from audio_library_poc.paths import validate_workspace_relative_path
from audio_library_poc.separation import SeparatorPrecision


class BaseSeparatorStageConfig(ContractModel):
    """Fields every separator stage requires regardless of candidate.

    ``source_relative_path`` locates the source audio inside the workspace so
    the bridge can resolve and hash it before calling the separator. The
    remaining fields mirror ``EffectiveSeparatorSettings`` in
    ``separation.py`` and become part of the recorded provenance in the
    ``SeparationResult`` a real separator later emits.

    Per-candidate configs extend this model with candidate-specific knobs.
    All ``extra`` fields are rejected by ``ContractModel``, so a config with
    an unknown key fails validation with a typed error rather than silently
    being ignored.
    """

    source_relative_path: str = Field(min_length=1)
    segment: float | None = Field(default=None, gt=0)
    overlap: float = Field(default=0.25, ge=0, lt=1)
    shifts: int = Field(default=1, ge=1)
    device: str = Field(default="cuda", min_length=1, max_length=128)
    precision: SeparatorPrecision = SeparatorPrecision.FLOAT32
    retain_native: bool = False

    @field_validator("source_relative_path")
    @classmethod
    def validate_source_relative_path(cls, value: str) -> str:
        return validate_workspace_relative_path(value)

    @field_validator("device")
    @classmethod
    def validate_device(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("device must not be blank")
        return value
