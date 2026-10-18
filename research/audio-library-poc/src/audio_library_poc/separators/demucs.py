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

DEMUCS_HTDEMUCS_6S_STAGE_KIND = "separator.demucs_htdemucs_6s"
DEMUCS_HTDEMUCS_6S_CANDIDATE_ID = "demucs_htdemucs_6s"


class DemucsStageConfig(BaseSeparatorStageConfig):
    checkpoint_relative_path: str = Field(min_length=1)
    split: bool = True
    jobs: int = Field(default=0, ge=0, le=16)

    @field_validator("checkpoint_relative_path")
    @classmethod
    def validate_checkpoint_path(cls, value: str) -> str:
        return validate_workspace_relative_path(value)


class DemucsSeparator:
    candidate_id: ClassVar[str] = DEMUCS_HTDEMUCS_6S_CANDIDATE_ID
    implementation_version: ClassVar[str] = "1.0.0"
    ConfigModel: ClassVar[type[DemucsStageConfig]] = DemucsStageConfig

    def separate(self, request: SeparatorRequest) -> SeparatorResponse:
        if not isinstance(request.config, self.ConfigModel):
            raise TypeError("DemucsSeparator requires a validated DemucsStageConfig")
        _resolve_demucs_assets(request)

        from audio_library_poc.separators._demucs_runtime import (
            run_demucs_inference,
        )

        return run_demucs_inference(
            request=request,
            candidate_id=self.candidate_id,
            implementation_version=self.implementation_version,
        )


def _resolve_demucs_assets(request: SeparatorRequest) -> None:

    config = request.config
    workspace = resolve_workspace(request.source_path, config.source_relative_path)
    resolve_workspace_asset(
        workspace,
        config.checkpoint_relative_path,
        code_prefix="separator",
        label="checkpoint",
        outside_message="Demucs checkpoint path must resolve inside the workspace",
        missing_message="Demucs checkpoint file is missing",
    )
