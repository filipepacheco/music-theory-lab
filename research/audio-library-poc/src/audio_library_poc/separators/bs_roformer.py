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
    checkpoint_relative_path: str = Field(min_length=1)
    config_relative_path: str = Field(min_length=1)
    batch_size: int = Field(default=1, ge=1, le=32)
    use_test_time_augmentation: bool = False

    @field_validator("checkpoint_relative_path", "config_relative_path")
    @classmethod
    def validate_model_asset_paths(cls, value: str) -> str:
        return validate_workspace_relative_path(value)


class BsRoformerSeparator:
    candidate_id: ClassVar[str] = BS_ROFORMER_CANDIDATE_ID
    implementation_version: ClassVar[str] = "1.0.0"
    ConfigModel: ClassVar[type[BsRoformerStageConfig]] = BsRoformerStageConfig

    def separate(self, request: SeparatorRequest) -> SeparatorResponse:
        if not isinstance(request.config, self.ConfigModel):
            raise TypeError(
                "BsRoformerSeparator requires a validated BsRoformerStageConfig"
            )
        _resolve_bs_roformer_assets(request)

        from audio_library_poc.separators._bs_roformer_runtime import (
            run_bs_roformer_inference,
        )

        return run_bs_roformer_inference(
            request=request,
            candidate_id=self.candidate_id,
            implementation_version=self.implementation_version,
        )


def _resolve_bs_roformer_assets(request: SeparatorRequest) -> None:

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
