# Roadmap — Arabic Calligraphy Studio

## Milestone 2 — Advanced calligraphy controls

### Implemented in source (verification still required)
- [x] Project format v2 with migration from v1: `src/editor/model.ts`, `src/editor/storage.ts`
- [x] HarfBuzz WASM glyph engine with bidi run handling: `src/editor/glyphs/`
- [x] Tatweel/kashida slots, presets, preview dialog, and separate Unicode-preserving storage
- [x] OpenType feature discovery from font GSUB/GPOS tables and saved overrides
- [x] Independent diacritic positioning, scaling, reset, undo integration, and persistence
- [x] Editable SVG export with embedded font CSS where available
- [x] Outline SVG export using shaped glyph paths
- [x] Vector PDF writer with canvas/A4/A3/Letter page sizing and background options
- [x] PNG shaped-text opacity compositing fix: translucent glyph paths are rendered to one layer so overlaps do not become darker
- [x] Unit tests covering kashida, feature toggles, project migration, mark adjustment, bidi ordering, SVG paths, and PDF primitives
- [x] GitHub Actions CI workflow added for tests, lint, and production build

### Verification still outstanding
- [ ] Confirm the latest responsive-title fix in a real browser
- [ ] Test resize drag and verify one undo step per drag
- [ ] Download a project, reopen it, and verify uploaded fonts are restored
- [ ] Upload a real supported TTF/OTF font and verify the glyph engine reads it
- [ ] Open editable SVG in a browser and compare Arabic shaping and diacritics
- [ ] Open outline SVG in a separate SVG viewer and compare against the canvas
- [ ] Open PDF in a standard viewer; verify page size, clipping, opacity, and colors
- [ ] Run GitHub Actions and resolve any failing tests, lint checks, or build errors. Current runs fail before the first step starts (`runner_id: 0`, no runner name, no step logs); treat this as runner/workflow infrastructure until evidence shows a source failure.
- [ ] Run browser acceptance checks for dense Arabic diacritics and mixed Arabic/English/numerals
- [ ] Verify WOFF2 limitation messaging and system-font fallback

## Milestone 3 — Professional composition workflow
- [ ] Rulers, guides, snapping, and alignment tools
- [ ] Grouping and multi-selection
- [ ] More decorative vector shapes and editable bezier paths
- [ ] Composition presets and reusable calligraphy layouts
- [ ] Safer project backup/restore and large-project reliability checks

## Working rule
A feature marked implemented is present in the source, not automatically browser-verified. Keep implementation and verification status separate, and never mark an acceptance check complete without an actual test result.
