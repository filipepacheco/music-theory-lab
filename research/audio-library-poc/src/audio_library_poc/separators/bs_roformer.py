"""BS-RoFormer six-stem separator adapter.

The adapter delegates real inference to ``_bs_roformer_runtime`` after its
checkpoint and model config pass workspace-containment preflight checks. Its
stage-kind constant, config surface, and stable candidate/version identifiers
remain cache-identity inputs.
"""

from __future__ import annotations

from typing import ClassVar

from pydantic import Field, field_validator

from audio_library_poc.asset_resolution import (
    resolve_workspace,
    resolve_workspace_asset,
)
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
    ``use_test_time_augmentation`` are recorded in provenance. The runtime's
    effective chunking must be captured from the selected model configuration
    and verified in an empirical parity run.
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
        # Resolve the model assets BEFORE the lazy import below: a missing
        # checkpoint must surface as a typed failure, not as the
        # ModuleNotFoundError the torch import would raise first on a
        # machine without the inference extras.
        _resolve_bs_roformer_assets(request)

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


def _resolve_bs_roformer_assets(request: SeparatorRequest) -> None:
    """Validate the checkpoint and model config exist inside the workspace.

    Mirrors the resolution the runtime performs, in the same order, so the
    typed failure is identical whether or not torch is importable.
    """

    config = request.config
    workspace = resolve_workspace(request.source_path, config.source_relative_path)
    for relative_path, label in (
        (config.checkpoint_relative_path, "checkpoint"),
        (config.config_relative_path, "config"),
    ):
        resolve_workspace_asset(
            workspace,
            relative_path,
            code_prefix="separator",
            label=label,
            outside_message=(
                f"BS-RoFormer {label} path must resolve inside the workspace"
            ),
            missing_message=f"BS-RoFormer {label} file is missing",
        )
