# GPIF Chord Metadata Findings

Resolves: https://github.com/filipepacheco/music-theory-lab/issues/4 (child of https://github.com/filipepacheco/music-theory-lab/issues/2)

## Method

Primary source examined: [CoderLine/alphaTab](https://github.com/CoderLine/alphaTab), an open-source TypeScript library that parses gp3/gp4/gp5/gpx/gp7/gp8 files and is actively used to render Guitar Pro tabs in browsers. Cloned locally at commit `a186437bb3263e5ae3f8fd373aef1fef5ebbc7e7` (2026-08-01) into a scratch directory and read its GPIF importer source directly, plus extracted and inspected two of its real GP7 test fixture `.gp` files (zip containers) byte-for-byte. Corroborated with PyGuitarPro's documented binary format and alphaTab's own published format-support matrix.

---

## 1. Does the GPIF schema have a concept of a named chord assigned to a beat/track, separate from an auto-generated fret-diagram graphic?

**Yes.** The GP7 GPIF XML format has an explicit, separate chord-name concept, distinct from the fret-diagram graphic. This is proven two ways:

- **Parser code**: `packages/alphatab/src/importer/GpifParser.ts` in alphaTab has a dedicated code path (`_parseDiagramItemForChord`, line 1061) that reads a chord's `name` attribute (line 1062: `chord.name = node.getAttribute('name');`) *before* it even looks for a `<Diagram>` child element. If no `<Diagram>` element is present, it explicitly sets `chord.showDiagram = false; chord.showFingering = false;` and returns early (lines 1064-1069) - i.e., the parser is written to expect chord name data can exist with zero diagram/fret data.
- **Real fixture proof**: The test fixture `packages/alphatab/test-data/guitarpro7/chord-no-diagram.gp` (a real GP7 zip file, extracted and inspected directly) contains, inside `Content/score.gpif`:
  ```xml
  <Property name="ChordCollection">
  <Items>
  <Item id="0" name="C">
  <Chord>
  <KeyNote step="C" accidental="Natural"/>
  <BassNote step="C" accidental="Natural"/>
  <Degree interval="Third" alteration="Major" omitted="false"/>
  <Degree interval="Fifth" alteration="Perfect" omitted="false"/>
  </Chord>
  </Item>
  </Items>
  </Property>
  ...
  <Property name="DiagramCollection">
  <Items />
  </Property>
  ```
  (score.gpif, extracted from `test-data/guitarpro7/chord-no-diagram.gp`, lines 217-234). Here `DiagramCollection` is empty (`<Items />`) but `ChordCollection` has a fully named, harmonically-described chord ("C" = major triad, root/third/fifth) with **no fret/string data at all**. The corresponding alphaTab test (`packages/alphatab/test/importer/Gp7Importer.test.ts`, lines 915-921) asserts exactly this: `beats[0].chord!.name` equals `'C'` and `beats[0].chord!.strings.length` equals `0`.

  This is direct, concrete confirmation that Guitar Pro's desktop "chord diagram" feature can serialize a chord **name** into the GPIF XML independent of any fret-diagram graphic, matching the very case the research question asked about.

- Supporting evidence: alphaTab's own published format-support matrix at https://alphatab.net/docs/formats/guitar-pro-7 lists both "Chord Names" and "Chord Diagrams" as separate rows under "Beat Level" support, each marked "Supported" for Data Model and Reading (they are just "Ignored" for Rendering/Audio in alphaTab itself - i.e., alphaTab reads them but doesn't render/play them by default).

- Cross-format corroboration: The same concept (chord name stored separately from fret/diagram data) also exists in the older binary formats. Per PyGuitarPro's documented format reference (https://pyguitarpro.readthedocs.io/en/stable/pyguitarpro/format.html), GP3's "old-style" chord block stores a `Name: IntByteSizeString` field ("e.g. Em") before the fret-diagram ints, and GP4/GP5's "new-style" chord block stores `Name: ByteSizeString` (max 22 chars) likewise separate from the root/type/extension/fret/barre diagram fields. alphaTab's own test suite runs the identical `GpImporterTestHelper.checkChords(score)` assertion (`packages/alphatab/test/importer/GpImporterTestHelper.ts`, line 479) against `Gp5Importer.test.ts` (line 168), `GpxImporter.test.ts` (line 264), and `Gp7Importer.test.ts` (line 706) - i.e., the same "named chord attached to a beat" model is normalized by alphaTab across GP5, GP6/GPX, and GP7/GP8 despite their different underlying file formats.

---

## 2. Structurally, what does it look like - specific enough to grep/parse against?

Two linked structures, confirmed against a real extracted `score.gpif`:

**A. A dictionary of named chords, at Track or Staff level:**

```
<Score>
  <Tracks>
    <Track>
      ...
      <Staves>
        <Staff>
          <Properties>
            <Property name="ChordCollection">      <!-- or "DiagramCollection" -->
              <Items>
                <Item id="0" name="C">              <!-- id + human-readable chord name -->
                  <Diagram stringCount="6" fretCount="5" baseFret="0" ...>   <!-- OPTIONAL -->
                    <Fret string="1" fret="3"/>
                    ...
                    <Fingering>...</Fingering>
                    <Property name="ShowDiagram" type="bool" value="true" />
                    <Property name="ShowName" type="bool" value="true" />
                    <Property name="ShowFingering" type="bool" value="true" />
                  </Diagram>
                  <Chord>                            <!-- music-theory decomposition, also OPTIONAL -->
                    <KeyNote step="C" accidental="Natural"/>
                    <BassNote step="C" accidental="Natural"/>
                    <Degree interval="Third" alteration="Major" omitted="false"/>
                    <Degree interval="Fifth" alteration="Perfect" omitted="false"/>
                  </Chord>
                </Item>
              </Items>
            </Property>
          </Properties>
        </Staff>
      </Staves>
    </Track>
  </Tracks>
```

Both property names `"ChordCollection"` and `"DiagramCollection"` are treated as synonyms by alphaTab's parser (`GpifParser.ts` lines 981-984 and 1160-1163: `case 'DiagramCollection': case 'ChordCollection': this._parseDiagramCollectionForStaff/Track(...)`). In the two real fixtures inspected, one file (`chords.gp`) put the actual chord entries under `DiagramCollection` (with `ChordCollection` left as an empty `<Items/>`), while the other (`chord-no-diagram.gp`) put them under `ChordCollection` (with `DiagramCollection` empty). Both are legitimate placements a parser must check.

Grep-able anchors: `Property name="ChordCollection"`, `Property name="DiagramCollection"`, `<Item id="..." name="...">` inside either, and `<Diagram ` (presence/absence of this child element is exactly what distinguishes "has a fret-diagram graphic" from "name-only chord").

**B. A per-beat reference into that dictionary:**

```
<Beat id="0">
  <Dynamic>MF</Dynamic>
  <Rhythm ref="0" />
  <Chord><![CDATA[0]]></Chord>     <!-- references Item id="0" above -->
  <Notes>0 1 2 3 4</Notes>
  ...
</Beat>
```

(verified at `score.gpif` line 857, extracted from `test-data/guitarpro7/chords.gp`). alphaTab's parser reads this at `GpifParser.ts` line 1721-1723 (`case 'Chord': beat.chordId = c.innerText; break;`) and exposes it on the model as `Beat.chordId` (`src/model/Beat.ts` line 516) with a `get chord()` accessor (line 522-523) that resolves it via `Staff.getChord(chordId)` (`src/model/Staff.ts` lines 168-184, backed by a `chords: Map<string, Chord>`).

Grep-able anchor: `<Chord>` (or `<Chord><![CDATA[...]]></Chord>`) as a **direct child of `<Beat>`** - this is a different, simpler tag than the `<Chord>` used inside a dictionary `<Item>` for harmonic decomposition, so a parser must disambiguate by XML path/parent, not tag name alone.

Note: this is the GP7 GPIF (XML) structure specifically. GP3/4/5 binary formats use an analogous but differently-encoded per-beat inline chord block (not a separate id-referenced dictionary) - see PyGuitarPro's format docs cited above.

---

## 3. How common is this in practice ("in the wild")?

Evidence found supports "occurs, but is author-dependent and not guaranteed" rather than "always present" or "never present":

- alphaTab ships **dedicated real-world-style GP7 test fixtures specifically for this feature**: `test-data/guitarpro7/chords.gp` (multiple named chords with full fret diagrams, fingerings, and harmonic decomposition - 8 chords covering C, Cm, D, Dm variants at different neck positions) and `test-data/guitarpro7/chord-no-diagram.gp` (a named chord with zero diagram data). The library's maintainers considered both cases (with-diagram and name-only) important enough to test explicitly and keep as regression fixtures, which is a strong signal the feature is exercised in real Guitar Pro files users produce.
- The feature is also present, in analogous form, across GP5 and GPX (GP6) binary/zip formats (same `checkChords` test helper reused across `Gp5Importer.test.ts`, `GpxImporter.test.ts`, `Gp7Importer.test.ts`), meaning it isn't a GP7-only edge case - it has existed since at least GP3/4 (per PyGuitarPro's format documentation of the legacy binary chord block).
- Countering that: the very sample file manually inspected for this issue (a real GP7 export) had **zero** chord-related tags anywhere - i.e., its author never used Guitar Pro's "type a chord name onto a beat" UI feature at all. Chord-diagram/chord-name assignment in Guitar Pro is a manual, opt-in annotation step (the user has to explicitly type or select a chord name onto a beat) - it is not auto-populated from the notes/tab data by Guitar Pro itself. Files transcribed purely as raw fretted notes (the common case for a quick tab rip) will have empty `ChordCollection`/`DiagramCollection` dictionaries and no per-beat `<Chord>` references, exactly like the file already inspected for this issue.
- No public GPIF XSD/schema was found (searched explicitly); Guitar Pro's file format is not formally published by Arobas Music, so the alphaTab source (a mature, actively-maintained reverse-engineered parser with passing round-trip tests against real Guitar Pro-produced files) is the most authoritative available reference for the actual on-disk shape.

---

## Viability summary

Metadata-based chord extraction is a viable **fast path for some** real-world `.gp`/`.gpif` files - specifically, any file where the original tab author manually assigned chord names via Guitar Pro's chord-diagram UI, which is detectable cheaply by checking whether `ChordCollection`/`DiagramCollection` under any `Staff`'s `Properties` has non-empty `<Items>` and whether any `<Beat>` elements carry a direct child `<Chord>` id reference - but it is not a fast path that can be assumed to exist. Because chord-name assignment is a manual, opt-in step in Guitar Pro's editor rather than something the app generates automatically from the tab notes, a large share of casually-transcribed tabs (like the one file already inspected for this issue) will have empty chord dictionaries. The most robust prototype design is therefore a **hybrid**: attempt the cheap metadata read first (dictionary lookup + beat-level `chordId` resolution) as an optimization, but always keep note-based pitch-set inference as the required fallback path, since it is the only approach guaranteed to work across the full range of real-world files.
