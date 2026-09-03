"""BS-RoFormer six-stem separator adapter stub.

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

BS_ROFORMER_STAGE_KIND = "separator.bs_roformer"
BS_ROFORMER_CANDIDATE_ID = "bs_roformer"


class BsRoformerStageConfig(BaseSeparatorStageConfig):
    """BS-RoFormer knobs on top of the shared separator surface."""

    batch_size: int = Field(default=1, ge=1, le=32)
    use_test_time_augmentation: bool = False


class BsRoformerSeparator:
    """Stub adapter that validates config and declines to infer."""

    candidate_id: ClassVar[str] = BS_ROFORMER_CANDIDATE_ID
    implementation_version: ClassVar[str] = "0.0.0"
    ConfigModel: ClassVar[type[BsRoformerStageConfig]] = BsRoformerStageConfig

    def separate(self, request: SeparatorRequest) -> SeparatorResponse:
        if not isinstance(request.config, self.ConfigModel):
            raise TypeError(
                "BsRoformerSeparator requires a validated BsRoformerStageConfig"
            )
        raise SeparatorNotImplementedError(
            self.candidate_id,
            message=(
                "BS-RoFormer inference is not wired up; pin a checkpoint and "
                "implement separate()"
            ),
        )
