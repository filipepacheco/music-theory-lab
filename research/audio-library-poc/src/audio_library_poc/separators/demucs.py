"""Demucs htdemucs_6s separator adapter.

The Hybrid-Transformer six-source Demucs model outputs the same six stems
as BS-RoFormer (``drums``, ``bass``, ``other``, ``vocals``, ``guitar``,
``piano``); the ``piano`` output folds into the app ``other`` stem per the
``SeparationResult`` contract.
"""

from __future__ import annotations

from typing import ClassVar

from pydantic import Field, field_validator

from audio_library_poc.paths import validate_workspace_relative_path
from audio_library_poc.separators.config import BaseSeparatorStageConfig
from audio_library_poc.separators.protocol import (
    SeparatorRequest,
    SeparatorResponse,
)

DEMUCS_HTDEMUCS_6S_STAGE_KIND = "separator.demucs_htdemucs_6s"
DEMUCS_HTDEMUCS_6S_CANDIDATE_ID = "demucs_htdemucs_6s"


class DemucsStageConfig(BaseSeparatorStageConfig):
    """Demucs htdemucs_6s knobs on top of the shared separator surface.

    ``checkpoint_relative_path`` locates the pinned single-model ``.th`` file
    inside the workspace; Demucs weights are self-describing so no separate
    YAML config is needed. ``segment`` / ``overlap`` / ``shifts`` are honoured
    verbatim by ``apply_model``; ``split`` / ``jobs`` are Demucs-specific
    scheduler knobs.
    """

    checkpoint_relative_path: str = Field(min_length=1)
    split: bool = True
    jobs: int = Field(default=0, ge=0, le=16)

    @field_validator("checkpoint_relative_path")
    @classmethod
    def validate_checkpoint_path(cls, value: str) -> str:
        return validate_workspace_relative_path(value)


class DemucsSeparator:
    """Real Demucs htdemucs_6s inference adapter."""

    candidate_id: ClassVar[str] = DEMUCS_HTDEMUCS_6S_CANDIDATE_ID
    implementation_version: ClassVar[str] = "1.0.0"
    ConfigModel: ClassVar[type[DemucsStageConfig]] = DemucsStageConfig

    def separate(self, request: SeparatorRequest) -> SeparatorResponse:
        if not isinstance(request.config, self.ConfigModel):
            raise TypeError("DemucsSeparator requires a validated DemucsStageConfig")
        # Lazy import so bs_roformer.py / demucs.py load without torch installed.
        from audio_library_poc.separators._demucs_runtime import (
            run_demucs_inference,
        )

        return run_demucs_inference(
            request=request,
            candidate_id=self.candidate_id,
            implementation_version=self.implementation_version,
        )
