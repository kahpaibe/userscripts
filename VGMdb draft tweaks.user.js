// ==UserScript==
// @name        VGMdb draft tweaks
// @namespace   Violentmonkey Scripts
// @match       https://vgmdb.net/db/artists-assign.php?draftid=*
// @grant       none
// @version     0.8
// @author      kahpaibe
// @description Merge of VGMdb draft scripts: auto apply, quick id open, and section check all, with configurable settings.
// @run-at      document-idle
// @require     https://raw.githubusercontent.com/kahpaibe/userscripts/refs/heads/main/components/VGMdb%20Custom%20Settings.js
// ==/UserScript==

(function() {
  'use strict';

  const HIGHLIGHT_COLOR = '#404000';
  const MODIFIED_CLASS = 'vgmdb-row-modified';
  const HIGHLIGHT_HOVER_COLOR = '#686800';

  const BASE_URL = 'https://vgmdb.net/artist/';
  const SELECT_QUERY = 'select[name^="suggest["]';

  let settingsManager = null;

  /*********************************************
   * Injected styles
   ********************************************/
  const styleContent = `
/* Modified row highlight — !important to override site hover styles */
body:not(.vgmdb-disable-highlight) tr.rolebit.${MODIFIED_CLASS} {
  background-color: ${HIGHLIGHT_COLOR} !important;
}
body:not(.vgmdb-disable-highlight) tr.rolebit.${MODIFIED_CLASS}:hover {
  background-color: ${HIGHLIGHT_HOVER_COLOR} !important;
}

/* Toggle settings hiding rules */
body.vgmdb-hide-open-btn .vgmdb-open-btn {
  display: none !important;
}
body.vgmdb-hide-section-toggle .vgmdb-section-toggle {
  display: none !important;
}

/* Custom dropdown wrapper */
.vgmdb-dropdown {
  display: inline-block;
  position: relative;
  vertical-align: middle;
}

/* Trigger: mimics native select appearance */
.vgmdb-dropdown-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font: inherit;
  box-sizing: border-box;
}

/* Dropdown arrow */
.vgmdb-dropdown-trigger::after {
  content: "▾";
  margin-left: 6px;
  flex-shrink: 0;
  opacity: 0.7;
}

/* Panel */
.vgmdb-dropdown-panel {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 9999;
  margin-top: 1px;
  padding: 3px 0;
  min-width: 100%;
  width: max-content;
  max-width: 450px;
  max-height: 250px;
  overflow-y: auto;
  overflow-x: hidden;
  list-style: none;
}

/* Dropdown items */
.vgmdb-dropdown-panel li {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  cursor: pointer;
  white-space: nowrap;
  font: inherit;
  transition: background-color 0.15s;
}
.vgmdb-dropdown-panel li:hover {
  background-color: rgba(255, 255, 255, 0.1);
}
.vgmdb-dropdown-panel li.vgmdb-selected {
  background-color: rgba(255, 255, 255, 0.15);
  font-weight: bold;
}

/* Option text span */
.vgmdb-dropdown-panel li .vgmdb-option-text {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Open-artist link (styled as button) */
.vgmdb-open-btn {
  flex-shrink: 0;
  margin-right: 6px;
  padding: 0px 3px;
  font-size: 1em;
  line-height: 1;
  color: #CEFFFF;
  background: transparent;
  border: 1px solid #CEFFFF;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
  vertical-align: middle;
  text-decoration: none;
}
.vgmdb-open-btn:hover {
  background-color: #CEFFFF;
  color: #151F30;
}

/* Section toggle checkbox in the APPLY? header */
.vgmdb-section-toggle {
  vertical-align: middle;
  margin-left: 4px;
  cursor: pointer;
}
`;

  function addStyles() {
    const style = document.createElement('style');
    style.textContent = styleContent;
    document.head.appendChild(style);
  }

  /*********************************************
   * Misc / Shared utilities
   ********************************************/
  function parseArtistId(value) {
    const match = String(value).match(/^(\d+)$/);
    return match ? match[1] : null;
  }

  /*********************************************
   * Feature: Auto Apply & Row Highlight
   ********************************************/

  /**
   * Record initial values for all interactive elements in a row,
   * so we can detect actual changes vs. no-ops.
   */
  function snapshotRow(row) {
    const snapshot = new Map();
    row.querySelectorAll('input, select').forEach(el => {
      if (el.type === 'hidden') return;
      if (el.name && el.name.startsWith('apply[')) return;
      const key = el;
      if (el.type === 'checkbox' || el.type === 'radio') {
        snapshot.set(key, el.checked);
      } else {
        snapshot.set(key, el.value);
      }
    });
    return snapshot;
  }

  /**
   * Compare current row values with the initial snapshot.
   */
  function isRowChanged(row) {
    if (!row._initialValues) return false;
    const currentValues = snapshotRow(row);
    for (const [el, initialVal] of row._initialValues.entries()) {
      if (currentValues.get(el) !== initialVal) {
        return true;
      }
    }
    return false;
  }

  /**
   * Handle changes within a row: check apply checkbox and highlight if changed,
   * otherwise restore state if reverted to initial.
   */
  function handleRowChange(row) {
    const changed = isRowChanged(row);
    const applyCheckbox = row.querySelector('input[name^="apply["]');
    const autoCheckEnabled = settingsManager ? settingsManager.getSetting('enableAutoCheck', true) : true;

    if (changed) {
      if (!row.classList.contains(MODIFIED_CLASS)) {
        row.classList.add(MODIFIED_CLASS);
      }
      if (autoCheckEnabled) {
        if (applyCheckbox && !applyCheckbox.checked) {
          applyCheckbox.checked = true;
          applyCheckbox.dataset.vgmdbAutoChecked = '1';
          // Dispatch event so that table-level and other listeners (e.g. section-toggle) sync
          applyCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else {
        if (applyCheckbox && !applyCheckbox.checked) {
          applyCheckbox.dataset.vgmdbAutoChecked = '1';
        }
      }
    } else {
      row.classList.remove(MODIFIED_CLASS);
      if (applyCheckbox) {
        if (applyCheckbox.dataset.vgmdbAutoChecked === '1') {
          if (applyCheckbox.checked) {
            applyCheckbox.checked = false;
            applyCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
          }
          delete applyCheckbox.dataset.vgmdbAutoChecked;
        }
      }
    }
  }

  /**
   * Attach change listeners to all interactive elements within a row
   * (excluding the apply checkbox itself and hidden inputs).
   */
  function watchRow(row) {
    if (row.dataset.vgmdbAutoApplyWatched) return;

    row._initialValues = snapshotRow(row);

    const elements = row.querySelectorAll('input, select');

    elements.forEach(el => {
      if (el.type === 'hidden') return;
      if (el.name && el.name.startsWith('apply[')) return;

      // Use 'input' for text fields (fires on every keystroke),
      // 'change' for selects, checkboxes, radios
      const eventType = (el.type === 'text' || el.type === 'search') ? 'input' : 'change';
      el.addEventListener(eventType, () => handleRowChange(row));

      // Also listen to 'change' on text inputs for paste / autofill
      if (eventType === 'input') {
        el.addEventListener('change', () => handleRowChange(row));
      }
    });

    // Clear auto-checked flag if user manually toggles the checkbox
    const applyCheckbox = row.querySelector('input[name^="apply["]');
    if (applyCheckbox) {
      applyCheckbox.addEventListener('change', () => {
        delete applyCheckbox.dataset.vgmdbAutoChecked;
      });
    }

    row.dataset.vgmdbAutoApplyWatched = '1';
  }

  /*********************************************
   * Feature: Quick ID Open dropdown
   ********************************************/

  function enhanceSelect(select) {
    if (select.dataset.vgmdbDropdownAdded) return;

    // Capture computed styles from the live select BEFORE hiding it
    const cs = window.getComputedStyle(select);
    const selectStyles = {
      backgroundColor: select.style.backgroundColor || cs.backgroundColor,
      color: cs.color,
      fontSize: cs.fontSize,
      fontFamily: cs.fontFamily,
      padding: cs.padding,
      border: cs.border,
      borderRadius: cs.borderRadius,
      maxWidth: select.style.maxWidth || cs.maxWidth,
      height: cs.height,
    };

    // Hide original select
    select.style.display = 'none';

    // Build wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'vgmdb-dropdown';

    // Build trigger
    const trigger = document.createElement('div');
    trigger.className = 'vgmdb-dropdown-trigger';
    trigger.style.backgroundColor = selectStyles.backgroundColor;
    trigger.style.color = selectStyles.color;
    trigger.style.fontSize = selectStyles.fontSize;
    trigger.style.fontFamily = selectStyles.fontFamily;
    trigger.style.padding = selectStyles.padding;
    trigger.style.border = selectStyles.border;
    trigger.style.borderRadius = selectStyles.borderRadius;
    trigger.style.maxWidth = selectStyles.maxWidth;

    const initialOption = select.options[select.selectedIndex] || select.options[0];
    const triggerText = document.createElement('span');
    triggerText.style.overflow = 'hidden';
    triggerText.style.textOverflow = 'ellipsis';
    triggerText.textContent = initialOption ? initialOption.textContent : '';
    trigger.appendChild(triggerText);
    wrapper.appendChild(trigger);

    // Build dropdown panel
    const panel = document.createElement('ul');
    panel.className = 'vgmdb-dropdown-panel';
    panel.style.backgroundColor = selectStyles.backgroundColor;
    panel.style.color = selectStyles.color;
    panel.style.fontSize = selectStyles.fontSize;
    panel.style.fontFamily = selectStyles.fontFamily;
    panel.style.border = selectStyles.border;
    panel.style.borderRadius = '0 0 ' + (selectStyles.borderRadius || '0') + ' ' + (selectStyles.borderRadius || '0');

    Array.from(select.options).forEach((option, index) => {
      const li = document.createElement('li');
      if (index === select.selectedIndex) {
        li.classList.add('vgmdb-selected');
      }

      // Open button
      const artistId = parseArtistId(option.value);
      if (artistId && artistId !== '0') {
        const link = document.createElement('a');
        link.className = 'vgmdb-open-btn';
        link.href = `${BASE_URL}${artistId}`;
        link.target = '_blank';
        link.rel = 'noopener';
        link.innerText = '↗';
        link.title = 'Open page in new tab';
        link.addEventListener('click', (e) => {
          e.stopPropagation(); // Prevent row selection
        });
        link.addEventListener('auxclick', (e) => {
          e.stopPropagation(); // Prevent row selection on middle-click
        });
        li.appendChild(link);
      }

      // Option text
      const textSpan = document.createElement('span');
      textSpan.className = 'vgmdb-option-text';
      textSpan.textContent = option.textContent;
      li.appendChild(textSpan);

      // Selection logic
      li.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        select.selectedIndex = index;
        select.dispatchEvent(new Event('change', { bubbles: true }));

        triggerText.textContent = option.textContent;
        panel.style.display = 'none';

        panel.querySelectorAll('li').forEach(l => l.classList.remove('vgmdb-selected'));
        li.classList.add('vgmdb-selected');
      });

      panel.appendChild(li);
    });

    wrapper.appendChild(panel);
    select.insertAdjacentElement('afterend', wrapper);

    // Toggle panel
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Close other open dropdowns
      document.querySelectorAll('.vgmdb-dropdown-panel').forEach(p => {
        if (p !== panel) p.style.display = 'none';
      });

      panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) {
        panel.style.display = 'none';
      }
    });

    // Sync styles if select background changes dynamically
    const styleObserver = new MutationObserver(() => {
      const bg = select.style.backgroundColor;
      if (bg) {
        trigger.style.backgroundColor = bg;
        panel.style.backgroundColor = bg;
      }
    });
    styleObserver.observe(select, { attributes: true, attributeFilter: ['style'] });

    select.dataset.vgmdbDropdownAdded = '1';
  }

  /*********************************************
   * Feature: Section Check All
   ********************************************/

  /**
   * Find all APPLY checkboxes within a role table.
   */
  function getApplyCheckboxes(table) {
    return Array.from(table.querySelectorAll('tr.rolebit input[name^="apply["]'));
  }

  /**
   * Add a toggle checkbox in the APPLY? header cell of a role table.
   */
  function enhanceTable(table) {
    if (table.dataset.vgmdbSectionToggleAdded) return;

    // Find the header row (first <tr> without .rolebit)
    const headerRow = table.querySelector('tr:not(.rolebit)');
    if (!headerRow) return;

    // Find the APPLY? header cell (last <td> containing <h4>APPLY?</h4>)
    const headerCells = headerRow.querySelectorAll('td');
    let applyHeaderCell = null;
    for (const cell of headerCells) {
      const h4 = cell.querySelector('h4');
      if (h4 && h4.textContent.trim() === 'APPLY?') {
        applyHeaderCell = cell;
        break;
      }
    }
    if (!applyHeaderCell) return;

    // Create toggle checkbox
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'vgmdb-section-toggle';
    toggle.title = 'Check/Uncheck all in this section';

    // Set initial state: checked if all apply boxes are checked
    function syncToggleState() {
      const boxes = getApplyCheckboxes(table);
      if (boxes.length === 0) return;
      toggle.checked = boxes.every(cb => cb.checked);
      toggle.indeterminate = !toggle.checked && boxes.some(cb => cb.checked);
    }
    syncToggleState();

    // Toggle all on click
    toggle.addEventListener('change', () => {
      const newState = toggle.checked;
      getApplyCheckboxes(table).forEach(cb => {
        if (cb.checked !== newState) {
          cb.checked = newState;
          // Trigger change event so row-level listeners update styles and state
          cb.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      toggle.indeterminate = false;
    });

    // Keep toggle in sync when individual checkboxes change
    table.addEventListener('change', (e) => {
      if (e.target.name && e.target.name.startsWith('apply[')) {
        syncToggleState();
      }
    });

    applyHeaderCell.appendChild(toggle);
    table.dataset.vgmdbSectionToggleAdded = '1';
  }

  /*********************************************
   * Custom Settings Management
   ********************************************/
  function initSettings() {
    if (!window.VGMdbCustomSettings || typeof window.VGMdbCustomSettings.createManager !== "function") {
      console.error("[VGMdb draft tweaks] Missing VGMdbCustomSettings library.");
      return false;
    }

    settingsManager = window.VGMdbCustomSettings.createManager({
      storageKey: "vgmdbDraftTweaksSettings",
      containerId: "vgmdbDraftTweaksSettingsContainer",
      config: {
        "(custom) VGMdb draft tweaks": [
          {
            type: "checkbox",
            id: "enableQuickOpen",
            label: "Show quick open artist buttons",
            default: true,
            onChange: function(value) {
              document.body.classList.toggle('vgmdb-hide-open-btn', !value);
            }
          },
          {
            type: "checkbox",
            id: "enableHighlight",
            label: "Highlight modified entries",
            default: true,
            onChange: function(value) {
              document.body.classList.toggle('vgmdb-disable-highlight', !value);
            }
          },
          {
            type: "checkbox",
            id: "enableAutoCheck",
            label: "Auto check modified entries",
            default: true,
            onChange: function(value) {
              document.querySelectorAll('tr.rolebit').forEach(row => {
                const applyCheckbox = row.querySelector('input[name^="apply["]');
                if (!applyCheckbox) return;

                if (value) {
                  if (isRowChanged(row) && applyCheckbox.dataset.vgmdbAutoChecked === '1' && !applyCheckbox.checked) {
                    applyCheckbox.checked = true;
                    applyCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                } else {
                  if (applyCheckbox.dataset.vgmdbAutoChecked === '1' && applyCheckbox.checked) {
                    applyCheckbox.checked = false;
                    applyCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                }
              });
            }
          },
          {
            type: "checkbox",
            id: "enableSectionToggle",
            label: "Show section check-all checkboxes",
            default: true,
            onChange: function(value) {
              document.body.classList.toggle('vgmdb-hide-section-toggle', !value);
            }
          }
        ]
      }
    });

    settingsManager.mount();
    return true;
  }

  function applyInitialSettings() {
    if (!settingsManager) return;

    const quickOpen = settingsManager.getSetting('enableQuickOpen', true);
    document.body.classList.toggle('vgmdb-hide-open-btn', !quickOpen);

    const highlight = settingsManager.getSetting('enableHighlight', true);
    document.body.classList.toggle('vgmdb-disable-highlight', !highlight);

    const sectionToggle = settingsManager.getSetting('enableSectionToggle', true);
    document.body.classList.toggle('vgmdb-hide-section-toggle', !sectionToggle);
  }

  /*********************************************
   * Initialization
   ********************************************/
  function init() {
    // 1. Initialize settings manager and load initial configuration
    if (!initSettings()) {
      return;
    }

    // 2. Add styles and apply settings classes to document body
    addStyles();
    applyInitialSettings();

    // 3. Watch and enhance all existing elements
    document.querySelectorAll('tr.rolebit').forEach(watchRow);
    document.querySelectorAll(SELECT_QUERY).forEach(enhanceSelect);
    document.querySelectorAll('table.role').forEach(enhanceTable);

    // 4. Watch for dynamically added elements using a single MutationObserver
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;

          // Check the added node itself
          if (node.matches) {
            if (node.matches('tr.rolebit')) {
              watchRow(node);
            }
            if (node.matches(SELECT_QUERY)) {
              enhanceSelect(node);
            }
            if (node.matches('table.role')) {
              enhanceTable(node);
            }
          }

          // Check children of the added node
          if (typeof node.querySelectorAll === 'function') {
            node.querySelectorAll('tr.rolebit').forEach(watchRow);
            node.querySelectorAll(SELECT_QUERY).forEach(enhanceSelect);
            node.querySelectorAll('table.role').forEach(enhanceTable);
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  init();
})();
