// ==UserScript==
// @name         VGMdb Custom Settings minimal example
// @namespace    https://vgmdb.net/
// @version      1.0
// @description  Minimal usage example for VGMdb Custom Settings library
// @author       kahpaibe
// @match        https://vgmdb.net/*
// @require      https://raw.githubusercontent.com/kahpaibe/userscripts/refs/heads/main/components/VGMdb%20Custom%20Settings.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  /*********************************************
   * Custom settings management
   ********************************************/
  if (
    !window.VGMdbCustomSettings ||
    typeof window.VGMdbCustomSettings.createManager !== "function"
  ) {
    console.error(
      "[VGMdb minimal example] Missing VGMdbCustomSettings library.",
    );
    return;
  }

  const manager = window.VGMdbCustomSettings.createManager({
    storageKey: "vgmdbCustomSettingsMinimalExample",
    containerId: "customSettingsContainerMinimalExample",
    config: {
      "Minimal Example": [
        {
          type: "checkbox",
          id: "showConsoleLog",
          label: "Enable console log on page load",
          default: false,
          onChange: function (value) {
            console.log(
              "[VGMdb minimal example] showConsoleLog changed:",
              value,
            );
          },
        },
        {
          type: "radio",
          id: "exampleRadio",
          label: "Example radio",
          options: [
            { value: "optionA", label: "Option A" },
            { value: "optionB", label: "Option B" },
          ],
          default: "optionA",
          onChange: function (value) {
            console.log("[VGMdb minimal example] exampleRadio changed:", value);
          },
        },
        {
          type: "tristate",
          id: "exampleTristate",
          label: "Example tristate",
          default: "null",
          onChange: function (value) {
            console.log(
              "[VGMdb minimal example] exampleTristate changed:",
              value,
            );
          },
        },
      ],
    },
  });

  /*********************************************
   * Setup and initialization
   ********************************************/
  manager.mount();

  // Log current values for all controls after mount
  console.log(
    "[VGMdb minimal example] showConsoleLog:",
    manager.getSetting("showConsoleLog", false),
  );
  console.log(
    "[VGMdb minimal example] exampleRadio:",
    manager.getSetting("exampleRadio", "optionA"),
  );
  console.log(
    "[VGMdb minimal example] exampleTristate:",
    manager.getSetting("exampleTristate", "null"),
  );
})();
