# Announcement Rich Text & Daily Lesson Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Teams-compatible rich-text formatting to all announcement composers and replace daily-lesson “complete/finished” copy with “covered today” framing.

**Architecture:** Extend shared TipTap config with announcement-specific extensions (lists, highlight, font size). Gate toolbar controls via `teamsSafe`. Course feed composer gets a compact inline toolbar; org-wide form is always Teams-safe; legacy announcement form keeps full toolbar. Backend only updates Teams heading copy + test assertion.

**Tech Stack:** TipTap 3.22, React/Next.js, Vitest, Django (`app_microsoft`).

**Spec:** [2026-07-06-announcement-rich-text-design.md](../specs/2026-07-06-announcement-rich-text-design.md)

---

## File Map

| File | Responsibility |
| --- | --- |
| `package.json` | Add `@tiptap/extension-highlight`, `@tiptap/extension-text-style` |
| `src/components/editor/font-size-extension.ts` | Custom `FontSize` mark on `TextStyle` |
| `src/components/editor/config.ts` | `announcementEditorExtensions`, `getAnnouncementEditorOptions` |
| `src/components/editor/menu.tsx` | List/highlight/font-size buttons; `teamsSafe` / `variant` |
| `src/components/editor/font-size-menu.tsx` | Small / Normal / Large selector |
| `src/components/editor/editor.tsx` | `menuPlacement`, `menuProps` |
| `src/components/editor/styles.module.scss` | Highlight + font-size view styles |
| `src/helpers/announcement-editor-teams.ts` | Detect unsupported Teams marks in doc |
| `src/types/course-feed.ts` | `dailyLessonHeader` copy |
| `src/types/course-feed.test.ts` | Header test |
| `src/components/course/feed/daily-lesson-unit-header.tsx` | Composer copy |
| `src/components/course/feed/feed-post-type-menu.tsx` | Menu description copy |
| `src/components/course/feed/course-feed-composer.tsx` | Toolbar + `teamsSafe` + toast |
| `src/components/course/feed/course-feed-card.tsx` | View editor uses announcement extensions |
| `src/components/announcement/announcement-form.tsx` | Announcement editor options + menu props |
| `src/components/announcement/org-wide-announcement-form.tsx` | `teamsSafe={true}` |
| `schedjuice-reimagined-be/app_microsoft/announcement_helpers.py` | Teams heading copy |
| `schedjuice-reimagined-be/app_microsoft/tests/test_course_feed_teams_sync.py` | Assertion update |

---

### Task 1: Daily lesson copy (TDD)

**Files:**
- Modify: `src/types/course-feed.ts`
- Modify: `src/types/course-feed.test.ts`
- Modify: `src/components/course/feed/daily-lesson-unit-header.tsx`
- Modify: `src/components/course/feed/feed-post-type-menu.tsx`
- Modify: `src/components/course/feed/course-feed-composer.tsx` (zod message only)

- [ ] **Step 1: Update failing test**

In `src/types/course-feed.test.ts`:

```ts
expect(dailyLessonHeader(7)).toBe("Unit 7 covered today");
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd schedjuice-reimagined-fe
npm test -- src/types/course-feed.test.ts
```

Expected: FAIL — received `"Unit 7 complete"`

- [ ] **Step 3: Update `dailyLessonHeader`**

In `src/types/course-feed.ts`:

```ts
export function dailyLessonHeader(finishedUnit: number): string {
  return `Unit ${finishedUnit} covered today`;
}
```

- [ ] **Step 4: Update composer strings**

`daily-lesson-unit-header.tsx`:
- Label: `Which unit did you cover today?`
- Inline: `Unit` … `covered today` (replace `complete`)
- `aria-label`: `Unit number covered today`

`feed-post-type-menu.tsx`:
- Description: `Log what the class covered today`

`course-feed-composer.tsx` zod refine message:
- `Enter the unit number you covered today`

- [ ] **Step 5: Run test**

```bash
npm test -- src/types/course-feed.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/types/course-feed.ts src/types/course-feed.test.ts \
  src/components/course/feed/daily-lesson-unit-header.tsx \
  src/components/course/feed/feed-post-type-menu.tsx \
  src/components/course/feed/course-feed-composer.tsx
git commit -m "fix: use covered-today copy for daily lesson posts"
```

---

### Task 2: Backend Teams heading copy

**Files:**
- Modify: `schedjuice-reimagined-be/app_microsoft/announcement_helpers.py`
- Modify: `schedjuice-reimagined-be/app_microsoft/tests/test_course_feed_teams_sync.py`

- [ ] **Step 1: Update failing test**

In `test_course_feed_teams_sync.py`:

```python
self.assertIn("<h2>Unit 5 covered today</h2>", html)
```

- [ ] **Step 2: Run test (expect fail)**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_microsoft.tests.test_course_feed_teams_sync.BuildTeamsHtmlTests.test_daily_lesson_heading
```

- [ ] **Step 3: Update `_teams_heading`**

In `announcement_helpers.py`:

```python
def _teams_heading(announcement: Announcement) -> str:
    if announcement.post_type == PostType.DAILY_LESSON:
        return f"<h2>Unit {announcement.finished_unit} covered today</h2>"
    title = announcement.title or "Announcement"
    return f"<h2>{title}</h2>"
```

- [ ] **Step 4: Run test**

```bash
./scripts/run_backend_tests.sh app_microsoft.tests.test_course_feed_teams_sync
```

Expected: PASS

- [ ] **Step 5: Commit (in BE repo)**

```bash
cd schedjuice-reimagined-be
git add app_microsoft/announcement_helpers.py app_microsoft/tests/test_course_feed_teams_sync.py
git commit -m "fix: daily lesson Teams heading uses covered-today copy"
```

---

### Task 3: TipTap dependencies

**Files:**
- Modify: `schedjuice-reimagined-fe/package.json`
- Modify: `schedjuice-reimagined-fe/package-lock.json` (via install)

- [ ] **Step 1: Install packages**

```bash
cd schedjuice-reimagined-fe
npm install @tiptap/extension-highlight@^3.22.3 @tiptap/extension-text-style@^3.22.3
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add tiptap highlight and text-style extensions"
```

---

### Task 4: Font size extension

**Files:**
- Create: `src/components/editor/font-size-extension.ts`

- [ ] **Step 1: Create extension**

```ts
import { Extension } from "@tiptap/core";

export type AnnouncementFontSize = "0.875rem" | "1rem" | "1.25rem";

export const ANNOUNCEMENT_FONT_SIZE_LABELS: Record<
  AnnouncementFontSize,
  string
> = {
  "0.875rem": "Small",
  "1rem": "Normal",
  "1.25rem": "Large",
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: AnnouncementFontSize) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

export const FontSize = Extension.create({
  name: "fontSize",

  addOptions() {
    return { types: ["textStyle"] as const };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) =>
              element.style.fontSize?.replace(/['"]+/g, "") || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontSize:
        (fontSize) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain()
            .setMark("textStyle", { fontSize: null })
            .removeEmptyTextStyle()
            .run(),
    };
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/components/editor/font-size-extension.ts
git commit -m "feat: add announcement font-size tiptap extension"
```

---

### Task 5: Announcement editor extensions + options factory

**Files:**
- Modify: `src/components/editor/config.ts`

- [ ] **Step 1: Add imports**

```ts
import Highlight from "@tiptap/extension-highlight";
import TextStyle from "@tiptap/extension-text-style";
import { BulletList, OrderedList, ListItem } from "@tiptap/extension-list";
import { FontSize } from "@/components/editor/font-size-extension";
```

- [ ] **Step 2: Define stable extension arrays**

After `defaultEditorExtensions`, add:

```ts
const announcementListItem = ListItem.configure({ HTMLAttributes: {} });

const announcementTeamsSafeExtensions: Extensions = [
  Document,
  Paragraph.configure({ HTMLAttributes: { class: " text-md" } }),
  Text,
  Bold,
  Italic,
  Underline,
  Gapcursor,
  UndoRedo,
  Link.configure({ openOnClick: false, autolink: true, defaultProtocol: "https" }),
  Heading.extend({ /* reuse existing renderHTML from defaulExtensions */ }).configure({
    levels: [1, 2, 3, 4],
  }),
  BulletList,
  OrderedList,
  announcementListItem,
];

const announcementFullExtensions: Extensions = [
  ...announcementTeamsSafeExtensions,
  Highlight.configure({ multicolor: false }),
  TextStyle,
  FontSize,
  TableKit.configure({ /* same table config as defaulExtensions */ }),
  TaskList,
  taskItemExtension,
];

export function getAnnouncementEditorExtensions(teamsSafe: boolean): Extensions {
  return teamsSafe ? announcementTeamsSafeExtensions : announcementFullExtensions;
}
```

Copy the existing `Heading.extend({ renderHTML… })` block from `defaulExtensions` rather than duplicating inline — extract to a shared `headingExtension` const if needed.

- [ ] **Step 3: Add options factory**

```ts
export type AnnouncementEditorOptionsInput = {
  placeholder?: string;
  teamsSafe: boolean;
};

export function getAnnouncementEditorOptions({
  placeholder,
  teamsSafe,
}: AnnouncementEditorOptionsInput): UseEditorOptions {
  const base = getDefaultEditorOptions();
  const extensions = [
    ...getAnnouncementEditorExtensions(teamsSafe),
    ...(placeholder
      ? [
          Placeholder.configure({
            placeholder,
            emptyNodeClass: "is-empty",
            emptyEditorClass: "is-editor-empty",
          }),
        ]
      : []),
  ];
  return {
    ...base,
    extensions,
    editorProps: {
      ...base.editorProps,
      attributes: {
        class:
          "focus:outline-hidden min-h-[4rem] text-sm text-foreground leading-relaxed",
      },
    },
  };
}

/** Read-only feed/announcement cards — always full extensions for faithful render. */
export function getAnnouncementViewEditorOptions(): UseEditorOptions {
  return getAnnouncementEditorOptions({ teamsSafe: false });
}
```

- [ ] **Step 4: Deprecate `getFeedComposerEditorOptions`**

Replace body with:

```ts
export function getFeedComposerEditorOptions(
  placeholder: string,
  teamsSafe = false,
): UseEditorOptions {
  return {
    ...getAnnouncementEditorOptions({ placeholder, teamsSafe }),
    content: { type: "doc", content: [{ type: "paragraph" }] },
  };
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/config.ts
git commit -m "feat: announcement editor extensions with teams-safe mode"
```

---

### Task 6: Teams unsupported-content helper

**Files:**
- Create: `src/helpers/announcement-editor-teams.ts`
- Create: `src/helpers/announcement-editor-teams.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/react";
import { getAnnouncementEditorExtensions } from "@/components/editor/config";
import { editorHasTeamsUnsupportedContent } from "./announcement-editor-teams";

describe("editorHasTeamsUnsupportedContent", () => {
  it("returns false for bold-only content", () => {
    const editor = new Editor({
      extensions: getAnnouncementEditorExtensions(false),
      content: "<p><strong>hi</strong></p>",
    });
    expect(editorHasTeamsUnsupportedContent(editor)).toBe(false);
    editor.destroy();
  });

  it("returns true when highlight is present", () => {
    const editor = new Editor({
      extensions: getAnnouncementEditorExtensions(false),
      content: '<p><mark>hi</mark></p>',
    });
    expect(editorHasTeamsUnsupportedContent(editor)).toBe(true);
    editor.destroy();
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

```bash
npm test -- src/helpers/announcement-editor-teams.test.ts
```

- [ ] **Step 3: Implement helper**

```ts
import type { Editor } from "@tiptap/react";

export function editorHasTeamsUnsupportedContent(editor: Editor): boolean {
  const { doc } = editor.state;
  let unsupported = false;
  doc.descendants((node) => {
    if (unsupported) return false;
    if (node.type.name === "table") unsupported = true;
    if (node.type.name === "taskList" || node.type.name === "taskItem") {
      unsupported = true;
    }
    if (node.marks.some((m) => m.type.name === "highlight")) unsupported = true;
    if (
      node.marks.some(
        (m) => m.type.name === "textStyle" && m.attrs.fontSize,
      )
    ) {
      unsupported = true;
    }
  });
  return unsupported;
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/helpers/announcement-editor-teams.ts src/helpers/announcement-editor-teams.test.ts
git commit -m "feat: detect Teams-unsupported marks in announcement editor"
```

---

### Task 7: Editor menu — lists, highlight, font size, teamsSafe

**Files:**
- Create: `src/components/editor/font-size-menu.tsx`
- Modify: `src/components/editor/menu.tsx`

- [ ] **Step 1: Create `FontSizeMenu`**

Mirror `heading-menu.tsx` pattern — `Selector` with Small / Normal / Large calling `editor.chain().focus().setFontSize(...)` / `unsetFontSize()`.

- [ ] **Step 2: Extend `EditorMenuProps`**

```ts
interface EditorMenuProps {
  // existing…
  teamsSafe?: boolean;
  variant?: "compact" | "full";
}
```

Default: `teamsSafe = false`, `variant = "full"`.

Set `embedded = variant === "compact"`.

- [ ] **Step 3: Add list actions**

Import `List`, `ListOrdered`, `Highlighter` from `lucide-react`.

```ts
{
  key: "bulletList",
  icon: List,
  command: (editor) => editor.chain().focus().toggleBulletList().run(),
  isActive: (editor) => editor.isActive("bulletList"),
},
{
  key: "orderedList",
  icon: ListOrdered,
  command: (editor) => editor.chain().focus().toggleOrderedList().run(),
  isActive: (editor) => editor.isActive("orderedList"),
},
```

Render after `HeadingMenu`, before table/checklist block actions.

- [ ] **Step 4: Gate Teams-unsafe controls**

Wrap highlight button, `FontSizeMenu`, table `BLOCK_ACTIONS`, and checklist action:

```tsx
{!teamsSafe && (
  <>
    <Button /* highlight toggle */ />
    <FontSizeMenu editor={editor} embedded={embedded} />
  </>
)}
{!teamsSafe &&
  BLOCK_ACTIONS.map(/* table + checklist */)}
```

Keep `canDeleteTable` button inside `!teamsSafe` guard.

- [ ] **Step 5: Manual smoke**

Run dev server, open any announcement form — verify bullet/ordered list buttons work.

- [ ] **Step 6: Commit**

```bash
git add src/components/editor/menu.tsx src/components/editor/font-size-menu.tsx
git commit -m "feat: announcement toolbar lists, highlight, font size, teamsSafe gating"
```

---

### Task 8: TextEditor menu placement

**Files:**
- Modify: `src/components/editor/editor.tsx`

- [ ] **Step 1: Extend props**

```ts
import type { EditorMenuProps } from "./menu";

interface TextEditorProps {
  editor: Editor;
  hideMenu?: boolean;
  editable?: boolean;
  label?: string;
  isViewOnly?: boolean;
  menuProps?: Pick<EditorMenuProps, "teamsSafe" | "variant">;
  menuPlacement?: "bottom" | "inline";
}
```

- [ ] **Step 2: Render menu inline or bottom**

```tsx
const menu = !hideMenu ? (
  <div
    className={
      menuPlacement === "inline"
        ? "border-t border-border/50 pt-2"
        : "py-4 border-b border-border"
    }
  >
    <EditorMenu editor={editor} {...menuProps} />
  </div>
) : null;

return (
  <div className="space-y-2">
    {label && <p className="text-sm font-medium">{label}</p>}
    <EditorContent … />
    {menuPlacement !== "inline" && menu}
  </div>
);
```

For inline placement, export menu separately or split `TextEditor` into body + optional trailing menu — course feed composer will render:

```tsx
<TextEditor editor={editor} hideMenu menuPlacement="inline" … />
{menu}
```

**Preferred approach:** add `renderMenuAfterBody` boolean; when true, return fragment `[EditorContent, menu]` without wrapping menu in bottom div. Simplest: pass `menuPlacement="inline"` and render menu **after** `EditorContent` inside the component (as shown above).

- [ ] **Step 3: Commit**

```bash
git add src/components/editor/editor.tsx
git commit -m "feat: inline or bottom editor menu placement"
```

---

### Task 9: Editor styles for highlight + font size

**Files:**
- Modify: `src/components/editor/styles.module.scss`

- [ ] **Step 1: Add view/edit styles**

```scss
.tiptapViewShell,
:global(.ProseMirror) {
  mark {
    background-color: hsl(var(--brand) / 0.25);
    color: inherit;
    border-radius: 0.125rem;
    padding: 0 0.125rem;
  }

  [style*="font-size: 0.875rem"] {
    font-size: 0.875rem;
  }
  [style*="font-size: 1.25rem"] {
    font-size: 1.25rem;
  }

  ul,
  ol {
    padding-left: 1.25rem;
    margin: 0.25rem 0;
  }
  ul { list-style: disc; }
  ol { list-style: decimal; }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/editor/styles.module.scss
git commit -m "style: announcement editor highlight, font size, list prose"
```

---

### Task 10: Wire course feed composer

**Files:**
- Modify: `src/components/course/feed/course-feed-composer.tsx`

- [ ] **Step 1: Switch editor options to announcement factory**

```ts
import { getFeedComposerEditorOptions } from "@/components/editor/config";
import { editorHasTeamsUnsupportedContent } from "@/helpers/announcement-editor-teams";

const editorOptions = useMemo(
  () => getFeedComposerEditorOptions(bodyPlaceholder, postToTeams),
  [bodyPlaceholder, postToTeams],
);

const editor = useEditor(editorOptions, [bodyPlaceholder, postToTeams]);
```

- [ ] **Step 2: Sync extensions when `postToTeams` toggles**

```ts
useEffect(() => {
  if (!editor) return;
  editor.setOptions({
    extensions: getFeedComposerEditorOptions(bodyPlaceholder, postToTeams).extensions,
  });
}, [editor, bodyPlaceholder, postToTeams]);
```

- [ ] **Step 3: Show compact inline toolbar**

Replace:

```tsx
<TextEditor editor={editor} isViewOnly={false} hideMenu />
```

With:

```tsx
<TextEditor
  editor={editor}
  isViewOnly={false}
  menuPlacement="inline"
  menuProps={{ variant: "compact", teamsSafe: postToTeams }}
/>
```

- [ ] **Step 4: Teams toggle toast**

```ts
const handlePostToTeamsChange = (checked: boolean) => {
  setPostToTeams(checked);
  if (
    checked &&
    editor &&
    editorHasTeamsUnsupportedContent(editor)
  ) {
    toast({
      description:
        "Highlight, font size, tables, and checklists won't appear in Teams.",
    });
  }
};
```

Wire to checkbox `onCheckedChange`.

- [ ] **Step 5: Commit**

```bash
git add src/components/course/feed/course-feed-composer.tsx
git commit -m "feat: course feed composer rich-text toolbar with teams-safe mode"
```

---

### Task 11: Wire announcement forms + feed card view

**Files:**
- Modify: `src/components/announcement/announcement-form.tsx`
- Modify: `src/components/announcement/org-wide-announcement-form.tsx`
- Modify: `src/components/course/feed/course-feed-card.tsx`

- [ ] **Step 1: `announcement-form.tsx`**

```ts
import { getAnnouncementEditorOptions } from "../editor/config";

const editor = useEditor(
  getAnnouncementEditorOptions({ teamsSafe: false }),
);
```

```tsx
<TextEditor
  editor={editor}
  isViewOnly={false}
  menuProps={{ teamsSafe: false, variant: "full" }}
/>
```

- [ ] **Step 2: `org-wide-announcement-form.tsx`**

```ts
const editor = useEditor(
  getAnnouncementEditorOptions({ teamsSafe: true }),
);
```

```tsx
<TextEditor
  editor={editor}
  isViewOnly={false}
  menuProps={{ teamsSafe: true, variant: "full" }}
/>
```

- [ ] **Step 3: `course-feed-card.tsx` read-only**

```ts
import { getAnnouncementViewEditorOptions } from "@/components/editor/config";

const editor = useEditor(getAnnouncementViewEditorOptions());
```

- [ ] **Step 4: Commit**

```bash
git add src/components/announcement/announcement-form.tsx \
  src/components/announcement/org-wide-announcement-form.tsx \
  src/components/course/feed/course-feed-card.tsx
git commit -m "feat: wire announcement editors and feed card view extensions"
```

---

### Task 12: Verification

- [ ] **Step 1: Run frontend tests**

```bash
cd schedjuice-reimagined-fe
npm test -- src/types/course-feed.test.ts src/helpers/announcement-editor-teams.test.ts
```

Expected: all PASS

- [ ] **Step 2: Run backend tests**

```bash
cd schedjuice-reimagined-be
./scripts/run_backend_tests.sh app_microsoft.tests.test_course_feed_teams_sync
```

Expected: PASS

- [ ] **Step 3: Manual checklist (spec §10.3)**

1. Course feed — Teams off: nested lists, highlight, font size → post → card renders all.
2. Course feed — Teams on: toolbar hides unsafe controls; list + bold → Teams matches.
3. Toggle Teams on with highlight → toast; feed keeps highlight.
4. Org-wide form: Teams-safe toolbar only.
5. Daily lesson copy reads “covered today” everywhere.

---

## Plan Self-Review

| Spec section | Task |
| --- | --- |
| TipTap extensions | Tasks 3–5 |
| Toolbar + teamsSafe | Tasks 7–8 |
| Feed compact bar | Tasks 8, 10 |
| Surface wiring | Tasks 10–11 |
| Daily lesson copy | Tasks 1–2 |
| Teams toast | Task 6, 10 |
| CSS | Task 9 |
| Tests | Tasks 1, 2, 6, 12 |

No placeholders. BE and FE commits are separate repos.
