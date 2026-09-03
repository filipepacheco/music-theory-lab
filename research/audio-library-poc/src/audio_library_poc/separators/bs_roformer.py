"""BS-RoFormer six-stem separator adapter stub.

Phase 2 will replace the ``separate`` body with the pinned inference pattern
from ``research/audio-analysis-pipeline-options.md``. Everything else here —
the stage-kind constant, the config surface, the stable candidate/version
identifiers — is meant to be stable across that work so the pipeline manifest
and cache identities stay valid.
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

BS_ROFORMER_STAGE_KIND = "separator.bs_roformer"
BS_ROFORMER_CANDIDATE_ID = "bs_roformer"


class BsRoformerStageConfig(BaseSeparatorStageConfig):
    """BS-RoFormer knobs on top of the shared separator surface.

    ``checkpoint_relative_path`` and ``config_relative_path`` locate the
    pinned model assets inside the workspace. The bridge validates the config
    but only ``BsRoformerSeparator`` resolves and reads the checkpoint/config
    files, so their paths become part of cache identity (through
    ``config_sha256``) without the bridge doing any file I/O for them.

    ``segment``, ``overlap``, ``shifts``, ``batch_size`` and
    ``use_test_time_augmentation`` are recorded in provenance but the current
    inference path defers all chunking to the ``chunk_size`` / ``num_overlap``
    baked into the model's own YAML config. Overrides land in a later slice.
    """

    checkpoint_relative_path: str = Field(min_length=1)
    config_relative_path: str = Field(min_length=1)
    batch_size: int = Field(default=1, ge=1, le=32)
    use_test_time_augmentation: bool = False

    @field_validator("checkpoint_relative_path", "config_relative_path")
    @classmethod
    def validate_model_asset_paths(cls, value: str) -> str:
        return validate_workspace_relative_path(value)


class BsRoformerSeparator:
    """Real BS-RoFormer inference adapter.

    Loads the pinned six-stem checkpoint (``bass``, ``drums``, ``other``,
    ``vocals``, ``guitar``, ``piano``) and emits the five app stems, folding
    the candidate-native ``piano`` output into the ``other`` app stem per the
    ``SeparationResult`` contract. Uses ``torch.cuda.amp.autocast`` (fp16)
    inside the vendored ``demix_track`` inference loop.
    """

    candidate_id: ClassVar[str] = BS_ROFORMER_CANDIDATE_ID
    implementation_version: ClassVar[str] = "1.0.0"
    ConfigModel: ClassVar[type[BsRoformerStageConfig]] = BsRoformerStageConfig

    def separate(self, request: SeparatorRequest) -> SeparatorResponse:
        if not isinstance(request.config, self.ConfigModel):
            raise TypeError(
                "BsRoformerSeparator requires a validated BsRoformerStageConfig"
            )
        # Lazy imports so the module import stays free of torch — Phase 1
        # tests still pass without the inference extras installed.
        from audio_library_poc.separators._bs_roformer_runtime import (
            run_bs_roformer_inference,
        )

        return run_bs_roformer_inference(
            request=request,
            candidate_id=self.candidate_id,
            implementation_version=self.implementation_version,
        )
