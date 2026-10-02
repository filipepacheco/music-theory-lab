// Reader for Standard MIDI Files (format 0 and 1).
//
// A MIDI file is a big-endian header chunk followed by track chunks; each
// track is a stream of delta-timed events with running status. Only what a
// bass chart needs is kept: notes with their channel, the tempo map, time
// signatures, markers and the General MIDI program each channel plays with.

const PITCH_BEND_CENTRE = 0x2000;
const CHANNEL_COUNT = 16;

export class MidiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MidiError';
  }
}

export interface MidiNote {
  /** 0-based; 9 is the General MIDI drum channel. */
  channel: number;
  pitch: number;
  velocity: number;
  startTick: number;
  endTick: number;
  /** True when the channel's pitch wheel was off-centre while it sounded. */
  bent: boolean;
}

export interface MidiFile {
  ticksPerQuarter: number;
  tempos: { tick: number; microsPerQuarter: number }[];
  timeSignatures: { tick: number; numerator: number; denominator: number }[];
  markers: { tick: number; text: string }[];
  /** Program selected on each channel when its first note plays. */
  programs: Record<number, number>;
  /** Ordered by start, then pitch. */
  notes: MidiNote[];
  endTick: number;
}

export function parseMidi(bytes: Uint8Array): MidiFile {
  if (bytes.length < 14 || ascii(bytes, 0) !== 'MThd') {
    throw new MidiError('not-midi');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const format = view.getUint16(8);
  const division = view.getUint16(12);
  // Format 2 holds unrelated patterns, and SMPTE timing has no beats to chart.
  if (format > 1 || division === 0 || division & 0x8000) {
    throw new MidiError('unsupported');
  }

  const midi: MidiFile = {
    ticksPerQuarter: division,
    tempos: [],
    timeSignatures: [],
    markers: [],
    programs: {},
    notes: [],
    endTick: 0,
  };
  const currentPrograms = new Array<number>(CHANNEL_COUNT).fill(0);
  let offset = 8 + view.getUint32(4);
  while (offset + 8 <= bytes.length) {
    const end = Math.min(bytes.length, offset + 8 + view.getUint32(offset + 4));
    if (ascii(bytes, offset) === 'MTrk') {
      readTrack(bytes.subarray(offset + 8, end), midi, currentPrograms);
    }
    offset = end;
  }

  midi.tempos.sort((a, b) => a.tick - b.tick);
  midi.timeSignatures.sort((a, b) => a.tick - b.tick);
  midi.markers.sort((a, b) => a.tick - b.tick);
  midi.notes.sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);
  return midi;
}

function readTrack(
  data: Uint8Array,
  midi: MidiFile,
  currentPrograms: number[],
): void {
  let position = 0;
  let tick = 0;
  let status = 0;
  const sounding: MidiNote[] = [];
  const bends = new Array<number>(CHANNEL_COUNT).fill(PITCH_BEND_CENTRE);

  const byte = (): number => {
    if (position >= data.length) throw new MidiError('corrupt');
    return data[position++];
  };
  const variableLength = (): number => {
    let value = 0;
    for (let i = 0; i < 4; i += 1) {
      const next = byte();
      value = (value << 7) | (next & 0x7f);
      if (!(next & 0x80)) return value;
    }
    throw new MidiError('corrupt');
  };
  const release = (channel: number, pitch: number) => {
    const index = sounding.findIndex(
      (n) => n.channel === channel && n.pitch === pitch,
    );
    if (index >= 0) sounding.splice(index, 1)[0].endTick = tick;
  };

  while (position < data.length) {
    tick += variableLength();
    if (data[position] & 0x80) status = byte();
    else if (status < 0x80 || status >= 0xf0) throw new MidiError('corrupt');

    if (status === 0xff) {
      const type = byte();
      const length = variableLength();
      const payload = data.subarray(position, position + length);
      if (payload.length < length) throw new MidiError('corrupt');
      position += length;
      if (type === 0x2f) break;
      if (type === 0x51 && length >= 3) {
        midi.tempos.push({
          tick,
          microsPerQuarter: (payload[0] << 16) | (payload[1] << 8) | payload[2],
        });
      } else if (type === 0x58 && length >= 2 && payload[0] > 0) {
        midi.timeSignatures.push({
          tick,
          numerator: payload[0],
          denominator: 2 ** payload[1],
        });
      } else if (type === 0x06) {
        const text = decodeText(payload).trim();
        if (text) midi.markers.push({ tick, text });
      }
      continue;
    }
    if (status === 0xf0 || status === 0xf7) {
      position += variableLength();
      continue;
    }
    if (status >= 0xf0) {
      // System common messages never carry notes; skip their data bytes.
      position += status === 0xf2 ? 2 : status === 0xf3 ? 1 : 0;
      continue;
    }

    const kind = status & 0xf0;
    const channel = status & 0x0f;
    const first = byte();
    const second = kind === 0xc0 || kind === 0xd0 ? 0 : byte();
    if (kind === 0x90 && second > 0) {
      if (!(channel in midi.programs)) {
        midi.programs[channel] = currentPrograms[channel];
      }
      const note: MidiNote = {
        channel,
        pitch: first,
        velocity: second,
        startTick: tick,
        endTick: tick,
        bent: bends[channel] !== PITCH_BEND_CENTRE,
      };
      sounding.push(note);
      midi.notes.push(note);
    } else if (kind === 0x80 || kind === 0x90) {
      release(channel, first);
    } else if (kind === 0xc0) {
      currentPrograms[channel] = first;
    } else if (kind === 0xe0) {
      bends[channel] = (second << 7) | first;
      if (bends[channel] !== PITCH_BEND_CENTRE) {
        for (const note of sounding) {
          if (note.channel === channel) note.bent = true;
        }
      }
    }
  }

  // A note left hanging rings until its track ends.
  for (const note of sounding) note.endTick = tick;
  midi.endTick = Math.max(midi.endTick, tick);
}

function ascii(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

/** Marker text is UTF-8 in modern exports and Latin-1 in older ones. */
function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('latin1').decode(bytes);
  }
}
