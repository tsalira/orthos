class WordLabApp {
  constructor() {
    this.db = null;
    this.bibles = new Map();
    this.onlineBibles = new Map();
    this.currentModule = null;
    this.currentBook = null;
    this.currentChapter = null;
    this.currentVerse = null;
    this.compareMode = false;
    this.selectedCompareModules = new Set();
    this.notes = [];
    this.noteCounter = 0;
    this.showStrongs = false;
    this.lexicons = new Map();
    this.lexiconsLoaded = false;
    this.tags = [];
    this.currentTagKeyword = null;
    this.currentLexiconStrongs = null;
    this.scripts = [];
    this.currentScriptId = null;
    this.apiKey = 'd20Rs4GU6IoajNA8L-021';
  }

  async init() {
    await this.openDB();
    this.setupDOM();
    this.applySavedTheme();
    this.bindEvents();
    await this.loadSavedTranslations();
    await this.loadSavedNotes();
    await this.loadSavedTags();
    await this.loadLexicons();
    await this.loadOnlineBibles();
    await this.loadOnlineChapterCache();
    await this.loadScripts();
    this.renderBookList();
    this.updateTranslationSelect();
    this.renderCompareCheckboxes();
    const defaultModule = this.getDefaultModule() || this.currentModule;
    if (defaultModule) {
      document.getElementById('translation-select').value = defaultModule;
      this.selectTranslation(defaultModule);
    } else {
      this.showEmptyState();
    }
  }

  openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('WordLabDB', 4);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('bibles')) {
          db.createObjectStore('bibles', { keyPath: 'module' });
        }
        if (!db.objectStoreNames.contains('notes')) {
          const store = db.createObjectStore('notes', { keyPath: 'id', autoIncrement: true });
          store.createIndex('ref', ['book','chapter','verse'], { unique: false });
        }
        if (!db.objectStoreNames.contains('tags')) {
          const store = db.createObjectStore('tags', { keyPath: 'id', autoIncrement: true });
          store.createIndex('keyword', 'keyword', { unique: false });
          store.createIndex('ref', ['book','chapter','verse','module'], { unique: false });
        }
        if (!db.objectStoreNames.contains('onlineChapters')) {
          db.createObjectStore('onlineChapters', { keyPath: ['module','bookName','chapter'] });
        }
        if (!db.objectStoreNames.contains('scripts')) {
          const store = db.createObjectStore('scripts', { keyPath: 'id', autoIncrement: true });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
      request.onsuccess = (e) => { this.db = e.target.result; resolve(); };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async loadSavedTranslations() {
    return new Promise((resolve) => {
      const tx = this.db.transaction('bibles', 'readonly');
      const store = tx.objectStore('bibles');
      const req = store.getAll();
      req.onsuccess = () => {
        for (const item of req.result) {
          this.indexBible(item);
        }
        resolve();
      };
      req.onerror = () => resolve();
    });
  }

  async loadOnlineChapterCache() {
    return new Promise((resolve) => {
      const tx = this.db.transaction('onlineChapters', 'readonly');
      const store = tx.objectStore('onlineChapters');
      const req = store.getAll();
      req.onsuccess = () => {
        for (const item of (req.result || [])) {
          const bible = this.onlineBibles.get(item.module);
          if (!bible) continue;
          if (!bible.bookMap[item.bookName]) {
            bible.bookMap[item.bookName] = { bookNum: 0, chapters: {} };
          }
          if (!bible.bookMap[item.bookName].chapters[item.chapter]) {
            bible.bookMap[item.bookName].chapters[item.chapter] = [];
          }
          for (const v of (item.verses || [])) {
            bible.bookMap[item.bookName].chapters[item.chapter].push(v);
            bible.verses.push(v);
          }
        }
        resolve();
      };
      req.onerror = () => resolve();
    });
  }

  indexBible(data) {
    const { metadata, verses } = data;
    if (!verses || !Array.isArray(verses)) return;
    const bookMap = {};
    const strongsIndex = new Map();
    
    for (const v of verses) {
      if (!bookMap[v.book_name]) {
        bookMap[v.book_name] = { bookNum: v.book, chapters: {} };
      }
      if (!bookMap[v.book_name].chapters[v.chapter]) {
        bookMap[v.book_name].chapters[v.chapter] = [];
      }
      bookMap[v.book_name].chapters[v.chapter].push(v);
      
      if (v.text) {
        const numbers = v.text.match(/[HG]\d+/gi) || [];
        for (const num of numbers) {
          const key = num.toUpperCase();
          if (!strongsIndex.has(key)) strongsIndex.set(key, []);
          strongsIndex.get(key).push({ book: v.book_name, chapter: v.chapter, verse: v.verse, text: v.text });
        }
      }
    }
    
    this.bibles.set(metadata.module, { metadata, verses, bookMap, strongsIndex });
    
    if (!this.currentModule) {
      this.selectTranslation(metadata.module);
    }
  }

  async loadSavedNotes() {
    return new Promise((resolve) => {
      const tx = this.db.transaction('notes', 'readonly');
      const store = tx.objectStore('notes');
      const req = store.getAll();
      req.onsuccess = () => {
        this.notes = req.result || [];
        this.noteCounter = this.notes.reduce((max, n) => Math.max(max, n.id || 0), 0);
        resolve();
      };
      req.onerror = () => resolve();
    });
  }

  async loadSavedTags() {
    return new Promise((resolve) => {
      const tx = this.db.transaction('tags', 'readonly');
      const store = tx.objectStore('tags');
      const req = store.getAll();
      req.onsuccess = () => {
        this.tags = req.result || [];
        resolve();
      };
      req.onerror = () => resolve();
    });
  }

  setupDOM() {
    this.els = {
      bookList: document.getElementById('book-list'),
      translationSelect: document.getElementById('translation-select'),
      compareSelect: document.getElementById('compare-select'),
      compareCheckboxes: document.getElementById('compare-checkboxes'),
      addBibleBtn: document.getElementById('add-bible-btn'),
      removeBibleBtn: document.getElementById('remove-bible-btn'),
      fileInput: document.getElementById('file-input'),
      toggleSidebar: document.getElementById('toggle-sidebar'),
      bibleSearch: document.getElementById('bible-search'),
      searchExecute: document.getElementById('search-execute'),
      compareToggle: document.getElementById('compare-toggle'),
      toggleConcordance: document.getElementById('toggle-concordance'),
      toggleNotes: document.getElementById('toggle-notes'),
      strongsToggle: document.getElementById('strongs-toggle'),
      copyVersesBtn: document.getElementById('copy-verses'),
      themeToggle: document.getElementById('theme-toggle'),
      chapterView: document.getElementById('chapter-view'),
      compareArea: document.getElementById('compare-area'),
      notesPanel: document.getElementById('notes-panel'),
      notesList: document.getElementById('notes-list'),
      noteText: document.getElementById('note-text'),
      saveNoteBtn: document.getElementById('save-note'),
      clearNoteBtn: document.getElementById('clear-note'),
      closeNotes: document.getElementById('close-notes'),
      concordancePanel: document.getElementById('concordance-panel'),
      closeConcordance: document.getElementById('close-concordance'),
      concordanceInput: document.getElementById('concordance-input'),
      concordanceSearchBtn: document.getElementById('concordance-search-btn'),
      concordanceList: document.getElementById('concordance-list'),
      concordanceStats: document.getElementById('concordance-stats'),
      breadcrumb: document.getElementById('breadcrumb'),
      loadingOverlay: document.getElementById('loading-overlay'),
      lexiconPanel: document.getElementById('lexicon-panel'),
      lexiconBody: document.getElementById('lexicon-body'),
      lexiconClose: document.getElementById('close-lexicon'),
      toggleLexicon: document.getElementById('toggle-lexicon'),
      tagsPanel: document.getElementById('tags-panel'),
      tagsList: document.getElementById('tags-list'),
      tagsAdd: document.getElementById('tags-add'),
      tagInput: document.getElementById('tag-input'),
      addTagBtn: document.getElementById('add-tag-btn'),
      toggleTags: document.getElementById('toggle-tags'),
      closeTags: document.getElementById('close-tags'),
      tagEntriesPanel: document.getElementById('tag-entries-panel'),
      tagEntriesList: document.getElementById('tag-entries-list'),
      tagEntriesTitle: document.getElementById('tag-entries-title'),
      closeTagEntries: document.getElementById('close-tag-entries'),
      scriptsPanel: document.getElementById('scripts-panel'),
      scriptsList: document.getElementById('scripts-list'),
      toggleScripts: document.getElementById('toggle-scripts'),
      closeScripts: document.getElementById('close-scripts'),
      newScriptBtn: document.getElementById('new-script-btn'),
      scriptEditorPanel: document.getElementById('script-editor-panel'),
      scriptEditorTitle: document.getElementById('script-editor-title'),
      scriptTextarea: document.getElementById('script-textarea'),
      scriptPreview: document.getElementById('script-preview'),
      previewScriptBtn: document.getElementById('preview-script-btn'),
      copyScriptBtn: document.getElementById('copy-script-btn'),
      deleteScriptBtn: document.getElementById('delete-script-btn'),
      closeScriptEditor: document.getElementById('close-script-editor'),
      confirmModal: document.getElementById('confirm-modal'),
      confirmModalTitle: document.getElementById('confirm-modal-title'),
      confirmModalMessage: document.getElementById('confirm-modal-message'),
      confirmModalCancel: document.getElementById('confirm-modal-cancel'),
      confirmModalOk: document.getElementById('confirm-modal-ok')
    };
  }

  bindEvents() {
    this.els.addBibleBtn.addEventListener('click', () => this.els.fileInput.click());
    this.els.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
    this.els.removeBibleBtn.addEventListener('click', () => this.removeCurrentTranslation());
    this.els.translationSelect.addEventListener('change', (e) => this.selectTranslation(e.target.value));
    this.els.toggleSidebar.addEventListener('click', () => this.toggleSidebar());
    this.els.searchExecute.addEventListener('click', () => this.executeSearch());
    this.els.bibleSearch.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.executeSearch(); });
    this.els.compareToggle.addEventListener('change', (e) => this.toggleCompare(e.target.checked));
    this.els.toggleConcordance.addEventListener('click', () => this.toggleConcordancePanel());
    this.els.closeConcordance.addEventListener('click', () => this.toggleConcordancePanel(false));
    this.els.concordanceSearchBtn.addEventListener('click', () => this.executeConcordanceSearch());
    this.els.concordanceInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.executeConcordanceSearch(); });
    this.els.toggleNotes.addEventListener('click', () => this.toggleNotesPanel());
    this.els.closeNotes.addEventListener('click', () => this.toggleNotesPanel(false));
    this.els.strongsToggle.addEventListener('change', () => this.toggleStrongs());
    this.els.saveNoteBtn.addEventListener('click', () => this.saveCurrentNote());
    this.els.clearNoteBtn.addEventListener('click', () => { this.els.noteText.value = ''; });
    this.els.copyVersesBtn.addEventListener('click', () => this.copyCurrentChapter());
    this.els.themeToggle.addEventListener('click', () => this.toggleTheme());
    this.els.toggleLexicon.addEventListener('click', () => this.toggleLexiconPanel());
    this.els.lexiconClose.addEventListener('click', () => this.toggleLexiconPanel(false));
    this.els.toggleTags.addEventListener('click', () => this.toggleTagsPanel());
    this.els.closeTags.addEventListener('click', () => this.toggleTagsPanel(false));
    this.els.closeTagEntries.addEventListener('click', () => this.closeTagEntries());
    this.els.toggleScripts.addEventListener('click', () => this.toggleScriptsPanel());
    this.els.closeScripts.addEventListener('click', () => this.toggleScriptsPanel(false));
    this.els.newScriptBtn.addEventListener('click', () => this.openScriptEditor());
    this.els.previewScriptBtn.addEventListener('click', () => this.toggleScriptPreview());
    this.els.copyScriptBtn.addEventListener('click', () => this.copyScriptMarkdown());
    this.els.deleteScriptBtn.addEventListener('click', () => this.confirmDeleteScript());
    this.els.closeScriptEditor.addEventListener('click', () => this.closeScriptEditor());
    this.els.confirmModalCancel.addEventListener('click', () => this.hideConfirmModal());
    this.els.confirmModalOk.addEventListener('click', () => this.executeConfirmedDelete());
    this.els.addTagBtn.addEventListener('click', () => this.addTagToCurrentVerse());
    this.els.tagInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.addTagToCurrentVerse(); });
    
    document.addEventListener('click', (e) => {
      const bookHeader = e.target.closest('.book-header');
      if (bookHeader) {
        const bookName = bookHeader.dataset.book;
        this.toggleBookChapters(bookName);
        return;
      }
      const chapterItem = e.target.closest('.chapter-list li');
      if (chapterItem) {
        const bookName = chapterItem.dataset.book;
        const chapterNum = parseInt(chapterItem.dataset.chapter, 10);
        this.selectChapter(bookName, chapterNum);
        return;
      }
      const strongsSpan = e.target.closest('.strongs');
      if (strongsSpan) {
        e.stopPropagation();
        this.showLexiconEntry(strongsSpan.dataset.strongs);
        return;
      }
      const verseNumEl = e.target.closest('.verse-num');
      if (verseNumEl) {
        e.stopPropagation();
        const book = verseNumEl.dataset.book;
        const chapter = parseInt(verseNumEl.dataset.chapter, 10);
        const verse = parseInt(verseNumEl.dataset.verse, 10);
        if (e.ctrlKey || e.metaKey) {
          this.copyVerse(book, chapter, verse);
        } else {
          this.selectVerse(book, chapter, verse);
        }
        return;
      }
      const noteIndicator = e.target.closest('.verse-note-indicator');
      if (noteIndicator) {
        e.stopPropagation();
        const book = noteIndicator.dataset.book;
        const chapter = parseInt(noteIndicator.dataset.chapter, 10);
        const verse = parseInt(noteIndicator.dataset.verse, 10);
        this.selectVerse(book, chapter, verse);
        this.toggleNotesPanel(true);
        return;
      }
      const accordionArrow = e.target.closest('.book-arrow');
      if (accordionArrow) {
        e.stopPropagation();
        const bookHeader = accordionArrow.closest('.book-header');
        const bookName = bookHeader.dataset.book;
        this.toggleBookChapters(bookName);
        return;
      }
      const deleteNoteBtn = e.target.closest('.delete-note-btn');
      if (deleteNoteBtn) {
        e.stopPropagation();
        const id = parseInt(deleteNoteBtn.dataset.id, 10);
        this.deleteNote(id);
        return;
      }
      const noteItem = e.target.closest('.note-item');
      if (noteItem) {
        const id = parseInt(noteItem.dataset.noteId, 10);
        this.deleteNote(id);
        return;
      }
      const verseRow = e.target.closest('.verse-row');
      if (verseRow && !e.target.closest('.verse-num') && !e.target.closest('.strongs')) {
        const book = verseRow.dataset.book;
        const chapter = parseInt(verseRow.dataset.chapter, 10);
        const verse = parseInt(verseRow.dataset.verse, 10);
        this.selectVerse(book, chapter, verse);
      }
    });
  }

  async handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      this.els.loadingOverlay.classList.remove('hidden');
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.verses || !Array.isArray(data.verses) || !data.metadata) {
        throw new Error('Invalid bible JSON format');
      }
      const module = data.metadata.module || file.name.replace(/\.json$/i, '');
      data.metadata.module = module;
      data.module = module;
      
      const tx = this.db.transaction('bibles', 'readwrite');
      const store = tx.objectStore('bibles');
      store.put(data);
      
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      
      this.indexBible(data);
      this.selectTranslation(module);
      this.els.translationSelect.value = module;
    } catch (err) {
      alert('Failed to load Bible: ' + err.message);
      console.error(err);
    } finally {
      this.els.loadingOverlay.classList.add('hidden');
      this.els.fileInput.value = '';
    }
  }

  async removeCurrentTranslation() {
    if (!this.currentModule) return;
    if (!confirm('Remove current translation? This cannot be undone.')) return;
    
    const tx = this.db.transaction('bibles', 'readwrite');
    const store = tx.objectStore('bibles');
    store.delete(this.currentModule);
    
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    
    this.bibles.delete(this.currentModule);
    this.currentModule = null;
    this.currentBook = null;
    this.currentChapter = null;
    this.currentVerse = null;
    this.updateTranslationSelect();
    this.renderCompareCheckboxes();
    this.renderBookList();
    this.showEmptyState();
  }

  selectTranslation(module) {
    this.currentModule = module;
    this.currentBook = null;
    this.currentChapter = null;
    this.currentVerse = null;
    this.renderBookList();
    this.toggleConcordancePanel(false);
    this.toggleNotesPanel(false);
    
    const bible = this.getCurrentBible();
    if (bible) {
      if (this.compareMode) {
        this.renderCompareView();
      } else {
        this.showEmptyState('Select a book to begin');
      }
    }
  }

  getCurrentBible() {
    return this.bibles.get(this.currentModule) || this.onlineBibles.get(this.currentModule);
  }

  getCurrentBibleFor(module) {
    return this.bibles.get(module) || this.onlineBibles.get(module);
  }

  getAllBibles() {
    const combined = new Map(this.bibles);
    for (const [key, bible] of this.onlineBibles) {
      combined.set(key, bible);
    }
    return combined;
  }

  toggleBookChapters(bookName) {
    const list = document.querySelector(`.chapter-list[data-book="${bookName}"]`);
    if (!list) return;
    const isOpen = list.classList.contains('open');
    document.querySelectorAll('.chapter-list.open').forEach(el => el.classList.remove('open'));
    if (!isOpen) {
      list.classList.add('open');
    }
  }

  selectChapter(bookName, chapterNum) {
    this.currentBook = bookName;
    this.currentChapter = chapterNum;
    this.currentVerse = null;
    this.renderChapterView();
    this.renderNotes();
    this.updateBreadcrumb();
    
    document.querySelectorAll('.book-header.active').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.chapter-list li.active').forEach(el => el.classList.remove('active'));
    const bookHeader = document.querySelector(`.book-header[data-book="${bookName}"]`);
    if (bookHeader) bookHeader.classList.add('active');
    const chapterItem = document.querySelector(`.chapter-list li[data-book="${bookName}"][data-chapter="${chapterNum}"]`);
    if (chapterItem) chapterItem.classList.add('active');
    
    if (window.innerWidth <= 768) {
      document.getElementById('sidebar').classList.remove('mobile-open');
    }
    if (!this.els.tagsPanel.classList.contains('hidden')) {
      this.showAllTags();
    }
  }

  selectVerse(book, chapter, verse) {
    this.currentVerse = { book, chapter, verse };
    this.renderNotes();
    this.updateBreadcrumb();
    
    document.querySelectorAll('.verse-row.active').forEach(el => el.classList.remove('active'));
    const row = document.querySelector(`.verse-row[data-book="${book}"][data-chapter="${chapter}"][data-verse="${verse}"]`);
    if (row) {
      row.classList.add('active');
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    
    if (!document.getElementById('notes-panel').classList.contains('hidden')) {
      this.renderNotes();
    }
    if (!this.els.tagsPanel.classList.contains('hidden')) {
      this.els.tagsAdd.classList.remove('hidden');
      this.els.tagEntriesPanel.classList.add('hidden');
      this.renderTagsList();
    }
  }

  renderBookList() {
    this.els.bookList.innerHTML = '';
    const primary = this.getCurrentBible();
    if (!primary) {
      const li = document.createElement('li');
      li.style.padding = '16px';
      li.style.color = 'var(--text-muted)';
      li.textContent = 'No Bible loaded. Upload a JSON file or connect to the internet.';
      this.els.bookList.appendChild(li);
      return;
    }
    
    let sortedBookNames = Object.keys(primary.bookMap).sort((a, b) => primary.bookMap[a].bookNum - primary.bookMap[b].bookNum);
    
    if (sortedBookNames.length === 0 && this.onlineBibles.has(this.currentModule)) {
      sortedBookNames = this.getStandardBookNames();
      const chapterCounts = this.getStandardBookChapterCounts();
      for (const name of sortedBookNames) {
        const maxCh = chapterCounts[name] || 22;
        const chapters = {};
        for (let ch = 1; ch <= maxCh; ch++) chapters[ch] = [];
        primary.bookMap[name] = { bookNum: 0, chapters };
      }
    }
    
    for (const name of sortedBookNames) {
      const info = primary.bookMap[name];
      const bookLi = document.createElement('li');
      bookLi.className = 'book-item';
      
      const chapterCount = Object.keys(info.chapters).length;
      
      bookLi.innerHTML = `
        <div class="book-header" data-book="${name}">
          <span class="book-name">${name}</span>
          <span class="book-arrow">▸ ${chapterCount}</span>
        </div>
        <ul class="chapter-list" data-book="${name}">
          ${Object.keys(info.chapters).map(ch => `<li data-book="${name}" data-chapter="${ch}">Chapter ${ch}</li>`).join('')}
        </ul>
      `;
      this.els.bookList.appendChild(bookLi);
    }
  }

  async renderChapterView() {
    const bible = this.getCurrentBible();
    if (!bible || !this.currentBook || !this.currentChapter) {
      this.showEmptyState('Select a book and chapter');
      return;
    }
    
    const isOnlineBible = this.onlineBibles.has(this.currentModule);
    const bookInfo = bible.bookMap[this.currentBook];
    let verses = bookInfo ? (bookInfo.chapters[this.currentChapter] || []) : [];
    
    if (isOnlineBible && verses.length === 0) {
      this.els.chapterView.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);">Loading from online...</div>';
      verses = await this.fetchOnlineChapter(this.currentModule, this.currentBook, this.currentChapter);
      if (verses.length === 0) {
        this.showEmptyState('Could not load this chapter online');
        return;
      }
    }
    
    if (!bookInfo || verses.length === 0) return;
    
    this.els.chapterView.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'chapter-title';
    title.textContent = `${this.currentBook} ${this.currentChapter}`;
    this.els.chapterView.appendChild(title);
    
    const container = document.createElement('div');
    
    for (const v of verses) {
      const row = document.createElement('div');
      row.className = 'verse-row';
      row.dataset.book = v.book_name;
      row.dataset.chapter = v.chapter;
      row.dataset.verse = v.verse;
      
      const numEl = document.createElement('span');
      numEl.className = 'verse-num';
      numEl.dataset.book = v.book_name;
      numEl.dataset.chapter = v.chapter;
      numEl.dataset.verse = v.verse;
      numEl.textContent = v.verse;
      numEl.title = 'Click to select, Ctrl+click to copy';
      
      const textEl = document.createElement('span');
      textEl.className = 'verse-text';
      textEl.innerHTML = this.formatVerseText(v.text);
      
      const notesForVerse = this.notes.filter(n => n.book === v.book_name && n.chapter === v.chapter && n.verse === v.verse);
      if (notesForVerse.length > 0) {
        const indicator = document.createElement('span');
        indicator.className = 'verse-note-indicator';
        indicator.dataset.book = v.book_name;
        indicator.dataset.chapter = v.chapter;
        indicator.dataset.verse = v.verse;
        indicator.textContent = '📝';
        indicator.title = `${notesForVerse.length} note(s)`;
        row.appendChild(numEl);
        row.appendChild(textEl);
        row.appendChild(indicator);
      } else {
        row.appendChild(numEl);
        row.appendChild(textEl);
      }
      
      container.appendChild(row);
    }
    
    this.els.chapterView.appendChild(container);
  }

  renderCompareView() {
    this.els.compareArea.innerHTML = '';
    this.els.chapterView.innerHTML = '';
    
    const allBibles = this.getAllBibles();
    
    if (allBibles.size === 0) {
      this.renderEmptyCompare();
      return;
    }
    
    if (this.selectedCompareModules.size === 0) {
      this.els.compareArea.innerHTML = '<div style="color:var(--text-muted);padding:24px;">Select translations to compare using the checkboxes in the sidebar.</div>';
      return;
    }
    
    for (const module of this.selectedCompareModules) {
      const bible = this.getCurrentBibleFor(module);
      if (!bible) continue;
      
      const col = document.createElement('div');
      col.className = 'compare-column';
      col.innerHTML = `<h4>${this.escapeHtml(bible.metadata.name || module)}</h4>`;
      
      if (this.currentBook && this.currentChapter) {
        const bookInfo = bible.bookMap[this.currentBook];
        if (bookInfo) {
          const verses = bookInfo.chapters[this.currentChapter] || [];
          verses.forEach(v => {
            const row = document.createElement('div');
            row.className = 'verse-row';
            row.dataset.book = v.book_name;
            row.dataset.chapter = v.chapter;
            row.dataset.verse = v.verse;
            row.innerHTML = `<span class="verse-num" title="Click to select, Ctrl+click to copy">${v.verse}</span><span class="verse-text">${this.formatVerseText(v.text)}</span>`;
            col.appendChild(row);
          });
        }
      } else {
        col.innerHTML += `<div style="color:var(--text-muted);font-size:0.9rem;">Select a chapter to compare.</div>`;
      }
      
      this.els.compareArea.appendChild(col);
    }
  }

  renderEmptyCompare() {
    this.els.compareArea.innerHTML = `<div style="color:var(--text-muted);padding:24px;">Select a chapter to compare.</div>`;
  }

  renderCompareCheckboxes() {
    this.els.compareCheckboxes.innerHTML = '';
    const allBibles = this.getAllBibles();
    
    for (const [module, bible] of allBibles) {
      const isOnlineOnly = this.onlineBibles.has(module) && !this.bibles.has(module);
      
      const label = document.createElement('label');
      label.className = 'compare-checkbox';
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = module;
      checkbox.checked = this.selectedCompareModules.has(module);
      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.selectedCompareModules.add(module);
        } else {
          this.selectedCompareModules.delete(module);
        }
        if (this.compareMode) {
          this.renderCompareView();
        }
      });
      
      const text = document.createTextNode(bible.metadata.name || module);
      label.appendChild(checkbox);
      label.appendChild(text);
      this.els.compareCheckboxes.appendChild(label);
    }
  }

  renderNotes() {
    this.els.notesList.innerHTML = '';
    let filtered = [];
    if (this.currentVerse) {
      filtered = this.notes.filter(n => 
        n.book === this.currentVerse.book && 
        n.chapter === this.currentVerse.chapter && 
        n.verse === this.currentVerse.verse
      );
    } else if (this.currentBook && this.currentChapter) {
      filtered = this.notes.filter(n => 
        n.book === this.currentBook && 
        n.chapter === this.currentChapter
      );
    } else {
      filtered = [];
    }
    
    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.style.color = 'var(--text-muted)';
      empty.style.fontSize = '0.9rem';
      empty.style.padding = '12px';
      empty.textContent = 'No notes yet. Select a verse and write a note.';
      this.els.notesList.appendChild(empty);
      return;
    }
    
    for (const note of filtered) {
      const item = document.createElement('div');
      item.className = 'note-item';
      item.dataset.noteId = note.id;
      const bible = this.bibles.get(note.translation);
      const refText = `${note.book} ${note.chapter}:${note.verse}`;
      item.innerHTML = `
        <div class="note-meta">${refText} · ${bible ? bible.metadata.name || note.translation : note.translation} · ${new Date(note.date).toLocaleString()}</div>
        <div class="note-body">${this.escapeHtml(note.text)}</div>
        <div style="text-align:right;margin-top:6px;"><button class="delete-note-btn" data-id="${note.id}" style="background:var(--accent);border:none;color:#fff;border-radius:4px;padding:4px 8px;cursor:pointer;">Delete</button></div>
      `;
      this.els.notesList.appendChild(item);
    }
  }

  async saveCurrentNote() {
    const text = this.els.noteText.value.trim();
    if (!text) return;
    if (!this.currentVerse && !this.currentBook) {
      alert('Select a verse or chapter first');
      return;
    }
    
    const note = {
      book: this.currentVerse ? this.currentVerse.book : this.currentBook,
      chapter: this.currentVerse ? this.currentVerse.chapter : this.currentChapter,
      verse: this.currentVerse ? this.currentVerse.verse : 0,
      text,
      date: Date.now(),
      translation: this.currentModule || ''
    };
    
    const tx = this.db.transaction('notes', 'readwrite');
    const store = tx.objectStore('notes');
    const id = await new Promise((resolve) => {
      const req = store.add(note);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    
    if (id) {
      note.id = id;
      this.notes.push(note);
      this.els.noteText.value = '';
      this.renderNotes();
      if (this.currentBook && this.currentChapter) {
        this.renderChapterView();
      }
    }
  }

  async deleteNote(id) {
    if (!confirm('Delete this note?')) return;
    const tx = this.db.transaction('notes', 'readwrite');
    tx.objectStore('notes').delete(id);
    await new Promise(r => { tx.oncomplete = r; });
    this.notes = this.notes.filter(n => n.id !== id);
    this.renderNotes();
    if (this.currentBook && this.currentChapter) {
      this.renderChapterView();
    }
  }

  executeSearch() {
    const query = this.els.bibleSearch.value.trim().toLowerCase();
    if (!query || !this.currentModule) return;
    const bible = this.bibles.get(this.currentModule);
    if (!bible) return;
    
    const results = bible.verses.filter(v => v.text.toLowerCase().includes(query));
    this.displaySearchResults(results, query);
  }

  displaySearchResults(results, query) {
    this.els.chapterView.innerHTML = `<div class="chapter-title">Search Results for "${this.escapeHtml(query)}" (${results.length})</div>`;
    const container = document.createElement('div');
    
    const grouped = {};
    for (const v of results) {
      const key = `${v.book_name} ${v.chapter}`;
      if (!grouped[key]) grouped[key] = { book: v.book_name, chapter: v.chapter, verses: [] };
      grouped[key].verses.push(v);
    }
    
    for (const key of Object.keys(grouped)) {
      const group = grouped[key];
      const header = document.createElement('div');
      header.className = 'chapter-title';
      header.style.fontSize = '1.2rem';
      header.style.marginTop = '16px';
      header.textContent = `${group.book} ${group.chapter}`;
      container.appendChild(header);
      
      for (const v of group.verses) {
        const row = document.createElement('div');
        row.className = 'verse-row';
        row.dataset.book = v.book_name;
        row.dataset.chapter = v.chapter;
        row.dataset.verse = v.verse;
        row.innerHTML = `<span class="verse-num" title="Click to select, Ctrl+click to copy">${v.verse}</span><span class="verse-text">${this.formatVerseText(v.text)}</span>`;
        container.appendChild(row);
      }
    }
    
    if (results.length === 0) {
      container.innerHTML = `<div style="color:var(--text-muted);padding:12px;">No results found.</div>`;
    }
    
    this.els.chapterView.appendChild(container);
  }

  executeConcordanceSearch() {
    const query = this.els.concordanceInput.value.trim().toUpperCase();
    if (!query || !this.currentModule) {
      this.els.concordanceStats.textContent = 'Enter a Strong\'s number (e.g., H7225)';
      this.els.concordanceList.innerHTML = '';
      return;
    }
    
    const bible = this.bibles.get(this.currentModule);
    if (!bible) return;
    
    const refs = bible.strongsIndex.get(query);
    if (!refs) {
      this.els.concordanceStats.textContent = `No occurrences found for ${query}`;
      this.els.concordanceList.innerHTML = '';
      return;
    }
    
    this.els.concordanceStats.textContent = `${refs.length} occurrence(s) for ${query}`;
    this.els.concordanceList.innerHTML = '';
    
    for (const ref of refs) {
      const li = document.createElement('li');
      li.className = 'concordance-item';
      li.innerHTML = `<div><span class="concordance-strongs">${this.escapeHtml(query)}</span> <span class="concordance-count">${this.escapeHtml(ref.book)} ${ref.chapter}:${ref.verse}</span></div><div style="margin-top:4px;font-size:0.9rem;color:var(--text-muted);line-height:1.4;">${this.formatVerseText(ref.text)}</div>`;
      li.addEventListener('click', () => {
        this.selectChapter(ref.book, ref.chapter);
        setTimeout(() => {
          const row = document.querySelector(`.verse-row[data-book="${ref.book}"][data-chapter="${ref.chapter}"][data-verse="${ref.verse}"]`);
          if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 50);
      });
      this.els.concordanceList.appendChild(li);
    }
  }

  toggleCompare(on) {
    this.compareMode = on;
    if (on) {
      this.els.compareSelect.classList.remove('hidden');
      this.els.compareArea.classList.add('active');
      this.els.chapterView.style.display = 'none';
      if (this.selectedCompareModules.size === 0 && this.currentModule) {
        this.selectedCompareModules.add(this.currentModule);
      }
      this.renderCompareCheckboxes();
      this.renderCompareView();
    } else {
      this.els.compareSelect.classList.add('hidden');
      this.els.compareArea.classList.remove('active');
      this.els.chapterView.style.display = 'block';
      if (this.currentBook && this.currentChapter) {
        this.renderChapterView();
      } else {
        this.showEmptyState('Select a book to begin');
      }
    }
  }

  toggleStrongs() {
    this.showStrongs = !this.showStrongs;
    this.els.strongsToggle.checked = this.showStrongs;
    if (this.currentBook && this.currentChapter) {
      this.renderChapterView();
    }
    if (this.compareMode) {
      this.renderCompareView();
    }
    if (!this.els.lexiconPanel.classList.contains('hidden') && this.currentLexiconStrongs) {
      this.showLexiconEntry(this.currentLexiconStrongs);
    }
  }

  applySavedTheme() {
    const saved = localStorage.getItem('wordlab-theme');
    if (saved === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      this.els.themeToggle.textContent = '🌙';
    } else {
      document.documentElement.removeAttribute('data-theme');
      this.els.themeToggle.textContent = '🌓';
    }
  }

  toggleTheme() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (isLight) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('wordlab-theme', 'dark');
      this.els.themeToggle.textContent = '🌓';
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('wordlab-theme', 'light');
      this.els.themeToggle.textContent = '🌙';
    }
  }

  async loadOnlineBibles() {
    try {
      await this.loadFromAPIBible();
      await this.loadFromFreeUseBibleAPI();
    } catch (err) {
      console.warn('Failed to load online bibles:', err);
    }
  }

  async loadFromAPIBible() {
    if (!this.apiKey) return;
    const translations = [
      { id: '63097d2a0a2f7db3-01', name: 'New King James Version', abbr: 'NKJV' },
      { id: '78a9f6124f344018-01', name: 'New International Version', abbr: 'NIV' },
      { id: 'a81b73293d3080c9-01', name: 'Amplified Bible', abbr: 'AMP' },
    ];
    for (const t of translations) {
      const moduleId = `online-${t.abbr.toLowerCase()}`;
      this.onlineBibles.set(moduleId, {
        metadata: {
          name: `${t.name} (Online)`,
          shortname: t.abbr,
          module: moduleId,
          year: '',
          publisher: 'API.Bible',
          owner: null,
          description: `Fetched online via API.Bible. Requires internet.`,
          lang: 'en',
          lang_short: 'en',
          copyright: 1,
          copyright_statement: `© ${t.name}`,
          url: null,
          citation_limit: 0,
          restrict: 1,
          italics: 0,
          strongs: 0,
          red_letter: 0,
          paragraph: 1,
          official: 0,
          research: 0,
          module_version: '1.0',
          audio_structure: null
        },
        verses: [],
        bookMap: {},
        strongsIndex: new Map(),
        isOnline: true,
        source: 'apibible',
        translationId: t.id,
        abbr: t.abbr
      });
    }
  }

  async loadFromFreeUseBibleAPI() {
    try {
      const res = await fetch('https://cdn.jsdelivr.net/gh/wldeh/bible-api/bibles/bibles.json');
      if (!res.ok) return;
      const data = await this.safeJson(res);
      if (!data) return;
      const targets = ['en-bsb', 'en-web', 'en-wmb', 'en-asv', 'en-kjv'];
      const targetNames = ['BSB', 'WEB', 'WMB', 'ASV', 'KJV'];
      for (let i = 0; i < targets.length; i++) {
        const id = targets[i];
        const versionData = data.find(d => d.id === id);
        if (!versionData) continue;
        const name = versionData.version || targetNames[i];
        const moduleId = `online-${id.replace('en-', '')}`;
        this.onlineBibles.set(moduleId, {
          metadata: {
            name: `${name} (Online)`,
            shortname: targetNames[i],
            module: moduleId,
            year: '',
            publisher: 'Public Domain',
            owner: null,
            description: `Fetched online via wldeh/bible-api. Requires internet.`,
            lang: 'en',
            lang_short: 'en',
            copyright: 0,
            copyright_statement: 'Public Domain',
            url: null,
            citation_limit: 0,
            restrict: 0,
            italics: 0,
            strongs: 0,
            red_letter: 0,
            paragraph: 1,
            official: 0,
            research: 0,
            module_version: '1.0',
            audio_structure: null
          },
          verses: [],
          bookMap: {},
          strongsIndex: new Map(),
          isOnline: true,
          source: 'freeuse',
          translationId: id
        });
      }
    } catch (err) {
      console.warn('Failed to load Free Use Bible translations:', err);
    }
  }

  async fetchOnlineChapter(module, bookName, chapter) {
    const bible = this.onlineBibles.get(module);
    if (!bible) return [];
    const cached = bible.bookMap[bookName] && bible.bookMap[bookName].chapters[chapter];
    if (cached && cached.length > 0) {
      return cached;
    }
    try {
      let verses = [];
      if (bible.source === 'apibible') {
        verses = await this.fetchAPIBibleChapter(bible.translationId, bookName, chapter);
      } else if (bible.source === 'freeuse') {
        verses = await this.fetchFreeUseChapter(bible.translationId, bookName, chapter);
      }
      for (const v of verses) {
        if (!bible.bookMap[v.book_name]) bible.bookMap[v.book_name] = { bookNum: v.book, chapters: {} };
        if (!bible.bookMap[v.book_name].chapters[v.chapter]) bible.bookMap[v.book_name].chapters[v.chapter] = [];
        bible.bookMap[v.book_name].chapters[v.chapter].push(v);
      }
      bible.verses.push(...verses);
      if (verses.length > 0) {
        this.saveOnlineChapter(module, bookName, chapter, verses);
      }
      return verses;
    } catch (err) {
      console.error(`Failed to fetch ${module} ${bookName} ${chapter}:`, err);
      return [];
    }
  }

  saveOnlineChapter(module, bookName, chapter, verses) {
    if (!this.db) return;
    try {
      const tx = this.db.transaction('onlineChapters', 'readwrite');
      const store = tx.objectStore('onlineChapters');
      store.put({ module, bookName, chapter, verses });
    } catch (e) {
      console.warn('Failed to save online chapter to cache:', e);
    }
  }

  async fetchAPIBibleChapter(translationId, bookName, chapter) {
    const bookId = this.getApiBibleBookId(bookName);
    const passages = await this.fetchWithAuth(`https://api.scripture.api.bible/v1/bibles/${translationId}/passages/${bookId}.${chapter}`, {
      headers: { 'api-key': this.apiKey, 'Accept': 'application/json' }
    });
    const html = (passages && passages.data && passages.data.content) || '';
    const verses = [];
    const regex = /<span[^>]*data-number="(\d+)"[^>]*class="v"[^>]*>.*?<\/span>(.*?)(?=<span|$)/gs;
    let m;
    while ((m = regex.exec(html)) !== null) {
      verses.push({
        book_name: bookName,
        book: 0,
        chapter: chapter,
        verse: parseInt(m[1], 10),
        text: m[2].replace(/<[^>]*>/g, '').trim()
      });
    }
    return verses;
  }

  async fetchFreeUseChapter(translationId, bookName, chapter) {
    const cleanBook = bookName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const url = `https://cdn.jsdelivr.net/gh/wldeh/bible-api/bibles/${encodeURIComponent(translationId)}/books/${cleanBook}/chapters/${chapter}.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || !data.data) return [];
    return data.data.map(v => ({
      book_name: bookName,
      book: 0,
      chapter: parseInt(v.chapter, 10) || chapter,
      verse: parseInt(v.verse, 10) || 0,
      text: (v.text || '').replace(/\{\(?[HG]\d+\)?\}/gi, '')
    }));
  }

  async fetchWithAuth(url, options = {}) {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (res.status === 204) return null;
    return this.safeJson(res);
  }

  async safeJson(res) {
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) return null;
    try {
      return await res.json();
    } catch {
      return null;
    }
  }

  copyCurrentChapter() {
    if (!this.currentBook || !this.currentChapter) {
      alert('Select a chapter first');
      return;
    }
    const bible = this.getCurrentBible();
    if (!bible) return;
    const bookInfo = bible.bookMap[this.currentBook];
    if (!bookInfo) return;
    const verses = bookInfo.chapters[this.currentChapter] || [];
    const text = `${this.currentBook} ${this.currentChapter}\n` + verses.map(v => `${v.verse} ${v.text.replace(/\{\(?[HG]\d+\)?\}/gi, '')}`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      const btn = this.els.copyVersesBtn;
      const original = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = original, 1500);
    }).catch(() => alert('Failed to copy'));
  }

  copyVerse(book, chapter, verse) {
    const bible = this.getCurrentBible();
    if (!bible) return;
    const verseObj = bible.verses.find(v => v.book_name === book && v.chapter === chapter && v.verse === verse);
    if (!verseObj) return;
    const text = `${book} ${chapter}:${verse}\n${verseObj.text.replace(/\{\(?[HG]\d+\)?\}/gi, '')}`;
    navigator.clipboard.writeText(text).then(() => {
      const btn = this.els.copyVersesBtn;
      const original = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = original, 1500);
    }).catch(() => alert('Failed to copy'));
  }

  formatVerseText(text) {
    const escaped = this.escapeHtml(text);
    if (this.showStrongs) {
      return this.highlightStrongs(escaped);
    }
    return escaped.replace(/\{\(?[HG]\d+\)?\}/gi, '');
  }

  formatOccurrenceText(text) {
    return this.escapeHtml(text).replace(/\{\(?([HG]\d+)\)?\}/gi, '<span class="occ-strongs">$1</span>');
  }

  toggleConcordancePanel(show) {
    if (typeof show === 'boolean') {
      if (show) this.els.concordancePanel.classList.remove('hidden');
      else this.els.concordancePanel.classList.add('hidden');
    } else {
      this.els.concordancePanel.classList.toggle('hidden');
    }
    if (!this.els.concordancePanel.classList.contains('hidden')) {
      this.els.toggleConcordance.classList.add('active');
    } else {
      this.els.toggleConcordance.classList.remove('active');
    }
  }

  toggleNotesPanel(show) {
    if (typeof show === 'boolean') {
      if (show) this.els.notesPanel.classList.remove('hidden');
      else this.els.notesPanel.classList.add('hidden');
    } else {
      this.els.notesPanel.classList.toggle('hidden');
    }
    if (!this.els.notesPanel.classList.contains('hidden')) {
      this.els.toggleNotes.classList.add('active');
      this.renderNotes();
    } else {
      this.els.toggleNotes.classList.remove('active');
    }
  }

  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
    if (window.innerWidth <= 768) {
      sidebar.classList.toggle('mobile-open');
    }
  }

  updateTranslationSelect() {
    const select = this.els.translationSelect;
    select.innerHTML = '';
    const allBibles = this.getAllBibles();
    
    for (const [module, bible] of allBibles) {
      const isOnlineOnly = this.onlineBibles.has(module) && !this.bibles.has(module);
      
      const opt = document.createElement('option');
      opt.value = module;
      let label = bible.metadata.name || module;
      if (isOnlineOnly) label += ' 🌐';
      opt.textContent = label;
      if (module === this.currentModule) opt.selected = true;
      select.appendChild(opt);
    }
    
    if (allBibles.size === 0) {
      const opt = document.createElement('option');
      opt.textContent = 'No translations loaded';
      opt.disabled = true;
      select.appendChild(opt);
    }
    this.renderCompareCheckboxes();
  }

  getStandardBookNames() {
    return [
      'Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth',
      '1 Samuel','2 Samuel','1 Kings','2 Kings','1 Chronicles','2 Chronicles','Ezra',
      'Nehemiah','Esther','Job','Psalms','Proverbs','Ecclesiastes','Song of Solomon',
      'Isaiah','Jeremiah','Lamentations','Ezekiel','Daniel','Hosea','Joel','Amos',
      'Obadiah','Jonah','Micah','Nahum','Habakkuk','Zephaniah','Haggai','Zechariah',
      'Malachi','Matthew','Mark','Luke','John','Acts','Romans','1 Corinthians',
      '2 Corinthians','Galatians','Ephesians','Philippians','Colossians','1 Thessalonians',
      '2 Thessalonians','1 Timothy','2 Timothy','Titus','Philemon','Hebrews','James',
      '1 Peter','2 Peter','1 John','2 John','3 John','Jude','Revelation'
    ];
  }

  getStandardBookChapterCounts() {
    return {
      'Genesis': 50, 'Exodus': 40, 'Leviticus': 27, 'Numbers': 36, 'Deuteronomy': 34,
      'Joshua': 24, 'Judges': 21, 'Ruth': 4, '1 Samuel': 31, '2 Samuel': 24,
      '1 Kings': 22, '2 Kings': 25, '1 Chronicles': 29, '2 Chronicles': 36, 'Ezra': 10,
      'Nehemiah': 13, 'Esther': 10, 'Job': 42, 'Psalms': 150, 'Proverbs': 31,
      'Ecclesiastes': 12, 'Song of Solomon': 8, 'Isaiah': 66, 'Jeremiah': 52, 'Lamentations': 5,
      'Ezekiel': 48, 'Daniel': 12, 'Hosea': 14, 'Joel': 3, 'Amos': 9,
      'Obadiah': 1, 'Jonah': 4, 'Micah': 7, 'Nahum': 3, 'Habakkuk': 3,
      'Zephaniah': 3, 'Haggai': 2, 'Zechariah': 14, 'Malachi': 4, 'Matthew': 28,
      'Mark': 16, 'Luke': 24, 'John': 21, 'Acts': 28, 'Romans': 16,
      '1 Corinthians': 16, '2 Corinthians': 13, 'Galatians': 6, 'Ephesians': 6, 'Philippians': 4,
      'Colossians': 4, '1 Thessalonians': 5, '2 Thessalonians': 3, '1 Timothy': 6, '2 Timothy': 4,
      'Titus': 3, 'Philemon': 1, 'Hebrews': 13, 'James': 5, '1 Peter': 5,
      '2 Peter': 3, '1 John': 5, '2 John': 1, '3 John': 1, 'Jude': 1, 'Revelation': 22
    };
  }

  getApiBibleBookId(bookName) {
    const map = {
      'Genesis':'GEN','Exodus':'EXO','Leviticus':'LEV','Numbers':'NUM','Deuteronomy':'DEU',
      'Joshua':'JOS','Judges':'JDG','Ruth':'RUT','1 Samuel':'1SA','2 Samuel':'2SA',
      '1 Kings':'1KI','2 Kings':'2KI','1 Chronicles':'1CH','2 Chronicles':'2CH','Ezra':'EZR',
      'Nehemiah':'NEH','Esther':'EST','Job':'JOB','Psalms':'PSA','Proverbs':'PRO',
      'Ecclesiastes':'ECC','Song of Solomon':'SNG','Isaiah':'ISA','Jeremiah':'JER','Lamentations':'LAM',
      'Ezekiel':'EZK','Daniel':'DAN','Hosea':'HOS','Joel':'JOL','Amos':'AMO',
      'Obadiah':'OBA','Jonah':'JON','Micah':'MIC','Nahum':'NAM','Habakkuk':'HAB',
      'Zephaniah':'ZEP','Haggai':'HAG','Zechariah':'ZEC','Malachi':'MAL','Matthew':'MAT',
      'Mark':'MRK','Luke':'LUK','John':'JHN','Acts':'ACT','Romans':'ROM',
      '1 Corinthians':'1CO','2 Corinthians':'2CO','Galatians':'GAL','Ephesians':'EPH','Philippians':'PHP',
      'Colossians':'COL','1 Thessalonians':'1TH','2 Thessalonians':'2TH','1 Timothy':'1TI','2 Timothy':'2TI',
      'Titus':'TIT','Philemon':'PHM','Hebrews':'HBR','James':'JAS','1 Peter':'1PE',
      '2 Peter':'2PE','1 John':'1JN','2 John':'2JN','3 John':'3JN','Jude':'JUD','Revelation':'REV'
    };
    return map[bookName] || bookName;
  }

  getDefaultModule() {
    const desiredName = 'Authorized King James Version w Strong\'s';
    const desiredShort = 'AKJV';
    for (const [module, bible] of this.bibles) {
      const name = (bible.metadata.name || '').toLowerCase();
      const short = (bible.metadata.shortname || '').toLowerCase();
      if (name === desiredName.toLowerCase() || short === desiredShort.toLowerCase()) {
        return module;
      }
    }
    return null;
  }

  updateBreadcrumb() {
    const parts = [];
    if (this.currentModule) {
      const bible = this.getCurrentBible();
      parts.push(bible ? (bible.metadata.name || this.currentModule) : this.currentModule);
    }
    if (this.currentBook) parts.push(this.currentBook);
    if (this.currentChapter) parts.push('Chapter ' + this.currentChapter);
    if (this.currentVerse) parts.push('Verse ' + this.currentVerse.verse);
    this.els.breadcrumb.textContent = parts.join(' > ') || 'Orthos';
  }

  showEmptyState(msg) {
    this.els.chapterView.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);flex-direction:column;gap:12px;">
      <div style="font-size:2rem;">📖</div>
      <div>${this.escapeHtml(msg || 'Orthos Bible Study')}</div>
    </div>`;
  }

  highlightStrongs(text) {
    return text.replace(/\{\(?([HG]\d+)\)?\}/gi, (match, num) => `<span class="strongs" data-strongs="${num.toUpperCase()}">${num}</span>`);
  }

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
  }

  renderEmptyCompare() {
    this.els.compareArea.innerHTML = `<div style="color:var(--text-muted);padding:24px;">Select a chapter to compare.</div>`;
  }

  async loadLexicons() {
    if (this.lexiconsLoaded) return;
    try {
      this.lexicons = new Map();
      
      await Promise.all([
        this.loadOpenScripturesLexicon('/strongs-hebrew-dictionary.js', 'strongsHebrewDictionary', 'hebrew'),
        this.loadOpenScripturesLexicon('/strongs-greek-dictionary.js', 'strongsGreekDictionary', 'greek')
      ]);
      
      await Promise.all([
        this.parseLexiconFile('/TBESH.txt', 'hebrew'),
        this.parseLexiconFile('/TBESG.txt', 'greek')
      ]);
      
      this.lexiconsLoaded = true;
    } catch (err) {
      console.warn('Failed to load lexicons:', err);
    }
  }

  async loadOpenScripturesLexicon(url, globalName, lang) {
    if (typeof window[globalName] === 'object') {
      this.parseOpenScripturesLexicon(window[globalName], lang);
      return;
    }
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const text = await res.text();
      const clean = text.replace(/module\.exports\s*=\s*\w+;?\s*$/, '');
      const blob = new Blob([clean], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = blobUrl;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
        URL.revokeObjectURL(blobUrl);
      });
      if (typeof window[globalName] === 'object') {
        this.parseOpenScripturesLexicon(window[globalName], lang);
      }
    } catch (err) {
      console.warn(`Failed to load ${url}:`, err);
    }
  }

  parseOpenScripturesLexicon(dict, lang) {
    for (const [key, entry] of Object.entries(dict)) {
      const upper = key.toUpperCase();
      const padded = upper.startsWith('H') || upper.startsWith('G')
        ? upper[0] + String(parseInt(upper.slice(1))).padStart(4, '0')
        : upper;
      
      const meaning = [entry.strongs_def, entry.kjv_def].filter(Boolean).join('\n');
      this.lexicons.set(upper, {
        strong: upper,
        lang,
        word: entry.lemma || '',
        transliteration: entry.xlit || '',
        morph: '',
        gloss: entry.strongs_def || entry.kjv_def || '',
        meaning
      });
      
      if (padded !== upper) {
        this.lexicons.set(padded, this.lexicons.get(upper));
      }
    }
  }

  async parseLexiconFile(url, lang) {
    const res = await fetch(url);
    if (!res.ok) return;
    const text = await res.text();
    const lines = text.split(/\r?\n/);
    let headerIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('eStrong') && lines[i].includes('Gloss')) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx < 0) return;
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('=')) continue;
      const cols = line.split('\t');
      if (cols.length < 8) continue;
      const strong = cols[0].trim();
      if (!strong) continue;
      const gloss = cols[6] ? cols[6].trim() : '';
      const meaning = cols[7] ? cols[7].trim() : '';
      if (!gloss && !meaning) continue;
      this.lexicons.set(strong, {
        strong,
        lang,
        word: cols[3] ? cols[3].trim() : '',
        transliteration: cols[4] ? cols[4].trim() : '',
        morph: cols[5] ? cols[5].trim() : '',
        gloss,
        meaning
      });
    }
  }

  showLexiconEntry(strongs) {
    const upper = strongs.toUpperCase();
    this.currentLexiconStrongs = upper;
    const padded = /^[HG]\d+$/.test(upper)
      ? upper[0] + String(parseInt(upper.slice(1))).padStart(4, '0')
      : upper;
    const entry = this.lexicons.get(upper) || this.lexicons.get(padded);
    this.els.lexiconBody.innerHTML = '';
    
    if (!entry) {
      this.els.lexiconBody.innerHTML = `<div style="color:var(--text-muted);">No lexicon entry found for <strong>${this.escapeHtml(strongs)}</strong>.</div>`;
    } else {
      const defDiv = document.createElement('div');
      defDiv.className = 'lexicon-entry';
      defDiv.innerHTML = `
        <div class="lexicon-strongs">${this.escapeHtml(entry.strong)}</div>
        ${entry.word ? `<div class="lexicon-hebrew">${this.escapeHtml(entry.word)}</div>` : ''}
        ${entry.transliteration ? `<div class="lexicon-transliteration">${this.escapeHtml(entry.transliteration)}</div>` : ''}
        ${entry.morph ? `<div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:8px;">${this.escapeHtml(entry.morph)}</div>` : ''}
        ${entry.gloss ? `<div class="lexicon-gloss">${this.escapeHtml(entry.gloss)}</div>` : ''}
        ${entry.meaning ? `<div class="lexicon-meaning">${entry.meaning.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')}</div>` : ''}
      `;
      this.els.lexiconBody.appendChild(defDiv);
    }

    const bible = this.getCurrentBible();
    if (bible) {
      const refs = bible.strongsIndex.get(upper);
      if (refs && refs.length > 0) {
        const occHeader = document.createElement('div');
        occHeader.className = 'lexicon-occurrences-header';
        occHeader.textContent = `${refs.length} occurrence(s) in current translation`;
        this.els.lexiconBody.appendChild(occHeader);

        const list = document.createElement('div');
        list.className = 'lexicon-occurrences';
        for (const ref of refs) {
          const item = document.createElement('div');
          item.className = 'concordance-item';
          item.innerHTML = `<div><span class="concordance-strongs">${this.escapeHtml(upper)}</span> <span class="concordance-count">${this.escapeHtml(ref.book)} ${ref.chapter}:${ref.verse}</span></div><div style="margin-top:4px;font-size:0.9rem;color:var(--text-muted);line-height:1.4;">${this.formatOccurrenceText(ref.text)}</div>`;
          item.addEventListener('click', () => {
            this.toggleLexiconPanel(false);
            this.selectChapter(ref.book, ref.chapter);
            setTimeout(() => {
              const row = document.querySelector(`.verse-row[data-book="${ref.book}"][data-chapter="${ref.chapter}"][data-verse="${ref.verse}"]`);
              if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 50);
          });
          list.appendChild(item);
        }
        this.els.lexiconBody.appendChild(list);
      }
    }

    this.toggleLexiconPanel(true);
  }

  toggleLexiconPanel(show) {
    if (typeof show === 'boolean') {
      if (show) this.els.lexiconPanel.classList.remove('hidden');
      else this.els.lexiconPanel.classList.add('hidden');
    } else {
      this.els.lexiconPanel.classList.toggle('hidden');
    }
    if (!this.els.lexiconPanel.classList.contains('hidden')) {
      this.els.toggleLexicon.classList.add('active');
    } else {
      this.els.toggleLexicon.classList.remove('active');
    }
  }

  toggleTagsPanel(show) {
    if (typeof show === 'boolean') {
      if (show) this.els.tagsPanel.classList.remove('hidden');
      else this.els.tagsPanel.classList.add('hidden');
    } else {
      this.els.tagsPanel.classList.toggle('hidden');
    }
    if (!this.els.tagsPanel.classList.contains('hidden')) {
      this.els.toggleTags.classList.add('active');
      this.els.tagEntriesPanel.classList.add('hidden');
      if (this.currentVerse) {
        this.els.tagsAdd.classList.remove('hidden');
      } else {
        this.showAllTags();
      }
      this.renderTagsList();
    } else {
      this.els.toggleTags.classList.remove('active');
    }
  }

  showAllTags() {
    this.currentTagKeyword = null;
    this.els.tagEntriesPanel.classList.add('hidden');
    this.els.tagsAdd.classList.remove('hidden');
    this.renderTagsList();
  }

  renderTagsList() {
    this.els.tagsList.innerHTML = '';
    const keywordMap = new Map();
    for (const tag of this.tags) {
      if (!keywordMap.has(tag.keyword)) {
        keywordMap.set(tag.keyword, []);
      }
      keywordMap.get(tag.keyword).push(tag);
    }
    if (keywordMap.size === 0) {
      this.els.tagsList.innerHTML = '<div class="tags-empty">No tags yet. Select a verse and add a keyword.</div>';
      return;
    }
    for (const [keyword, tags] of keywordMap) {
      const item = document.createElement('span');
      item.className = 'tag-cloud-item';
      item.innerHTML = `<span class="tag-cloud-keyword">${this.escapeHtml(keyword)}</span><span class="tag-cloud-count">${tags.length}</span>`;
      item.addEventListener('click', () => this.showTagEntries(keyword));
      this.els.tagsList.appendChild(item);
    }
  }

  getBookSortKey(bookName) {
    const bible = this.getCurrentBible();
    if (bible && bible.bookMap[bookName]) {
      return bible.bookMap[bookName].bookNum || 0;
    }
    return 0;
  }

  groupConsecutiveVerses(tags) {
    const sorted = [...tags].sort((a, b) => {
      const aBook = this.getBookSortKey(a.book);
      const bBook = this.getBookSortKey(b.book);
      if (aBook !== bBook) return aBook - bBook;
      if (a.chapter !== b.chapter) return a.chapter - b.chapter;
      return a.verse - b.verse;
    });

    const groups = [];
    for (const tag of sorted) {
      const last = groups[groups.length - 1];
      if (last && last.book === tag.book && last.chapter === tag.chapter && tag.verse === last.endVerse + 1) {
        last.endVerse = tag.verse;
        last.tags.push(tag);
      } else {
        groups.push({
          book: tag.book,
          chapter: tag.chapter,
          startVerse: tag.verse,
          endVerse: tag.verse,
          tags: [tag]
        });
      }
    }
    return groups;
  }

  showTagEntries(keyword) {
    this.currentTagKeyword = keyword;
    this.els.tagsAdd.classList.add('hidden');
    this.els.tagEntriesTitle.textContent = `Tag: ${keyword}`;
    this.els.tagEntriesPanel.classList.remove('hidden');
    this.els.tagEntriesList.innerHTML = '';
    const matching = this.tags.filter(t => t.keyword === keyword);
    const bible = this.getCurrentBible();
    const groups = this.groupConsecutiveVerses(matching);

    for (const group of groups) {
      const item = document.createElement('div');
      item.className = 'tag-entry-item';
      let verseText = '';
      if (bible) {
        const verses = [];
        for (let v = group.startVerse; v <= group.endVerse; v++) {
          const found = bible.verses.find(ver => ver.book_name === group.book && ver.chapter === group.chapter && ver.verse === v);
          if (found) verses.push(found);
        }
        if (verses.length > 0) {
          verseText = verses.map(v => `${v.verse}. ${this.formatOccurrenceText(v.text)}`).join(' ');
        }
      }
      const refText = group.startVerse === group.endVerse
        ? `${group.book} ${group.chapter}:${group.startVerse}`
        : `${group.book} ${group.chapter}:${group.startVerse}-${group.endVerse}`;
      item.innerHTML = `<div class="tag-entry-ref">${this.escapeHtml(refText)}</div><div class="tag-entry-text">${verseText || 'Verse text unavailable'}</div>`;
      item.addEventListener('click', () => {
        this.selectChapter(group.book, group.chapter);
        setTimeout(() => {
          const row = document.querySelector(`.verse-row[data-book="${group.book}"][data-chapter="${group.chapter}"][data-verse="${group.startVerse}"]`);
          if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 50);
      });
      this.els.tagEntriesList.appendChild(item);
    }
  }

  closeTagEntries() {
    this.els.tagEntriesPanel.classList.add('hidden');
    this.currentTagKeyword = null;
    this.els.tagsAdd.classList.remove('hidden');
  }

  addTagToCurrentVerse() {
    const keyword = this.els.tagInput.value.trim();
    if (!keyword) return;
    if (!this.currentVerse && !this.currentBook) {
      alert('Select a verse first');
      return;
    }
    const tag = {
      keyword,
      book: this.currentVerse ? this.currentVerse.book : this.currentBook,
      chapter: this.currentVerse ? this.currentVerse.chapter : this.currentChapter,
      verse: this.currentVerse ? this.currentVerse.verse : 0,
      module: this.currentModule || '',
      date: Date.now()
    };
    const tx = this.db.transaction('tags', 'readwrite');
    const store = tx.objectStore('tags');
    const req = store.add(tag);
    req.onsuccess = () => {
      tag.id = req.result;
      this.tags.push(tag);
      this.els.tagInput.value = '';
      this.renderTagsList();
    };
    req.onerror = () => console.error('Failed to save tag', req.error);
  }

  deleteTag(id) {
    if (!confirm('Delete this tag?')) return;
    const tx = this.db.transaction('tags', 'readwrite');
    tx.objectStore('tags').delete(id);
    tx.oncomplete = () => {
      this.tags = this.tags.filter(t => t.id !== id);
      if (this.currentTagKeyword) {
        this.showTagEntries(this.currentTagKeyword);
      } else {
        this.renderTagsList();
      }
    };
  }

  async loadScripts() {
    return new Promise((resolve) => {
      const tx = this.db.transaction('scripts', 'readonly');
      const store = tx.objectStore('scripts');
      const req = store.getAll();
      req.onsuccess = () => {
        this.scripts = (req.result || []).slice().sort((a, b) => b.updatedAt - a.updatedAt);
        resolve();
      };
      req.onerror = () => { this.scripts = []; resolve(); };
    });
  }

  toggleScriptsPanel(show) {
    if (typeof show === 'boolean') {
      if (show) this.els.scriptsPanel.classList.remove('hidden');
      else this.els.scriptsPanel.classList.add('hidden');
    } else {
      this.els.scriptsPanel.classList.toggle('hidden');
    }
    if (!this.els.scriptsPanel.classList.contains('hidden')) {
      this.renderScriptsList();
    }
  }

  renderScriptsList() {
    this.els.scriptsList.innerHTML = '';
    if (!this.scripts || this.scripts.length === 0) {
      this.els.scriptsList.innerHTML = '<li class="tags-empty">No scripts yet. Click + New Script to create one.</li>';
      return;
    }
    for (const script of this.scripts) {
      const li = document.createElement('li');
      li.className = 'tag-item';
      const heading = (script.content || '').split('\n').find(line => line.trim()) || 'Untitled';
      const dateStr = new Date(script.updatedAt).toLocaleString();
      li.innerHTML = `<div style="flex:1;min-width:0;"><div class="tag-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this.escapeHtml(heading)}</div><div class="tag-count" style="margin-top:4px;">${this.escapeHtml(dateStr)}</div></div>`;
      li.addEventListener('click', () => this.openScriptEditor(script));
      this.els.scriptsList.appendChild(li);
    }
  }

  openScriptEditor(script = null) {
    if (script) {
      this.els.scriptEditorTitle.textContent = (script.content || '').split('\n').find(line => line.trim()) || 'Untitled';
      this.els.scriptTextarea.value = script.content || '';
      this.currentScriptId = script.id;
    } else {
      this.els.scriptEditorTitle.textContent = 'New Script';
      this.els.scriptTextarea.value = '# New Script\n';
      this.currentScriptId = null;
    }
    this.els.scriptPreview.classList.add('hidden');
    this.els.scriptTextarea.classList.remove('hidden');
    this.els.scriptEditorPanel.classList.remove('hidden');
    this.els.scriptTextarea.focus();
  }

  closeScriptEditor() {
    this.els.scriptEditorPanel.classList.add('hidden');
    this.currentScriptId = null;
  }

  async toggleScriptPreview() {
    const isHidden = this.els.scriptPreview.classList.contains('hidden');
    if (isHidden) {
      const markdown = this.els.scriptTextarea.value;
      this.els.scriptPreview.innerHTML = this.renderMarkdown(markdown);
      this.els.scriptPreview.classList.remove('hidden');
      this.els.scriptTextarea.classList.add('hidden');
      this.els.previewScriptBtn.classList.add('active');
    } else {
      await this.saveCurrentScript();
      this.els.scriptPreview.classList.add('hidden');
      this.els.scriptTextarea.classList.remove('hidden');
      this.els.previewScriptBtn.classList.remove('active');
    }
  }

  confirmDeleteScript() {
    if (!this.currentScriptId) return;
    this.els.confirmModalTitle.textContent = 'Delete Script';
    this.els.confirmModalMessage.textContent = 'Are you sure you want to delete this script? This action cannot be undone.';
    this.els.confirmModal.classList.remove('hidden');
    this._pendingDeleteId = this.currentScriptId;
  }

  hideConfirmModal() {
    this.els.confirmModal.classList.add('hidden');
    this._pendingDeleteId = null;
  }

  async executeConfirmedDelete() {
    const id = this._pendingDeleteId;
    if (!id) return;
    this.hideConfirmModal();
    const tx = this.db.transaction('scripts', 'readwrite');
    const store = tx.objectStore('scripts');
    store.delete(id);
    await new Promise((resolve) => { tx.oncomplete = resolve; });
    this.scripts = this.scripts.filter(s => s.id !== id);
    this.closeScriptEditor();
    this.renderScriptsList();
  }

  async saveCurrentScript() {
    const content = this.els.scriptTextarea.value;
    const heading = content.split('\n').find(line => line.trim()) || 'Untitled';
    const now = Date.now();
    const tx = this.db.transaction('scripts', 'readwrite');
    const store = tx.objectStore('scripts');
    if (this.currentScriptId) {
      const req = store.get(this.currentScriptId);
      req.onsuccess = () => {
        const existing = req.result || { id: this.currentScriptId };
        existing.content = content;
        existing.heading = heading;
        existing.updatedAt = now;
        store.put(existing);
        this.refreshScriptsList(existing);
      };
    } else {
      const req = store.add({ content, heading, updatedAt: now });
      req.onsuccess = () => {
        const newScript = { id: req.result, content, heading, updatedAt: now };
        this.currentScriptId = req.result;
        this.els.scriptEditorTitle.textContent = heading;
        this.refreshScriptsList(newScript);
      };
    }
    tx.oncomplete = () => {
      this.renderScriptsList();
    };
  }

  refreshScriptsList(updatedScript) {
    const idx = this.scripts.findIndex(s => s.id === updatedScript.id);
    if (idx >= 0) {
      this.scripts[idx] = updatedScript;
    } else {
      this.scripts.unshift(updatedScript);
    }
    this.scripts.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async copyScriptMarkdown() {
    const text = this.els.scriptTextarea.value;
    try {
      await navigator.clipboard.writeText(text);
      const btn = this.els.copyScriptBtn;
      const original = btn.textContent;
      btn.textContent = '✓';
      setTimeout(() => { btn.textContent = original; }, 1500);
    } catch {
      alert('Failed to copy');
    }
  }

  renderMarkdown(md) {
    if (!md) return '';
    
    let html = md;
    
    const codeBlocks = [];
    const fencedRegex = /```[\s\S]*?```/g;
    let match;
    while ((match = fencedRegex.exec(html)) !== null) {
      const placeholder = String.fromCharCode(0) + 'CODE' + codeBlocks.length + String.fromCharCode(0);
      codeBlocks.push(match[0].slice(3, -3).trim());
      html = html.replace(match[0], placeholder);
    }
    
    const lines = html.split('\n');
    const processed = [];
    let inIndentedCode = false;
    let codeBuf = [];
    for (const line of lines) {
      if (!inIndentedCode && line.startsWith('    ') && line.trim() !== '') {
        inIndentedCode = true;
        codeBuf = [line.slice(4)];
      } else if (inIndentedCode) {
        if (line.startsWith('    ') || line.trim() === '') {
          codeBuf.push(line.slice(4));
        } else {
          inIndentedCode = false;
          const placeholder = String.fromCharCode(0) + 'ICODE' + codeBlocks.length + String.fromCharCode(0);
          codeBlocks.push(codeBuf.join('\n'));
          processed.push(placeholder);
          codeBuf = [];
          processed.push(line);
        }
      } else {
        processed.push(line);
      }
    }
    if (inIndentedCode) {
      const placeholder = String.fromCharCode(0) + 'ICODE' + codeBlocks.length + String.fromCharCode(0);
      codeBlocks.push(codeBuf.join('\n'));
      processed.push(placeholder);
    }
    html = processed.join('\n');
    
    html = html.replace(/^(#{1,6})\s*(.+)$/gim, (match, hashes, text) => {
      const level = hashes.length;
      return '<h' + level + '>' + text.trim() + '</h' + level + '>';
    });
    
    html = html.replace(/^([^\n]+)\n=+\s*$/gim, '<h1>$1</h1>');
    html = html.replace(/^([^\n]+)\n-+\s*$/gim, '<h2>$1</h2>');
    
    const bqRegex = /^> ?(.*)$/gim;
    const blockquotes = [];
    let bqIdx = 0;
    html = html.replace(bqRegex, (match, content) => {
      const placeholder = String.fromCharCode(0) + 'BQ' + bqIdx++ + String.fromCharCode(0);
      blockquotes.push(content);
      return placeholder;
    });
    for (let i = 0; i < blockquotes.length; i++) {
      html = html.replace(String.fromCharCode(0) + 'BQ' + i + String.fromCharCode(0), '<blockquote>' + blockquotes[i] + '</blockquote>');
    }
    
    html = html.replace(/^---+\s*$/gim, '<hr>');
    html = html.replace(/^\*\*\*+\s*$/gim, '<hr>');
    html = html.replace(/^___+\s*$/gim, '<hr>');
    
    const listLines = html.split('\n');
    const listOutput = [];
    let inUl = false;
    let inOl = false;
    for (const line of listLines) {
      if (/^\s*[-*+]\s+/.test(line)) {
        if (!inUl) {
          if (inOl) { listOutput.push('</ol>'); inOl = false; }
          listOutput.push('<ul>');
          inUl = true;
        }
        const content = line.replace(/^\s*[-*+]\s+/, '');
        listOutput.push('<li>' + content + '</li>');
      } else if (/^\s*\d+\.\s+/.test(line)) {
        if (!inOl) {
          if (inUl) { listOutput.push('</ul>'); inUl = false; }
          listOutput.push('<ol>');
          inOl = true;
        }
        const content = line.replace(/^\s*\d+\.\s+/, '');
        listOutput.push('<li>' + content + '</li>');
      } else {
        if (inUl) { listOutput.push('</ul>'); inUl = false; }
        if (inOl) { listOutput.push('</ol>'); inOl = false; }
        listOutput.push(line);
      }
    }
    if (inUl) listOutput.push('</ul>');
    if (inOl) listOutput.push('</ol>');
    html = listOutput.join('\n');
    
    html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/___(.*?)___/g, '<strong><em>$1</em></strong>');
    html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
    html = html.replace(/_(.*?)_/g, '<em>$1</em>');
    
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    html = html.replace(/\[([^\]]+)\]\s*\(([^)]+)\)/g, (match, text, rest) => {
      let url = rest;
      let title = '';
      const titleMatch = rest.match(/^(.+?)\s+"(.+)"$/);
      if (titleMatch) {
        url = titleMatch[1];
        title = titleMatch[2];
      }
      let attrs = 'href="' + url + '" target="_blank" rel="noopener noreferrer"';
      if (title) attrs += ' title="' + title + '"';
      return '<a ' + attrs + '>' + text + '</a>';
    });
    
    html = html.replace(/!\[([^\]]*)\]\s*\(([^)]+)\)/g, (match, alt, rest) => {
      let url = rest;
      let title = '';
      const titleMatch = rest.match(/^(.+?)\s+"(.+)"$/);
      if (titleMatch) {
        url = titleMatch[1];
        title = titleMatch[2];
      }
      let attrs = 'src="' + url + '" alt="' + alt + '"';
      if (title) attrs += ' title="' + title + '"';
      return '<img ' + attrs + '>';
    });
    
    html = html.replace(/<(https?:\/\/[^>]+)>/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    html = html.replace(/<(mailto:[^>]+)>/g, '<a href="$1">$1</a>');
    
    html = html.replace(/&/g, '&amp;');
    html = html.replace(/</g, '&lt;');
    html = html.replace(/>/g, '&gt;');
    
    html = html.replace(/\\\\/g, '&bsol;');
    html = html.replace(/\\\*/g, '&ast;');
    html = html.replace(/\\_/g, '&lowbar;');
    html = html.replace(/\\\`/g, '&grave;');
    html = html.replace(/\\\[/g, '&lsqb;');
    html = html.replace(/\\\]/g, '&rsqb;');
    html = html.replace(new RegExp('\\' + '\\(' , 'g'), '&lpar;');
    html = html.replace(new RegExp('\\\\)', 'g'), '&rpar;');
    html = html.replace(/\\#/g, '&num;');
    html = html.replace(/\\\+/g, '&plus;');
    html = html.replace(/\\-/g, '&minus;');
    html = html.replace(/\\\./g, '&period;');
    html = html.replace(/\\!/g, '&excl;');
    html = html.replace(/\\\|/g, '&vert;');
    
    for (let i = 0; i < codeBlocks.length; i++) {
      const ph1 = String.fromCharCode(0) + 'CODE' + i + String.fromCharCode(0);
      const ph2 = String.fromCharCode(0) + 'ICODE' + i + String.fromCharCode(0);
      html = html.replace(ph1, '<pre><code>' + codeBlocks[i] + '</code></pre>');
      html = html.replace(ph2, '<pre><code>' + codeBlocks[i] + '</code></pre>');
    }
    
    const blocks = html.split(/\n{2,}/);
    const blockResults = [];
    for (const block of blocks) {
      const trimmed = block.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('<')) {
        blockResults.push(trimmed);
        continue;
      }
      const pText = trimmed.replace(/\n/g, '<br>');
      blockResults.push('<p>' + pText + '</p>');
    }
    html = blockResults.join('\n\n');
    
    html = html.replace(/  \n/g, '<br>\n');
    html = html.replace(/\n/g, '<br>');
    
    return html;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW registration failed:', err));
  }
  const app = new WordLabApp();
  app.init().catch(console.error);
});
