from __future__ import annotations

from pydantic import Field, field_validator

from audio_library_poc.models import ContractModel
from audio_library_poc.paths import validate_workspace_relative_path
from audio_library_poc.separation import SeparatorPrecision


class BaseSeparatorStageConfig(ContractModel):
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
