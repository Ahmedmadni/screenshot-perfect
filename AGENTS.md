<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Editor logic lives in `src/editor/` (model, history, fonts, storage, export, useEditor); UI lives in `src/components/editor/`. Why: keeps the data model and rendering engine reusable as features grow.
- Arabic shaping is delegated to the browser's text engine (SVG text on screen, Canvas 2D for PNG); never reverse or reshape strings manually. Why: correct joining and mark placement come from HarfBuzz in the browser.
- Project data stores the original Unicode text and object properties only; rendered output is derived. Why: projects stay editable and exports reproducible.
- Persistence is local (localStorage for projects, IndexedDB for uploaded fonts, downloadable .acs.json with embedded fonts) until a backend is added. Why: no account required for the first milestone.
- Drags use `replace` during movement and one `commitFrom(base)` at pointer-up; rapid same-field edits coalesce via a key. Why: one undo step per user action.
- Fonts the studio ships itself live in `public/fonts/` next to their licence text and are listed in both `BUNDLED_FONTS` (with `url`) and `BUNDLED_SOURCES`. A modified OFL font must be renamed away from its Reserved Font Name. Why: the same file feeds screen, glyph engine and exports, and the licence must travel with it.
- The tool rail stays short: related tools open from one rail button as a popover group; fonts and the ornament library are their own rail entries (ornaments as a movable, resizable floating window). Why: keeps the canvas uncluttered as tools grow.
