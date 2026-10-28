# Roadmap

## Milestone 2 — Advanced calligraphy controls
- [x] Baseline: tests (8/8) and type check pass before changes
- [ ] Baseline browser checks: responsive title, resize drag, reopen downloaded project, real font upload, editable SVG in browser
- [ ] Project format v2 with migration from v1 (kashida, OpenType features, diacritic adjustments)
- [ ] Glyph engine (HarfBuzz WASM + bidi) behind its own module; plain text keeps live browser rendering
- [ ] Tatweel / kashida elongation with joining-safe slots, presets, preview dialog, undo
- [ ] OpenType feature panel from the font's real GSUB/GPOS lists, reset, serialized
- [ ] Independent diacritic editing on canvas (move, scale, reset, undo, saved)
- [ ] Outline SVG export (glyph paths) next to editable SVG
- [ ] Vector PDF export (page size, background options)
- [ ] Tests for kashida, remapping, migration, PDF writer, shaping
- [ ] Browser acceptance run (items 1–13 in the brief) and report
