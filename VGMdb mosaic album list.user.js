// ==UserScript==
// @name        VGMdb mosaic album list
// @namespace   Violentmonkey Scripts
// @match       https://vgmdb.net/*
// @require     https://raw.githubusercontent.com/kahpaibe/userscripts/refs/heads/main/components/VGMdb%20Custom%20Settings.js
// @grant       GM_addStyle
// @grant       GM_xmlhttpRequest
// @version     1.0
// @author      kahpaibe
// @description Add a mosaic view for album lists on VGMdb.
// @run-at      document-idle
// ==/UserScript==

(function () {
  "use strict";

  /*********************************************
   * User variables and global helpers
   ********************************************/
  const mosaicMaxConcurrentRequests = 5;
  const mosaicMaxCoverFetchRetries = 2;
  const mosaicRetryDelayMs = 400;
  const mosaicAlbumLinkSelector = 'a.albumtitle[href*="/album/"]';
  const mosaicDefaultShowContainer = true;
  const mosaicSettingsCategoryLabel = "(custom) VGMdb mosaic album list";
  const mosaicSettingsStorageKey = "vgmdbMosaicAlbumList";
  const mosaicSettingsContainerId = "customSettingsContainerMosaicAlbumList";
  const mosaicContainers = new Set();
  const mosaicDefaultVisibility = {
    title: true,
    catalog: true,
    date: true,
    event: true,
  };

  /** Find the closest ancestor that matches a predicate. */
  const mosaicFindAncestor = (start, predicate, stopAt = document.body) => {
    let node = start;
    while (node && node !== stopAt) {
      if (predicate(node)) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  };

  /** Count album links within a node. */
  const mosaicGetAlbumLinkCount = (node) =>
    node.querySelectorAll(mosaicAlbumLinkSelector).length;

  /** Detect if a table is an album list table. */
  const mosaicIsAlbumListTable = (table) => {
    const nestedAlbumTables = Array.from(table.querySelectorAll("table"))
      .filter((child) => child !== table)
      .filter((child) => child.querySelector(mosaicAlbumLinkSelector));
    if (nestedAlbumTables.length > 0) {
      return false;
    }

    const rows = Array.from(table.querySelectorAll("tr")).filter(
      (row) => row.closest("table") === table,
    );
    const rowsWithAlbums = rows.filter((row) => {
      return (
        row.querySelector(mosaicAlbumLinkSelector) &&
        row.querySelector("span.catalog")
      );
    });
    if (rowsWithAlbums.length >= 2) {
      return true;
    }
    if (rowsWithAlbums.length === 1) {
      const hasHeader = rows.some((row) => row.querySelector("td.thead, th"));
      return Boolean(hasHeader || table.classList.contains("results"));
    }
    return false;
  };

  /** Locate the root container for album infobit lists. */
  const mosaicFindAlbumInfobitRoot = (link) => {
    const infobit = link.closest(".album_infobit_small");
    if (!infobit) {
      return null;
    }
    const root = mosaicFindAncestor(infobit.parentElement, (node) => {
      const childInfobits = Array.from(node.children).filter((child) =>
        child.classList?.contains("album_infobit_small"),
      );
      return childInfobits.length >= 2;
    });
    return root || infobit.parentElement || infobit;
  };

  /** Determine if a node looks like a simple album item. */
  const mosaicIsSimpleAlbumItem = (node) =>
    node.matches("div.smallfont") &&
    node.querySelector(mosaicAlbumLinkSelector) &&
    node.querySelector("span.catalog");

  /** Locate the root container for simple album lists. */
  const mosaicFindSimpleListRoot = (link) => {
    const item = link.closest("div.smallfont");
    if (!item || !item.querySelector("span.catalog")) {
      return null;
    }
    const root = mosaicFindAncestor(item.parentElement, (node) => {
      const childItems = Array.from(node.children).filter((child) =>
        mosaicIsSimpleAlbumItem(child),
      );
      return childItems.length >= 2;
    });
    return root || item.parentElement || item;
  };

  /** Locate the list root for a given album link. */
  const mosaicFindListRoot = (link) => {
    const infobitRoot = mosaicFindAlbumInfobitRoot(link);
    if (infobitRoot) {
      return infobitRoot;
    }

    const simpleRoot = mosaicFindSimpleListRoot(link);
    if (simpleRoot) {
      return simpleRoot;
    }

    const table = link.closest("table");
    if (table && mosaicIsAlbumListTable(table)) {
      return table;
    }

    const fallback = mosaicFindAncestor(link.parentElement, (node) =>
      mosaicGetAlbumLinkCount(node) >= 2 && node.querySelector("span.catalog"),
    );
    if (fallback) {
      return fallback;
    }

    return mosaicFindAncestor(link.parentElement, (node) =>
      node.querySelector("span.catalog"),
    );
  };

  /** Find a catalog span associated with an album link. */
  const mosaicFindCatalogSpan = (link, listRoot) => {
    const container = mosaicFindAncestor(
      link.parentElement,
      (node) => {
        if (node === listRoot) {
          return false;
        }
        return (
          node.querySelector("span.catalog") &&
          mosaicGetAlbumLinkCount(node) === 1
        );
      },
      listRoot,
    );
    if (container) {
      return container.querySelector("span.catalog");
    }

    const row = link.closest("tr");
    if (row && row.querySelectorAll(mosaicAlbumLinkSelector).length === 1) {
      return row.querySelector("span.catalog");
    }

    return null;
  };

  /** Normalize whitespace in a label. */
  const mosaicNormalizeText = (value) =>
    (value || "").replace(/\s+/g, " ").trim();

  /** Normalize release-date text to the plain date only. */
  const mosaicNormalizeReleaseDateText = (value) =>
    mosaicNormalizeText(value).replace(/^View albums released on\s+/i, "");

  /** Determine if text looks like an English month date. */
  const mosaicLooksLikeDate = (text) =>
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}/i.test(
      text,
    );

  /** Extract date and event data for an album entry. */
  const mosaicExtractDateEvent = (link, listRoot) => {
    const result = {
      dateText: "",
      dateUrl: "",
      eventText: "",
      eventUrl: "",
    };

    const infobit = link.closest(".album_infobit_small");
    if (infobit) {
      const eventLink = infobit.querySelector("a.link_event");
      if (eventLink) {
        result.eventText = mosaicNormalizeText(eventLink.textContent);
        result.eventUrl = eventLink.href || "";
      }

      const timeSpan = infobit.querySelector("span.time");
      if (timeSpan) {
        result.dateText = mosaicNormalizeText(timeSpan.textContent);
        const dateAnchor = timeSpan.querySelector("a");
        result.dateUrl = dateAnchor?.href || "";
      }

      if (!result.dateText) {
        const detailItems = Array.from(
          infobit.querySelectorAll(".album_infobit_detail li"),
        );
        const dateItem = detailItems.find((li) =>
          mosaicLooksLikeDate(li.textContent || ""),
        );
        if (dateItem) {
          result.dateText = mosaicNormalizeText(dateItem.textContent);
        }
      }

      return result;
    }

    const row = link.closest("tr");
    if (row && (!listRoot || listRoot.contains(row))) {
      const eventLink = row.querySelector("a.link_event");
      if (eventLink) {
        result.eventText = mosaicNormalizeText(eventLink.textContent);
        result.eventUrl = eventLink.href || "";
      }

      const timeSpan = row.querySelector("span.time");
      if (timeSpan) {
        result.dateText = mosaicNormalizeText(timeSpan.textContent);
        const dateAnchor = timeSpan.querySelector("a");
        result.dateUrl = dateAnchor?.href || "";
      }
    }

    return result;
  };

  /** Inject mosaic styles once. */
  const mosaicApplyStyles = () =>
    GM_addStyle(`
.vgmdb-mosaic-controls {
  margin: 6px 0 10px;
  display: flex;
  gap: 8px;
  align-items: center;
}
.vgmdb-mosaic-grid {
  display: none;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
  padding: 4px 0 12px;
  align-items: start;
}
.vgmdb-mosaic-container.vgmdb-mosaic-covers-only .vgmdb-mosaic-grid {
  grid-template-columns: repeat(auto-fill, minmax(78px, 78px));
  gap: 10px;
}
.vgmdb-mosaic-item {
  width: 100%;
  background-color: #2F364F;
}
.vgmdb-mosaic-container.vgmdb-mosaic-covers-only .vgmdb-mosaic-item {
  width: 78px;
  box-sizing: border-box;
}
.vgmdb-mosaic-container.vgmdb-mosaic-covers-only .album_infobit_detail {
  display: none;
}
.vgmdb-mosaic-container.vgmdb-mosaic-covers-only .album_infobit_thumb,
.vgmdb-mosaic-container.vgmdb-mosaic-covers-only .vgmdb-mosaic-thumb {
  width: 60px;
  margin-left: auto;
  margin-right: auto;
}
.vgmdb-mosaic-thumb-inner {
  background-color: #001122;
  background-repeat: no-repeat;
  background-position: center center;
  background-size: cover;
  height: 60px;
  width: 60px;
}
.vgmdb-mosaic-thumb-inner.vgmdb-mosaic-missing {
  background-image: none;
}
.vgmdb-mosaic-status {
  font-size: 7pt;
  color: #95a3c3;
}
.vgmdb-mosaic-date,
.vgmdb-mosaic-date a {
  color: #788990;
}
.vgmdb-mosaic-date {
  /* spacing handled by a single text node to avoid double gaps */
}
.vgmdb-mosaic-event {
  vertical-align: middle;
}
.vgmdb-mosaic-event img {
  vertical-align: middle;
  height: 10px;
  width: auto;
  margin-right: 3px;
}
    `);

  /** Show or hide all mosaic containers. */
  const mosaicUpdateContainerVisibility = (show) => {
    for (const container of mosaicContainers) {
      container.style.display = show ? "" : "none";
    }
  };

  /** Determine whether only covers should be shown. */
  const mosaicIsCoversOnly = (mosaicConfig) =>
    !mosaicConfig.showTitle &&
    !mosaicConfig.showCatalog &&
    !mosaicConfig.showDate &&
    !mosaicConfig.showEvent;

  /** Show or hide supported fields on all mosaic items. */
  const mosaicUpdateItemVisibility = (mosaicConfig) => {
    const coversOnly = mosaicIsCoversOnly(mosaicConfig);
    for (const container of mosaicContainers) {
      container.classList.toggle("vgmdb-mosaic-covers-only", coversOnly);
      const items = container.mosaicItems || [];
      for (const item of items) {
        if (item.title) {
          item.title.hidden = !mosaicConfig.showTitle;
        }
        if (item.catalog) {
          item.catalog.hidden = !mosaicConfig.showCatalog;
        }
        if (item.dateSpan) {
          item.dateSpan.hidden = !mosaicConfig.showDate || !item.dateSpan.textContent.trim();
        }
        if (item.eventWrapper) {
          item.eventWrapper.hidden = !mosaicConfig.showEvent || !item.eventWrapper.textContent.trim();
        }
      }
    }
  };

  /** Extract the first URL from a background-image string. */
  const mosaicExtractBackgroundUrl = (value) => {
    if (!value) {
      return null;
    }
    const match = /url\(["']?([^"')]+)["']?\)/i.exec(value);
    return match ? match[1] : null;
  };

  /** Normalize a cover URL to the thumb host, if possible. */
  const mosaicNormalizeThumbUrl = (url) => {
    if (!url) {
      return null;
    }
    let absoluteUrl;
    try {
      absoluteUrl = new URL(url, location.origin);
    } catch (error) {
      return null;
    }
    if (absoluteUrl.pathname.includes("/db/img/album-nocover")) {
      return null;
    }
    if (
      absoluteUrl.hostname === "medium-media.vgm.io" ||
      absoluteUrl.hostname === "media.vgm.io"
    ) {
      absoluteUrl.hostname = "thumb-media.vgm.io";
    }
    return absoluteUrl.toString();
  };

  /** Extract any cover image URL from HTML. */
  const mosaicExtractAnyCoverUrl = (html) => {
    const match = html.match(
      /https?:\/\/(?:thumb-media|medium-media|media)\.vgm\.io\/albums\/[^"')\s]+/i,
    );
    return match ? match[0] : null;
  };

  /** Parse album HTML and try several sources for the cover URL. */
  const mosaicExtractCoverUrl = (html) => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const cover = doc.querySelector("#coverart");
    const candidates = [];

    if (cover) {
      const styleText = cover.getAttribute("style") || "";
      const background = cover.style.backgroundImage || styleText;
      candidates.push(mosaicExtractBackgroundUrl(background));
    }

    const meta = doc.querySelector(
      'meta[property="og:image"], meta[name="twitter:image"]',
    );
    if (meta) {
      candidates.push(meta.getAttribute("content"));
    }

    const fallbackMatch =
      /id=["']coverart["'][^>]*style=["'][^"']*url\(["']?([^"')]+)["']?\)/i.exec(
        html,
      );
    if (fallbackMatch) {
      candidates.push(fallbackMatch[1]);
    }

    candidates.push(mosaicExtractAnyCoverUrl(html));

    for (const candidate of candidates) {
      const normalized = mosaicNormalizeThumbUrl(candidate);
      if (normalized) {
        return normalized;
      }
    }

    return null;
  };

  /** Parse the album release date from the album info table. */
  const mosaicExtractReleaseDate = (html) => {
    if (!html) {
      return null;
    }

    const doc = new DOMParser().parseFromString(html, "text/html");
    const rows = Array.from(doc.querySelectorAll("#album_infobit_large tr"));
    const row = rows.find((candidate) => {
      const label = candidate.querySelector("td span.label b");
      return mosaicNormalizeText(label?.textContent) === "Release Date";
    });
    if (!row) {
      return null;
    }

    const valueCell = row.querySelectorAll("td")[1];
    if (!valueCell) {
      return null;
    }

    const dateAnchor = valueCell.querySelector("a");
    const dateText = mosaicNormalizeReleaseDateText(
      dateAnchor?.getAttribute("data-vcs-original-text") ||
        dateAnchor?.title ||
        dateAnchor?.textContent ||
        valueCell.textContent,
    );
    const eventLink = valueCell.querySelector("a.link_event");
    const eventText = eventLink ? mosaicNormalizeText(eventLink.textContent) : "";
    const eventUrl = eventLink ? eventLink.href || "" : "";
    return {
      dateText,
      dateUrl: dateAnchor?.href || "",
      eventText,
      eventUrl,
    };
  };

  /** Reuse list thumbnails when available. */
  const mosaicGetThumbUrlFromList = (link) => {
    const infobit = link.closest(".album_infobit_small");
    if (!infobit) {
      return null;
    }
    const thumbContainer = infobit.querySelector(".album_infobit_thumb > div");
    if (!thumbContainer) {
      return null;
    }
    const styleText =
      thumbContainer.getAttribute("style") ||
      thumbContainer.style.backgroundImage ||
      "";
    return mosaicNormalizeThumbUrl(mosaicExtractBackgroundUrl(styleText));
  };

  /** Force album URLs to HTTPS. */
  const mosaicNormalizeAlbumUrl = (albumUrl) => {
    try {
      const url = new URL(albumUrl, location.origin);
      url.protocol = "https:";
      return url.toString();
    } catch (error) {
      return albumUrl;
    }
  };

  /** Resolve after a delay. */
  const mosaicDelay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /** Fetch raw album HTML via GM_xmlhttpRequest. */
  const mosaicRequestAlbumHtml = (albumUrl) =>
    new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: albumUrl,
        onload: (response) => resolve(response.responseText || ""),
        onerror: () => resolve(""),
      });
    });

  /** Fetch and extract the cover URL with retries. */
  const mosaicFetchCoverUrl = async (albumUrl, mosaicConfig) => {
    const normalizedUrl = mosaicNormalizeAlbumUrl(albumUrl);
    let releaseDate = null;
    for (
      let attempt = 0;
      attempt <= mosaicConfig.maxCoverFetchRetries;
      attempt += 1
    ) {
      const html = await mosaicRequestAlbumHtml(normalizedUrl);
      releaseDate = html ? mosaicExtractReleaseDate(html) : releaseDate;
      const coverUrl = html ? mosaicExtractCoverUrl(html) : null;
      if (coverUrl) {
        console.log("fetched url (thumbail url)", coverUrl);
        return {
          coverUrl,
          releaseDateText: releaseDate?.dateText || "",
          releaseDateUrl: releaseDate?.dateUrl || "",
          eventText: releaseDate?.eventText || "",
          eventUrl: releaseDate?.eventUrl || "",
        };
      }
      if (attempt < mosaicConfig.maxCoverFetchRetries) {
        await mosaicDelay(mosaicConfig.retryDelayMs);
      }
    }
    return {
      coverUrl: null,
      releaseDateText: releaseDate?.dateText || "",
      releaseDateUrl: releaseDate?.dateUrl || "",
      eventText: releaseDate?.eventText || "",
      eventUrl: releaseDate?.eventUrl || "",
    };
  };

  /** Ensure a mosaic item has a cover image (or is marked missing). */
  const mosaicEnsureCover = async (item, mosaicConfig) => {
    if (
      item.thumb.dataset.loaded === "1" ||
      item.thumb.dataset.loading === "1"
    ) {
      return;
    }
    item.thumb.dataset.loading = "1";

    const coverResult = await mosaicFetchCoverUrl(item.url, mosaicConfig);
    delete item.thumb.dataset.loading;

    if (coverResult.releaseDateText) {
      mosaicUpdateDate(
        item,
        coverResult.releaseDateText,
        coverResult.releaseDateUrl,
        mosaicConfig,
      );
    }
    if (coverResult.eventText) {
      mosaicUpdateEvent(
        item,
        coverResult.eventText,
        coverResult.eventUrl,
        mosaicConfig,
      );
    }

    if (coverResult.coverUrl) {
      item.thumb.style.backgroundImage = `url("${coverResult.coverUrl}")`;
      item.thumb.dataset.loaded = "1";
      item.status.textContent = "";
      return;
    }

    const failed = Number(item.thumb.dataset.failed || "0") + 1;
    item.thumb.dataset.failed = String(failed);
    if (failed >= 2) {
      item.thumb.dataset.loaded = "1";
      item.thumb.classList.add("vgmdb-mosaic-missing");
      item.status.textContent = "";
    }
  };

  /** Run a queue of cover loads with limited concurrency. */
  const mosaicRunQueue = async (queue, concurrency, mosaicConfig) => {
    let cursor = 0;
    const workerCount = Math.max(1, Math.min(concurrency, queue.length));
    const worker = async () => {
      while (cursor < queue.length) {
        const current = queue[cursor];
        cursor += 1;
        await mosaicEnsureCover(current, mosaicConfig);
      }
    };
    await Promise.all(Array.from({ length: workerCount }, worker));
  };

  /** Load all covers with retries and status updates. */
  const mosaicLoadAllCoversWithLimit = async (items, mosaicConfig) => {
    const pendingItems = items.filter(
      (item) => item.thumb.dataset.loaded !== "1",
    );
    if (pendingItems.length === 0) {
      return;
    }

    for (const item of pendingItems) {
      item.status.textContent = "Requested";
    }

    await mosaicRunQueue(
      pendingItems,
      mosaicConfig.maxConcurrentRequests,
      mosaicConfig,
    );

    const retryItems = items.filter((item) => {
      const failed = Number(item.thumb.dataset.failed || "0");
      return item.thumb.dataset.loaded !== "1" && failed < 2;
    });
    if (retryItems.length === 0) {
      return;
    }

    for (const item of retryItems) {
      item.status.textContent = "Retrying";
    }
    await mosaicDelay(mosaicConfig.retryDelayMs);
    await mosaicRunQueue(retryItems, 1, mosaicConfig);
  };

  /** Build album metadata for a list entry. */
  const mosaicBuildAlbumData = (link, listRoot) => {
    const href = link.getAttribute("href");
    if (!href) {
      return null;
    }
    const albumUrl = new URL(href, location.origin).toString();
    const inlineTitle = link.querySelector(
      'span.albumtitle[style*="display:inline"]',
    );
    const rawTitle =
      (
        inlineTitle?.textContent ||
        link.getAttribute("title") ||
        link.textContent ||
        "Album"
      ).trim() || "Album";
    const cleanedTitle = rawTitle.replace(/^\s*\/\s*/, "");
    const title = cleanedTitle || rawTitle;
    const catalogSpan = mosaicFindCatalogSpan(link, listRoot);
    const catalogText = catalogSpan ? catalogSpan.textContent.trim() : "";
    const catalogClass = catalogSpan ? catalogSpan.className : "";
    const titleClass = link.className || "";
    const { dateText, dateUrl, eventText, eventUrl } =
      mosaicExtractDateEvent(link, listRoot);
    return {
      url: albumUrl,
      title,
      titleClass,
      catalogText,
      catalogClass,
      dateText,
      dateUrl,
      eventText,
      eventUrl,
      sourceTitleNode: inlineTitle || link,
      listThumbUrl: mosaicGetThumbUrlFromList(link),
    };
  };

  /** Update the visible date line for a mosaic item. */
  const mosaicUpdateDate = (item, dateText, dateUrl, mosaicConfig) => {
    if (!item.dateSpan || !dateText) {
      return;
    }

    item.dateSpan.textContent = dateText;
    item.dateSpan.hidden = !mosaicConfig.showDate;
  };

  /** Update the inline event for a mosaic item. */
  const mosaicUpdateEvent = (item, eventText, eventUrl, mosaicConfig) => {
    if (!item.eventWrapper || !item.eventLabel) {
      return;
    }

    if (!eventText) {
      item.eventWrapper.hidden = true;
      return;
    }

    // ensure wrapper visible
    item.eventWrapper.hidden = !mosaicConfig.showEvent;

    // find existing anchor wrapper if any
    const existingAnchor = item.eventWrapper.querySelector("a.link_event");
    let targetAnchor = existingAnchor;
    if (eventUrl) {
      if (!existingAnchor) {
        // create anchor and move label into it
        targetAnchor = document.createElement("a");
        targetAnchor.className = "link_event";
        targetAnchor.rel = "nofollow";
        item.eventWrapper.appendChild(targetAnchor);
        targetAnchor.appendChild(item.eventLabel);
      } else {
        // ensure label is inside anchor
        if (existingAnchor !== item.eventLabel.parentElement) {
          existingAnchor.appendChild(item.eventLabel);
        }
      }
      targetAnchor.href = eventUrl;
    } else if (existingAnchor) {
      // unwrap label from anchor
      item.eventWrapper.appendChild(item.eventLabel);
      existingAnchor.remove();
    }

    // update label text (keep icon)
    // remove any text nodes after the icon
    const img = item.eventIcon;
    // clear label then re-append img + text
    item.eventLabel.textContent = "";
    item.eventLabel.appendChild(img);
    item.eventLabel.appendChild(document.createTextNode(" " + eventText));

    item.eventWrapper.hidden = !mosaicConfig.showEvent;
  };

  /** Build and insert mosaic UI for a list root. */
  const mosaicBuildMosaicForList = (listRoot, listLinks, mosaicConfig) => {
    if (
      listRoot.previousElementSibling?.classList?.contains(
        "vgmdb-mosaic-container",
      )
    ) {
      return;
    }
    const container = listRoot.parentElement;
    if (!container) {
      return;
    }

    const uniqueAlbums = new Map();
    for (const link of listLinks) {
      const album = mosaicBuildAlbumData(link, listRoot);
      if (!album || uniqueAlbums.has(album.url)) {
        continue;
      }
      uniqueAlbums.set(album.url, album);
    }

    if (uniqueAlbums.size === 0) {
      return;
    }

    const mosaicContainer = document.createElement("div");
    mosaicContainer.className = "vgmdb-mosaic-container";
    container.insertBefore(mosaicContainer, listRoot);
    mosaicContainers.add(mosaicContainer);
    mosaicUpdateContainerVisibility(mosaicConfig.showContainer);

    const controls = document.createElement("div");
    controls.className = "vgmdb-mosaic-controls";

    const toggleButton = document.createElement("input");
    toggleButton.type = "button";
    toggleButton.className = "button";
    toggleButton.value = "Show mosaic";

    controls.appendChild(toggleButton);
    mosaicContainer.appendChild(controls);

    const mosaicGrid = document.createElement("div");
    mosaicGrid.className = "vgmdb-mosaic-grid";
    mosaicContainer.appendChild(mosaicGrid);

    const items = [];
    for (const album of uniqueAlbums.values()) {
      const item = document.createElement("div");
      item.className = "album_infobit_small smallfont label vgmdb-mosaic-item";

      const thumbWrap = document.createElement("div");
      thumbWrap.className = "album_infobit_thumb vgmdb-mosaic-thumb";

      const thumb = document.createElement("div");
      thumb.className = "vgmdb-mosaic-thumb-inner";

      const thumbLink = document.createElement("a");
      thumbLink.href = album.url;
      thumbLink.title = album.title;

      thumb.appendChild(thumbLink);
      thumbWrap.appendChild(thumb);

      const details = document.createElement("ul");
      details.className = "album_infobit_detail";

      const titleRow = document.createElement("li");
      const label = document.createElement("a");
      const titleClasses = new Set(
        (album.titleClass || "").split(/\s+/).filter(Boolean),
      );
      titleClasses.add("albumtitle");
      titleClasses.add("smallfont");
      titleClasses.add("vgmdb-mosaic-title");
      label.className = Array.from(titleClasses).join(" ");
      label.href = album.url;
      label.title = album.title;
      label.textContent = album.title;
      titleRow.appendChild(label);

      if (album.catalogText && album.catalogText !== "N/A") {
        const catalog = document.createElement("span");
        const catalogClasses = new Set(
          (album.catalogClass || "").split(/\s+/).filter(Boolean),
        );
        catalogClasses.add("catalog");
        catalogClasses.add("smallfont");
        catalogClasses.add("vgmdb-mosaic-catalog");
        catalog.className = Array.from(catalogClasses).join(" ");
        catalog.textContent = album.catalogText;
        titleRow.appendChild(document.createTextNode(" "));
        titleRow.appendChild(catalog);
        catalog.hidden = false;
      }

      // Title + catalog (and inline date will follow if present)
      details.appendChild(titleRow);

      // event will be rendered inline after date (see below)
      // Inline date span appended to the title row so it follows catalog
      const inlineDateSpan = document.createElement("span");
      inlineDateSpan.className = "time vgmdb-mosaic-date";
      inlineDateSpan.hidden = !album.dateText;
      if (album.dateText) inlineDateSpan.textContent = album.dateText;
      // insert a single separating space if the title row doesn't already end with whitespace
      const last = titleRow.lastChild;
      if (!last || last.nodeType !== Node.TEXT_NODE || !/\s$/.test(last.textContent)) {
        titleRow.appendChild(document.createTextNode(" "));
      }
      titleRow.appendChild(inlineDateSpan);

      // If there's an event, add it inline after the date using an anchor.link_event
      // create an inline event placeholder (may be filled from list or album page)
      const eventWrapper = document.createElement("span");
      eventWrapper.className = "vgmdb-mosaic-event";
      eventWrapper.hidden = !album.eventText;

      const innerLabel = document.createElement("span");
      innerLabel.className = "label";

      const eventIcon = document.createElement("img");
      eventIcon.src = "/db/icons/event_first_release.png";
      eventIcon.alt = "";
      innerLabel.appendChild(eventIcon);
      if (album.eventText) innerLabel.appendChild(document.createTextNode(" " + album.eventText));

      // if the list provided a URL, wrap the label in an anchor
      if (album.eventUrl) {
        const a = document.createElement("a");
        a.className = "link_event";
        a.href = album.eventUrl;
        a.rel = "nofollow";
        a.appendChild(innerLabel);
        eventWrapper.appendChild(a);
      } else {
        eventWrapper.appendChild(innerLabel);
      }

      titleRow.appendChild(eventWrapper);

      const status = document.createElement("li");
      status.className = "vgmdb-mosaic-status";
      details.appendChild(status);

      item.appendChild(thumbWrap);
      item.appendChild(details);
      mosaicGrid.appendChild(item);

      if (album.listThumbUrl) {
        thumb.style.backgroundImage = `url("${album.listThumbUrl}")`;
        thumb.dataset.loaded = "1";
      }

      const itemData = {
        thumb,
        url: album.url,
        status,
        title: label,
        catalog: titleRow.querySelector(".vgmdb-mosaic-catalog"),
        dateLine: details.querySelector(".vgmdb-mosaic-date")?.parentElement,
        dateSpan: titleRow.querySelector(".vgmdb-mosaic-date"),
        sourceTitleNode: album.sourceTitleNode,
        eventWrapper,
        eventLabel: innerLabel,
        eventIcon,
      };
      items.push(itemData);

      if (album.dateText) {
        mosaicUpdateDate(itemData, album.dateText, album.dateUrl, mosaicConfig);
      }
    }

    mosaicContainer.mosaicItems = items;
    mosaicUpdateItemVisibility(mosaicConfig);

    toggleButton.addEventListener("click", () => {
      console.log("mosaic view requested");
      mosaicGrid.style.display = "grid";
      toggleButton.style.display = "none";
      void mosaicLoadAllCoversWithLimit(items, mosaicConfig);
    });
  };

  /*********************************************
   * Main setup
   ********************************************/
  /** Setup mosaic feature UI on album lists. */
  const mosaicSetupFeatures = (mosaicConfig) => {
    const mosaicAlbumLinks = Array.from(
      document.querySelectorAll(mosaicAlbumLinkSelector),
    );
    if (mosaicAlbumLinks.length === 0) {
      return;
    }

    const mosaicListGroups = new Map();
    for (const link of mosaicAlbumLinks) {
      const root = mosaicFindListRoot(link);
      if (!root) {
        continue;
      }
      if (!mosaicListGroups.has(root)) {
        mosaicListGroups.set(root, new Set());
      }
      mosaicListGroups.get(root).add(link);
    }

    if (mosaicListGroups.size === 0) {
      return;
    }

    mosaicApplyStyles();

    for (const [root, links] of mosaicListGroups.entries()) {
      mosaicBuildMosaicForList(root, Array.from(links), mosaicConfig);
    }
  };

  /*********************************************
   * Custom settings setup
   ********************************************/
  /** Setup custom settings and return the resolved config. */
  const mosaicSetupSettings = () => {
    const mosaicConfig = {
      maxConcurrentRequests: mosaicMaxConcurrentRequests,
      maxCoverFetchRetries: mosaicMaxCoverFetchRetries,
      retryDelayMs: mosaicRetryDelayMs,
      showContainer: mosaicDefaultShowContainer,
      showTitle: mosaicDefaultVisibility.title,
      showCatalog: mosaicDefaultVisibility.catalog,
      showDate: mosaicDefaultVisibility.date,
      showEvent: mosaicDefaultVisibility.event,
    };

    if (
      !window.VGMdbCustomSettings ||
      typeof window.VGMdbCustomSettings.createManager !== "function"
    ) {
      return mosaicConfig;
    }

    const mosaicManager = window.VGMdbCustomSettings.createManager({
      storageKey: mosaicSettingsStorageKey,
      containerId: mosaicSettingsContainerId,
      config: {
        [mosaicSettingsCategoryLabel]: [
          {
            type: "checkbox",
            id: "mosaicShowContainer",
            label: "Show mosaic container",
            default: mosaicDefaultShowContainer,
            onChange: (value) => {
              mosaicConfig.showContainer = Boolean(value);
              mosaicUpdateContainerVisibility(mosaicConfig.showContainer);
            },
          },
          {
            type: "checkbox",
            id: "mosaicShowTitle",
            label: "Show title",
            default: mosaicDefaultVisibility.title,
            onChange: (value) => {
              mosaicConfig.showTitle = Boolean(value);
              mosaicUpdateItemVisibility(mosaicConfig);
            },
          },
          {
            type: "checkbox",
            id: "mosaicShowCatalog",
            label: "Show catalog number",
            default: mosaicDefaultVisibility.catalog,
            onChange: (value) => {
              mosaicConfig.showCatalog = Boolean(value);
              mosaicUpdateItemVisibility(mosaicConfig);
            },
          },
          {
            type: "checkbox",
            id: "mosaicShowDate",
            label: "Show date",
            default: mosaicDefaultVisibility.date,
            onChange: (value) => {
              mosaicConfig.showDate = Boolean(value);
              mosaicUpdateItemVisibility(mosaicConfig);
            },
          },
          {
            type: "checkbox",
            id: "mosaicShowEvent",
            label: "Show event",
            default: mosaicDefaultVisibility.event,
            onChange: (value) => {
              mosaicConfig.showEvent = Boolean(value);
              mosaicUpdateItemVisibility(mosaicConfig);
            },
          },
        ],
      },
    });

    mosaicManager.mount();
    mosaicConfig.showContainer = Boolean(
      mosaicManager.getSetting("mosaicShowContainer", mosaicConfig.showContainer),
    );
    mosaicConfig.showTitle = Boolean(
      mosaicManager.getSetting("mosaicShowTitle", mosaicConfig.showTitle),
    );
    mosaicConfig.showCatalog = Boolean(
      mosaicManager.getSetting("mosaicShowCatalog", mosaicConfig.showCatalog),
    );
    mosaicConfig.showDate = Boolean(
      mosaicManager.getSetting("mosaicShowDate", mosaicConfig.showDate),
    );
    mosaicConfig.showEvent = Boolean(
      mosaicManager.getSetting("mosaicShowEvent", mosaicConfig.showEvent),
    );

    return mosaicConfig;
  };

  /*********************************************
   * Call setups
   ********************************************/
  const mosaicConfig = mosaicSetupSettings();
  mosaicSetupFeatures(mosaicConfig);
})();
