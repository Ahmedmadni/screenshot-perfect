# Roadmap — Arabic Calligraphy Studio

## Milestone 2 — Advanced calligraphy controls

### Implemented in source (verification still required)
- [x] Project format v3 with migration support for v1/v2 files: `src/editor/model.ts`, `src/editor/storage.ts`
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
- [ ] Verify the new Bézier path tests in an executed test run; tests have been added but not yet run in CI. Latest Actions jobs still terminate with `runner_id: 0`, no runner name, and no steps.
- [ ] Run browser acceptance checks for pen/curvature/freehand drawing, handle dragging, node insertion, close/open, undo/redo, save/reopen, and PNG/SVG/PDF export
- [ ] Run browser acceptance checks for dense Arabic diacritics and mixed Arabic/English/numerals
- [ ] Verify WOFF2 limitation messaging and system-font fallback

## Milestone 3 — Professional composition workflow
- [ ] Rulers, guides, snapping, and alignment tools
- [ ] Grouping and multi-selection
- [x] Bézier path data model, curve geometry, and SVG path serialization are present in source
- [x] Pen, curvature, and freehand path creation tools wired into the canvas; anchor/handle editing, node insertion, node type conversion, contour close/open, path style controls, adjustable freehand smoothing, and Escape-to-cancel implemented in source (browser verification still required)
- [ ] More decorative vector shapes and editable bezier paths beyond the current core tools
- [ ] Composition presets and reusable calligraphy layouts
- [ ] Safer project backup/restore and large-project reliability checks

## Working rule
A feature marked implemented is present in the source, not automatically browser-verified. Keep implementation and verification status separate, and never mark an acceptance check complete without an actual test result.


## Milestone 4 — Interactive diacritics and ornament library
- [x] Dedicated editor tab for Arabic diacritics, Qur’anic/Islamic symbols, floral/geometric glyph ornaments, and dividers
- [x] Search field and category filters for the library
- [x] Click-to-insert and drag-and-drop placement onto the canvas
- [x] Inserted decorations are independent text layers and inherit the existing object transform, color, opacity, duplicate, delete, save, and export workflows
- [ ] Browser acceptance: drag from each category, position precisely, resize/rotate, undo/redo, save/reopen, and export PNG/SVG/PDF
- [ ] Replace/augment Unicode ornament glyphs with purpose-built editable Bézier/SVG ornament packs
- [ ] Add favorites, custom collections, and touch-friendly drag placement

### Latest CI findings
- [x] TypeScript check passed on commit `adf6a831fc9b8393aa4a66d43f438db217aca4d8`
- [x] Identified and corrected a stale migration test expectation: v1 projects correctly migrate to current format v3
- [ ] Re-run tests, lint, and build after the migration-test and searchable-library changes; latest workflow run is pending job allocation


### Milestone 4 progress — editable vector presets
- [x] Added a separate Vector category in the decoration library: eight-point star, diamond, circular frame, arch, frame, and a layered geometric rosette
- [x] Vector presets are inserted as native ShapeObjects (not text glyphs), so width/height, fill, stroke, stroke width, rotation, opacity, ordering, duplication, deletion, project save, and vector export use the existing shape pipeline
- [x] Both click insertion and canvas drop now route through the same vector-aware insertion handler
- [ ] Browser-verify all vector presets, drag/drop coordinates at non-100% zoom and with canvas scrolling, then save/reopen and export PNG/SVG/PDF
- [ ] Build custom Bézier floral and interlaced ornament packs with independently editable paths (current rosette is a layered set of native shapes)


### Bézier ornament pack — first native path preset
- [x] Added an eight-petal floral rosette built from editable cubic Bézier contours (one PathObject with eight petal contours plus a separate center contour)
- [x] Added geometry tests for contour count, closure, handles, placement, and bounds
- [ ] Verify path node editing, color/stroke controls, selection, save/reopen, and SVG/PDF/PNG export in a real browser
- [ ] Expand the pack with arabesque leaves, paired vines, interlaced bands, and ornamental corner pieces
