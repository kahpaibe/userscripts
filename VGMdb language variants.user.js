// ==UserScript==
// @name        VGMdb language variants
// @namespace   Violentmonkey Scripts
// @match       https://vgmdb.net/*
// @require     https://raw.githubusercontent.com/kahpaibe/userscripts/refs/heads/main/components/VGMdb%20Custom%20Settings.js
// @grant       GM_addStyle
// @version     1.8
// @author      kahpaibe
// @description Show language variants (for artists, roles, titles...) in VGMdb
// @run-at      document-idle
// ==/UserScript==

(function() {
    'use strict';

    /*********************************************
     * User configuration
     ********************************************/

    // Define the color for the language variant text (any valid CSS color)
    const showLanguageVariantsColor = '#34ef2b';

    // Add any CSS selectors you want to EXCLUDE from the language variants formatting here.
    const showLanguageVariantsExcludedSelectors = [
        'h1 .albumtitle',          // Excludes the main album title at the top
        'h1 + div .albumtitle',    // Excludes the secondary album titles (the div right below the h1)
        'span[style*="font-size: 1.5em"] .albumtitle', // Excludes event page titles
        'div[style*="padding: 6px 10px 10px 10px"] .albumtitle', // Excludes event page header titles
    ];

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
        showLanguageVariantsManager = window.VGMdbCustomSettings.createManager({
            storageKey: "vgmdbCustomSettingsShowLanguageVariants",
            containerId: "customSettingsContainerShowLanguageVariants",
            config: {
                "(custom) VGMdb show language variants": [
                    {
                        type: "checkbox",
                        id: "showLanguageVariantsEnabled",
                        label: "Show language variants",
                        default: true,
                        onChange: function (value) {
                            // Toggle a class on the body to instantly show/hide the elements
                            document.body.classList.toggle('vgmdb-hide-language-variants', !value);
                        },
                    },
                ],
            },
        });
    } else {
        console.error("[VGMdb show language variants] Missing VGMdbCustomSettings library.");
    }

    /*********************************************
     * Main features implementation
     ********************************************/

    function showLanguageVariantsSetup() {
        // 1. Find ALL language spans on the page
        const allLangSpans = document.querySelectorAll('span[lang]');

        // 2. Filter out the ones that match our exclusion list
        const langSpans = Array.from(allLangSpans).filter(el => {
            return !showLanguageVariantsExcludedSelectors.some(selector => el.matches(selector));
        });

        const parentMap = new Map();

        // 3. Group the remaining valid spans by their parent container
        langSpans.forEach(el => {
            const parent = el.parentElement;
            if (!parentMap.has(parent)) {
                parentMap.set(parent, []);
            }
            parentMap.get(parent).push(el);
        });

        // 4. Process each group
        for (const [parent, spans] of parentMap.entries()) {

            // We only care if there are multiple languages and at least one is hidden
            const hiddenSpans = spans.filter(s => s.style.display === 'none');
            if (spans.length < 2 || hiddenSpans.length === 0) {
                continue;
            }

            // Identify which span is currently shown (the default)
            const visibleSpans = spans.filter(s => s.style.display !== 'none');
            const defaultSpan = visibleSpans.length > 0 ? visibleSpans[0] : spans[0];

            // The remaining spans are our variants
            const altSpans = spans.filter(s => s !== defaultSpan);

            // Find where this group starts and ends inside the parent element
            let firstIndex = -1;
            let lastIndex = -1;
            Array.from(parent.childNodes).forEach((node, index) => {
                if (spans.includes(node)) {
                    if (firstIndex === -1) firstIndex = index;
                    lastIndex = index;
                }
            });

            const referenceNode = parent.childNodes[lastIndex].nextSibling;

            // Clean up VGMdb's standalone separators (e.g., <span style="display:none"><em> / </em></span>)
            const nodesToRemove = [];
            for (let i = firstIndex; i <= lastIndex; i++) {
                const node = parent.childNodes[i];
                if (!spans.includes(node)) {
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
    }

    /*********************************************
     * Setup and initialization
     ********************************************/

    // 1. Inject the dynamic CSS rule for toggling visibility
    const showLanguageVariantsStyle = document.createElement('style');
    showLanguageVariantsStyle.textContent = `
        body.vgmdb-hide-language-variants .vgmdb-custom-language-variants-wrapper {
            display: none !important;
        }
    `;
    document.head.appendChild(showLanguageVariantsStyle);

    // 2. Initialize the settings UI and read the initial stored state
    if (showLanguageVariantsManager) {
        showLanguageVariantsManager.mount();
        const isEnabled = showLanguageVariantsManager.getSetting("showLanguageVariantsEnabled", true);
        document.body.classList.toggle('vgmdb-hide-language-variants', !isEnabled);
    }

    // 3. Process the page HTML to inject the variants
    showLanguageVariantsSetup();

})();