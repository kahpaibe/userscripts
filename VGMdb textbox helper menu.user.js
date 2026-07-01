// ==UserScript==
// @name        VGMdb textbox helper menu
// @namespace   Violentmonkey Scripts
// @match       https://vgmdb.net/*
// @require     https://raw.githubusercontent.com/kahpaibe/userscripts/refs/heads/main/components/VGMdb%20Custom%20Settings.js
// @grant       GM_addStyle
// @version     1.2
// @author      kahpaibe
// @description Add configurable formatting utilities and autocomplete widgets for textboxes on VGMdb.
// @run-at      document-idle
// ==/UserScript==

(function () {
  "use strict";

  /*********************************************
   * User variables
   ********************************************/
  const textboxHelperCommonSubstitutions = {
    // Convert full-width punctuation
    "：": ": ",
    "，": ",",
    "．": ".",
    "！": "!",
    "？": "?",
    "－": "-",
    "～": "~",
    "（": "(",
    "）": ")",
    "［": "[",
    "］": "]",
    "｛": "{",
    "｝": "}",
    "＋": "+",
    "＝": "=",
    "／": "/",
    "｜": "|",
    "・": ", ",
    "、": ", ",
    // Other substitutions
    "&": ", ",
    "(?!\\s)": " (", // Force space before "("
    ":(?!\\s)": ": ", // Force space after ":"
    // Convert full-width space to standard space
    "　": " ",
    // Compress consecutive newlines (3 or more down to exactly 2)
    "/\\n{3,}/g": "\n\n",
    // Compress consecutive spaces (2 or more down to exactly 1)
    "/ {2,}/g": " ",
  };

  /** Helper to apply common substitutions. */
  const runCommonSubst = (text) => {
    if (!text) return "";
    // 1. Convert all full-width alphanumeric characters to standard ASCII
    let result = text.replace(/[\uFF01-\uFF5E]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0)
    );
    // Normalize line endings to LF to ensure reliable newline compression
    result = result.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    // 2. Apply user map substitutions
    for (const [base, subst] of Object.entries(textboxHelperCommonSubstitutions)) {
      let regex;
      if (base.startsWith("/") && base.lastIndexOf("/") > 0) {
        const lastSlashIdx = base.lastIndexOf("/");
        const pattern = base.substring(1, lastSlashIdx);
        const flags = base.substring(lastSlashIdx + 1);
        try {
          regex = new RegExp(pattern, flags);
        } catch (e) {
          regex = new RegExp(base, "g");
        }
      } else {
        const escaped = base.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
        regex = new RegExp(escaped, "g");
      }
      result = result.replace(regex, subst);
    }
    return result;
  };

  /*********************************************
   * Widgets Definition
   ********************************************/
  const textboxHelperAvailableWidgets = {
    // 1. Album Tag: Prompts for album page/ID, extracts ID, wraps selection
    "album-tag": {
      id: "album-tag",
      type: "button",
      label: "Album",
      tooltip: "Wrap selection in [album] tag with prompted Album ID",
      url_regex: ["/album/new", "/album/", "/db/albums-history\\.php\\?id="],
      action: (selectedText) => {
        const input = prompt("Enter Album URL or ID:");
        if (input === null) return null; // Cancelled
        const match = /(\d+)/.exec(input);
        const id = match ? match[1] : "";
        return `[album=${id}]${selectedText}[/album]`;
      },
    },

    // 1b. M-series: Prompts for a count and generates M01, M02 ... separated by an empty line
    "m-series": {
      id: "m-series",
      type: "button",
      label: "M-series",
      tooltip: "Insert series of Media items (M01, M02, ...)",
      url_regex: ["/album/new", "/album/", "/db/albums-history\\.php\\?id="],
      action: (selectedText) => {
        const input = prompt("Enter number of items in the series:");
        if (input === null) return null; // Cancelled
        const count = parseInt(input, 10);
        if (isNaN(count) || count <= 0) return null;
        const lines = [];
        for (let i = 1; i <= count; i++) {
          const padded = String(i).padStart(2, '0');
          lines.push(`M${padded}`);
        }
        return lines.join("\n\n");
      },
    },

    // 2. Artist Tag: Prompts for artist/org page/ID, extracts ID, wraps selection
    "artist-tag": {
      id: "artist-tag",
      type: "button",
      label: "Artist",
      tooltip: "Wrap selection in [artist] tag with prompted Artist ID",
      url_regex: ["/artist/", "/org/", "/db/artists-submit\\.php"],
      action: (selectedText) => {
        const input = prompt("Enter Artist/Org URL or ID:");
        if (input === null) return null; // Cancelled
        const match = /(\d+)/.exec(input);
        const id = match ? match[1] : "";
        return `[artist=${id}]${selectedText}[/artist]`;
      },
    },

    // 3. Regex Replacer Widget
    "regex-replacer": {
      id: "regex-replacer",
      type: "regex-replacer",
      label: "Regex Replace",
      tooltip: "Search and replace text in selection using regex rules",
    },

    // 4. Common Substitutions: Standardizes fullwidth characters & applies user map
    "common-subst": {
      id: "common-subst",
      type: "button",
      label: "Common Subst",
      tooltip: "Substitute common full-width and punctuation characters",
      action: (selectedText) => {
        const activeTextarea = textboxHelperActiveTextarea;
        if (!activeTextarea) return null;

        const start = activeTextarea.selectionStart;
        const end = activeTextarea.selectionEnd;
        if (start === end) return null; // Only perform on selection

        return runCommonSubst(selectedText);
      },
    },

    // 5. Sources: Inserts checklist of source info
    "sources": {
      id: "sources",
      type: "button",
      label: "Sources",
      tooltip: "Insert common source justification template",
      url_regex: ["/album/new", "/album/"],
      action: (selectedText) => {
        return "Release date, event, price, per-track credits, credits: ";
      },
    },

    // 6. Searchable Select autocomplete (Kept in registry for custom availability)
    "artist-search": {
      id: "artist-search",
      type: "searchable-select",
      label: "Find Artist",
      placeholder: "Search artist...",
      tooltip: "Search artist, album, or organization database and insert BBCode tag",
      url_regex: ["/db/artists-assign", "/db/draft", "/album/", "/db/artists-submit"],
      onSearch: async (query) => {
        if (query.trim().length < 3) {
          return [{ label: "Type at least 3 characters...", disabled: true }];
        }
        try {
          const response = await fetch(
            `/db/ajax-autocomplete.php?q=${encodeURIComponent(query)}`
          );
          if (!response.ok) return [];
          const text = await response.text();
          const lines = text.split("\n").filter((line) => line.trim().length > 0);

          return lines.map((line) => {
            const parts = line.split("|");
            // Autocomplete format: Name|ID|URL|Type
            // Type: 1 = Artist, 2 = Org, 0 = Album
            const name = parts[0] || "Unknown";
            const id = parts[1] || "";
            const typeId = parts[3] || "1";
            let typeLabel = "Unknown";
            if (typeId === "1") typeLabel = "Artist";
            else if (typeId === "2") typeLabel = "Org";
            else if (typeId === "0") typeLabel = "Album";

            return {
              label: `${name} (${typeLabel} #${id})`,
              value: id,
              name: name,
              type: typeLabel.toLowerCase(),
            };
          });
        } catch (error) {
          console.error("Autocomplete search error:", error);
          return [];
        }
      },
      onSelect: (textarea, selectedText, item) => {
        if (item.disabled) return null;
        const tag = item.type === "org" ? "org" : item.type === "album" ? "album" : "artist";
        return `[${tag}=${item.value}]${selectedText || item.name}[/${tag}]`;
      },
    },
  };

  /*********************************************
   * Widget Constructors
   ********************************************/

  /** Construct a simple button widget. */
  const textboxHelperConstructButton = (widget) => {
    const button = document.createElement("button");
    button.className = "vgmdb-textbox-helper-btn";
    button.type = "button";
    button.textContent = widget.label;
    if (widget.tooltip) {
      button.title = widget.tooltip;
    }

    button.addEventListener("mousedown", (e) => {
      e.preventDefault();
    });

    button.addEventListener("click", () => {
      const activeTextarea = textboxHelperActiveTextarea;
      if (!activeTextarea) return;

      if (widget.action) {
        const selectedText = activeTextarea.value.substring(activeTextarea.selectionStart, activeTextarea.selectionEnd);
        const replacement = widget.action(selectedText);
        if (replacement !== null && replacement !== undefined) {
          textboxHelperInsertText(activeTextarea, replacement, selectedText);
        }
      }
    });

    return button;
  };

  /** Construct a dropdown select widget. */
  const textboxHelperConstructSelect = (widget) => {
    const select = document.createElement("select");
    select.className = "vgmdb-textbox-helper-select";
    if (widget.tooltip) {
      select.title = widget.tooltip;
    }

    const defaultOption = document.createElement("option");
    defaultOption.textContent = widget.label;
    defaultOption.value = "";
    defaultOption.disabled = true;
    defaultOption.selected = true;
    select.appendChild(defaultOption);

    widget.options.forEach((opt) => {
      const option = document.createElement("option");
      option.textContent = opt.label;
      option.value = opt.label;
      select.appendChild(option);
    });

    let savedStart = 0;
    let savedEnd = 0;

    select.addEventListener("mousedown", () => {
      const activeTextarea = textboxHelperActiveTextarea;
      if (activeTextarea) {
        savedStart = activeTextarea.selectionStart;
        savedEnd = activeTextarea.selectionEnd;
      }
    });

    select.addEventListener("focus", () => {
      const activeTextarea = textboxHelperActiveTextarea;
      if (activeTextarea) {
        savedStart = activeTextarea.selectionStart;
        savedEnd = activeTextarea.selectionEnd;
      }
    });

    select.addEventListener("change", () => {
      const activeTextarea = textboxHelperActiveTextarea;
      if (!activeTextarea) return;

      const selectedLabel = select.value;
      if (!selectedLabel) return;

      const opt = widget.options.find((o) => o.label === selectedLabel);
      if (opt && opt.action) {
        activeTextarea.focus();
        activeTextarea.setSelectionRange(savedStart, savedEnd);

        const selectedText = activeTextarea.value.substring(savedStart, savedEnd);
        const replacement = opt.action(selectedText);
        if (replacement !== null && replacement !== undefined) {
          textboxHelperInsertText(activeTextarea, replacement, selectedText);
        }
      }
      select.value = "";
    });

    return select;
  };

  /** Construct a regex replacer widget. */
  const textboxHelperConstructRegexReplacer = (widget) => {
    const container = document.createElement("div");
    container.className = "vgmdb-textbox-helper-regex-container";
    if (widget.tooltip) {
      container.title = widget.tooltip;
    }

    const findInput = document.createElement("input");
    findInput.type = "text";
    findInput.className = "bginput vgmdb-textbox-helper-regex-input";
    findInput.placeholder = "Find regex...";
    if (widget.tooltip) {
      findInput.title = widget.tooltip;
    }

    const replaceInput = document.createElement("input");
    replaceInput.type = "text";
    replaceInput.className = "bginput vgmdb-textbox-helper-regex-input";
    replaceInput.placeholder = "Replace...";
    if (widget.tooltip) {
      replaceInput.title = widget.tooltip;
    }

    const syncInputWidth = (input) => {
      input.style.width = input.value ? `${input.value.length + 1.5}ch` : "4em";
    };

    findInput.addEventListener("input", () => syncInputWidth(findInput));
    replaceInput.addEventListener("input", () => syncInputWidth(replaceInput));

    // Sync initial state
    syncInputWidth(findInput);
    syncInputWidth(replaceInput);

    const replaceBtn = document.createElement("button");
    replaceBtn.className = "vgmdb-textbox-helper-btn";
    replaceBtn.type = "button";
    replaceBtn.textContent = widget.label || "Replace";
    if (widget.tooltip) {
      replaceBtn.title = widget.tooltip;
    }

    replaceBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
    });

    replaceBtn.addEventListener("click", () => {
      const activeTextarea = textboxHelperActiveTextarea;
      if (!activeTextarea) return;

      const findText = findInput.value;
      const replaceText = replaceInput.value;
      if (!findText) return;

      activeTextarea.focus();
      const start = activeTextarea.selectionStart;
      const end = activeTextarea.selectionEnd;
      if (start === end) return; // Only perform on selection

      const text = activeTextarea.value;
      const targetText = text.substring(start, end);

      let regex;
      try {
        const match = /^\/(.*)\/([gimy]*)$/.exec(findText);
        if (match) {
          let pattern = match[1];
          // Translate absolute start/end anchors (\A and \Z/\z)
          pattern = pattern
            .replace(/\\A/g, "(?<![\\s\\S])")
            .replace(/\\[Zz]/g, "(?![\\s\\S])");
          const flags = match[2].includes("m") ? match[2] : match[2] + "m";
          regex = new RegExp(pattern, flags);
        } else {
          let pattern = findText
            .replace(/\\A/g, "(?<![\\s\\S])")
            .replace(/\\[Zz]/g, "(?![\\s\\S])");
          regex = new RegExp(pattern, "gm");
        }
      } catch (e) {
        regex = findText;
      }

      const replaced = targetText.replace(regex, replaceText);
      textboxHelperInsertText(activeTextarea, replaced, targetText);
    });

    container.appendChild(findInput);
    container.appendChild(replaceInput);
    container.appendChild(replaceBtn);

    return container;
  };

  /** Construct a searchable select autocomplete widget. */
  const textboxHelperConstructSearchableSelect = (widget) => {
    const wrapper = document.createElement("div");
    wrapper.className = "vgmdb-textbox-helper-searchable-select-wrapper";

    const trigger = document.createElement("button");
    trigger.className = "vgmdb-textbox-helper-btn vgmdb-textbox-helper-searchable-select-trigger";
    trigger.type = "button";
    trigger.textContent = widget.label;
    if (widget.tooltip) {
      trigger.title = widget.tooltip;
    }

    const dropdown = document.createElement("div");
    dropdown.className = "vgmdb-textbox-helper-searchable-select-dropdown";
    dropdown.style.display = "none";

    const searchRow = document.createElement("div");
    searchRow.className = "vgmdb-textbox-helper-searchable-select-search-row";

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.className = "bginput vgmdb-textbox-helper-searchable-select-search";
    searchInput.placeholder = widget.placeholder || "Type to search...";

    const searchBtn = document.createElement("button");
    searchBtn.className = "vgmdb-textbox-helper-btn vgmdb-textbox-helper-searchable-select-search-btn";
    searchBtn.type = "button";
    searchBtn.textContent = "Search";

    searchRow.appendChild(searchInput);
    searchRow.appendChild(searchBtn);

    const resultsCount = document.createElement("div");
    resultsCount.className = "vgmdb-textbox-helper-searchable-select-count";

    const resultsList = document.createElement("ul");
    resultsList.className = "vgmdb-textbox-helper-searchable-select-results";

    dropdown.appendChild(searchRow);
    dropdown.appendChild(resultsCount);
    dropdown.appendChild(resultsList);
    wrapper.appendChild(trigger);
    wrapper.appendChild(dropdown);

    let savedStart = 0;
    let savedEnd = 0;

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const activeTextarea = textboxHelperActiveTextarea;
      if (!activeTextarea) return;

      const isShowing = dropdown.style.display === "block";

      document.querySelectorAll(".vgmdb-textbox-helper-searchable-select-dropdown").forEach((d) => {
        if (d !== dropdown) d.style.display = "none";
      });

      if (isShowing) {
        dropdown.style.display = "none";
      } else {
        savedStart = activeTextarea.selectionStart;
        savedEnd = activeTextarea.selectionEnd;
        dropdown.style.display = "block";

        // Determine opening direction based on screen space
        const triggerRect = trigger.getBoundingClientRect();
        if (triggerRect.top < window.innerHeight / 2) {
          dropdown.style.top = "100%";
          dropdown.style.bottom = "auto";
          dropdown.style.marginTop = "4px";
          dropdown.style.marginBottom = "0";
        } else {
          dropdown.style.top = "auto";
          dropdown.style.bottom = "100%";
          dropdown.style.marginTop = "0";
          dropdown.style.marginBottom = "4px";
        }

        searchInput.value = "";
        resultsCount.textContent = "";
        resultsList.innerHTML = "";
        searchInput.focus();
      }
    });

    const performSearch = async () => {
      const activeTextarea = textboxHelperActiveTextarea;
      if (!activeTextarea) return;

      const query = searchInput.value;
      resultsCount.textContent = "Searching...";
      resultsList.innerHTML = "<li class='vgmdb-textbox-helper-searchable-select-status'>Searching...</li>";

      const results = await widget.onSearch(query);
      resultsList.innerHTML = "";

      // Filter out prompt status items from the count
      const actualResultsCount = results.filter((item) => !item.disabled).length;
      if (results.some((item) => item.disabled)) {
        resultsCount.textContent = "";
      } else {
        resultsCount.textContent = `Found ${actualResultsCount} result(s)`;
      }

      if (results.length === 0) {
        resultsList.innerHTML = "<li class='vgmdb-textbox-helper-searchable-select-status'>No results found</li>";
        return;
      }

      results.forEach((item) => {
        const li = document.createElement("li");
        li.textContent = item.label;
        if (item.disabled) {
          li.className = "vgmdb-textbox-helper-searchable-select-status";
        } else {
          li.className = "vgmdb-textbox-helper-searchable-select-option";
          li.addEventListener("click", () => {
            const innerActiveTextarea = textboxHelperActiveTextarea;
            if (innerActiveTextarea) {
              innerActiveTextarea.focus();
              innerActiveTextarea.setSelectionRange(savedStart, savedEnd);

              const selectedText = innerActiveTextarea.value.substring(savedStart, savedEnd);
              const replacement = widget.onSelect(innerActiveTextarea, selectedText, item);
              if (replacement !== null && replacement !== undefined) {
                textboxHelperInsertText(innerActiveTextarea, replacement, selectedText);
              }
            }
            dropdown.style.display = "none";
          });
        }
        resultsList.appendChild(li);
      });
    };

    searchBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      performSearch();
    });

    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        performSearch();
      }
    });

    return wrapper;
  };

  /** Mapping of widget types to their corresponding constructor functions. */
  const textboxHelperWidgetConstructors = {
    "button": textboxHelperConstructButton,
    "select": textboxHelperConstructSelect,
    "regex-replacer": textboxHelperConstructRegexReplacer,
    "searchable-select": textboxHelperConstructSearchableSelect,
  };

  /*********************************************
   * Menu Configuration
   ********************************************/
  // List of active widget IDs to display in the menu toolbar.
  // Reorder, remove, or duplicate IDs below to configure the toolbar.
  const textboxHelperActiveWidgetIds = [
    "album-tag",
    "m-series",
    "artist-tag",
    "regex-replacer",
    "common-subst",
    "sources",
  ];

  // Resolve active widgets from registry
  const textboxHelperWidgets = textboxHelperActiveWidgetIds
    .map((id) => textboxHelperAvailableWidgets[id])
    .filter(Boolean);

  /*********************************************
   * Global state and selectors
   ********************************************/
  let textboxHelperMenu = null;
  let textboxHelperActiveTextarea = null;
  let textboxHelperResizeObserver = null;

  /*********************************************
   * Helper functions
   ********************************************/

  /** Check if a widget is enabled for the current URL. */
  const textboxHelperIsWidgetEnabled = (widget) => {
    if (!widget.url_regex || widget.url_regex.length === 0) {
      return true;
    }
    const currentUrl = window.location.href;
    const currentPath = window.location.pathname + window.location.search;
    return widget.url_regex.some((regexStr) => {
      try {
        const regex = new RegExp(regexStr, "i");
        return regex.test(currentUrl) || regex.test(currentPath);
      } catch (e) {
        return currentUrl.includes(regexStr) || currentPath.includes(regexStr);
      }
    });
  };

  /** Inject textbox helper styles. */
  const textboxHelperApplyStyles = () =>
    GM_addStyle(`
      .vgmdb-textbox-helper-menu {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
        background-color: #001122 !important;
        border: 1px solid #3F476C !important;
        border-radius: 4px 4px 0 0 !important;
        padding: 4px 6px !important;
        box-sizing: border-box !important;
        border-bottom: none !important;
      }
      .vgmdb-textbox-helper-menu button,
      .vgmdb-textbox-helper-menu select,
      .vgmdb-textbox-helper-menu input {
        margin: 0 !important;
      }

      .vgmdb-textbox-helper-btn {
        background-color: #1B273D !important;
        border: 1px solid #3F476C !important;
        color: #FFFFFF !important;
        font-family: Arial, sans-serif !important;
        font-size: 11px !important;
        padding: 4px 8px !important;
        border-radius: 4px !important;
        cursor: pointer !important;
        outline: none !important;
        transition: background-color 0.15s, border-color 0.15s !important;
        white-space: nowrap !important;
      }

      .vgmdb-textbox-helper-btn:hover {
        background-color: #3F476C !important;
        border-color: #5C6693;
      }

      .vgmdb-textbox-helper-btn:active {
        background-color: #151F30;
      }

      /* Regex Replacer Widget styles */
      .vgmdb-textbox-helper-regex-container {
        display: inline-flex;
        gap: 4px;
        align-items: center;
      }
      .vgmdb-textbox-helper-regex-input {
        min-width: 4em;
        width: 4em;
        font-size: 11px !important;
        padding: 3px 6px !important;
        border: 1px solid #3F476C !important;
        background-color: #1B273D !important;
        color: #FFFFFF !important;
        border-radius: 4px;
        outline: none;
        box-sizing: border-box;
        transition: width 0.1s ease-out;
      }
      .vgmdb-textbox-helper-regex-input::placeholder {
        color: #788990;
      }

      /* Dropdown Select Widget styles */
      .vgmdb-textbox-helper-select {
        background-color: #1B273D;
        border: 1px solid #3F476C;
        color: #FFFFFF;
        font-family: Arial, sans-serif;
        font-size: 11px;
        padding: 3px 6px;
        border-radius: 4px;
        cursor: pointer;
        outline: none;
      }
      .vgmdb-textbox-helper-select:hover {
        border-color: #5C6693;
      }

      /* Searchable Select Widget styles */
      .vgmdb-textbox-helper-searchable-select-wrapper {
        position: relative;
        display: inline-block;
      }
      .vgmdb-textbox-helper-searchable-select-dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        z-index: 100001;
        background-color: #2F364F;
        border: 1px solid #3F476C;
        border-radius: 6px;
        padding: 6px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
        width: 220px;
        margin-top: 4px;
      }
      .vgmdb-textbox-helper-searchable-select-search-row {
        display: flex;
        gap: 4px;
        margin-bottom: 6px;
      }
      .vgmdb-textbox-helper-searchable-select-search {
        flex-grow: 1;
        width: 0;
        box-sizing: border-box;
        font-size: 11px !important;
        padding: 3px 6px !important;
        border: 1px solid #3F476C !important;
        background-color: #1B273D !important;
        color: #FFFFFF !important;
        border-radius: 4px;
        outline: none;
      }
      .vgmdb-textbox-helper-searchable-select-search-btn {
        padding: 3px 8px;
        flex-shrink: 0;
      }
      .vgmdb-textbox-helper-searchable-select-count {
        font-size: 10px;
        color: #788990;
        margin-bottom: 4px;
        padding: 0 4px;
        font-style: italic;
      }
      .vgmdb-textbox-helper-searchable-select-results {
        list-style: none;
        margin: 0;
        padding: 0;
        max-height: 150px;
        overflow-y: auto;
      }
      .vgmdb-textbox-helper-searchable-select-option {
        padding: 4px 6px;
        font-size: 11px;
        color: #FFFFFF;
        cursor: pointer;
        border-radius: 4px;
        transition: background-color 0.15s;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .vgmdb-textbox-helper-searchable-select-option:hover {
        background-color: #3F476C;
      }
      .vgmdb-textbox-helper-searchable-select-status {
        padding: 4px 6px;
        font-size: 11px;
        color: #788990;
        font-style: italic;
      }
    `);

  /** Replace the current selection with replacementText, maintaining selection or placing cursor. */
  const textboxHelperInsertText = (textarea, replacementText, originalSelectedText) => {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    // Normalize line endings to standard LF to prevent browser execCommand stripping bugs
    const normalizedReplacement = replacementText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    textarea.focus();
    textarea.setSelectionRange(start, end);

    let success = false;
    try {
      success = document.execCommand("insertText", false, normalizedReplacement);
    } catch (error) {
      success = false;
    }

    if (!success) {
      textarea.value = text.substring(0, start) + normalizedReplacement + text.substring(end);
    }

    if (originalSelectedText) {
      const normalizedOriginal = originalSelectedText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const idx = normalizedReplacement.indexOf(normalizedOriginal);
      if (idx !== -1) {
        const newStart = start + idx;
        const newEnd = newStart + normalizedOriginal.length;
        textarea.setSelectionRange(newStart, newEnd);
      } else {
        const newCursorPos = start + normalizedReplacement.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }
    } else {
      // Heuristic for empty selection: if it looks like BBCode tags, place cursor inside
      if (normalizedReplacement.startsWith("[") && normalizedReplacement.includes("]")) {
        const firstBracketClose = normalizedReplacement.indexOf("]");
        const newCursorPos = start + firstBracketClose + 1;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      } else {
        const newCursorPos = start + normalizedReplacement.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }
    }

    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  };

  /** Create the menu DOM element globally. */
  const textboxHelperCreateMenu = () => {
    const enabledWidgets = textboxHelperWidgets.filter(textboxHelperIsWidgetEnabled);
    if (enabledWidgets.length === 0) {
      return null;
    }

    const menu = document.createElement("div");
    menu.className = "vgmdb-textbox-helper-menu";
    menu.style.display = "none";

    enabledWidgets.forEach((widget) => {
      const constructorFn = textboxHelperWidgetConstructors[widget.type];
      if (constructorFn) {
        const widgetElement = constructorFn(widget);
        if (widgetElement) {
          menu.appendChild(widgetElement);
        }
      }
    });

    return menu;
  };

  /** Hide the shared menu and restore active textarea state. */
  const textboxHelperHideMenu = () => {
    if (textboxHelperMenu) {
      textboxHelperMenu.style.display = "none";
      // Close any open searchable select dropdowns inside the menu
      textboxHelperMenu.querySelectorAll(".vgmdb-textbox-helper-searchable-select-dropdown").forEach((d) => {
        d.style.display = "none";
      });
    }

    if (textboxHelperResizeObserver) {
      textboxHelperResizeObserver.disconnect();
    }

    if (textboxHelperActiveTextarea) {
      // Restore original margins
      const origMargins = textboxHelperActiveTextarea.textboxHelperOriginalMargins;
      if (origMargins) {
        textboxHelperActiveTextarea.style.marginTop = origMargins.marginTop;
        textboxHelperActiveTextarea.style.marginRight = origMargins.marginRight;
        textboxHelperActiveTextarea.style.marginBottom = origMargins.marginBottom;
        textboxHelperActiveTextarea.style.marginLeft = origMargins.marginLeft;
      }
      textboxHelperActiveTextarea = null;
    }
  };

  /** Show and position the shared menu for the specified textarea. */
  const textboxHelperShowMenuForTextarea = (textarea) => {
    textboxHelperLastTextarea = textarea;
    if (!textboxHelperEnabled) {
      return; // Disabled in settings
    }
    if (textboxHelperActiveTextarea === textarea) {
      return; // Already showing for this textarea
    }

    // Ensure menu is created
    if (!textboxHelperMenu) {
      textboxHelperMenu = textboxHelperCreateMenu();
      if (!textboxHelperMenu) return; // No widgets enabled
    }

    // Deactivate previous active textarea if any
    textboxHelperHideMenu();

    textboxHelperActiveTextarea = textarea;

    // Save original margins if not already saved
    if (textarea.textboxHelperOriginalMargins === undefined) {
      const computedStyle = window.getComputedStyle(textarea);
      textarea.textboxHelperOriginalMargins = {
        marginTop: computedStyle.marginTop || "0px",
        marginRight: computedStyle.marginRight || "0px",
        marginBottom: computedStyle.marginBottom || "0px",
        marginLeft: computedStyle.marginLeft || "0px",
      };
    }

    const origMargins = textarea.textboxHelperOriginalMargins;

    // Apply margins to the menu to align it perfectly with the textarea
    textboxHelperMenu.style.marginTop = origMargins.marginTop;
    textboxHelperMenu.style.marginRight = origMargins.marginRight;
    textboxHelperMenu.style.marginLeft = origMargins.marginLeft;
    textboxHelperMenu.style.marginBottom = "0px";

    // Reset textarea top margin so it sits flush under the menu
    textarea.style.marginTop = "0px";

    // Insert menu before the textarea
    textarea.parentNode.insertBefore(textboxHelperMenu, textarea);
    textboxHelperMenu.style.display = "flex";

    // Observe size changes to keep width in sync
    const syncWidth = () => {
      const rect = textarea.getBoundingClientRect();
      textboxHelperMenu.style.width = `${rect.width}px`;
    };

    if (window.ResizeObserver) {
      textboxHelperResizeObserver = new ResizeObserver(() => {
        syncWidth();
      });
      textboxHelperResizeObserver.observe(textarea);
    }

    syncWidth();
  };

  /*********************************************
   * Setup features and listeners
   ********************************************/
  const textboxHelperSetupFeatures = () => {
    textboxHelperApplyStyles();

    // Show menu on text box click/focus
    document.addEventListener("click", (event) => {
      const textarea = event.target.closest("textarea");
      const isMenuClick = textboxHelperMenu && textboxHelperMenu.contains(event.target);

      if (textarea) {
        textboxHelperShowMenuForTextarea(textarea);
      } else if (!isMenuClick) {
        textboxHelperHideMenu();
      }
    });

    // Close menu when focus moves to elements outside the textarea and the menu (e.g. keyboard navigation)
    document.addEventListener("focusin", (event) => {
      const textarea = event.target.closest("textarea");
      const isMenuFocus = textboxHelperMenu && textboxHelperMenu.contains(event.target);

      if (textarea) {
        textboxHelperShowMenuForTextarea(textarea);
      } else if (!isMenuFocus) {
        textboxHelperHideMenu();
      }
    });

    // Close any searchable select dropdown when clicking outside of them
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".vgmdb-textbox-helper-searchable-select-wrapper")) {
        document.querySelectorAll(".vgmdb-textbox-helper-searchable-select-dropdown").forEach((d) => {
          d.style.display = "none";
        });
      }
    });
  };

  /*********************************************
   * Custom settings management
   ********************************************/
  if (
    !window.VGMdbCustomSettings ||
    typeof window.VGMdbCustomSettings.createManager !== "function"
  ) {
    console.error(
      "[VGMdb textbox helper menu] Missing VGMdbCustomSettings library."
    );
  }

  let textboxHelperEnabled = true;
  let textboxHelperLastTextarea = null;

  const textboxHelperToggleMenuEnabled = (enabled) => {
    textboxHelperEnabled = enabled;
    if (!enabled) {
      // Hide the menu instantly if showing
      if (textboxHelperMenu) {
        textboxHelperMenu.style.display = "none";
      }
      // Restore margins on the active textarea if any
      if (textboxHelperActiveTextarea) {
        const origMargins = textboxHelperActiveTextarea.textboxHelperOriginalMargins;
        if (origMargins) {
          textboxHelperActiveTextarea.style.marginTop = origMargins.marginTop;
        }
      }
    } else {
      // If we have an active or last textarea, show it instantly
      const targetTextarea = textboxHelperActiveTextarea || textboxHelperLastTextarea;
      if (targetTextarea) {
        // Clear active textarea reference so showMenu doesn't early-return
        textboxHelperActiveTextarea = null;
        textboxHelperShowMenuForTextarea(targetTextarea);
      }
    }
  };

  const manager = window.VGMdbCustomSettings ? window.VGMdbCustomSettings.createManager({
    storageKey: "vgmdbTextboxHelper",
    containerId: "customSettingsContainerTextboxHelper",
    config: {
      "(custom) VGMdb textbox helper menu": [
        {
          type: "checkbox",
          id: "enableTextboxHelper",
          label: "Show textbox helper menu",
          tooltip: "Toggle the visibility of the textbox helper menu when interacting with textareas.",
          default: true,
          onChange: function (value) {
            textboxHelperToggleMenuEnabled(value);
          },
        },
      ],
    },
  }) : null;

  if (manager) {
    manager.mount();
    textboxHelperEnabled = manager.getSetting("enableTextboxHelper", true);
  }

  /*********************************************
   * Call setups
   ********************************************/
  textboxHelperSetupFeatures();
})();
