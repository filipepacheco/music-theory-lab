"""ChordMini BaseTransformer, vendored verbatim from the pinned MIT source."""

import torch
import torch.nn as nn
import torch.nn.functional as F

_pe_cache = {}


def positional_encoding(
    batch_size, n_time, n_feature, zero_pad=False, scale=False, dtype=torch.float32
):
    cache_key = (n_time, n_feature, zero_pad, scale, dtype)
    if cache_key not in _pe_cache:
        pos = torch.arange(n_time, dtype=dtype).reshape(-1, 1)
        pos_enc = pos / torch.pow(
            10000, 2 * torch.arange(0, n_feature, dtype=dtype) / n_feature
        )
        pos_enc[:, 0::2] = torch.sin(pos_enc[:, 0::2])
        pos_enc[:, 1::2] = torch.cos(pos_enc[:, 1::2])
        if zero_pad:
            pos_enc = torch.cat([torch.zeros(1, n_feature), pos_enc[1:, :]], 0)
        if scale:
            pos_enc = pos_enc * (n_feature**0.5)
        _pe_cache[cache_key] = pos_enc
    return _pe_cache[cache_key].unsqueeze(0).expand(batch_size, -1, -1)


class FeedForward(nn.Module):
    def __init__(self, n_feature=512, dropout=0.2):
        super().__init__()
        n_hidden = n_feature * 4
        self.linear1 = nn.Linear(n_feature, n_hidden)
        self.linear2 = nn.Linear(n_hidden, n_feature)
        self.dropout = nn.Dropout(dropout)
        self.norm = nn.LayerNorm(n_hidden)
        self.norm_layer = nn.LayerNorm(n_feature)
        self.alpha = nn.Parameter(torch.zeros(1))

    def forward(self, x):
        residual = x
        y = F.relu(self.norm(self.linear1(x)))
        y = self.dropout(y)
        y = self.linear2(y)
        y = self.dropout(y)
        return self.norm_layer(residual + self.alpha * y)


class EncoderF(nn.Module):
    def __init__(self, n_freq, n_group, n_head=8, n_layer=5, dropout=0.2, pr=0.01):
        super().__init__()
        assert n_freq % n_group == 0
        self.d_model, self.n_freq, self.n_group, self.pr = (
            n_freq // n_group,
            n_freq,
            n_group,
            pr,
        )
        self.attn_layer, self.ff_layer, self.attn_alphas = (
            nn.ModuleList(),
            nn.ModuleList(),
            nn.ParameterList(),
        )
        for _ in range(n_layer):
            self.attn_layer.append(
                nn.MultiheadAttention(self.d_model, n_head, batch_first=True)
            )
            self.ff_layer.append(FeedForward(self.d_model, dropout))
            self.attn_alphas.append(nn.Parameter(torch.zeros(1)))
        self.dropout, self.fc, self.norm_layer = (
            nn.Dropout(dropout),
            nn.Linear(n_freq, n_freq),
            nn.LayerNorm(n_freq),
        )

    def forward(self, x):
        batch, time, _ = x.shape
        x = x.reshape(batch * time, self.n_group, self.d_model)
        x = (
            x
            + positional_encoding(x.shape[0], x.shape[1], x.shape[2]).to(x.device)
            * self.pr
        )
        for index, (attn, ff) in enumerate(zip(self.attn_layer, self.ff_layer)):
            residual = x
            output, _ = attn(x, x, x, need_weights=False)
            x = ff(residual + self.attn_alphas[index] * output)
        return self.norm_layer(
            self.fc(self.dropout(x.reshape(batch, time, self.n_freq)))
        )


class EncoderT(nn.Module):
    def __init__(self, n_freq, n_head=8, n_layer=5, dropout=0.2, pr=0.02):
        super().__init__()
        self.n_freq, self.pr = n_freq, pr
        self.attn_layer, self.ff_layer, self.attn_alphas = (
            nn.ModuleList(),
            nn.ModuleList(),
            nn.ParameterList(),
        )
        for _ in range(n_layer):
            self.attn_layer.append(
                nn.MultiheadAttention(n_freq, n_head, batch_first=True)
            )
            self.ff_layer.append(FeedForward(n_freq, dropout))
            self.attn_alphas.append(nn.Parameter(torch.zeros(1)))
        self.dropout, self.fc, self.norm_layer = (
            nn.Dropout(dropout),
            nn.Linear(n_freq, n_freq),
            nn.LayerNorm(n_freq),
        )

    def forward(self, x):
        batch, time, features = x.shape
        x = x + positional_encoding(batch, time, features).to(x.device) * self.pr
        for index, (attn, ff) in enumerate(zip(self.attn_layer, self.ff_layer)):
            residual = x
            output, _ = attn(x, x, x, need_weights=False)
            x = ff(residual + self.attn_alphas[index] * output)
        return self.norm_layer(self.fc(self.dropout(x)))


class Decoder(nn.Module):
    def __init__(
        self,
        d_model=512,
        n_head=8,
        n_layer=5,
        dropout=0.5,
        r1=1.0,
        r2=1.0,
        wr=1.0,
        pr=0.01,
    ):
        super().__init__()
        self.r1, self.r2, self.wr, self.pr = r1, r2, wr, pr
        self.attn_layer1, self.attn_layer2, self.ff_layer = (
            nn.ModuleList(),
            nn.ModuleList(),
            nn.ModuleList(),
        )
        self.attn1_alphas, self.attn2_alphas = nn.ParameterList(), nn.ParameterList()
        for _ in range(n_layer):
            self.attn_layer1.append(
                nn.MultiheadAttention(d_model, n_head, batch_first=True)
            )
            self.attn_layer2.append(
                nn.MultiheadAttention(d_model, n_head, batch_first=True)
            )
            self.ff_layer.append(FeedForward(d_model, dropout))
            self.attn1_alphas.append(nn.Parameter(torch.zeros(1)))
            self.attn2_alphas.append(nn.Parameter(torch.zeros(1)))
        self.dropout, self.fc, self.norm_layer = (
            nn.Dropout(dropout),
            nn.Linear(d_model, d_model),
            nn.LayerNorm(d_model),
        )

    def forward(self, x1, x2, weight=None):
        y = x1 * self.r1 + x2 * self.r2
        if weight is not None:
            while weight.dim() < y.dim():
                weight = weight.unsqueeze(-1)
            if weight.shape[-1] == 1 and y.shape[-1] > 1:
                weight = weight.expand_as(y)
            y = y + weight * self.wr
        y = (
            y
            + positional_encoding(y.shape[0], y.shape[1], y.shape[2]).to(y.device)
            * self.pr
        )
        for index in range(len(self.attn_layer1)):
            residual = y
            output, _ = self.attn_layer1[index](y, y, y, need_weights=False)
            y = self.norm_layer(
                residual + self.attn1_alphas[index] * self.dropout(output)
            )
            residual = y
            output, _ = self.attn_layer2[index](y, x2, x2, need_weights=False)
            y = self.norm_layer(
                residual + self.attn2_alphas[index] * self.dropout(output)
            )
            y = self.ff_layer[index](y)
        return self.fc(self.dropout(y)), y


class BaseTransformer(nn.Module):
    def __init__(
        self,
        n_channel=1,
        n_freq=2048,
        n_group=16,
        f_layer=2,
        f_head=8,
        f_dropout=0.2,
        t_layer=2,
        t_head=4,
        t_dropout=0.2,
        d_layer=2,
        d_head=4,
        d_dropout=0.5,
        r1=1.0,
        r2=1.0,
        wr=0.2,
    ):
        super().__init__()
        self.n_channel = n_channel
        self.encoder_f, self.encoder_t = nn.ModuleList(), nn.ModuleList()
        for _ in range(n_channel):
            self.encoder_f.append(EncoderF(n_freq, n_group, f_head, f_layer, f_dropout))
            self.encoder_t.append(EncoderT(n_freq, t_head, t_layer, t_dropout))
        self.decoder = Decoder(n_freq, d_head, d_layer, d_dropout, r1, r2, wr)

    def forward(self, x, weight=None):
        if x.ndim == 3:
            x = x.unsqueeze(1)
        if self.n_channel == 1:
            y1, y2 = self.encoder_f[0](x[:, 0]), self.encoder_t[0](x[:, 0])
        else:
            frequencies = [
                self.encoder_f[index](x[:, index])
                for index in range(min(self.n_channel, x.shape[1]))
            ]
            temporal = [
                self.encoder_t[index](x[:, index])
                for index in range(min(self.n_channel, x.shape[1]))
            ]
            y1, y2 = (
                torch.sum(torch.stack(frequencies), dim=0),
                torch.sum(torch.stack(temporal), dim=0),
            )
        return self.decoder(y1, y2, weight)
