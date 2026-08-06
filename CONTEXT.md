# Domain Glossary

Terms specific to the [.gp file → chord progression feasibility effort](https://github.com/filipepacheco/music-theory-lab/issues/2). Not yet used elsewhere in the app.

## Harmony track

The track in a `.gp` file's data that carries full chord content per bar — always polyphonic (multiple simultaneous pitches), never a single note. Source of chord *quality* (major/minor/7th/etc). Identified by literal track name for v1 (e.g. `"Rhythm Guitar - Acoustic Guitar (steel)"`); no structural auto-detection yet. See [Decide track-sourcing strategy for chord extraction](https://github.com/filipepacheco/music-theory-lab/issues/5).

## Root track

The track providing a bass/root anchor per bar — often monophonic or near-monophonic (frequently a single note). Used alongside the harmony track, not merely as a gap-filler. Cannot alone determine chord quality. Identified by literal track name for v1 (e.g. `"Electric Bass (finger)"`).

## No chord data

The explicit output label for a bar where **both** the harmony track and root track are silent — distinct from a bar that resolved to an *ambiguous* chord (which still gets a best-effort label, per the map's Notes). Not a fallback chain to other tracks; just an honest "nothing to work with here."
