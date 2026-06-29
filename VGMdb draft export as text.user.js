// ==UserScript==
// @name        VGMdb draft export as text
// @namespace   Violentmonkey Scripts
// @match       https://vgmdb.net/db/artists-assign.php?draftid=*
// @require     https://raw.githubusercontent.com/kahpaibe/userscripts/refs/heads/main/components/VGMdb%20Custom%20Settings.js
// @grant       none
// @version     1.0
// @author      kahpaibe
// @description Adds a button to export the draft as text to clipboard.
// @run-at      document-idle
// ==/UserScript==

(function() {
  'use strict';

  /*********************************************
   * User variables
   ********************************************/
  const BUTTON_COLOR = '#CEFFFF';

  /*********************************************
   * Shared button creation utility
   ********************************************/
  const BUTTON_GROUP_ATTR = 'data-vgmdb-tweak-group';

  function setButtonGroup(button, group) {
    if (!button || !group) return;
    button.setAttribute(BUTTON_GROUP_ATTR, group);
  }

  function createButton({
    text = '⎘',
    tooltip,
    onClick,
    color = BUTTON_COLOR,
    group,
  } = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.innerText = text;
    button.title = tooltip;
    if (group) {
      setButtonGroup(button, group);
    }

    button.style.marginRight = '8px';
    button.style.padding = '1px 3px';
    button.style.fontSize = '0.75em';
    button.style.color = color;
    button.style.background = 'transparent';
    button.style.border = `1px solid ${color}`;
    button.style.cursor = 'pointer';
    button.style.transition = 'background 0.3s, color 0.3s';
    button.style.verticalAlign = 'middle';

    button.addEventListener('click', onClick);
    return button;
  }

  /*********************************************
   * Role data helpers
   ********************************************/

  /**
   * Parse $.rolemenu JSON array from script tag content using bracket matching.
   */
  function extractRoleMenuFromScript(text) {
    const index = text.indexOf('$.rolemenu');
    if (index === -1) return null;

    // Find the opening bracket of the array
    const startIndex = text.indexOf('[', index);
    if (startIndex === -1) return null;

    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = startIndex; i < text.length; i++) {
      const char = text[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (char === '\\') {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === '[') {
          depth++;
        } else if (char === ']') {
          depth--;
          if (depth === 0) {
            const jsonStr = text.substring(startIndex, i + 1);
            try {
              return JSON.parse(jsonStr);
            } catch (e) {
              return null;
            }
          }
        }
      }
    }
    return null;
  }

  /**
   * Build a lookup map from the page's $.rolemenu global.
   * Returns { roleId: { name: [rom, orig], aliases: { aliasId: { name: [rom, orig, norm] } } } }
   */
  function getRoleMenuMap() {
    let rolemenu = null;

    // Try accessing from window or unsafeWindow globals
    try {
      const global = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
      rolemenu = (global.$ && global.$.rolemenu)
        || (global.jQuery && global.jQuery.rolemenu)
        || global.rolemenu;
    } catch (e) {
      // Ignore
    }

    // Fallback: parse from inline <script> tags
    if (!rolemenu || !Array.isArray(rolemenu)) {
      for (const script of document.querySelectorAll('script:not([src])')) {
        const text = script.textContent;
        if (text.includes('$.rolemenu')) {
          rolemenu = extractRoleMenuFromScript(text);
          if (rolemenu) {
            break;
          }
        }
      }
    }

    if (!rolemenu || !Array.isArray(rolemenu)) {
      return {};
    }
    const map = {};
    for (const role of rolemenu) {
      map[role.id] = role;
    }
    return map;
  }

  /**
   * Resolve a role name from a data-selected value like "35,337" or just "337".
   * Returns the role name in the requested language, falling back to romanized.
   */
  function resolveRoleName(dataSelected, roleMap, language) {
    if (!dataSelected) {
      return '';
    }

    let roleId = '';
    let aliasId = '';

    if (dataSelected.includes(',')) {
      const parts = dataSelected.split(',');
      roleId = parts[0];
      aliasId = parts[1];
    } else {
      const singleId = dataSelected;
      if (roleMap[singleId]) {
        roleId = singleId;
      } else {
        // Search for this ID as an alias ID in all roles
        for (const rId in roleMap) {
          const r = roleMap[rId];
          if (r.aliases && typeof r.aliases === 'object' && r.aliases[singleId]) {
            roleId = rId;
            aliasId = singleId;
            break;
          }
        }
      }
      if (!roleId) {
        roleId = singleId;
      }
    }

    const role = roleMap[roleId];
    if (!role) {
      return '';
    }

    // Helper to get name with fallback for original-case indices (index 3 and 4)
    // which are added by VGMdb's scripts, mutating the original lowercase values (index 0 and 1).
    const getName = (nameArr) => {
      if (!nameArr || !Array.isArray(nameArr)) return '';
      if (language === 'original') {
        if (nameArr[4]) return nameArr[4];
        if (nameArr[1]) return nameArr[1];
      }
      if (nameArr[3]) return nameArr[3];
      return nameArr[0] || '';
    };

    // Try to get name from the alias first
    if (aliasId && aliasId !== '0' && role.aliases && typeof role.aliases === 'object') {
      const alias = role.aliases[aliasId];
      if (alias && alias.name) {
        const name = getName(alias.name);
        if (name) return name;
      }
    }

    // Fallback to role name
    return getName(role.name);
  }

  /*********************************************
   * Artist data extraction from a row
   ********************************************/

  /**
   * Extract artist info from a tr.rolebit row.
   * Returns { name, nameOriginal, suffix, role } or null if not extractable.
   */
  function extractRowData(row, roleMap, roleLanguage) {
    // Get the row ID from any input name like "apply[XXXXX]"
    const applyInput = row.querySelector('input[name^="apply["]');
    if (!applyInput) return null;
    const idMatch = applyInput.name.match(/\[(\d+)\]/);
    if (!idMatch) return null;
    const rowId = idMatch[1];

    // Artist name: linked artists have hidden artistname, unlinked use alias input
    const artistNameInput = row.querySelector(`input[name="artistname[${rowId}]"]`);
    const artistNameKanjiInput = row.querySelector(`input[name="artistnamekanji[${rowId}]"]`);
    const aliasInput = row.querySelector(`input[name="alias[${rowId}]"]`);
    const aliasKanjiInput = row.querySelector(`input[name="aliaskanji[${rowId}]"]`);

    let nameRomanized = '';
    let nameOriginal = '';

    if (artistNameInput && artistNameInput.value) {
      // Linked artist
      nameRomanized = artistNameInput.value;
      nameOriginal = artistNameKanjiInput ? artistNameKanjiInput.value : '';
    } else if (aliasInput) {
      // Unlinked artist
      nameRomanized = aliasInput.value;
      nameOriginal = aliasKanjiInput ? aliasKanjiInput.value : '';
    }

    // Suffix
    const suffixInput = row.querySelector(`input[name="suffix[${rowId}]"]`);
    const suffix = suffixInput ? suffixInput.value : '';

    // Role from newrole select (tail.select might clear or change the name attribute)
    const roleSelect = row.querySelector('select.role-menu') || row.querySelector(`select[name="newrole[${rowId}]"]`);
    const dataSelected = roleSelect ? (roleSelect.value || roleSelect.getAttribute('data-selected') || '') : '';
    const roleName = resolveRoleName(dataSelected, roleMap, roleLanguage);

    // Artist ID
    const linkChoiceRadio = row.querySelector(`input[name="linkchoice[${rowId}]"]:checked`);
    const linkChoice = linkChoiceRadio ? linkChoiceRadio.value : '';
    let artistId = '0';
    if (linkChoice === 'suggest') {
      const suggestSelect = row.querySelector(`select[name="suggest[${rowId}]"]`);
      artistId = suggestSelect ? (suggestSelect.value || '0') : '0';
    } else {
      const manualInput = row.querySelector(`input[name="manual[${rowId}]"]`);
      artistId = manualInput ? (manualInput.value || '0') : '0';
    }

    return {
      nameRomanized,
      nameOriginal,
      suffix,
      roleName,
      artistId,
    };
  }

  /*********************************************
   * Export logic
   ********************************************/

  function getArtistDisplayName(entry, artistLanguage, appendArtistId) {
    let name;
    if (artistLanguage === 'original' && entry.nameOriginal) {
      name = entry.nameOriginal;
    } else {
      name = entry.nameRomanized;
    }
    if (entry.suffix) {
      name += ' ' + entry.suffix;
    }
    if (appendArtistId) {
      name += `[${entry.artistId || '0'}]`;
    }
    return name;
  }

  function generateExportText() {
    const roleLanguage = manager.getSetting('roleLanguage', 'original');
    const artistLanguage = manager.getSetting('artistLanguage', 'original');
    const grouping = manager.getSetting('grouping', 'hybrid');
    const appendArtistId = manager.getSetting('appendArtistId', false);

    const roleMap = getRoleMenuMap();
    const rows = document.querySelectorAll('tr.rolebit');
    const entries = [];

    rows.forEach(row => {
      const data = extractRowData(row, roleMap, roleLanguage);
      if (data && data.nameRomanized) {
        entries.push(data);
      }
    });

    if (entries.length === 0) return '(No artist entries found)';

    let lines = [];

    if (grouping === 'none') {
      // Ungrouped: role: artist per line
      for (const e of entries) {
        const name = getArtistDisplayName(e, artistLanguage, appendArtistId);
        lines.push(`${e.roleName}: ${name}`);
      }
    } else if (grouping === 'role') {
      // Group by role: role: artist1, artist2
      const roleGroups = new Map();
      for (const e of entries) {
        const name = getArtistDisplayName(e, artistLanguage, appendArtistId);
        if (!roleGroups.has(e.roleName)) {
          roleGroups.set(e.roleName, []);
        }
        roleGroups.get(e.roleName).push(name);
      }
      for (const [role, artists] of roleGroups) {
        lines.push(`${role}: ${artists.join(', ')}`);
      }
    } else if (grouping === 'artist') {
      // Group by artist: role1, role2: artist
      const artistGroups = new Map();
      for (const e of entries) {
        const name = getArtistDisplayName(e, artistLanguage, appendArtistId);
        if (!artistGroups.has(name)) {
          artistGroups.set(name, []);
        }
        const roles = artistGroups.get(name);
        if (!roles.includes(e.roleName)) {
          roles.push(e.roleName);
        }
      }
      for (const [artist, roles] of artistGroups) {
        lines.push(`${roles.join(', ')}: ${artist}`);
      }
    } else if (grouping === 'hybrid') {
      // Best effort grouping: Group artists that have the exact same set of roles.
      const artistToRoles = new Map();
      for (const e of entries) {
        const name = getArtistDisplayName(e, artistLanguage, appendArtistId);
        if (!artistToRoles.has(name)) {
          artistToRoles.set(name, []);
        }
        const roles = artistToRoles.get(name);
        if (!roles.includes(e.roleName)) {
          roles.push(e.roleName);
        }
      }

      // Group by the sorted, stringified role-set
      const roleSetGroups = new Map();
      for (const [artist, roles] of artistToRoles) {
        roles.sort();
        const roleKey = roles.join(', ');
        if (!roleSetGroups.has(roleKey)) {
          roleSetGroups.set(roleKey, []);
        }
        roleSetGroups.get(roleKey).push(artist);
      }

      // Format: "Role1, Role2: ArtistA, ArtistB"
      for (const [roleKey, artists] of roleSetGroups) {
        lines.push(`${roleKey}: ${artists.join(', ')}`);
      }
    }

    return lines.join('\n');
  }

  function exportDraft(button) {
    const text = generateExportText();
    navigator.clipboard.writeText(text).then(() => {
      if (button) {
        const original = button.innerText;
        button.innerText = "✔ Exported to clipboard";
        setTimeout(() => (button.innerText = original), 1000);
      }
    }).catch(() => {
      // Fallback: show in a prompt for manual copy
      prompt('Copy the exported draft text:', text);
    });
  }

  /*********************************************
   * Custom settings management
   ********************************************/
  if (
    !window.VGMdbCustomSettings ||
    typeof window.VGMdbCustomSettings.createManager !== 'function'
  ) {
    console.error('[VGMdb draft export] Missing VGMdbCustomSettings library.');
    return;
  }

  const manager = window.VGMdbCustomSettings.createManager({
    storageKey: 'vgmdbDraftExportSettings',
    containerId: 'customSettingsContainerDraftExport',
    config: {
      '(custom) VGMdb draft export as text': [
        {
          type: 'radio',
          id: 'roleLanguage',
          label: 'Role language',
          tooltip: 'Choose which language to use for role names in the export.',
          options: [
            { value: 'original', label: 'Original role' },
            { value: 'romanized', label: 'Romanized role' },
          ],
          default: 'original',
        },
        {
          type: 'radio',
          id: 'artistLanguage',
          label: 'Artist name language',
          tooltip: 'Choose which language to use for artist names in the export.',
          options: [
            { value: 'original', label: 'Original artist name' },
            { value: 'romanized', label: 'Romanized artist name' },
          ],
          default: 'original',
        },
        {
          type: 'radio',
          id: 'grouping',
          label: 'Grouping',
          tooltip: 'Choose how to group entries in the export.',
          options: [
            { value: 'hybrid', label: 'Best effort grouping' },
            { value: 'role', label: 'Group by role' },
            { value: 'artist', label: 'Group by artist' },
            { value: 'none', label: 'Ungrouped' },
          ],
          default: 'hybrid',
        },
        {
          type: 'checkbox',
          id: 'appendArtistId',
          label: 'Append artist ID',
          tooltip: 'Append the database ID of the artist to their name, like ArtistName[id].',
          default: false,
        },
      ],
    },
  });

  manager.mount();

  /*********************************************
   * Initialization
   ********************************************/
  function init() {
    // Find the "Edit Draft" link and insert our button next to it
    const editDraftLink = Array.from(document.querySelectorAll('a')).find(
      a => a.textContent.trim() === 'Edit Draft'
    );

    if (editDraftLink) {
      const btn = createButton({
        text: '📋 Export Draft',
        tooltip: 'Export draft artist assignments as text (copied to clipboard)',
        onClick: (e) => exportDraft(e.target),
      });
      btn.style.fontSize = '1em';
      btn.style.padding = '2px 6px';
      editDraftLink.parentElement.insertBefore(btn, editDraftLink);
    }
  }

  init();
})();
