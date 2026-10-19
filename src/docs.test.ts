import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

describe('glossary: unclear bar', () => {
  const glossary = read('CONTEXT.md');

  it('says an unclear bar carries the chord before it, marked unsure', () => {
    expect(glossary).toMatch(
      /carries the chord before it, marked unsure/,
    );
  });

  it('keeps the no-guess rule for the chord name', () => {
    expect(glossary).toMatch(/gives it no chord name/);
    expect(glossary).toMatch(/ruled out best-effort guessing/);
  });
});

describe('agent doc: audio and persistence', () => {
  const claude = read('CLAUDE.md');

  it('describes the transport, not a beat callback registered by the examples', () => {
    expect(claude).not.toMatch(/register[s]? the beat callback/i);
    expect(claude).toMatch(/transport owns the shared clock/);
    expect(claude).toMatch(/`useStepPlayer`[^\n]*subscribes with `transport\.onBeat`/);
  });

  it('says the save button calls the structures facade through the structures hook', () => {
    expect(claude).toMatch(
      /save button \(`SaveStructureButton`\) calls the structures façade through the structures hook \(`useStructures`\)/,
    );
  });
});
