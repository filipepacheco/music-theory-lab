"""Demucs htdemucs_6s separator adapter stub.

Phase 2 will replace the ``separate`` body with the pinned inference pattern
from ``research/audio-analysis-pipeline-options.md``. Everything else here —
the stage-kind constant, the config surface, the stable candidate/version
identifiers — is meant to be stable across that work so the pipeline manifest
and cache identities stay valid.
"""

from __future__ import annotations

from typing import ClassVar

from pydantic import Field

from audio_library_poc.separators.config import BaseSeparatorStageConfig
from audio_library_poc.separators.protocol import (
    SeparatorNotImplementedError,
    SeparatorRequest,
    SeparatorResponse,
)

DEMUCS_HTDEMUCS_6S_STAGE_KIND = "separator.demucs_htdemucs_6s"
DEMUCS_HTDEMUCS_6S_CANDIDATE_ID = "demucs_htdemucs_6s"


class DemucsStageConfig(BaseSeparatorStageConfig):
    """Demucs htdemucs_6s knobs on top of the shared separator surface."""

    split: bool = True
    jobs: int = Field(default=0, ge=0, le=16)


class DemucsSeparator:
    """Stub adapter that validates config and declines to infer."""

    candidate_id: ClassVar[str] = DEMUCS_HTDEMUCS_6S_CANDIDATE_ID
    implementation_version: ClassVar[str] = "0.0.0"
    ConfigModel: ClassVar[type[DemucsStageConfig]] = DemucsStageConfig

    def separate(self, request: SeparatorRequest) -> SeparatorResponse:
        if not isinstance(request.config, self.ConfigModel):
            raise TypeError("DemucsSeparator requires a validated DemucsStageConfig")
        raise SeparatorNotImplementedError(
            self.candidate_id,
            message=(
                "Demucs htdemucs_6s inference is not wired up; pin a "
                "checkpoint and implement separate()"
            ),
        )
