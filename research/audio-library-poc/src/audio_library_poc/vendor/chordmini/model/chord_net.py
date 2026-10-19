"""ChordMini ChordNet from pinned MIT revision aa6e3a8d7b017f082fd2aaff9329d5c26af49c03."""

import torch
import torch.nn as nn

from .base_transformer import BaseTransformer
from .temporal_smoothing import apply_temporal_smoothing


class ChordNet(nn.Module):
    def __init__(
        self,
        n_freq=144,
        n_classes=170,
        n_group=12,
        f_layer=5,
        f_head=8,
        t_layer=5,
        t_head=8,
        d_layer=5,
        d_head=8,
        dropout=0.2,
        ignore_index=None,
        **kwargs,
    ):
        super().__init__()
        if n_freq % n_group:
            raise ValueError("n_freq must be divisible by n_group")
        feature_dim = n_freq // n_group
        for heads in range(f_head, 0, -1):
            if feature_dim % heads == 0:
                f_head = heads
                break
        self.transformer = BaseTransformer(
            1,
            n_freq,
            n_group,
            f_layer,
            f_head,
            dropout,
            t_layer,
            t_head,
            dropout,
            d_layer,
            d_head,
            dropout,
        )
        self.dropout, self.n_classes, self.fc, self.ignore_index = (
            nn.Dropout(dropout),
            n_classes,
            nn.Linear(n_freq, n_classes),
            ignore_index,
        )
        self.idx_to_chord = kwargs.get("idx_to_chord")

    def forward(self, x, targets=None, weight=None):
        if x.dim() == 3:
            x = x.unsqueeze(1)
        elif x.dim() == 2:
            x = x.unsqueeze(1).unsqueeze(1)
        _, features = self.transformer(x, weight)
        logits = self.fc(self.dropout(features))
        if targets is not None:
            raise RuntimeError("training loss is not vendored for inference")
        return logits, features

    def predict(
        self, x, per_frame=False, smooth=True, kernel_size=9, use_gaussian=False
    ):
        with torch.no_grad():
            logits = self.forward(x)[0]
            if smooth:
                logits = apply_temporal_smoothing(logits, kernel_size, use_gaussian)
            return (
                logits.argmax(dim=-1)
                if per_frame
                else logits.mean(dim=1).argmax(dim=-1)
            )
