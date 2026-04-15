// ==UserScript==
// @name         VGMdb album formatted info copy
// @namespace    https://vgmdb.net/
// @version      0.9
// @description  Copy album metadata as a formatted string.
// @author       kahpaibe
// @match        https://vgmdb.net/album/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  // Global button settings
  const albummetadataButtonSettings = [
    // {title: "...", tooltip: "...", formatFunction: (url, coverurl, titles, notes, links, albuminfo, credits, tracklists) => {...}, [color: "..."]}
    {
      title: "Copy short format",
      tooltip: "Copy album info to clipboard (DC format)",
      formatFunction: (
        url,
        coverurl,
        titles,
        notes,
        links,
        albuminfo,
        credits,
        tracklists,
      ) => {
        let result = "";
        let title_list = [];
        let artist = null;

        ["Publisher", "Label", "Distributor"].forEach((role_guess) => {
          // Role priority
          if (albuminfo && albuminfo[role_guess]) {
            artist = albuminfo[role_guess];
            return;
          }
        });

        title_list.push(`[${albuminfo["Release Date"] || "N/A"}]`);
        if (artist) {
          title_list.push(`${artist} —`);
        }
        title_list.push(`${titles.join("/")}`);
        if (
          albuminfo["Catalog Number"] &&
          albuminfo["Catalog Number"] != "N/A"
        ) {
          title_list.push(`\{${albuminfo["Catalog Number"]}\}`);
        }
        result += `${title_list.join(" ")}\n`;
        result += `info: ${url}\n`;
        if (Array.isArray(links) && links.length > 0) {
          result += `links: ${links.join(", ")}\n`;
        }

        return result;
      },
      color: "#FF0000",
    },
    {
      title: "Copy example format",
      tooltip: "Copy album info to clipboard (example format)",
      formatFunction: (
        url,
        coverurl,
        titles,
        notes,
        links,
        albuminfo,
        credits,
        tracklists,
      ) => {
        let result = `url: ${url}\n`;
        result += `coverurl: ${coverurl}\n`;
        result += "\n--- Titles ---\n";
        titles.forEach((title, index) => {
          result += `${index + 1}. ${title}\n`;
        });
        result += "\n--- Notes ---\n";
        result += `${notes}\n`;
        result += "\n--- Links ---\n";
        links.forEach((link, index) => {
          result += `${index + 1}. ${link}\n`;
        });
        result += "\n--- Album info ---\n";
        for (const [key, value] of Object.entries(albuminfo)) {
          result += `${key}: ${value}\n`;
        }
        result += "\n--- Credits ---\n";
        for (const [key, value] of Object.entries(credits)) {
          result += `${key}: ${value}\n`;
        }
        result += "\n--- Tracklists ---\n";
        for (const [language, discs] of Object.entries(tracklists)) {
          result += `\n${language}:\n`;
          discs.forEach((disc, discIndex) => {
            result += `  Disc ${discIndex + 1}:\n`;
            disc.forEach((track, trackIndex) => {
              result += `    ${trackIndex + 1}. ${track.title}`;
              if (track.duration) {
                result += ` (${track.duration})`;
              }
              result += `\n`;
            });
          });
        }
        return result;
      },
    },
  ];

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

  // Global setup function
  function albummetadataSetup() {
    function parseMetadata() {
      // Function to parse all metadata
      let url = window.location.href;
      let coverurl = "";
      let titles = [];
      let notes = "";
      let links = [];
      let albuminfo = {};
      let credits = {};
      let tracklists = {};

      // Retrieve album titles and subtitles
      const mainAlbumSection = document.querySelector("#innermain");
      if (mainAlbumSection) {
        const albumTitleSpans = mainAlbumSection.querySelectorAll(
          'span.albumtitle[style*="display:inline"]',
        );
        const seenTitles = new Set();
        albumTitleSpans.forEach((span) => {
          const html = span.innerHTML;
          const lines = html
            .split("<br>")
            .map((line) => line.trim())
            .filter((line) => line);
          lines.forEach((line) => {
            const titleText = line.replace(/<[^>]*>/g, "");
            if (titleText && !seenTitles.has(titleText)) {
              seenTitles.add(titleText);
              titles.push(titleText);
            }
          });
        });
      }

      // Retrieve notes
      const notesDiv = document.querySelector("#notes");
      if (notesDiv) {
        notes = notesDiv.innerHTML
          .replace(/<br>/g, "\n")
          .replace(/<[^>]*>/g, "")
          .trim();
      }

      // Retrieve official links
      const linkDocs = document.querySelectorAll(
        'span.link_doc a[rel="nofollow"]',
      );
      linkDocs.forEach((linkDoc) => {
        let href = linkDoc.getAttribute("href");
        if (href) {
          href = href.replace(/\/redirect\/\d+\//, "");
          links.push(href);
        }
      });

      // Retrieve cover art URL
      const coverArtDiv = document.querySelector("#coverart");
      if (coverArtDiv) {
        const style = coverArtDiv.getAttribute("style");
        const match = style.match(/url\('(.*?)'\)/);
        if (match && match[1]) {
          coverurl = match[1];
        }
      }

      // Retrieve album infos
      const albumInfoTable = document.querySelector("#album_infobit_large");
      if (albumInfoTable) {
        const rows = albumInfoTable.querySelectorAll("tr");
        rows.forEach((row) => {
          const labelCell = row.querySelector("td:first-child span.label b");
          const valueCell = row.querySelector("td:last-child");

          if (labelCell && valueCell) {
            const fieldName = labelCell.textContent.trim();
            const fieldValue =
              valueCell.textContent.trim() || valueCell.innerText.trim();
            albuminfo[fieldName] = fieldValue;
          }
        });
      }

      // Retrieve credits
      const creditsDiv = document.querySelector("#collapse_credits");
      if (creditsDiv) {
        const creditsTable = creditsDiv.querySelector("table");
        if (creditsTable) {
          const rows = creditsTable.querySelectorAll("tr");
          rows.forEach((row) => {
            const labelCell = row.querySelector("td:first-child span.label b");
            const valueCell = row.querySelector("td:last-child");

            if (labelCell && valueCell) {
              const fieldName = labelCell.textContent.trim();
              const fieldValue =
                valueCell.textContent.trim() || valueCell.innerText.trim();
              credits[fieldName] = fieldValue;
            }
          });
        }
      }

      // Retrieve tracklists
      const tracklistDiv = document.querySelector("#tracklist");
      if (tracklistDiv) {
        const tabNav = document.querySelector("#tlnav");
        if (tabNav) {
          const tabs = tabNav.querySelectorAll("li a");
          tabs.forEach((tab) => {
            const language = tab.textContent.trim();
            const tracklistSpan = document.querySelector(
              `#${tab.getAttribute("rel")}`,
            );
            if (tracklistSpan) {
              const discs = [];
              let currentDisc = [];

              // Find all disc headers and tables
              const discHeaders = tracklistSpan.querySelectorAll(
                'span[style*="font-size:8pt"] b',
              );
              const tables = tracklistSpan.querySelectorAll("table.role");

              // For each disc header, find the corresponding table
              discHeaders.forEach((header, index) => {
                if (index < tables.length) {
                  const table = tables[index];
                  const rows = table.querySelectorAll("tr.rolebit");
                  currentDisc = [];
                  rows.forEach((row) => {
                    const trackNumberCell = row.querySelector(
                      "td:first-child span.label",
                    );
                    const trackTitleCell = row.querySelector("td:nth-child(2)");
                    const trackDurationCell = row.querySelector(
                      "td:last-child span.time",
                    );

                    if (trackTitleCell) {
                      const track = {
                        title:
                          trackTitleCell.textContent.trim() ||
                          trackTitleCell.innerText.trim(),
                        duration: trackDurationCell
                          ? trackDurationCell.textContent.trim()
                          : null,
                      };
                      currentDisc.push(track);
                    }
                  });
                  discs.push(currentDisc);
                }
              });

              tracklists[language] = discs;
            }
          });
        }
      }

      return {
        url,
        coverurl,
        titles,
        notes,
        links,
        albuminfo,
        credits,
        tracklists,
      };
    }

    const discussSpan = document.querySelector('span[style*="float:right;"]');
    if (!discussSpan) return;

    const discussLink = discussSpan.querySelector(
      'a[href*="albums-discuss.php"]',
    );
    if (!discussLink) return;

    // Shared onClick logic for all buttons
    function albummetadataOnClick(button, buttonConfig) {
      const metadata = parseMetadata();
      if (!metadata.albuminfo) {
        alert("Failed to parse albuminfo!");
        return;
      }

      const formattedText = buttonConfig.formatFunction(
        metadata.url,
        metadata.coverurl,
        metadata.titles,
        metadata.notes,
        metadata.links,
        metadata.albuminfo,
        metadata.credits,
        metadata.tracklists,
      );

      navigator.clipboard
        .writeText(formattedText)
        .then(function () {
          button.innerText = `✓ ${buttonConfig.title}`;
          setTimeout(() => (button.innerText = buttonConfig.title), 2000);
        })
        .catch(function (error) {
          alert("Failed to copy to clipboard: " + error);
        });
    }

    // Insert all buttons
    albummetadataButtonSettings.forEach((buttonConfig) => {
      const button = createButton({
        text: buttonConfig.title,
        tooltip: buttonConfig.tooltip,
        onClick: () => albummetadataOnClick(button, buttonConfig),
        color: buttonConfig.color ? buttonConfig.color : "#FFD700",
      });
      discussSpan.insertBefore(button, discussLink);
    });
  }

  // Run the setup function immediately
  albummetadataSetup();
})();
