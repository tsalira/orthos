# Orthos Bible Study

A progressive web application for offline Bible study, scripture search, and note-taking.

## Features

- **Multiple Bible Translations**: Load local JSON Bible files or use online APIs
- **Scripture Search**: Full-text search across loaded translations
- **Strong's Concordance**: Integrated Hebrew (H) and Greek (G) Strong's number lookup with inline highlighting
- **Lexicon**: Word studies with definitions, transliterations, morphology, and usage occurrences
- **Notes**: Per-verse note-taking with persistent storage
- **Tags**: Keyword-based tagging system for organizing verses
- **Scripts**: Markdown-based study notes with a built-in renderer
- **Compare Mode**: Side-by-side chapter comparison across translations
- **Dark/Light Theme**: Toggle between themes with CSS custom properties
- **Offline-First**: IndexedDB storage for Bibles, notes, tags, scripts, and online chapter cache
- **PWA Support**: Service worker for offline caching and installability

## Quick Start

1. Open `index.html` in a modern web browser.
2. Click **+ Add Bible** to load a local Bible JSON file.
3. Select a book and chapter to begin reading.
4. Use the top bar to toggle compare mode, Strong's numbers, notes, lexicon, tags, and scripts.

## Supported Bible JSON Format

Uploaded Bible files must follow this structure:

```json
{
  "metadata": {
    "name": "Translation Name",
    "shortname": "ABBR",
    "module": "unique-module-id"
  },
  "verses": [
    {
      "book_name": "Genesis",
      "book": 1,
      "chapter": 1,
      "verse": 1,
      "text": "In the beginning..."
    }
  ]
}
```

## Keyboard Shortcuts

- **Ctrl/Cmd + Click** a verse: copy the verse text
- **Enter** in search/concordance/tag inputs: execute search

## Tech Stack

- **Frontend**: Vanilla HTML5, CSS3, ES6 JavaScript
- **Storage**: IndexedDB via native browser API
- **Architecture**: Single-page application with component-based panels
- **PWA**: Service worker (`sw.js`) and web app manifest (`manifest.json`)

## Project Structure

| File | Purpose |
|------|---------|
| `index.html` | Main application shell |
| `app.js` | Core application logic, renderers, and data layer |
| `style.css` | Theme system, layout, and component styling |
| `sw.js` | Service worker for offline caching |
| `manifest.json` | PWA manifest for installability |
| `strongs-*-dictionary.js` | OpenScriptures Strong's dictionary data |
| `TBES*.txt` | BibleStudy.org lexicon files |

## License

MIT
