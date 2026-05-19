// ==UserScript==
// @name        VGMdb mosaic album list
// @namespace   Violentmonkey Scripts
// @match       https://vgmdb.net/*
// @require     https://raw.githubusercontent.com/kahpaibe/userscripts/refs/heads/main/components/VGMdb%20Custom%20Settings.js
// @grant       GM_addStyle
// @grant       GM_xmlhttpRequest
// @version     0.4
// @author      kahpaibe
// @description Add a mosaic view for all album lists on VGMdb.
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
  const mosaicIsSimpleAlbumItem = (node) => {
    return (
      node.matches("div.smallfont") &&
      node.querySelector(mosaicAlbumLinkSelector) &&
      node.querySelector("span.catalog")
    );
  };

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

    const fallback = mosaicFindAncestor(link.parentElement, (node) => {
      return (
        mosaicGetAlbumLinkCount(node) >= 2 && node.querySelector("span.catalog")
      );
    });
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
	grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
	gap: 12px;
	padding: 4px 0 12px;
}
.vgmdb-mosaic-item {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 6px;
	background: #2F364F;
	border: 1px solid #1B273D;
	border-radius: 6px;
	padding: 8px 6px;
	text-decoration: none;
	text-align: center;
}
.vgmdb-mosaic-thumb {
	background-color: #001122;
	background-repeat: no-repeat;
	background-position: center center;
	border: solid 1px #40557E;
	height: 60px;
	width: 60px;
}
.vgmdb-mosaic-thumb.vgmdb-mosaic-missing {
	background-image: none;
}
.vgmdb-mosaic-meta {
	display: flex;
	flex-direction: column;
	gap: 2px;
	align-items: center;
}
.vgmdb-mosaic-title {
	display: block;
	font-size: 9pt;
	line-height: 1.2;
}
.vgmdb-mosaic-catalog {
	display: block;
	font-size: 8pt;
}
.vgmdb-mosaic-status {
	display: block;
	font-size: 7pt;
	color: #95a3c3;
	text-transform: uppercase;
	letter-spacing: 0.2px;
}
	`);

  /** Show or hide all mosaic containers. */
  const mosaicUpdateContainerVisibility = (show) => {
    for (const container of mosaicContainers) {
      container.style.display = show ? "" : "none";
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
  const mosaicRequestAlbumHtml = (albumUrl) => {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: albumUrl,
        onload: (response) => resolve(response.responseText || ""),
        onerror: () => resolve(""),
      });
    });
  };

  /** Fetch and extract the cover URL with retries. */
  const mosaicFetchCoverUrl = async (albumUrl, mosaicConfig) => {
    const normalizedUrl = mosaicNormalizeAlbumUrl(albumUrl);
    for (
      let attempt = 0;
      attempt <= mosaicConfig.maxCoverFetchRetries;
      attempt += 1
    ) {
      const html = await mosaicRequestAlbumHtml(normalizedUrl);
      const coverUrl = html ? mosaicExtractCoverUrl(html) : null;
      if (coverUrl) {
        console.log("fetched url (thumbail url)", coverUrl);
        return coverUrl;
      }
      if (attempt < mosaicConfig.maxCoverFetchRetries) {
        await mosaicDelay(mosaicConfig.retryDelayMs);
      }
    }
    return null;
  };

  /** Apply the album title color from the source list. */
  const mosaicApplyTitleColor = (item) => {
    if (!item.label || item.label.dataset.colorApplied === "1") {
      return;
    }
    const sourceNode = item.sourceTitleNode;
    if (sourceNode && sourceNode.isConnected) {
      const color = getComputedStyle(sourceNode).color;
      if (color) {
        item.label.style.color = color;
      }
    }
    item.label.dataset.colorApplied = "1";
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

    const coverUrl = await mosaicFetchCoverUrl(item.url, mosaicConfig);
    delete item.thumb.dataset.loading;
    mosaicApplyTitleColor(item);

    if (coverUrl) {
      item.thumb.style.backgroundImage = `url("${coverUrl}")`;
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
    return {
      url: albumUrl,
      title,
      titleClass,
      catalogText,
      catalogClass,
      sourceTitleNode: inlineTitle || link,
      listThumbUrl: mosaicGetThumbUrlFromList(link),
    };
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
      const item = document.createElement("a");
      item.className = "vgmdb-mosaic-item";
      item.href = album.url;
      item.title = album.title;

      const thumb = document.createElement("div");
      thumb.className = "vgmdb-mosaic-thumb";

      const meta = document.createElement("div");
      meta.className = "vgmdb-mosaic-meta";

      const label = document.createElement("span");
      label.className = album.titleClass
        ? `${album.titleClass} vgmdb-mosaic-title`
        : "vgmdb-mosaic-title";
      label.textContent = album.title;
      meta.appendChild(label);

      if (album.catalogText && album.catalogText !== "N/A") {
        const catalog = document.createElement("span");
        catalog.className = album.catalogClass
          ? `${album.catalogClass} vgmdb-mosaic-catalog`
          : "vgmdb-mosaic-catalog";
        catalog.textContent = album.catalogText;
        meta.appendChild(catalog);
      }

      const status = document.createElement("span");
      status.className = "vgmdb-mosaic-status";
      meta.appendChild(status);

      item.appendChild(thumb);
      item.appendChild(meta);
      mosaicGrid.appendChild(item);

      if (album.listThumbUrl) {
        thumb.style.backgroundImage = `url("${album.listThumbUrl}")`;
        thumb.dataset.loaded = "1";
      }

      const itemData = {
        thumb,
        url: album.url,
        status,
        label,
        sourceTitleNode: album.sourceTitleNode,
      };
      items.push(itemData);
      mosaicApplyTitleColor(itemData);
    }

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
        ],
      },
    });

    mosaicManager.mount();
    mosaicConfig.showContainer = Boolean(
      mosaicManager.getSetting(
        "mosaicShowContainer",
        mosaicConfig.showContainer,
      ),
    );

    return mosaicConfig;
  };

  /*********************************************
   * Call setups
   ********************************************/
  const mosaicConfig = mosaicSetupSettings();
  mosaicSetupFeatures(mosaicConfig);
})();
