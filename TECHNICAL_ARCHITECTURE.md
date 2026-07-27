# Orthos Bible Study — Technical Architecture

## 1. System Overview

Orthos is a client-side Progressive Web Application (PWA) for Bible study. It runs entirely in the browser without a backend server, using IndexedDB for persistence and the Bible API for online content.

### Key Characteristics

- **Single-page application (SPA)**: All logic in `app.js`, no framework
- **Offline-first**: Service worker caches static assets and API responses
- **Data model**: Bible JSON files + user-generated notes, tags, and scripts stored locally
- **Rendering**: Custom Markdown renderer for the scripts panel
- **Search**: In-memory text search and Strong's concordance index
- **Theme**: CSS custom properties with light/dark modes

## 2. File Structure

```
wordlab/
├── index.html           # Application shell, sidebar, panels, modals
├── app.js               # WordLabApp class (~2100 lines), all business logic
├── style.css            # CSS variables, layout, components (~1100 lines)
├── sw.js                # Service worker for caching
├── manifest.json        # PWA manifest
├── icon.png             # App icon
├── logo.png             # Branding logo
├── sample-kjv.json      # Sample Bible data
├── strongs-hebrew-dictionary.js  # Hebrew lexicon data
├── strongs-greek-dictionary.js   # Greek lexicon data
├── TBESH.txt            # Hebrew lexicon (BibleStudy.org format)
├── TBESG.txt            # Greek lexicon (BibleStudy.org format)
└── [test scripts]       # Temporary test harnesses
```

## 3. Application Architecture

### 3.1 Core Class: WordLabApp

The entire application is encapsulated in a single ES6 class with the following responsibilities:

#### State Management

```javascript
// Core state
this.db                    // IndexedDB database reference
this.bibles                // Map<module, BibleData> - local translations
this.onlineBibles          // Map<module, BibleData> - online translations
this.currentModule         // Currently selected translation ID
this.currentBook           // Current book name
this.currentChapter        // Current chapter number
this.currentVerse          // Current verse object
this.compareMode           // Boolean compare mode flag
this.selectedCompareModules // Set of modules for comparison
this.notes                 // Array of note objects
this.noteCounter           // Auto-increment note ID counter
this.showStrongs           // Boolean Strong's highlight flag
this.lexicons              // Map<strongs, LexiconEntry>
this.lexiconsLoaded        // Boolean lexicon load flag
this.tags                  // Array of tag objects
this.currentTagKeyword     // Current tag filter
this.currentLexiconStrongs // Current lexicon entry
this.scripts               // Array of script objects
this.currentScriptId       // Current editing script ID
this.apiKey                // Bible API key
```

#### Initialization Flow

```
init()
├── openDB()                     // Initialize IndexedDB
├── setupDOM()                   // Cache DOM element references
├── applySavedTheme()            // Restore dark/light preference
├── bindEvents()                 // Attach all event listeners
├── loadSavedTranslations()      // Restore local Bibles from IndexedDB
├── loadSavedNotes()             // Restore notes from IndexedDB
├── loadSavedTags()              // Restore tags from IndexedDB
├── loadLexicons()               // Load Strong's dictionaries
├── loadOnlineBibles()           // Discover available online translations
├── loadOnlineChapterCache()     // Restore cached online chapters
├── loadScripts()                // Restore scripts from IndexedDB
├── renderBookList()             // Populate sidebar book list
├── updateTranslationSelect()    // Populate translation dropdown
├── renderCompareCheckboxes()    // Populate compare checkboxes
└── selectDefaultTranslation()   // Load default Bible or show empty state
```

### 3.2 IndexedDB Schema

Database: `WordLabDB` version 4

| Store Name | Key Path | Indexes | Purpose |
|------------|----------|---------|---------|
| `bibles` | `module` | - | Stores complete Bible JSON objects |
| `notes` | `id` (auto-increment) | `ref` (compound: book, chapter, verse) | User verse notes |
| `tags` | `id` (auto-increment) | `keyword`, `ref` (compound: book, chapter, verse, module) | Verse tags |
| `onlineChapters` | compound (module, bookName, chapter) | - | Cached online Bible chapters |
| `scripts` | `id` (auto-increment) | `updatedAt` | Markdown study scripts |

### 3.3 Data Model

#### Bible Data Structure

```javascript
{
  metadata: {
    name: "King James Version",
    shortname: "KJV",
    module: "eng-kjv"
  },
  verses: [
    {
      book_name: "Genesis",
      book: 1,
      chapter: 1,
      verse: 1,
      text: "In the beginning God created..."
    }
  ]
}
```

#### Bible Index (in-memory)

When a Bible is loaded, it's indexed into:

- `bookMap`: Hierarchical structure for navigation
  ```
  bookMap[bookName] → { bookNum, chapters: { chapterNum: [verses] } }
  ```
- `strongsIndex`: Map of Strong's numbers to verse references
  ```
  strongsIndex["H7225"] → [{ book, chapter, verse, text }]
  ```

#### Note Model

```javascript
{
  id: 1,
  book: "Genesis",
  chapter: 1,
  verse: 1,
  text: "Personal study note",
  module: "eng-kjv"
}
```

#### Tag Model

```javascript
{
  id: 1,
  keyword: "creation",
  book: "Genesis",
  chapter: 1,
  verse: 1,
  module: "eng-kjv"
}
```

#### Script Model

```javascript
{
  id: 1,
  content: "# Study Notes\n\n## Heading\n...",
  heading: "Study Notes",
  updatedAt: 1690000000000
}
```

## 4. UI Architecture

### 4.1 Layout Structure

```
┌──────────────────────────────────────────────────────────────┐
│ Top Bar (breadcrumb, toggles, theme)                         │
├───────────┬──────────────────────────────────────────────────┤
│           │  Chapter View / Compare Area                     │
│  Sidebar  │                                                  │
│  (Books)  │                                                  │
│           │                                                  │
│           │                                                  │
│           ├──────────┬───────────┬──────────┬───────────────┤
│           │  Notes   │Concordance│  Lexicon │   Tags        │
│           │  Panel   │  Panel    │  Panel   │   Panel       │
│           ├──────────┴───────────┴──────────┴───────────────┤
│           │  Scripts Panel / Script Editor                   │
└───────────┴──────────────────────────────────────────────────┘
```

### 4.2 Sidebar Components

- **Sidebar Header**: Logo, add/remove Bible buttons, translation select, compare checkboxes, online translations list
- **Search**: Text input with execute button
- **Book List**: Expandable accordion of books → chapters

### 4.3 Main Panel Components

| Panel | Element ID | Purpose |
|-------|------------|---------|
| Bible Viewer | `#bible-viewer` | Main chapter display with verse rows |
| Compare Area | `#compare-area` | Side-by-side chapter rendering |
| Notes Panel | `#notes-panel` | Note editor and list |
| Concordance Panel | `#concordance-panel` | Strong's search results |
| Lexicon Panel | `#lexicon-panel` | Word study display |
| Tags Panel | `#tags-panel` | Tag cloud and management |
| Tag Entries Panel | `#tag-entries-panel` | Verses for selected tag |
| Scripts Panel | `#scripts-panel` | Markdown script list |
| Script Editor Panel | `#script-editor-panel` | Markdown editor with preview toggle |

### 4.4 DOM Caching Strategy

All DOM references are cached in `setupDOM()` into `this.els` object for performance. No repeated `getElementById` calls during runtime.

### 4.5 Event Delegation

A single `document.addEventListener('click', ...)` handler at the root level handles most UI interactions using `closest()` for element targeting. This reduces memory footprint compared to individual listeners.

## 5. Data Flow

### 5.1 Bible Loading

```
User uploads JSON file
    ↓
handleFileUpload()
    ↓
Parse JSON, validate structure
    ↓
Store in IndexedDB (bibles store)
    ↓
indexBible(data)
    ↓
Build bookMap + strongsIndex
    ↓
Select translation
    ↓
renderBookList() + renderChapter()
```

### 5.2 Online Bible Fetching

```
Select online translation
    ↓
fetchChapter(module, book, chapter)
    ↓
Check onlineChapters IndexedDB cache
    ↓ (miss)
Call Bible API (api.bible)
    ↓
Cache response in onlineChapters
    ↓
Render verses
```

### 5.3 Search Flow

```
User enters search query
    ↓
executeSearch()
    ↓
Iterate all verses in current Bible
    ↓
Match text against query (case-insensitive)
    ↓
Render results with click-to-navigate
```

### 5.4 Strong's Concordance Flow

```
Inline Strong's numbers detected in verse text
    ↓
highlightStrongs(text) wraps in <span class="strongs" data-strongs="H7225">
    ↓
User clicks Strong's number
    ↓
showLexiconEntry(strongs)
    ↓
Lookup in lexicons Map
    ↓
Render: strong number, word, transliteration, morph, gloss, meaning
    ↓
Show occurrences in current translation with click-to-navigate
```

### 5.5 Notes/Tags Flow

```
Select verse
    ↓
toggleNotesPanel(true)
    ↓
Load notes for (book, chapter, verse)
    ↓
User edits and saves
    ↓
saveCurrentNote()
    ↓
Upsert in IndexedDB notes store
    ↓
Render note indicators in chapter view
```

## 6. Rendering Systems

### 6.1 Chapter Rendering

Verses are rendered as a list of `.verse-row` elements with:
- Verse number span (data attributes for book/chapter/verse)
- Highlighted Strong's numbers (if enabled)
- Note indicators (if notes exist)
- Background highlight for selected verse

### 6.2 Compare Rendering

When compare mode is enabled:
- Two chapter views are displayed side-by-side
- Each uses a separate translation from `selectedCompareModules`
- Synchronized scrolling or independent navigation

### 6.3 Markdown Renderer (Scripts Panel)

A custom-built Markdown-to-HTML converter supporting:

| Feature | Syntax | Output |
|---------|--------|--------|
| Headings | `# H1` - `###### H6` | `<h1>` - `<h6>` |
| Alternate headings | `===` / `---` | `<h1>` / `<h2>` |
| Blockquotes | `> quote` | `<blockquote>` |
| Bold | `**text**` or `__text__` | `<strong>` |
| Italic | `*text*` or `_text_` | `<em>` |
| Bold+Italic | `***text***` | `<strong><em>` |
| Inline code | `` `code` `` | `<code>` |
| Fenced code blocks | ```` ``` ```` | `<pre><code>` |
| Indented code blocks | 4-space indent | `<pre><code>` |
| Links | `[text](url "title")` | `<a href>` |
| Images | `![alt](url "title")` | `<img src>` |
| Autolinks | `<https://...>` | `<a href>` |
| Horizontal rules | `---` `***` `___` | `<hr>` |
| Ordered lists | `1. item` | `<ol><li>` |
| Unordered lists | `- item` `* item` `+ item` | `<ul><li>` |
| Line breaks | Two trailing spaces | `<br>` |
| Escaping | `\*` `\_` etc. | Literal characters |

### 6.4 Lexicon Rendering

Lexicon entries display:
- Strong's number
- Original word (Hebrew/Greek)
- Transliteration
- Morphology code
- Gloss/definition
- Meaning/usage notes
- Occurrences in current translation with click-to-navigate

## 7. Styling System

### 7.1 CSS Custom Properties

```css
:root {
  --bg: #1a1a2e;           /* Primary background */
  --bg-secondary: #16213e; /* Secondary background */
  --bg-tertiary: #0f3460;  /* Tertiary background */
  --text: #e0e0e0;         /* Primary text */
  --text-muted: #a0a0a0;   /* Secondary text */
  --accent: #c5a028;       /* Gold accent color */
  --border: #2a2a4a;       /* Border color */
  --shadow: rgba(0,0,0,0.4); /* Shadow color */
}
```

Light theme overrides via `[data-theme="light"]`.

### 7.2 Key Layout Dimensions

- `--sidebar-width`: 260px
- `--panel-width`: 320px

### 7.3 Panel System

Panels are positioned absolutely or as flex children, toggled via `.hidden` class. The scripts panel and editor use stacked absolute positioning with `display: none` toggling.

## 8. External Integrations

### 8.1 Bible API

- Provider: [api.bible](https://api.bible) (American Bible Society)
- Endpoint: `https://api.scripture.api.bible/v1/bibles/{bibleId}/passages/{reference}`
- Authentication: API key stored in `this.apiKey`
- Response format: Paragraph-based text
- Local caching: Responses stored in `onlineChapters` IndexedDB store

### 8.2 OpenScriptures Lexicon

- Source: `strongs-hebrew-dictionary.js` and `strongs-greek-dictionary.js`
- Format: JavaScript objects with `strongs_def`, `kjv_def`, `lemma`, `xlit` properties
- Loaded via dynamic `<script>` injection with Blob URLs

### 8.3 BibleStudy.org Lexicon

- Source: `TBESH.txt` (Hebrew) and `TBESG.txt` (Greek)
- Format: Tab-separated values with 8 columns
- Parsed client-side by `parseLexiconFile()`

## 9. Offline Strategy

### 9.1 Service Worker

- Caches static assets (HTML, CSS, JS, images, fonts)
- Implements stale-while-revalidate for Bible API requests
- Enables PWA installability

### 9.2 IndexedDB Persistence

All user data persists across sessions:
- Uploaded Bible translations
- Cached online Bible chapters
- Notes, tags, and scripts

## 10. Security Considerations

- **API Key Exposure**: The Bible API key is embedded in client-side code and visible in network requests. For production, proxy requests through a backend.
- **XSS Prevention**: All user-generated content and Bible text is escaped via `escapeHtml()` before insertion. Strong's numbers and lexicon content are sanitized.
- **CSP**: No Content Security Policy is currently implemented.
- **HTML in Markdown**: The custom Markdown renderer intentionally allows raw HTML in the final output for formatting flexibility.

## 11. Known Limitations

1. **Single-file JS**: All application logic is in one 2100-line file, making maintenance difficult
2. **No build process**: No bundling, transpilation, or module system
3. **Limited Markdown**: Custom renderer doesn't support nested lists, nested blockquotes, or tables
4. **Memory search**: Full Bible search loads all verses into memory
5. **Hardcoded API key**: Exposed in client-side code
6. **No user authentication**: All data is local to the browser
7. **Limited error handling**: Many promises lack proper error boundaries

## 12. Browser Support

- Modern browsers with IndexedDB and ES6 class support
- Chrome/Edge 80+
- Firefox 75+
- Safari 13+
- No IE11 support
