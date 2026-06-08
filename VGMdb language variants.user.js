// ==UserScript==
// @name        VGMdb language variants
// @namespace   Violentmonkey Scripts
// @match       https://vgmdb.net/*
// @require     https://raw.githubusercontent.com/kahpaibe/userscripts/refs/heads/main/components/VGMdb%20Custom%20Settings.js
// @grant       GM_addStyle
// @version     1.10
// @author      kahpaibe
// @description Show language variants (for artists, roles, titles...) in VGMdb
// @run-at      document-idle
// ==/UserScript==

(function() {
    'use strict';

    /*********************************************
     * User configuration
     ********************************************/

    // Color for the language variant text
    const showLanguageVariantsColor = '#34ef2b';

    // CSS selectors to EXCLUDE from the language variants insertion.
    const showLanguageVariantsExcludedSelectors = [
        'h1 .albumtitle',          // Excludes the main album title at the top
        'h1 + div .albumtitle',    // Excludes the secondary album titles (the div right below the h1)
        'span[style*="font-size: 1.5em"] .albumtitle', // Excludes event page titles
        '#innermain > div[style*="padding: 6px 10px 10px 10px"] .albumtitle', // Excludes event page header titles (targeted to avoid discography table)
    ];

    /**
     * Defines the containers where language variants will be shown and can be toggled.
     * 
     * - id: Unique identifier used for saving settings.
     * - label: Display name in the preferences menu.
     * - selector: CSS selector used to identify the container in the DOM.
     * - type: Short name used as a custom CSS class for toggling (e.g., vgmdb-type-table-results).
     * - tooltip (optional): Description shown when hovering over the setting.
     */
    const containerTypes = [
        { id: "table_results", label: "Results table", selector: "table.results", type: "table-results", tooltip: "Lists in table.results containers, such as in search results" },
        { id: "album_infobit_large", label: "Infobit (large)", selector: "table#album_infobit_large", type: "album-infobit-large", tooltip: "Containers such as Credits and main info section on album pages" },
        { id: "album_infobit_small", label: "Infobit (small)", selector: ".album_infobit_small", type: "album-infobit-small", tooltip: "Album preview blocks found on home page or Related Albums sections" },
        { id: "albumlist", label: "Album list", selector: "#albumlist", type: "albumlist", tooltip: "Album lists such as those found on artist pages" },
        { id: "producttable", label: "Product table", selector: "#producttable", type: "producttable", tooltip: "Product lists such as those found on artist pages" },
        { id: "discotable", label: "Discotable", selector: "#discotable", type: "discotable", tooltip: "Lists such as those found on product pages" },
        { id: "role", label: "table.role", selector: "table.role", type: "role", tooltip: "Tracklist credits on album pages" },
        { id: "rightcolumn", label: "Right column", selector: "#rightcolumn", type: "rightcolumn", tooltip: "Right sidebar (e.g., Products represented on Album pages)" },
        { id: "leftfloat", label: "Left float", selector: "#leftfloat", type: "leftfloat", tooltip: "Left sidebar info (e.g., Aliases, Organizations on Artist pages)" },
    ];

    const masterSwitchTooltip = "Master switch to enable/disable language variants display. Containers with no dedicated toggle will follow this setting only.";

    /*********************************************
     * Misc utilities
     ********************************************/

    /**
     * Helper function to extract clean text for comparison.
     * It ignores clipboard buttons and VGMdb's separator slashes.
     */
    function getCleanText(element) {
        const clone = element.cloneNode(true);
        // Remove utility buttons so they don't corrupt the text comparison
        clone.querySelectorAll('button').forEach(b => b.remove());
        // Remove VGMdb separator slashes
        clone.querySelectorAll('em').forEach(em => {
            if (em.textContent.trim() === '/') em.remove();
        });
        return clone.textContent.trim();
    }

    /*********************************************
     * Custom settings management
     ********************************************/

    let showLanguageVariantsManager = null;

    if (
        window.VGMdbCustomSettings &&
        typeof window.VGMdbCustomSettings.createManager === "function"
    ) {
        const settingsConfig = {
            "(custom) VGMdb show language variants": [
                {
                    type: "checkbox",
                    id: "showLanguageVariantsEnabled",
                    label: "Show language variants",
                    tooltip: masterSwitchTooltip,
                    default: true,
                    onChange: function (value) {
                        // Toggle a class on the body to instantly show/hide the elements
                        document.body.classList.toggle('vgmdb-hide-language-variants', !value);
                    },
                },
            ],
        };

        containerTypes.forEach(c => {
            settingsConfig["(custom) VGMdb show language variants"].push({
                type: "checkbox",
                id: `showLanguageVariantsEnabled_${c.id}`,
                label: c.label,
                tooltip: c.tooltip,
                default: true,
                onChange: function (value) {
                    document.body.classList.toggle(`vgmdb-hide-language-variants-${c.type}`, !value);
                },
            });
        });

        showLanguageVariantsManager = window.VGMdbCustomSettings.createManager({
            storageKey: "vgmdbCustomSettingsShowLanguageVariants",
            containerId: "customSettingsContainerShowLanguageVariants",
            config: settingsConfig,
        });
    } else {
        console.error("[VGMdb show language variants] Missing VGMdbCustomSettings library.");
    }

    /*********************************************
     * Main features implementation
     ********************************************/

    /**
     * Identifies if a node is a VGMdb language variant separator.
     */
    function isSeparator(node) {
        if (!node) return false;
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent.trim();
            return text === '' || text === '/';
        }
        if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'EM' && node.textContent.trim() === '/') return true;
            if (node.tagName === 'SPAN') {
                // Check for <span style="display:none"><em> / </em></span>
                const em = node.querySelector('em');
                return em && em.textContent.trim() === '/';
            }
        }
        return false;
    }

    function processGroup(spans, parent) {
        // We only care if there are multiple languages and at least one is hidden
        const hiddenSpans = spans.filter(s => s.style.display === 'none');
        if (spans.length < 2 || hiddenSpans.length === 0) {
            return;
        }

        // Identify which span is currently shown (the default)
        const visibleSpans = spans.filter(s => s.style.display !== 'none');
        const defaultSpan = visibleSpans.length > 0 ? visibleSpans[0] : spans[0];

        // The remaining spans are our variants
        const altSpans = spans.filter(s => s !== defaultSpan);

        // Find where this group starts and ends inside the parent element
        let firstIndex = -1;
        let lastIndex = -1;
        const childNodes = Array.from(parent.childNodes);
        childNodes.forEach((node, index) => {
            if (spans.includes(node)) {
                if (firstIndex === -1) firstIndex = index;
                lastIndex = index;
            }
        });

        const referenceNode = parent.childNodes[lastIndex].nextSibling;

        // Clean up VGMdb's standalone separators (e.g., <span style="display:none"><em> / </em></span>)
        // ONLY if they are part of the variants sequence
        const nodesToRemove = [];
        for (let i = firstIndex; i <= lastIndex; i++) {
            const node = parent.childNodes[i];
            if (!spans.includes(node) && isSeparator(node)) {
                nodesToRemove.push(node);
            }
        }
        nodesToRemove.forEach(n => n.remove());

        // --- DEDUPLICATION LOGIC ---
        const defaultText = getCleanText(defaultSpan);
        const seenTexts = new Set([defaultText]);
        const uniqueAltSpans = [];

        altSpans.forEach(alt => {
            const altText = getCleanText(alt);
            // If the text is not empty and we haven't seen it yet
            if (altText !== '' && !seenTexts.has(altText)) {
                seenTexts.add(altText);
                uniqueAltSpans.push(alt);
            } else {
                // Completely remove redundant/duplicate variants from the DOM
                alt.remove();
            }
        });

        // Rebuild the structure: DEFAULT (ALT1, ALT2)

        // Step A: Insert the default visible text
        parent.insertBefore(defaultSpan, referenceNode);

        // Only proceed with parentheses if there are actually unique variants left
        if (uniqueAltSpans.length > 0) {
            // Step B: Create a wrapper container for all the variants (so it can be easily toggled via CSS)
            const altContainer = document.createElement('span');
            altContainer.className = 'vgmdb-custom-language-variants-wrapper';

            // Add specific type class if it matches one of our monitored containers
            // Find the CLOSEST matching container
            let bestMatch = null;
            let containerInfo = null;
            containerTypes.forEach(c => {
                const match = parent.closest(c.selector);
                if (match) {
                    if (!bestMatch || bestMatch.contains(match)) {
                        bestMatch = match;
                        containerInfo = c;
                    }
                }
            });

            if (containerInfo) {
                altContainer.classList.add(`vgmdb-type-${containerInfo.type}`);
            }

            altContainer.appendChild(document.createTextNode(' ('));

            // Step C: Insert unique variants, styled, separated by commas
            uniqueAltSpans.forEach((alt, index) => {

                // Clean up internal slashes (e.g., <em> / </em>) inside the span itself
                const internalEms = alt.querySelectorAll('em');
                internalEms.forEach(em => {
                    if (em.textContent.trim() === '/') {
                        em.remove();
                    }
                });

                // Force the element to show up and apply the user-defined color
                alt.style.setProperty('display', 'inline', 'important');
                alt.style.setProperty('color', showLanguageVariantsColor, 'important');

                altContainer.appendChild(alt);

                // Add a comma if it's not the last variant
                if (index < uniqueAltSpans.length - 1) {
                    altContainer.appendChild(document.createTextNode(', '));
                }
            });

            // Step D: Close parentheses and insert the whole block
            altContainer.appendChild(document.createTextNode(')'));
            parent.insertBefore(altContainer, referenceNode);
        }
    }

    function showLanguageVariantsSetup() {
        // 1. Find ALL language spans on the page
        const allLangSpans = document.querySelectorAll('span[lang]');

        // 2. Filter out the ones that match our exclusion list
        const langSpans = Array.from(allLangSpans).filter(el => {
            return !showLanguageVariantsExcludedSelectors.some(selector => el.matches(selector));
        });

        const processed = new Set();

        // 3. Process spans in clusters to avoid grouping unrelated items (like multiple artists in Special Thanks)
        langSpans.forEach(startSpan => {
            if (processed.has(startSpan)) return;

            const parent = startSpan.parentElement;
            if (!parent) return;

            const group = [startSpan];
            processed.add(startSpan);

            // Look forward for consecutive variants or separators
            let next = startSpan.nextSibling;
            while (next) {
                if (langSpans.includes(next)) {
                    group.push(next);
                    processed.add(next);
                } else if (isSeparator(next)) {
                    // It's a separator, continue looking for the next variant
                } else {
                    // Not a variant or separator, end of this group
                    break;
                }
                next = next.nextSibling;
            }

            if (group.length >= 2) {
                processGroup(group, parent);
            }
        });
    }

    /*********************************************
     * Setup and initialization
     ********************************************/

    // 1. Inject the dynamic CSS rules for toggling visibility
    const showLanguageVariantsStyle = document.createElement('style');
    let styleText = `
        body.vgmdb-hide-language-variants .vgmdb-custom-language-variants-wrapper {
            display: none !important;
        }
    `;
    containerTypes.forEach(c => {
        styleText += `
        body.vgmdb-hide-language-variants-${c.type} .vgmdb-custom-language-variants-wrapper.vgmdb-type-${c.type} {
            display: none !important;
        }
        `;
    });
    showLanguageVariantsStyle.textContent = styleText;
    document.head.appendChild(showLanguageVariantsStyle);

    // 2. Initialize the settings UI and read the initial stored state
    if (showLanguageVariantsManager) {
        showLanguageVariantsManager.mount();
        const isEnabled = showLanguageVariantsManager.getSetting("showLanguageVariantsEnabled", true);
        document.body.classList.toggle('vgmdb-hide-language-variants', !isEnabled);

        containerTypes.forEach(c => {
            const isSpecificEnabled = showLanguageVariantsManager.getSetting(`showLanguageVariantsEnabled_${c.id}`, true);
            document.body.classList.toggle(`vgmdb-hide-language-variants-${c.type}`, !isSpecificEnabled);
        });
    }

    // 3. Process the page HTML to inject the variants
    showLanguageVariantsSetup();

})();