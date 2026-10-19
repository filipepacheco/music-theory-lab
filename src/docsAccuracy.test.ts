import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (file: string) => readFileSync(join(root, file), 'utf8');

/** The text of one `## ` section of a markdown file, up to the next `## `. */
function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`## ${heading}`);
  if (start < 0) throw new Error(`missing section: ${heading}`);
  const rest = markdown.slice(start + 3 + heading.length);
  const next = rest.search(/\n## /);
  return next < 0 ? rest : rest.slice(0, next);
}

/** The text of one `### ` subsection, up to the next `###` or `## ` heading. */
function subsection(markdown: string, heading: string): string {
  const start = markdown.indexOf(`### ${heading}`);
  if (start < 0) throw new Error(`missing subsection: ${heading}`);
  const rest = markdown.slice(start + 4 + heading.length);
  const next = rest.search(/\n##(#)? /);
  return next < 0 ? rest : rest.slice(0, next);
}

describe('glossary: unclear bar', () => {
  const unclear = section(read('CONTEXT.md'), 'Unclear bar');

  it('says an unclear bar carries the chord before it, marked unsure', () => {
    expect(unclear).toMatch(/chord before it/);
    expect(unclear).toMatch(/unsure/);
  });

  it('says a bar with no chord before it gets the ? placeholder, marked unsure', () => {
    expect(unclear).toMatch(/no chord comes before it/);
    expect(unclear).toMatch(/\?/);
    expect(unclear).toMatch(/placeholder/);
  });

  it('no longer says an unclear bar carries no chord label', () => {
    expect(unclear).not.toMatch(/carries \*\*no\*\* chord label/i);
  });

  it('keeps the no-guess rule for the chord name', () => {
    expect(unclear).toMatch(/guess/i);
    expect(unclear).toMatch(/no-fuzzy-fallback/);
  });
});

describe('audio doc: transport', () => {
  const claude = read('CLAUDE.md');
  const metronome = subsection(claude, 'Metronome & Progression Playback');

  it('no longer says progression examples register the beat callback', () => {
    expect(metronome).not.toMatch(/ProgressionExamples hooks into/);
    expect(metronome).not.toMatch(/`onBeat\(callback\)` registration/);
  });

  it('no longer says ProgressionExamples tracks beats or does look-ahead', () => {
    expect(metronome).not.toMatch(/ProgressionExamples tracks beat position/);
    expect(metronome).not.toMatch(/^- ProgressionExamples /m);
  });

  it('names useStepPlayer as the beat subscriber and look-ahead owner', () => {
    expect(metronome).toMatch(/useStepPlayer/);
    expect(metronome).toMatch(/transport\.onBeat/);
    expect(metronome).toMatch(/offsetEighths/);
  });

  it('describes the transport as owner of the shared clock and beat listeners', () => {
    expect(metronome).toMatch(/transport/i);
    expect(metronome).toMatch(/shared clock/i);
    expect(metronome).toMatch(/beat listeners/i);
    expect(metronome).toMatch(/newest player/i);
  });
});

describe('persistence doc: structures save path', () => {
  const persistence = subsection(read('CLAUDE.md'), 'Persistence (sql.js)');

  it('no longer says the store calls the structures façade', () => {
    expect(persistence).not.toMatch(/store uses the structures/i);
  });

  it('says the save button calls the structures façade through the structures hook', () => {
    expect(persistence).toMatch(/save button/i);
    expect(persistence).toMatch(/useStructures/);
    expect(persistence).toMatch(/structures façade/);
  });
});

describe('agent doc word cap', () => {
  it('keeps CLAUDE.md below 2,500 words', () => {
    const words = read('CLAUDE.md').split(/\s+/).filter(Boolean).length;
    expect(words).toBeLessThan(2500);
  });
});
