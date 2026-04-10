// ==UserScript==
// @name         VGMdb album page tweaks
// @namespace    https://vgmdb.net/
// @version      0.9
// @description  Tweaks for VGMdb album pages: custom date format, insert buttons to copy metadata, title and tracklists to clipboard.
// @author       kahpaibe
// @match        https://vgmdb.net/album/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  // Date format override definition
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

  // Shared button creation utility
  function createButton({
    text = "⎘",
    tooltip,
    onClick,
    color = "#CEFFFF",
  } = {}) {
    const button = document.createElement("button");
    button.innerText = text;
    button.title = tooltip;

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
  function dateOverrideSetup() {
    // Replace album-release date link text with formatted YYYY.MM.DD
    window.addEventListener("load", function () {
      document
        .querySelectorAll('a[title^="View albums released on"]')
        .forEach((link) => {
          const dateObj = new Date(link.innerText.trim());
          if (!isNaN(dateObj)) {
            link.innerText = formatDateOverride(dateObj);
          }
        });
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
})();
