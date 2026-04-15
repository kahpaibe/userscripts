// ==UserScript==
// @name         VGMdb Custom Settings minimal example
// @namespace    https://vgmdb.net/
// @version      1.0
// @description  Minimal usage example for VGMdb Custom Settings library
// @author       kahpaibe
// @match        https://vgmdb.net/*
// @require      https://raw.githubusercontent.com/kahpaibe/userscripts/refs/heads/main/components/VGMdb%20Custom%20Settings%20test.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    if (!window.VGMdbCustomSettings || typeof window.VGMdbCustomSettings.createManager !== 'function') {
        console.error('[VGMdb minimal example] Missing VGMdbCustomSettings library.');
        return;
    }

    const manager = window.VGMdbCustomSettings.createManager({
        storageKey: 'vgmdbCustomSettingsMinimalExample',
        containerId: 'customSettingsContainerMinimalExample',
        config: {
            'Minimal Example': [
                {
                    type: 'checkbox',
                    id: 'showConsoleLog',
                    label: 'Enable console log on page load',
                    default: false,
                    onChange: function(value) {
                        console.log('[VGMdb minimal example] showConsoleLog changed:', value);
                    }
                }
            ]
        }
    });

    manager.mount();

    if (manager.getSetting('showConsoleLog', false)) {
        console.log('[VGMdb minimal example] checkbox is enabled');
    }
})();
