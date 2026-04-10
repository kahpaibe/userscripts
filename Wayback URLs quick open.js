// ==UserScript==
// @name        Wayback Machine URLs quick open
// @namespace   Violentmonkey Scripts
// @match       https://web.archive.org/web/*
// @match       http://web.archive.org/web/*
// @grant       none
// @version     1.5
// @author      -
// @description Add buttons to open the original, newest, oldest URLs of a domain's URLs quickly, and a batch open button.
// @run-at      document-idle
// @icon        https://www.svgrepo.com/show/505075/wayback-machine.svg
// ==/UserScript==

(function () {
  "use strict";

  /**
   * Function to add the "Batch open" button inside the first col-sm-6 div
   */
  function addOpenAllButton() {
    const rowDiv = document.querySelector(".row");
    if (!rowDiv) return;

    const firstColDiv = rowDiv.querySelector(".col-sm-6:first-child");
    if (!firstColDiv || document.getElementById("waybackOpenAllButton")) return;

    const openAllButton = document.createElement("button");
    openAllButton.id = "waybackOpenAllButton";
    openAllButton.textContent = "Batch open";
    openAllButton.style.marginLeft = "10px";
    openAllButton.style.padding = "5px 10px";
    openAllButton.style.backgroundColor = "#6c757d";
    openAllButton.style.color = "white";
    openAllButton.style.border = "none";
    openAllButton.style.borderRadius = "4px";
    openAllButton.style.cursor = "pointer";
    openAllButton.title = "Batch open archived urls";
    openAllButton.onclick = () => {
      const input = prompt(
        "Usage: [batchSize][options][-skip]\n" +
          "Examples:\n" +
          "  5fn9o    → Open 5 URLs, first saved/newest/saved/original\n" +
          "  10of-13  → Open 10 URLs, skip first 13 entries\n" +
          "Options: \n" +
          "  f: first\n" +
          "  n: newest\n" +
          "  s: saved\n" +
          "  o: original\n" +
          "Spaces can be used.",
      );
      if (input) {
        const { batchSize, options, skipCount } = parseInput(input);
        if (batchSize && options) {
          openAllUrls(batchSize, options, skipCount);
        } else {
          alert(
            "Invalid input. Use format: [number][letters][-skip], e.g. 5fn9o or 10of-13.",
          );
        }
      }
    };

    firstColDiv.appendChild(openAllButton);
  }

  /**
   * Parses input like "5fn9o" or "10of-13" into { batchSize, options, skipCount }
   */
  function parseInput(input) {
    const batchSizeMatch = input.match(/^\d+/);
    const batchSize = batchSizeMatch ? parseInt(batchSizeMatch[0], 10) : null;

    const skipMatch = input.match(/-(\d+)/);
    const skipCount = skipMatch ? parseInt(skipMatch[1], 10) : 0;

    const letters = input.match(/[fnslo]/gi) || [];
    if (!batchSize || letters.length === 0)
      return { batchSize: null, options: null, skipCount: 0 };

    const options = [...new Set(letters)].join("");
    return { batchSize, options, skipCount };
  }

  /**
   * Function to batch open URLs based on user options with batching
   */
  function openAllUrls(batchSize, options, skipCount = 0) {
    const urlCells = document.querySelectorAll("td.url");
    if (urlCells.length === 0) {
      alert("No URLs found to open.");
      return;
    }

    let index = skipCount;
    let perIterationOpen = batchSize;

    const processBatch = () => {
      if (index >= urlCells.length) {
        alert("All URLs processed.");
        return;
      }

      const endIndex = Math.min(index + perIterationOpen, urlCells.length);
      const batchLog = [];

      for (; index < endIndex; index++) {
        const cell = urlCells[index];
        let link = cell.querySelector("a.wb-main-link");
        if (!link) link = cell.querySelector('a[href^="/web/"]');
        if (!link) continue;

        const waybackHref = link.getAttribute("href");
        const originalUrl = extractOriginalUrlFromHref(waybackHref);
        const baseUrl = "https://web.archive.org";
        const absoluteWaybackHref = waybackHref.startsWith("http")
          ? waybackHref
          : baseUrl + waybackHref;

        const urlsToOpen = [];
        const descriptions = [];

        if (options.includes("s")) {
          urlsToOpen.push(absoluteWaybackHref);
          descriptions.push(`Saved: ${absoluteWaybackHref}`);
        }
        if (options.includes("f") && originalUrl) {
          urlsToOpen.push(`${baseUrl}/web/0/${originalUrl}`);
          descriptions.push(`First saved: ${baseUrl}/web/0/${originalUrl}`);
        }
        if (options.includes("n") && originalUrl) {
          urlsToOpen.push(`${baseUrl}/web/2/${originalUrl}`);
          descriptions.push(`Newest: ${baseUrl}/web/2/${originalUrl}`);
        }
        if (options.includes("o") && originalUrl) {
          urlsToOpen.push(originalUrl);
          descriptions.push(`Original: ${originalUrl}`);
        }

        urlsToOpen.forEach((url) =>
          window.open(url, "_blank", "noopener,noreferrer"),
        );
        if (descriptions.length > 0)
          batchLog.push(`[Entry ${index + 1}]\n${descriptions.join("\n")}`);
      }

      if (index >= urlCells.length) {
        alert(
          `Batch Complete.\n\nOpened:\n${batchLog.join("\n\n")}\n\nAll URLs processed.`,
        );
        return;
      }

      setTimeout(() => {
        const promptMessage =
          `Processed up to ${index}/${urlCells.length}\n` +
          `Next: ${perIterationOpen} URLs\n\n` +
          `Change batch size? (Enter number, or leave empty for ${perIterationOpen})\n` +
          `Change options? (Enter letters, or leave empty for ${options})\n` +
          `Change skip? (Enter number, or leave empty for ${skipCount})`;

        const input = prompt(promptMessage);
        if (input === null) {
          alert("Process stopped by user.");
        } else {
          const newBatchSizeMatch = input.match(/^\d+/);
          if (newBatchSizeMatch)
            perIterationOpen = parseInt(newBatchSizeMatch[0], 10);

          const newLetters = input.match(/[fnslo]/gi) || [];
          if (newLetters.length > 0) {
            options = [...new Set(newLetters)].join("");
          }

          const newSkipMatch = input.match(/-(\d+)/);
          if (newSkipMatch) {
            skipCount = parseInt(newSkipMatch[1], 10);
            index = skipCount;
          }

          processBatch();
        }
      }, 200);
    };

    processBatch();
  }

  function extractOriginalUrlFromHref(waybackHref) {
    if (!waybackHref) return null;
    const match = waybackHref.match(/^\/web\/[^/]+\/(.+)$/);
    return match ? match[1] : null;
  }

  function processUrlCells(root) {
    const links = root.querySelectorAll("td.url a:not([data-wb-processed])");
    links.forEach((link) => {
      const waybackHref = link.getAttribute("href");
      if (!waybackHref || !waybackHref.startsWith("/web/")) return;

      link.setAttribute("data-wb-processed", "true");
      link.classList.add("wb-main-link");

      const originalUrl = extractOriginalUrlFromHref(waybackHref);
      const container = document.createElement("span");
      container.style.marginRight = "5px";
      container.style.whiteSpace = "nowrap";

      if (originalUrl) {
        createButton(
          container,
          " o",
          originalUrl,
          "#fd7e14",
          "#e65c00",
          "Open original URL",
        );
        createButton(
          container,
          " n",
          `https://web.archive.org/web/2/${originalUrl}`,
          "#28a745",
          "#218838",
          "Open newest archived version",
        );
        createButton(
          container,
          " f",
          `https://web.archive.org/web/0/${originalUrl}`,
          "#dc3545",
          "#c82333",
          "Open oldest archived version",
        );
      }

      link.parentNode.insertBefore(container, link);
    });
  }

  function createButton(container, text, href, color, hoverColor, title) {
    const btn = document.createElement("a");
    btn.textContent = text;
    btn.href = href;
    btn.target = "_blank";
    btn.rel = "noopener noreferrer";
    btn.title = title;
    btn.style.cssText = `
            color: ${color};
            text-decoration: none;
            border: none;
            padding: 0 2px;
            font-size: 1em;
            font-weight: bold;
            cursor: pointer;
            line-height: 1;
        `;
    btn.onmouseover = () => (btn.style.color = hoverColor);
    btn.onmouseout = () => (btn.style.color = color);
    container.appendChild(btn);
  }

  // Initial scan
  processUrlCells(document.body);

  // Observer for "Batch open" button
  const buttonObserver = new MutationObserver(() => addOpenAllButton());
  buttonObserver.observe(document.body, { childList: true, subtree: true });

  // Observer for dynamic content
  const contentObserver = new MutationObserver((mutations) => {
    let shouldProcess = false;
    mutations.forEach((m) => {
      if (m.addedNodes.length > 0) shouldProcess = true;
    });
    if (shouldProcess) processUrlCells(document.body);
  });
  contentObserver.observe(document.body, { childList: true, subtree: true });
})();
