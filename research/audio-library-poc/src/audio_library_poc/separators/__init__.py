"""Model-agnostic seam for candidate stem-separator implementations."""

from audio_library_poc.separators.bs_roformer import (
    BS_ROFORMER_STAGE_KIND,
    BsRoformerSeparator,
    BsRoformerStageConfig,
)
from audio_library_poc.separators.config import BaseSeparatorStageConfig
from audio_library_poc.separators.demucs import (
    DEMUCS_HTDEMUCS_6S_STAGE_KIND,
    DemucsSeparator,
    DemucsStageConfig,
)
from audio_library_poc.separators.protocol import (
    Separator,
    SeparatorNotImplementedError,
    SeparatorRequest,
    SeparatorResponse,
)

__all__ = (
    "BS_ROFORMER_STAGE_KIND",
    "BaseSeparatorStageConfig",
    "BsRoformerSeparator",
    "BsRoformerStageConfig",
    "DEMUCS_HTDEMUCS_6S_STAGE_KIND",
    "DemucsSeparator",
    "DemucsStageConfig",
    "Separator",
    "SeparatorNotImplementedError",
    "SeparatorRequest",
    "SeparatorResponse",
)
