// ==UserScript==
// @name        VGMdb add album tweaks
// @namespace   Violentmonkey Scripts
// @match       https://vgmdb.net/album/new
// @grant       GM_addStyle
// @grant       GM_xmlhttpRequest
// @require     https://raw.githubusercontent.com/kahpaibe/userscripts/refs/heads/main/components/VGMdb%20Custom%20Settings.js
// @version     1.0
// @author      kahpaibe
// @description Tweaks for VGMdb new album pages: Quick date entry, selected items display, product query and insertion.
// @run-at      document-idle
// ==/UserScript==

(function () {
  "use strict";

  /*********************************************
   * User configuration
   ********************************************/
  // List of regex patterns to try for quick date parsing
  const albumAddQuickDateDateRegexes = [
    // {expr: /.../, desc: "..."}
    {
      expr: /(?<year>\d{4})\D(?<month>\d{1,2})\D(?<day>\d{2})/,
      desc: "YYYY*MM*DD",
    },
    {
      expr: /(?<day>\d{1,2})\D(?<month>\d{1,2})\D(?<year>\d{4})/,
      desc: "DD*MM*YYYY",
    },
  ];

  // Selected items display font color
  const albumAddSelectedItemsFontColor = "#AAAA";

  // Language priority for queried product names.
  const albumAddQueryProductsLanguagePriority = ["ja-Latn", "ja", "en"];

  /*********************************************
   * Misc utilities
   ********************************************/
  // Inject CSS required for searchable dropdowns
  function injectCSS() {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://vgmdb.net/db/css/tail.select-dark.css?ver=2";
    document.head.appendChild(link);
  }

  /*********************************************
   * Main features implementation
   ********************************************/
  // Main function for quick date button
  function albumAddQuickDateSetup() {
    let retries = 0;
    const maxRetries = 10;
    const retryDelay = 500; // ms

    function insertQuickDateButton() {
      const relstatusField = document.querySelector('div[rel="field_reldate"]');
      if (!relstatusField) {
        if (retries < maxRetries) {
          retries++;
          setTimeout(insertQuickDateButton, retryDelay);
        } else {
          console.error("relstatus field not found.");
        }
        return;
      }

      // Remove existing elements
      const existingButtonDiv = document.getElementById(
        "albumAddQuickDateButtonDiv",
      );
      if (existingButtonDiv) existingButtonDiv.remove();

      // Create button container
      const buttonDiv = document.createElement("div");
      buttonDiv.id = "albumAddQuickDateButtonDiv";
      buttonDiv.className = "submit";
      buttonDiv.style.display = "inline-block";
      buttonDiv.style.marginLeft = "10px";

      // Create button
      const quickDateButton = document.createElement("input");
      quickDateButton.id = "albumAddQuickDateButton";
      quickDateButton.className = "button";
      quickDateButton.type = "button";
      quickDateButton.value = "Quick Date";

      // Add click event to the button
      quickDateButton.addEventListener("click", function () {
        const userInput = prompt(
          `Enter a date (supported formats: \n${albumAddQuickDateDateRegexes.map((item) => item.desc).join("\n  ")}\n):`,
        );
        if (userInput) {
          const trimmedInput = userInput.trim();
          let match = null;
          let regexIndex = 0;

          // Try each regex until a match is found
          while (!match && regexIndex < albumAddQuickDateDateRegexes.length) {
            match = trimmedInput.match(
              albumAddQuickDateDateRegexes[regexIndex].expr,
            );
            regexIndex++;
          }

          if (match) {
            let { year, month, day } = match.groups;

            // Strip leading zeros from month and day
            month = month.replace(/^0/, "");
            day = day.replace(/^0/, "");

            // Fill in the fields
            const daySelect = document.querySelector(
              'select[name="reldate_day"]',
            );
            const monthSelect = document.querySelector(
              'select[name="reldate_month"]',
            );
            const yearInput = document.querySelector(
              'input[name="reldate_year"]',
            );

            if (daySelect && monthSelect && yearInput) {
              // Set day
              const dayOption = daySelect.querySelector(
                `option[value="${day}"]`,
              );
              if (dayOption) {
                daySelect.value = day;
              } else {
                alert("Invalid date");
                return;
              }

              // Set month
              const monthOption = monthSelect.querySelector(
                `option[value="${month}"]`,
              );
              if (monthOption) {
                monthSelect.value = month;
              } else {
                alert("Invalid date");
                return;
              }

              // Set year
              yearInput.value = year;
            } else {
              alert("Could not find date fields.");
            }
          } else {
            alert("Invalid date format");
          }
        }
      });

      buttonDiv.appendChild(quickDateButton);

      // Insert the button after the relstatus dropdown
      const relstatusSelect = relstatusField.querySelector(
        'select[name="relstatus"]',
      );
      if (relstatusSelect) {
        relstatusSelect.parentNode.insertBefore(
          buttonDiv,
          relstatusSelect.nextSibling,
        );
      } else {
        console.error("Could not find the relstatus dropdown.");
      }
    }

    // Call the insertion function
    insertQuickDateButton();
  }

  // Main function for selected items display
  function albumAddSelectedItemsSetup() {
    let retries = 0;
    const maxRetries = 10;
    const retryDelay = 500; // ms

    function insertSelectedItemsText() {
      // Insert below all select[multiple] elements
      const selects = Array.from(document.querySelectorAll("select[multiple]"));

      if (selects.length === 0) {
        if (retries < maxRetries) {
          retries++;
          setTimeout(insertSelectedItemsText, retryDelay);
        } else {
          console.error("No select tags found.");
        }
        return;
      }

      selects.forEach((select, i) => {
        // Remove existing elements
        const existingDiv = document.getElementById(`selectedItems_${i}`);
        if (existingDiv) existingDiv.remove();

        // Create text container
        const textDiv = document.createElement("div");
        textDiv.id = `selectedItems_${i}`;
        textDiv.style.marginTop = "5px";
        textDiv.style.fontSize = "0.9em";
        textDiv.style.color = albumAddSelectedItemsFontColor;

        // Update text on change
        const updateText = () => {
          const selectedOptions = Array.from(select.selectedOptions).map(
            (opt) => opt.text,
          );
          textDiv.textContent = `Selected: ${selectedOptions.length ? selectedOptions.join(", ") : "(None)"}`;
        };

        select.addEventListener("change", updateText);
        updateText();

        // Insert after select
        select.parentNode.insertBefore(textDiv, select.nextSibling);
      });
    }
    // Call the insertion function
    insertSelectedItemsText();
  }

  // Main function for product query
  function albumAddQueryProductsSetup() {
    let retries = 0;
    const maxRetries = 10;
    const retryDelay = 500; // ms

    function createSearchableDropdown() {
      // Main container
      const container = document.createElement("div");
      container.className = "tail-select no-classes open-top";
      container.id = "albumAddProductsDropdown";
      container.tabIndex = 0;

      // Label
      const label = document.createElement("div");
      label.className = "select-label";
      label.innerHTML =
        '<span class="label-inner">Insert a product... (0)</span>';
      container.appendChild(label);

      // Dropdown (hidden by default)
      const dropdown = document.createElement("div");
      dropdown.className = "select-dropdown";
      dropdown.style.maxHeight = "350px";
      dropdown.style.height = "auto";
      dropdown.style.display = "none";
      dropdown.style.overflow = "visible";

      // Search input
      const searchDiv = document.createElement("div");
      searchDiv.className = "dropdown-search";
      const searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.className = "search-input";
      searchInput.placeholder = "Type in to search...";
      searchDiv.appendChild(searchInput);
      dropdown.appendChild(searchDiv);

      // Options container
      const optionsContainer = document.createElement("div");
      optionsContainer.className = "dropdown-inner";
      optionsContainer.style.maxHeight = "316px";
      optionsContainer.style.overflowY = "auto";

      // Optgroup for products
      const optgroup = document.createElement("ul");
      optgroup.className = "dropdown-optgroup";
      optgroup.setAttribute("data-group", "Products");
      optionsContainer.appendChild(optgroup);

      dropdown.appendChild(optionsContainer);
      container.appendChild(dropdown);

      // Hidden input
      const hiddenInput = document.createElement("input");
      hiddenInput.className = "select-search";
      hiddenInput.type = "hidden";
      hiddenInput.name = "selected_product";
      container.appendChild(hiddenInput);

      return { container, dropdown, optgroup };
    }

    function toggleDropdownVisibility(dropdown) {
      dropdown.style.display =
        dropdown.style.display === "block" ? "none" : "block";
    }

    function hideDropdown(dropdown) {
      dropdown.style.display = "none";
    }

    function filterDropdownOptions(optgroup, searchTerm) {
      const options = optgroup.querySelectorAll(".dropdown-option");
      options.forEach((option) => {
        const text = option.textContent.toLowerCase();
        option.style.display = text.includes(searchTerm) ? "block" : "none";
      });
    }

    function insertQueryButton() {
      const productsLabel = document.querySelector('label[for="game"]');
      if (!productsLabel) {
        if (retries < maxRetries) {
          retries++;
          setTimeout(insertQueryButton, retryDelay);
        } else {
          console.error("Products label not found.");
        }
        return;
      }

      // Remove existing elements
      const existingButton = document.getElementById(
        "albumAddProductsQueryButton",
      );
      const existingDropdown = document.querySelector(".tail-select");
      if (existingButton) existingButton.parentNode.remove();
      if (existingDropdown) existingDropdown.remove();

      // Create button container and input
      const buttonDiv = document.createElement("div");
      buttonDiv.className = "submit";
      buttonDiv.style.display = "inline-block";
      buttonDiv.style.marginRight = "10px";

      const queryButton = document.createElement("input");
      queryButton.id = "albumAddProductsQueryButton";
      queryButton.className = "button";
      queryButton.type = "button";
      queryButton.value = "Query Products";

      buttonDiv.appendChild(queryButton);

      // Create and insert the searchable dropdown
      const {
        container: productDropdown,
        dropdown,
        optgroup,
      } = createSearchableDropdown();
      productsLabel.parentNode.insertBefore(productDropdown, productsLabel);
      productsLabel.parentNode.insertBefore(buttonDiv, productDropdown);

      // Toggle dropdown visibility when clicking the container label
      productDropdown
        .querySelector(".select-label")
        .addEventListener("click", (e) => {
          e.stopPropagation();
          toggleDropdownVisibility(dropdown);
        });

      // Prevent dropdown from closing when clicking inside it
      dropdown.addEventListener("click", (e) => {
        e.stopPropagation();
      });

      // Close dropdown when clicking outside
      document.addEventListener("click", (e) => {
        if (!productDropdown.contains(e.target)) {
          hideDropdown(dropdown);
        }
      });

      // Filter options on search
      const searchInput = productDropdown.querySelector(".search-input");
      searchInput.addEventListener("input", () => {
        const searchTerm = searchInput.value.toLowerCase();
        filterDropdownOptions(optgroup, searchTerm);
      });

      queryButton.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const keywords = prompt("Enter product search keywords:");
        if (!keywords) return;

        const encodedKeywords = encodeURIComponent(keywords).replace(
          /%20/g,
          "+",
        );
        const searchUrl = `/search?q=${encodedKeywords}&type=product`;

        console.info(`Fetching products for: ${searchUrl}`);
        GM_xmlhttpRequest({
          method: "GET",
          url: searchUrl,
          onload: function (response) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(
              response.responseText,
              "text/html",
            );
            const productRows = doc.querySelectorAll(
              "table.results tbody:nth-of-type(2) tr",
            );

            // Clear previous options
            optgroup.innerHTML = "";

            const products = [];

            if (productRows.length === 0) { // No results, may be the product page itself if only 1 match
              const titleElement = doc.querySelector("h1#maintitle");
              let directName = null;
              if (titleElement) {
                const spans = titleElement.querySelectorAll("span.albumtitle");
                for (const lang of albumAddQueryProductsLanguagePriority) {
                  const span = Array.from(spans).find((s) => s.lang === lang);
                  if (span) {
                    directName = span.textContent.trim();
                    break;
                  }
                }
                if (!directName) {
                  directName = titleElement.textContent.trim();
                }
                if (directName) {
                  directName = directName.replace(/^\s*\/\s*/, "");
                }
              }

              const discussLink = doc.querySelector(
                'a[href*="/db/product-discuss.php?id="]',
              );
              const productIdMatch = discussLink
                ? discussLink.href.match(/id=(\d+)/)
                : null;
              const directProductId = productIdMatch ? productIdMatch[1] : null;

              if (directName) {
                products.push({ id: directProductId, name: directName });

                const option = document.createElement("li");
                option.className = "dropdown-option";
                option.textContent = directName;
                if (directProductId) option.dataset.key = directProductId;
                optgroup.appendChild(option);

                option.addEventListener("click", () => {
                  const textarea = document.querySelector(
                    'textarea[name="game"]',
                  );
                  if (textarea) {
                    let products = textarea.value
                      .split(", ")
                      .map((p) => p.trim())
                      .filter((p) => p.length > 0);
                    products.push(directName);
                    textarea.value = products.join(", ");
                    dropdown.style.display = "none";
                  }
                });
              }
            } else { // Search results page, list products
              productRows.forEach((row) => {
                const link = row.querySelector("td.productname a");
                if (!link) return;

                const spans = link.querySelectorAll("span.productname");
                let name = null;

                for (const lang of albumAddQueryProductsLanguagePriority) {
                  const span = Array.from(spans).find((s) => s.lang === lang);
                  if (span) {
                    name = span.textContent;
                    break;
                  }
                }

                if (name) {
                  const productUrl = link.href;
                  const productIdMatch = productUrl.match(/\/product\/(\d+)/);
                  const productId = productIdMatch ? productIdMatch[1] : null;
                  products.push({ id: productId, name: name });

                  const option = document.createElement("li");
                  option.className = "dropdown-option";
                  option.textContent = name;
                  option.dataset.key = productId;
                  optgroup.appendChild(option);

                  option.addEventListener("click", () => {
                    const textarea = document.querySelector(
                      'textarea[name="game"]',
                    );
                    if (textarea) {
                      let products = textarea.value
                        .split(", ")
                        .map((p) => p.trim())
                        .filter((p) => p.length > 0);
                      products.push(name);
                      textarea.value = products.join(", ");
                      dropdown.style.display = "none";
                    }
                  });
                }
              });
            }

            // Update label
            const label = productDropdown.querySelector(
              ".select-label .label-inner",
            );
            if (label)
              label.textContent = `Insert a product... (${products.length})`;
            console.log("Found products:", products);
          },
        });
      });
    }

    injectCSS();
    insertQueryButton();
  }

  // Main function for organization query (publisher)
  function albumAddQueryOrgsSetup() {
    let retries = 0;
    const maxRetries = 10;
    const retryDelay = 500; // ms

    function createOrgSearchableDropdown() {
      // Main container
      const container = document.createElement("div");
      container.className = "tail-select no-classes open-top";
      container.id = "albumAddOrgsDropdown";
      container.tabIndex = 0;

      // Label
      const label = document.createElement("div");
      label.className = "select-label";
      label.innerHTML =
        '<span class="label-inner">Insert an organization... (0)</span>';
      container.appendChild(label);

      // Dropdown (hidden by default)
      const dropdown = document.createElement("div");
      dropdown.className = "select-dropdown";
      dropdown.style.maxHeight = "350px";
      dropdown.style.height = "auto";
      dropdown.style.display = "none";
      dropdown.style.overflow = "visible";

      // Search input
      const searchDiv = document.createElement("div");
      searchDiv.className = "dropdown-search";
      const searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.className = "search-input";
      searchInput.placeholder = "Type in to search...";
      searchDiv.appendChild(searchInput);
      dropdown.appendChild(searchDiv);

      // Options container
      const optionsContainer = document.createElement("div");
      optionsContainer.className = "dropdown-inner";
      optionsContainer.style.maxHeight = "316px";
      optionsContainer.style.overflowY = "auto";

      // Optgroup for orgs
      const optgroup = document.createElement("ul");
      optgroup.className = "dropdown-optgroup";
      optgroup.setAttribute("data-group", "Organizations");
      optionsContainer.appendChild(optgroup);

      dropdown.appendChild(optionsContainer);
      container.appendChild(dropdown);

      // Hidden input
      const hiddenInput = document.createElement("input");
      hiddenInput.className = "select-search";
      hiddenInput.type = "hidden";
      hiddenInput.name = "selected_organization";
      container.appendChild(hiddenInput);

      return { container, dropdown, optgroup };
    }

    function toggleDropdownVisibility(dropdown) {
      dropdown.style.display =
        dropdown.style.display === "block" ? "none" : "block";
    }

    function hideDropdown(dropdown) {
      dropdown.style.display = "none";
    }

    function filterDropdownOptions(optgroup, searchTerm) {
      const options = optgroup.querySelectorAll(".dropdown-option");
      options.forEach((option) => {
        const text = option.textContent.toLowerCase();
        option.style.display = text.includes(searchTerm) ? "block" : "none";
      });
    }

    function insertOrgQueryButton() {
      const publisherLabel = document.querySelector('label[for="publisher"]');
      if (!publisherLabel) {
        if (retries < maxRetries) {
          retries++;
          setTimeout(insertOrgQueryButton, retryDelay);
        } else {
          console.error("Publisher label not found.");
        }
        return;
      }

      // Remove existing org-specific elements
      const existingButton = document.getElementById("albumAddOrgsQueryButton");
      const existingDropdown = document.getElementById("albumAddOrgsDropdown");
      if (existingButton) existingButton.parentNode.remove();
      if (existingDropdown) existingDropdown.remove();

      // Create button container and input
      const buttonDiv = document.createElement("div");
      buttonDiv.className = "submit";
      buttonDiv.style.display = "inline-block";
      buttonDiv.style.marginRight = "10px";

      const queryButton = document.createElement("input");
      queryButton.id = "albumAddOrgsQueryButton";
      queryButton.className = "button";
      queryButton.type = "button";
      queryButton.value = "Query Organizations";

      buttonDiv.appendChild(queryButton);

      // Create and insert the searchable dropdown
      const {
        container: orgDropdown,
        dropdown,
        optgroup,
      } = createOrgSearchableDropdown();
      publisherLabel.parentNode.insertBefore(orgDropdown, publisherLabel);
      publisherLabel.parentNode.insertBefore(buttonDiv, orgDropdown);

      // Toggle dropdown visibility when clicking the container label
      orgDropdown
        .querySelector(".select-label")
        .addEventListener("click", (e) => {
          e.stopPropagation();
          toggleDropdownVisibility(dropdown);
        });

      // Prevent dropdown from closing when clicking inside it
      dropdown.addEventListener("click", (e) => {
        e.stopPropagation();
      });

      // Close dropdown when clicking outside
      document.addEventListener("click", (e) => {
        if (!orgDropdown.contains(e.target)) {
          hideDropdown(dropdown);
        }
      });

      // Filter options on search
      const searchInput = orgDropdown.querySelector(".search-input");
      searchInput.addEventListener("input", () => {
        const searchTerm = searchInput.value.toLowerCase();
        filterDropdownOptions(optgroup, searchTerm);
      });

      queryButton.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const keywords = prompt("Enter organization search keywords:");
        if (!keywords) return;

        const encodedKeywords = encodeURIComponent(keywords).replace(
          /%20/g,
          "+",
        );
        const searchUrl = `/search?q=${encodedKeywords}&type=org`;

        console.info(`Fetching organizations for: ${searchUrl}`);

        GM_xmlhttpRequest({
          method: "GET",
          url: searchUrl,
          onload: function (response) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(
              response.responseText,
              "text/html",
            );
            const orgRows = doc.querySelectorAll(
              "table.results tbody:nth-of-type(2) tr",
            );

            // Clear previous options
            optgroup.innerHTML = "";

            const orgs = [];

            if (orgRows.length === 0) { // No results, may be the organization page itself if only 1 match
              const directOrgName = doc.querySelector("h1")?.textContent.trim();
              const discussLink = doc.querySelector(
                'a[href*="/db/org-discuss.php?id="]',
              );
              const orgIdMatch = discussLink
                ? discussLink.href.match(/id=(\d+)/)
                : null;
              const directOrgId = orgIdMatch ? orgIdMatch[1] : null;

              if (directOrgName) {
                orgs.push({ id: directOrgId, name: directOrgName });

                const option = document.createElement("li");
                option.className = "dropdown-option";
                option.textContent = directOrgName;
                if (directOrgId) option.dataset.key = directOrgId;
                optgroup.appendChild(option);

                option.addEventListener("click", () => {
                  const input = document.querySelector('input[name="publisher"]');
                  if (input) {
                    let publishers = input.value
                      .split(", ")
                      .map((p) => p.trim())
                      .filter((p) => p.length > 0);
                    publishers.push(directOrgName);
                    input.value = publishers.join(", ");
                    dropdown.style.display = "none";
                  }
                });
              }
            } else { // Search results page, list orgs
              orgRows.forEach((row) => {
                const link = row.querySelector("td.orgname a");
                if (!link) return;

                const name = link.textContent.trim();
                const orgUrl = link.href;
                const orgIdMatch = orgUrl.match(/\/org\/(\d+)/);
                const orgId = orgIdMatch ? orgIdMatch[1] : null;
                orgs.push({ id: orgId, name: name });

                const option = document.createElement("li");
                option.className = "dropdown-option";
                option.textContent = name;
                option.dataset.key = orgId;
                optgroup.appendChild(option);

                option.addEventListener("click", () => {
                  const input = document.querySelector('input[name="publisher"]');
                  if (input) {
                    let publishers = input.value
                      .split(", ")
                      .map((p) => p.trim())
                      .filter((p) => p.length > 0);
                    publishers.push(name);
                    input.value = publishers.join(", ");
                    dropdown.style.display = "none";
                  }
                });
              });
            }

            // Update label
            const label = orgDropdown.querySelector(
              ".select-label .label-inner",
            );
            if (label)
              label.textContent = `Insert an organization... (${orgs.length})`;
            console.log("Found organizations:", orgs);
          },
        });
      });
    }

    injectCSS();
    insertOrgQueryButton();
  }

  /*********************************************
   * Custom settings handling
   ********************************************/
  if (
    window.VGMdbCustomSettings &&
    typeof window.VGMdbCustomSettings.createManager === "function"
  ) {
    const settingsManager = window.VGMdbCustomSettings.createManager({
      storageKey: "vgmdbAddAlbumTweaksSettings",
      containerId: "vgmdbAddAlbumTweaksSettingsContainer",
      config: {
        "(custom) VGMdb add album tweaks": [
          {
            type: "checkbox",
            id: "showSelectedItems",
            label: "Selected items display",
            default: true,
            onChange: function (value) {
              document
                .querySelectorAll('[id^="selectedItems_"]')
                .forEach((el) => {
                  el.style.display = value ? "" : "none";
                });
            },
          },
          {
            type: "checkbox",
            id: "enableQuickDate",
            label: "Quick date",
            default: true,
            onChange: function (value) {
              const el = document.getElementById("albumAddQuickDateButtonDiv");
              if (el) el.style.display = value ? "inline-block" : "none";
            },
          },
          {
            type: "checkbox",
            id: "enableQueryProducts",
            label: "Query products",
            default: true,
            onChange: function (value) {
              const btn = document.getElementById(
                "albumAddProductsQueryButton",
              );
              if (btn && btn.parentNode)
                btn.parentNode.style.display = value ? "inline-block" : "none";
              const dd = document.getElementById("albumAddProductsDropdown");
              if (dd) dd.style.display = value ? "" : "none";
            },
          },
          {
            type: "checkbox",
            id: "enableQueryOrgs",
            label: "Query orgs",
            default: true,
            onChange: function (value) {
              const btn = document.getElementById("albumAddOrgsQueryButton");
              if (btn && btn.parentNode)
                btn.parentNode.style.display = value ? "inline-block" : "none";
              const dd = document.getElementById("albumAddOrgsDropdown");
              if (dd) dd.style.display = value ? "" : "none";
            },
          },
        ],
      },
    });

    // Mount the settings UI (if available) and apply initial visibility
    settingsManager.mount();

    // Apply initial visibility based on saved settings
    try {
      const showSelected = settingsManager.getSetting(
        "showSelectedItems",
        true,
      );
      document.querySelectorAll('[id^="selectedItems_"]').forEach((el) => {
        el.style.display = showSelected ? "" : "none";
      });

      const quickDateEnabled = settingsManager.getSetting(
        "enableQuickDate",
        true,
      );
      const quickEl = document.getElementById("albumAddQuickDateButtonDiv");
      if (quickEl)
        quickEl.style.display = quickDateEnabled ? "inline-block" : "none";

      const prodEnabled = settingsManager.getSetting(
        "enableQueryProducts",
        true,
      );
      const prodBtn = document.getElementById("albumAddProductsQueryButton");
      if (prodBtn && prodBtn.parentNode)
        prodBtn.parentNode.style.display = prodEnabled
          ? "inline-block"
          : "none";
      const prodDd = document.getElementById("albumAddProductsDropdown");
      if (prodDd) prodDd.style.display = prodEnabled ? "" : "none";

      const orgEnabled = settingsManager.getSetting("enableQueryOrgs", true);
      const orgBtn = document.getElementById("albumAddOrgsQueryButton");
      if (orgBtn && orgBtn.parentNode)
        orgBtn.parentNode.style.display = orgEnabled ? "inline-block" : "none";
      const orgDd = document.getElementById("albumAddOrgsDropdown");
      if (orgDd) orgDd.style.display = orgEnabled ? "" : "none";
    } catch (e) {
      console.warn("Settings apply failed", e);
    }
  }

  // Call the setup functions
  albumAddSelectedItemsSetup();
  albumAddQuickDateSetup();
  albumAddQueryProductsSetup();
  albumAddQueryOrgsSetup();
})();
