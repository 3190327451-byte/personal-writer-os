# Personal Writer OS — Desktop Visual & Interaction Specification

Status: awaiting final visual approval  
Version: 1.0  
Scope: desktop-first redesign; no production UI changes are authorized by this document alone.

## 1. Product feeling

The product should feel like a private computer that has quietly remained on since the late 1990s:

- A personal desktop, not a productivity dashboard.
- A slightly dreamy old operating system, not a museum-perfect Windows replica.
- Colorful and expressive, but never noisy enough to interrupt writing.
- Private, handmade, nostalgic and a little strange.
- The writing surface remains the calmest and most readable layer.

Core sentence:

> write something — give your inspiration a place to stay.

Visual source priority:

1. The nine references supplied by the user.
2. The product’s “quiet writing, long-term growth” principle.
3. Readability and interaction reliability.
4. Generic web design conventions.

If a generic convention conflicts with the references but no usability problem is created, follow the references.

## 2. What this design must not become

Do not use:

- Beige minimalist notebook styling as the primary visual language.
- Generic SaaS cards, oversized radii, glassmorphism or floating white pills.
- Large areas of empty space used only to appear “premium.”
- Cursive or decorative script for primary navigation such as `Write` and `Works`.
- Low-contrast gray copy that requires effort to read.
- Random retro decoration without hierarchy or function.
- Constant CRT flicker, heavy noise, chromatic aberration on body text or motion that makes writing tiring.
- Modern bouncy spring animation.
- Horizontal page scrolling at any supported desktop width.
- Explanatory interface copy such as “Typing starts the timer automatically.”
- Gamified failure language, pressure, missed-task warnings or red “you failed” states.

## 3. Visual grammar

### 3.1 Desktop and windows

The global interface is built from three layers:

1. Desktop: a quiet cyan/teal or theme-tinted field with very subtle dither.
2. Window: rectangular application frames with title bars and beveled controls.
3. Document: the high-readability writing or data surface inside the window.

Windows use:

- Radius: `0–3px`.
- Outer outline: `2px` dark-purple or theme-dark.
- Inner highlight: `1px` near-white.
- Hard shadow: `4–8px`, no blurred modern drop shadow.
- Title bar height: `28–34px`.
- Title bar text: readable pixel/system UI face, never cursive.
- Window controls: decorative where they have no action; actionable controls must have clear hover, pressed and focus states.

Overlapping windows are allowed on Home and visual overview pages. They are not allowed to reduce the editor’s usable width.

### 3.2 Color

Global neutral tokens:

| Token | Value range | Use |
|---|---:|---|
| `desktop` | `#68C9C5–#9EDBDD` | page background |
| `window` | `#F3D8EA–#F7E8F2` | window chrome |
| `window-hi` | `#FFF8FE` | inner bevel |
| `outline` | `#392052–#503068` | borders and primary text |
| `ink` | `#241B2C` | body copy |
| `muted` | `#72677A` | secondary copy |
| `paper` | `#FFFDF6` | long-form document |
| `focus` | `#235FD0` | keyboard focus where theme accent is insufficient |

Rules:

- Overall saturation is approximately 15–20% lower than the supplied references.
- At least one rich accent remains on every page; the result must not collapse into dusty gray.
- Body text has a minimum practical contrast of 4.5:1.
- Gray editor text is lighter than black text but remains readable: target `#78727D` on the document surface.
- Pink and yellow highlights are pale enough to preserve black text readability.

### 3.3 Borders, shadows and texture

- Main borders: hard, layered and deliberate.
- Buttons: 1px highlight on top/left and 1–2px dark edge on bottom/right.
- Pressed buttons invert the bevel and move content by 1px.
- Texture may include low-opacity ordered dither, tiny stars, scanline suggestion or paper grain.
- Texture opacity is normally `2–6%`.
- Never place visible texture directly behind long body text.
- No texture animation while the user is typing.

### 3.4 Density and spacing

Base spacing units: `4, 8, 12, 16, 24, 32`.

- Desktop page padding: `16–28px`, scaled by viewport width.
- Window content padding: `12–20px`.
- Editor document padding: `clamp(28px, 4vw, 72px)`.
- Controls are compact. Default height: `28–34px`.
- Primary action may reach `36–40px`, but should still resemble an old desktop button.
- Lists should show more useful content than the current version; do not hide sparse layouts behind large cards.

## 4. Typography

### 4.1 Hierarchy

| Role | Desktop size | Weight/style |
|---|---:|---|
| Welcome headline | `34–40px` | bold, readable, non-cursive |
| Page title | `30–36px` | bold, readable, non-cursive |
| Window title | `13–15px` | bold UI/pixel face |
| Section title | `18–22px` | semibold |
| Work title in list | `16–19px` | semibold |
| Body/UI copy | `14–16px` | regular |
| Editor body | `16–19px` | category-dependent |
| Metadata/status | `12–13px` | regular |
| Tiny decorative label | `10–11px` | uppercase/pixel; not essential content |

The sentence “give your inspiration a place to stay.” is subordinate to the welcome headline and uses `14–16px`.

### 4.2 Interface type

`Write`, `Works`, navigation, buttons and page titles:

- Use a legible bitmap-inspired or old system sans.
- Never use calligraphy, handwriting or an italic display face.
- At Windows 100%, 125% and 150% scaling, letter shapes must remain identifiable.

### 4.3 Editor type by category

Each category may use a distinct reading face while keeping the toolbar and controls consistent.

- Observations: rational sans or highly legible screen serif; crisp and slightly condensed.
- Reflections: soft Chinese serif/Kai-like face with conservative stroke contrast.
- Reviews & Essays: book/print serif with a cinematic editorial feeling.
- Fan Works: Fusion Pixel Font in proportional mode is the preferred candidate.

Fan Works pixel-font acceptance conditions:

- Test Chinese, English, punctuation, quotation marks and numerals.
- Minimum effective body size: `18px` if the font renders densely.
- Line height: `1.75–1.9`.
- If prolonged reading becomes tiring, pixel type remains in the title/UI while the body falls back to a softer readable face.
- Font files must be self-hosted so offline mode continues to work.

## 5. Four writing-category identities

The four categories share the same window geometry, toolbar behavior, data model and editor layout. Difference comes from color, small ornament, document texture, icon and typography.

### 5.1 Observations

Concept: old forum / early Tieba / rational public discussion.

- Main colors: steel blue, electric blue, pale cyan, off-white.
- Accent: `#2E63C7`.
- Dark: `#20365F`.
- Document: cool off-white with faint horizontal forum-divider rhythm outside the text area.
- Category frame: squared blue double border; tiny status labels resembling post metadata.
- Icon/cursor: fountain pen.
- Decorative motifs: reply index, timestamp-like metadata, small link-blue underlines.
- Avoid: making the editor itself look like a comment thread.

### 5.2 Reflections

Concept: memo, pinned note, soft private record.

- Main colors: cream, apricot, warm pink, faded orange.
- Accent: `#D98268`.
- Dark: `#70463F`.
- Document: warm ivory with extremely light paper grain.
- Category frame: memo edge, tiny tape/tab detail, a single offset warm shadow.
- Icon/cursor: pencil.
- Decorative motifs: date stamp, small ruled-paper hint, corner fold used sparingly.
- Avoid: childish scrapbook overload.

### 5.3 Reviews & Essays

Concept: film notes, book pages, critical analysis.

- Main colors: plum, wine red, silver gray, ivory.
- Accent: `#7A355F`.
- Dark: `#35273A`.
- Document: ivory book page with subtle top/bottom rule.
- Category frame: thin cinema-frame or publication masthead lines.
- Icon/cursor: dip pen.
- Decorative motifs: chapter markers, film-frame ticks, understated serif numerals.
- Avoid: black cinema UI or low-contrast dark editor backgrounds.

### 5.4 Fan Works

Concept: Y2K girl web, dreamy fan page, pixel fantasy.

- Main colors: hot pink, lilac, aqua, pale blue.
- Accent: `#D23E96`.
- Secondary: `#50BFD0`.
- Dark: `#51204E`.
- Document: very pale lilac/pink; long-form body remains quiet.
- Category frame: layered pink/lilac window with small star, butterfly or heart corner ornaments.
- Icon/cursor: quill.
- Decorative motifs: pixel stars, chrome-like tiny badges, personal-homepage labels.
- Body candidate: Fusion Pixel Font proportional mode.
- Avoid: filling the writing area with dolls, photos or stickers; decoration stays on chrome and margins.

## 6. Custom writing cursors

Custom cursor artwork must remain small and precise:

- Observations: fountain pen.
- Reflections: pencil.
- Reviews & Essays: dip pen.
- Fan Works: quill.

Rules:

- Cursor hotspot is at the actual writing tip.
- Cursor asset is ideally `24–32px`, with a standard text cursor fallback.
- Custom cursor appears in the editor writing zone, not over every toolbar control.
- It must not obscure the insertion point or selected text.
- If browser zoom or OS scaling makes the cursor unclear, fall back automatically.

## 7. Desktop responsiveness

Supported review widths:

`1024`, `1280`, `1366`, `1440`, `1600`, `1920`, `2560`.

Supported scaling checks:

Windows browser/OS effective scale equivalents of `100%`, `125%`, `150%`.

Global rules:

- `html`, `body` and application shell never produce horizontal overflow.
- Every flex/grid child that may shrink uses `min-width: 0`.
- Long titles, tags and URLs wrap or ellipsize within their own region.
- Fixed-position windows are clamped inside the visible viewport.
- No page-level `min-width` greater than the viewport.
- Decorative overflow is clipped within its visual layer and cannot expand layout width.

Editor width:

- Outer editor window: fills available workspace after page padding.
- At 1024px viewport: target at least `calc(100vw - 32px)`.
- At 1366px and above: target `calc(100vw - 48px)` with a sensible maximum near `1800px`.
- The document surface can remain a readable centered column, but the editor window and tool area use the full available width.
- Text line measure target: about `70–92` Latin characters or a comfortable Chinese measure; user-controlled font size may alter this.
- Side gaps must never resemble unused half-pages.
- The toolbar wraps internally when necessary; it must not force horizontal scrolling.

## 8. Shared component rules

### 8.1 Top menu/navigation

- Styled as an old application menu bar.
- Brand mark and main navigation use clear, non-cursive type.
- Current section is shown through a pressed tab or dark underline, not a modern rounded pill.
- Local Data opens a desktop menu/popover.
- Clicking anywhere outside an open menu closes it.
- `Escape` closes it.
- Opening another popup closes the previous one.

### 8.2 Buttons

- Primary: filled theme accent, hard outline and bevel.
- Secondary: window-colored face and dark outline.
- Destructive: muted red only at the moment of irreversible confirmation.
- Hover: color shift or 1px highlight; no scaling.
- Active: 1px down/right press.
- Keyboard focus: clear 2px focus ring.
- Disabled: visibly inactive but readable.

### 8.3 Lists and selection

- List controls must be real, not decorative.
- Sort selector changes ordering immediately and keeps the chosen option visible.
- Ordered and unordered list toolbar actions operate on the current editor selection/paragraph.
- Selected work/category/tag has a visible filled or inverted state.
- Empty states use quiet, factual copy without instructional paragraphs.

### 8.4 Modals

- Modal is presented as a centered old-system dialog window.
- Background receives a subtle static tint, not heavy blur.
- `Escape` closes only when doing so cannot lose unsaved form content.
- Focus enters the modal and returns to the originating control on close.
- The primary action remains visually obvious.

## 9. Page-level design

### 9.1 Home / Private Study

Visual composition:

- A quiet desktop with two or three functional windows, not a grid of cards.
- Main welcome window carries:
  - `write something`
  - `give your inspiration a place to stay.`
  - Continue Writing
  - New Work
- Today state appears as a small `today.log` or status window.
- If no writing occurred: `No writing yet today.` in small muted text.
- Recently edited works appear as document rows or overlapping file windows.

Remove:

- “桌上摊开的作品”
- “这里没有催促。写下一点，或者只是看看已经走过的路。”
- Any explanation of the work model or writing workflow.

### 9.2 Write / Work chooser

- Page title `Write` uses readable non-cursive UI type.
- Four category frames are visible as distinct window/file types.
- Each category shows its matching pen icon.
- Existing work list and `New Work` action are both directly available.
- Category choice changes accents and small details, but does not cause a full-page animated transition.
- Tags belonging to a category can be attached while creating or editing a work.

### 9.3 Works library

- Page title `Works` uses readable non-cursive UI type.
- First level: the four categories.
- Second level: tags scoped to the selected category.
- Tags from different categories never merge into one shared filter cloud.
- Search covers title, body and tags.
- Sorting supports:
  - Recently edited
  - Created date
  - Word count
- Sort changes must actually reorder displayed work.
- List rows are information-dense: title, category, tags, word count, modified date.
- Trash remains a separate recoverable area with 30-day retention.

### 9.4 Editor

The editor is the widest and quietest page.

Layout:

- Large application window nearly fills the viewport width.
- Title field sits inside document chrome, not in a separate oversized card.
- Compact formatting toolbar at the top.
- Editor body has a calm document surface and no explanatory copy underneath.
- Tags and linked-material metadata are compact drawers or status-bar items, not permanent wide sidebars.
- Bottom status bar may show saved state, word count and current category.

Toolbar must support and visibly reflect:

- Undo / Redo
- Bold / Italic
- Ordered list / Unordered list
- Web link
- Font size
- Black text / lighter gray text
- Pale-yellow highlight / pale-pink highlight

Paste behavior:

- Preserve supported basic formatting.
- Strip images, tables, scripts, unsafe markup and unsupported layout styles.
- Pasted content must not create width overflow.

Auto-save:

- Visual state cycles quietly between `Saving…` and `Saved`.
- Save at least every five seconds while dirty.
- Save immediately on page unload/refresh where browser capability permits.
- Editing remains available offline.

### 9.5 Floating timer

Appearance:

- Small draggable utility window.
- Default position: top-right within editor workspace.
- Contains elapsed time, state, Pause/Resume and End.
- May collapse to a compact title-bar form.
- Never covers the active insertion point by design; user can move it freely.

Behavior:

- First actual text input starts timing immediately.
- The timer display and state update in the same interaction frame; persistence follows asynchronously.
- Manual Start remains available before first input.
- Drag begins on `pointerdown`, captures the pointer and follows it directly.
- During drag:
  - update DOM position with `transform: translate3d(...)`;
  - batch only visual updates with `requestAnimationFrame`;
  - apply no CSS transition;
  - do not write IndexedDB or React state on every pointer movement.
- On `pointerup`, clamp inside the viewport and persist the final position once.
- Timer state transitions must feel immediate even if database saving is still pending.
- Backgrounding behavior is not addressed in this phase, as agreed.

### 9.6 End-session settlement

Pressing End always opens a settlement dialog before returning elsewhere.

Dialog content:

- `Writing session complete`
- Work name
- Writing time
- Added words
- Total words
- Today’s state:
  - 🙂 Smooth
  - 😐 Ordinary
  - 😣 Difficult
- One unrestricted note textarea for thoughts, problems, next steps or any other summary.

Actions:

- Save & Return to Work
- Save & Go Home

Rules:

- Only one note field is used; no separate compulsory “summary” field.
- Closing the dialog must not silently discard the finished session.
- If a crash occurs after End but before the note is saved, the timed session remains recoverable and the settlement can reopen.

### 9.7 Reminder dialog

Phase-one reminder is in-site only.

Schedule:

- Weekdays: 09:00.
- Weekends: 11:00.
- Show only if no writing has been recorded that day.
- Dismiss once per day.
- Copy: `Your writing desk has not been opened today.`

The reminder is:

- Gentle, dismissible and non-blocking.
- Never labeled overdue, failed or missed.
- A small old-system dialog with `Open Writing Desk` and `Not now`.

`Preview reminder`:

- A test control in Settings/Local Data.
- Opens the exact reminder dialog immediately.
- Does not alter today’s writing status or the real scheduled reminder record.
- Exists so the user can verify copy, appearance and buttons without waiting for 09:00/11:00.

### 9.8 Dashboard / Overview

The overview should look like a personal archive/control panel, not a business analytics SaaS page.

Top statistics:

- Total writing time
- Total words
- Number of works
- Current writing streak
- Longest session

Visualizations:

- One-year contribution-style calendar.
- Frequency summaries for 7, 30 and 120 days.
- Category ratio.
- Writing-state distribution.
- Quiet bars, pixel cells, small legends and hard-edged panels.
- No 3D charts, glossy gradients or large donut charts used only as decoration.

Day detail:

- Date
- Writing/rest state
- Works
- Writing time
- Added words
- Writing mood
- Note

The 120-day growth route is removed. A 120-day frequency range remains because it is an analytics time window, not a task route.

### 9.9 Materials library

The materials library uses a two-pane desktop file-manager pattern:

- Left pane: materials list, search and filters.
- Right pane: selected material detail and backlinks.

A material can be:

- A URL saved directly to the library.
- A URL cited inside a work.

Citation behavior:

- A cited URL appears as a normal clickable hyperlink in the article.
- The library automatically creates or updates the corresponding material record.
- The material record lists every work that cites it.
- A material may exist with no citing work.
- Selecting a backlink opens the relevant work; precise in-document anchor navigation is not required in the first version.

### 9.10 Local Data

- Opens as an old-system dropdown/menu window.
- Clicking outside closes it.
- `Escape` closes it.
- Contains backup/export/import information and `Preview reminder`.
- Import actions that could replace data require a specific confirmation dialog.
- Avoid long explanatory paragraphs on the main page; detailed explanations belong inside this menu/dialog.

## 10. Motion

Motion language: short, stepped, physical.

| Interaction | Duration | Effect |
|---|---:|---|
| Button hover | `80–120ms` | color/highlight change |
| Button press | immediate | 1px down/right bevel inversion |
| Window open | `120–160ms` | 2-step opacity + 2px position settle |
| Menu open | `80–120ms` | reveal from title/menu edge |
| Modal open | `120–160ms` | quick opacity and hard-shadow arrival |
| Category switch | `140–180ms` | accent/color swap; no full-page slide |
| Drag timer | `0ms` transition | direct pointer tracking |
| Save indicator | `120ms` | text/icon change only |

Rules:

- No bounce.
- No continuous floating.
- No parallax.
- No animation on every keystroke.
- Respect `prefers-reduced-motion`.

## 11. Sound

Retro system sound is optional and off by default.

Allowed:

- Very short soft click on explicit button press.
- Gentle save/complete chime.
- Subtle dialog open sound.

Not allowed:

- Typing sounds on every keystroke.
- Loud alerts.
- Sounds that play before a user gesture.

A single sound toggle lives in Settings/Local Data. Audio assets must work offline.

## 12. Reliability and interaction acceptance

The redesign is accepted only after testing real interactions, not screenshots alone.

### 12.1 Overflow matrix

At every supported width:

- No horizontal scrollbar on Home, Write, Works, Editor, Overview or Materials.
- Toolbar controls remain reachable.
- Timer remains fully inside the viewport after drag and resize.
- Long titles, long tags and long URLs do not expand the page.
- Browser zoom at 125% and 150% does not cause hidden primary actions.

### 12.2 Editor matrix

- Ordered list creates and continues numbered items.
- Unordered list creates and continues bullet items.
- Undo/Redo correctly affects editor history.
- Gray text is visibly lighter than black.
- Font size change affects the selection or subsequent input as expected.
- External paste preserves only supported formatting.
- Refresh after typing does not lose saved content.
- Offline refresh opens the app and latest saved work.

### 12.3 Timer matrix

- First text input changes `Not started` to `Writing` with no perceptible delay.
- Pause freezes elapsed time.
- Resume continues from the paused total.
- Drag follows pointer without lag or jump.
- Ending opens settlement every time.
- Accidental disconnect/restart recovers the saved active session from the last persisted heartbeat; it must not invent keyboard activity.
- Midnight finalization saves the elapsed session and marks system-ended where applicable.

### 12.4 Settlement matrix

- Work name, duration, added words and total words are correct.
- Mood selection is required before saving.
- Note may be empty.
- Saving creates one session record, never duplicates it on double click.
- A partially completed settlement can recover after refresh.

### 12.5 Reminder matrix

- Preview control always opens the same component used by the schedule.
- Real reminder does not show after writing occurred that day.
- Dismissing it prevents a second real reminder that day.
- Preview does not consume or create the scheduled reminder.

### 12.6 Menu and modal matrix

- Clicking outside Local Data closes it.
- Clicking inside does not close it unexpectedly.
- `Escape` behavior is consistent.
- Keyboard focus is visible and restored.

## 13. Implementation sequence after approval

1. Establish semantic visual tokens and local font/assets.
2. Repair layout containment and remove all horizontal overflow.
3. Rebuild shared desktop/window/menu/button components.
4. Rebuild Home, Write chooser and Works.
5. Rebuild the Editor and four category skins.
6. Fix timer state response and direct dragging.
7. Complete settlement and in-site reminder dialogs.
8. Rebuild Overview and Materials.
9. Run the full desktop-width and real-interaction acceptance matrix.
10. Only then save and deploy a verified production version.

## 14. Approval checklist

Before implementation, confirm or edit:

- [ ] The global 1999–2005 dream-computer direction is correct.
- [ ] Saturation should remain about 15–20% below the references.
- [ ] Main headings and navigation are readable and non-cursive.
- [ ] Fan Works may use Fusion Pixel Font for body text if readability tests pass.
- [ ] The four category palettes and motifs are correct.
- [ ] Reminder is in-site only and includes `Preview reminder`.
- [ ] Settlement uses mood plus one optional note field.
- [ ] Dashboard keeps the 120-day analytics range but removes the growth route.
- [ ] Materials use a two-pane layout with URL backlinks.
- [ ] Retro sound is optional and off by default.
- [ ] Desktop widths and no-horizontal-scroll rules are correct.
