// ==UserScript==
// @name         VGMdb album page tweaks
// @namespace    https://vgmdb.net/
// @version      0.9
// @description  Tweaks for VGMdb album pages: custom date format, insert buttons to copy metadata, title and tracklists to clipboard.
// @author       kahpaibe
// @match        https://vgmdb.net/album/*
// @grant        none
// @run-at       document-end
// @require      https://raw.githubusercontent.com/kahpaibe/userscripts/refs/heads/main/components/VGMdb%20Custom%20Settings%20test.js
// ==/UserScript==

(function () {
  "use strict";

  function formatDateOverride(dateObj) {
    // Format date as YYYY.MM.DD with leading zeros for month and day
    return `${dateObj.getFullYear()}.${("0" + (dateObj.getMonth() + 1)).slice(-2)}.${("0" + dateObj.getDate()).slice(-2)}`;
  }

  // Button text and tooltips
  const perDiscBtnTitleName = "⎘";
  const perDiscBtnTitleName_pressed = "✔ COPIED";
  const perDiscBtnTitleMO = "Copy titles for this disc";
  const perDiscBtnFullName = "⎘";
  const perDiscBtnFullName_pressed = "✔ COPIED";
  const perDiscBtnFullMO = "Copy tracklist for this disc";
  const perLangBtnTitleName = "⎘";
  const perLangBtnTitleName_pressed = "✔ COPIED";
  const perLangBtnTitleMO = "Copy titles of all discs";
  const perLangBtnFullName = "⎘";
  const perLangBtnFullName_pressed = "✔ COPIED";
  const perLangBtnFullMO = "Copy tracklists of all discs";

  // Custom settings button management
  if (
    !window.VGMdbCustomSettings ||
    typeof window.VGMdbCustomSettings.createManager !== "function"
  ) {
    console.error(
      "[VGMdb album page tweaks] Missing VGMdbCustomSettings library. Please add the @require line.",
    );
    return;
  }

  const BUTTON_GROUP_ATTR = "data-vgmdb-tweak-group";
  const BUTTON_GROUPS = {
    albumInfo: "albumInfo",
    credits: "credits",
    tracklists: "tracklists",
    title: "title",
  };

  function setButtonGroup(button, group) {
    if (!button || !group) return;
    button.setAttribute(BUTTON_GROUP_ATTR, group);
  }

  function setButtonVisibility(group, visible) {
    document
      .querySelectorAll(`[${BUTTON_GROUP_ATTR}="${group}"]`)
      .forEach((button) => {
        button.style.display = visible ? "" : "none";
      });
  }

  function applyAllButtonVisibility(settings) {
    setButtonVisibility(BUTTON_GROUPS.albumInfo, settings.albumInfo ?? true);
    setButtonVisibility(BUTTON_GROUPS.credits, settings.credits ?? true);
    setButtonVisibility(BUTTON_GROUPS.tracklists, settings.tracklists ?? true);
    setButtonVisibility(BUTTON_GROUPS.title, settings.title ?? true);
  }

  const settingsManager = window.VGMdbCustomSettings.createManager({
    storageKey: "vgmdbAlbumPageTweaksSettings",
    containerId: "vgmdbAlbumPageTweaksSettingsContainer",
    config: {
      "(custom) VGMdb album page tweaks": [
        {
          type: "checkbox",
          id: "dateOverride",
          label: "Custom date format",
          default: true,
          onChange: function (value) {
            // apply or revert date formatting dynamically
            try {
              dateOverrideApply(value);
            } catch (e) {
              console.error("dateOverride toggle failed", e);
            }
          },
        },
        {
          type: "checkbox",
          id: "albumInfo",
          label: "Album info",
          default: true,
          onChange: function (value) {
            setButtonVisibility(BUTTON_GROUPS.albumInfo, value);
          },
        },
        {
          type: "checkbox",
          id: "credits",
          label: "Credits",
          default: true,
          onChange: function (value) {
            setButtonVisibility(BUTTON_GROUPS.credits, value);
          },
        },
        {
          type: "checkbox",
          id: "tracklists",
          label: "Tracklists",
          default: true,
          onChange: function (value) {
            setButtonVisibility(BUTTON_GROUPS.tracklists, value);
          },
        },
        {
          type: "checkbox",
          id: "title",
          label: "Title",
          default: true,
          onChange: function (value) {
            setButtonVisibility(BUTTON_GROUPS.title, value);
          },
        },
      ],
    },
  });

  // Shared button creation utility
  function createButton({
    text = "⎘",
    tooltip,
    onClick,
    color = "#CEFFFF",
    group,
  } = {}) {
    const button = document.createElement("button");
    button.innerText = text;
    button.title = tooltip;
    if (group) {
      setButtonGroup(button, group);
    }

    // Internal styling
    button.style.marginRight = "8px";
    button.style.padding = "1px 3px";
    button.style.fontSize = "0.75em";
    button.style.color = color;
    button.style.background = "transparent";
    button.style.border = `1px solid ${color}`;
    button.style.cursor = "pointer";
    button.style.transition = "background 0.3s, color 0.3s";
    button.style.verticalAlign = "middle";

    button.addEventListener("click", onClick);
    return button;
  }

  // Main function for date override
  // Apply or revert custom date formatting on matching links.
  function dateOverrideApply(enabled) {
    const selector = 'a[title^="View albums released on"]';
    document.querySelectorAll(selector).forEach((link) => {
      if (!link) return;

      // Store original text so we can revert later
      if (!link.dataset.vcsOriginalText) {
        link.dataset.vcsOriginalText = link.innerText;
      }

      if (enabled) {
        const dateObj = new Date(link.dataset.vcsOriginalText.trim());
        if (!isNaN(dateObj)) {
          link.innerText = formatDateOverride(dateObj);
        }
      } else {
        // revert to stored original text
        link.innerText = link.dataset.vcsOriginalText;
      }
    });
  }

  function dateOverrideSetup() {
    // On load, apply according to saved setting
    window.addEventListener("load", function () {
      const enabled = settingsManager.getSetting("dateOverride", true);
      dateOverrideApply(enabled);
    });
  }

  // Main function for metadata copy buttons
  function metadatacopySetup() {
    // Containers in which to insert copy to clipboard buttons
    const metadatacopyContainers = [
      "table#album_infobit_large",
      "div#collapse_credits",
    ];

    // Wait for the page to fully load
    window.addEventListener("load", function () {
      metadatacopyContainers.forEach((selector) => {
        const container = document.querySelector(selector);
        if (!container) return;

        // Find all <span class="label"> elements within the container
        const labels = container.querySelectorAll("span.label");
        labels.forEach((label) => {
          // Skip labels inside <a class="link_event">
          if (label.closest("a.link_event")) return;

          // Find the parent <td> of the label
          const labelCell = label.closest("td");
          if (!labelCell) return;

          // Find the next <td> (content cell) in the same row
          const row = labelCell.closest("tr");
          if (!row) return;

          const contentCell = row.querySelector("td:last-child");
          if (!contentCell) return;

          // Create and append the copy button before the label
          const button = createButton({
            text: "⎘",
            tooltip: "Copy content to clipboard",
            group:
              selector === "table#album_infobit_large"
                ? BUTTON_GROUPS.albumInfo
                : BUTTON_GROUPS.credits,
            onClick: () => {
              const fragment = contentCell.textContent.trim();
              navigator.clipboard.writeText(fragment).then(() => {
                const original = button.innerText;
                button.innerText = "✔";
                setTimeout(() => (button.innerText = original), 1000);
              });
            },
          });

          // Insert the button before the label
          label.parentNode.insertBefore(button, label);
        });
      });
    });
  }

  // Main function for title copy buttons
  function titleCopySetup() {
    // Selector for album titles, scoped to #innermain
    const albumTitleSelector =
      '#innermain span.albumtitle[style="display:inline"], #innermain span.albumtitle:not([style])';

    window.addEventListener("load", function () {
      const albumTitles = document.querySelectorAll(albumTitleSelector);
      albumTitles.forEach((title) => {
        const lines = title.innerHTML
          .split("<br>")
          .map((line) => line.trim())
          .filter((line) => line);
        title.innerHTML = "";
        lines.forEach((line, index) => {
          const lineText = line.replace(/<[^>]*>/g, "");
          const button = createButton({
            tooltip: "Copy to clipboard",
            group: BUTTON_GROUPS.title,
            onClick: () => {
              navigator.clipboard.writeText(lineText).then(() => {
                button.innerText = "✓";
                setTimeout(() => (button.innerText = "⎘"), 2000);
              });
            },
          });
          title.appendChild(button);
          title.appendChild(document.createTextNode(lineText));
          if (index < lines.length - 1) {
            title.appendChild(document.createElement("br"));
          }
        });
      });
    });
  }

  // Main function for tracklist copy buttons (per-disc)
  function tracklistCopySetup() {
    window.addEventListener("load", function () {
      const tracklistContainer = document.querySelector("#tracklist");
      if (!tracklistContainer) return;

      const allSpans = tracklistContainer.querySelectorAll("span");
      allSpans.forEach((span) => {
        if (!/Disc \d+/.test(span.textContent)) return;

        let sibling = span.nextElementSibling;
        while (sibling && sibling.tagName !== "TABLE") {
          sibling = sibling.nextElementSibling;
        }
        if (!sibling) return;
        const trackTable = sibling;

        const btnPerDiscTitle = createButton({
          text: perDiscBtnTitleName,
          tooltip: perDiscBtnTitleMO,
          group: BUTTON_GROUPS.tracklists,
          onClick: () => {
            const tracks = trackTable.querySelectorAll("tr");
            const lines = [];
            tracks.forEach((tr) => {
              const tds = tr.querySelectorAll("td");
              if (tds.length >= 2) {
                const title = tds[1].textContent.trim();
                lines.push(title);
              }
            });
            if (lines.length > 0) {
              navigator.clipboard.writeText(lines.join("\n")).then(() => {
                btnPerDiscTitle.innerText = perDiscBtnTitleName_pressed;
                setTimeout(
                  () => (btnPerDiscTitle.innerText = perDiscBtnTitleName),
                  1500,
                );
              });
            }
          },
        });

        const btnPerDiscFull = createButton({
          text: perDiscBtnFullName,
          tooltip: perDiscBtnFullMO,
          group: BUTTON_GROUPS.tracklists,
          onClick: () => {
            const tracks = trackTable.querySelectorAll("tr");
            const lines = [];
            tracks.forEach((tr) => {
              const tds = tr.querySelectorAll("td");
              if (tds.length >= 3) {
                const number = tds[0].textContent.trim();
                const title = tds[1].textContent.trim();
                const duration = tds[2].textContent.trim();
                lines.push(`${number} ${title} ${duration}`);
              }
            });
            if (lines.length > 0) {
              navigator.clipboard.writeText(lines.join("\n")).then(() => {
                btnPerDiscFull.innerText = perDiscBtnFullName_pressed;
                setTimeout(
                  () => (btnPerDiscFull.innerText = perDiscBtnFullName),
                  1500,
                );
              });
            }
          },
        });

        span.appendChild(btnPerDiscTitle);
        span.appendChild(btnPerDiscFull);
      });
    });
  }

  // Main function for tracklist copy buttons (per-language)
  function languageCopySetup() {
    window.addEventListener("load", function () {
      const tabNav = document.querySelector("#tlnav");
      if (!tabNav) return;

      const tabLinks = tabNav.querySelectorAll("li");
      tabLinks.forEach((li) => {
        const rel = li.querySelector("a")?.getAttribute("rel");
        if (!rel) return;
        const tlbox = document.getElementById(rel);
        if (!tlbox) return;

        const btnPerLangTitle = createButton({
          text: perLangBtnTitleName,
          tooltip: perLangBtnTitleMO,
          group: BUTTON_GROUPS.tracklists,
          onClick: () => {
            const spans = tlbox.querySelectorAll("span");
            let result = "";
            spans.forEach((span) => {
              if (!/Disc \d+/.test(span.textContent)) return;
              let sibling = span.nextElementSibling;
              while (sibling && sibling.tagName !== "TABLE") {
                sibling = sibling.nextElementSibling;
              }
              if (!sibling) return;
              const trackRows = sibling.querySelectorAll("tr.rolebit");
              if (trackRows.length === 0) return;
              const discTitle = span.childNodes[0]?.textContent.trim();
              result += `${discTitle}:\n`;
              trackRows.forEach((row) => {
                const titleCell = row.querySelectorAll("td")[1];
                const title = titleCell?.textContent.trim();
                result += `${title}\n`;
              });
              result += "\n";
            });
            navigator.clipboard.writeText(result.trim()).then(() => {
              btnPerLangTitle.innerText = perLangBtnTitleName_pressed;
              setTimeout(
                () => (btnPerLangTitle.innerText = perLangBtnTitleName),
                1500,
              );
            });
          },
        });

        const btnPerLangFull = createButton({
          text: perLangBtnFullName,
          tooltip: perLangBtnFullMO,
          group: BUTTON_GROUPS.tracklists,
          onClick: () => {
            const spans = tlbox.querySelectorAll("span");
            let result = "";
            spans.forEach((span) => {
              if (!/Disc \d+/.test(span.textContent)) return;
              let sibling = span.nextElementSibling;
              while (sibling && sibling.tagName !== "TABLE") {
                sibling = sibling.nextElementSibling;
              }
              if (!sibling) return;
              const trackRows = sibling.querySelectorAll("tr.rolebit");
              if (trackRows.length === 0) return;
              const discTitle = span.childNodes[0]?.textContent.trim();
              result += `${discTitle}:\n`;
              trackRows.forEach((row) => {
                const number = row
                  .querySelector("td .label")
                  ?.textContent.trim();
                const title = row.querySelectorAll("td")[1]?.textContent.trim();
                const duration = row
                  .querySelectorAll("td")[2]
                  ?.textContent.trim();
                result += `${number}. ${title} ${duration}\n`;
              });
              result += "\n";
            });
            navigator.clipboard.writeText(result.trim()).then(() => {
              btnPerLangFull.innerText = perLangBtnFullName_pressed;
              setTimeout(
                () => (btnPerLangFull.innerText = perLangBtnFullName),
                1500,
              );
            });
          },
        });

        li.appendChild(btnPerLangTitle);
        li.appendChild(btnPerLangFull);
      });
    });
  }

  // Call the setup functions
  dateOverrideSetup();
  metadatacopySetup();
  titleCopySetup();
  tracklistCopySetup();
  languageCopySetup();

  settingsManager.mount();
  window.addEventListener("load", function () {
    applyAllButtonVisibility({
      albumInfo: settingsManager.getSetting("albumInfo", true),
      credits: settingsManager.getSetting("credits", true),
      tracklists: settingsManager.getSetting("tracklists", true),
      title: settingsManager.getSetting("title", true),
    });
  });
})();
