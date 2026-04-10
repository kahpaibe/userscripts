// ==UserScript==
// @name        VGMdb menu tweaks
// @namespace   Violentmonkey Scripts
// @match       https://vgmdb.net/*
// @grant       GM_addStyle
// @version     0.9
// @author      kahpaibe
// @description Insert buttons in VGMdb subnav and navmember menus
// @run-at      document-idle
// ==/UserScript==

(function () {
  "use strict";

  /* Retrieve user info, returns {name: "...", id: "..."}. If not logged in, returns {name: null, id: null} */
  function getUserInfo() {
    // Get user name
    const navmemberNameElement = document.querySelector("#navmember a");
    const name = navmemberNameElement ? navmemberNameElement.textContent : null;

    // Get user ID from "My Profile" link
    const navmemberProfileLink = document.querySelector(
      'a[href^="/forums/member.php?u="]',
    );
    const idMatch = navmemberProfileLink
      ? navmemberProfileLink.href.match(/u=(\d+)/)
      : null;
    const id = idMatch ? parseInt(idMatch[1], 10) : null;

    return { name, id };
  }

  // User-defined buttons to insert in "subnav" menu.
  const subnavButtons = [
    // {title: "...", href: "...", tooltip:"..."}
    {
      title: "game-adgacent",
      href: "/forums/showthread.php?t=29157",
      tooltip: "Game-adgacent description post",
    },
    {
      title: "role requests",
      href: "/forums/showthread.php?t=23536",
      tooltip: "Forum thread for role addition requests",
    },
    {
      title: "new draft",
      href: "/db/draft-submit.php?do=add",
      tooltip: "Page for new draft",
    },
  ];

  // User-defined buttons to insert in "navmember" menu.
  const navmemberCustomButtons = [
    // {title: "...", href: "...", tooltip:"..."}
    {
      title: "My modq",
      href: "/db/modq.php?do=mod_albums&type=mine",
      tooltip: "See user's entries in mod queue",
    },
  ];

  // Main function for subnav features
  function subnavSetup() {
    // Centralized style for subnav buttons
    const subnavStyle = `
            #subnav > .subnav-button {
                display: inline-flex !important;
                align-items: stretch !important;
                height: 100% !important;
                margin: 0 5px !important;
                cursor: pointer !important;
                position: relative !important;
                background: transparent !important;
                overflow: visible !important;
            }
            #subnav > .subnav-button span {
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                padding: 5px 10px !important;
                color: #6C7687 !important;
                font-weight: 900 !important;
                font-family: Arial, sans-serif !important;
                cursor: pointer !important;
                position: relative !important;
            }
            #subnav > .subnav-button span::after {
                content: "";
                width: 0;
                height: 0;
                border-left: 0.4em solid transparent;
                border-right: 0.4em solid transparent;
                border-top: 0.4em solid #1B273D;
                position: absolute;
                top: 0;
                left: 50%;
                transform: translateX(-50%);
                display: none;
            }
            #subnav > .subnav-button:hover span {
                color: #7A8594 !important;
            }
            #subnav > .subnav-button:hover span::after {
                display: block;
            }
        `;

    // Add styles to the document
    GM_addStyle(subnavStyle);

    // Retry logic with a limit
    let retries = 0;
    const maxRetries = 20;
    const retryDelay = 1000;

    function insertSubnavButtons() {
      const subnavUl = document.getElementById("subnav");
      if (!subnavUl) {
        if (retries < maxRetries) {
          retries++;
          setTimeout(insertSubnavButtons, retryDelay);
        }
        return;
      }

      // Get the last <li> in #subnav
      const subnavChildren = subnavUl.children;
      const lastLi = subnavChildren[subnavChildren.length - 1];

      // Remove existing subnav buttons to avoid duplicates
      document.querySelectorAll(".subnav-button").forEach((el) => el.remove());

      // Insert custom buttons after the last <li>
      subnavButtons
        .slice()
        .reverse()
        .forEach((button, index) => {
          const li = document.createElement("li");
          li.id = `subnav_custom${index + 1}`;
          li.className = "subnav-button";
          li.title = button.tooltip;
          li.setAttribute("aria-label", button.title);

          const span = document.createElement("span");
          span.textContent = button.title;
          span.setAttribute("aria-hidden", "true");

          li.appendChild(span);

          li.addEventListener("click", () => {
            window.location.href = button.href;
          });

          subnavUl.insertBefore(li, lastLi.nextSibling);
        });
    }

    insertSubnavButtons();
  }

  // Main function for navmember features
  function navmemberSetup() {
    const userInfo = getUserInfo();
    if (!userInfo.name || !userInfo.id) {
      // User not logged in, skip navmember modifications
      return;
    }

    let navmemberRetries = 0;
    const navmemberMaxRetries = 10;
    const navmemberRetryDelay = 500; // ms

    function navmemberInsertButtons() {
      // Find the target table and the last menu item
      const navmemberTable = document.querySelector(
        'table[cellpadding="4"][cellspacing="1"][border="0"] tbody',
      );
      const navmemberLastItem = document.querySelector(
        'table[cellpadding="4"][cellspacing="1"][border="0"] tbody tr:last-child',
      );

      if (!navmemberTable || !navmemberLastItem) {
        if (navmemberRetries < navmemberMaxRetries) {
          navmemberRetries++;
          setTimeout(navmemberInsertButtons, navmemberRetryDelay);
        } else {
          console.error("VGMdb navmember_menu or last item not found.");
        }
        return;
      }

      // Remove existing custom buttons to avoid duplicates
      document
        .querySelectorAll('tr[id^="navmember_custom"]')
        .forEach((el) => el.remove());

      // Insert each custom button
      navmemberCustomButtons
        .slice()
        .reverse()
        .forEach((button, index) => {
          const navmemberRow = document.createElement("tr");
          navmemberRow.id = `navmember_custom${index + 1}`;

          const navmemberCell = document.createElement("td");
          navmemberCell.className = "vbmenu_option vbmenu_option_alink";
          navmemberCell.style.cursor = "default";
          navmemberCell.title = button.tooltip || button.title;
          navmemberCell.setAttribute("aria-label", button.title);

          const navmemberLink = document.createElement("a");
          navmemberLink.href = button.href;
          navmemberLink.textContent = button.title;

          navmemberCell.appendChild(navmemberLink);
          navmemberRow.appendChild(navmemberCell);

          // Add hover effect
          navmemberRow.addEventListener("mouseover", () => {
            navmemberCell.className = "vbmenu_hilite vbmenu_hilite_alink";
          });
          navmemberRow.addEventListener("mouseout", () => {
            navmemberCell.className = "vbmenu_option vbmenu_option_alink";
          });

          // Insert the new row after the last existing row
          navmemberTable.insertBefore(
            navmemberRow,
            navmemberLastItem.nextSibling,
          );
        });
    }

    // Call the insertion function
    navmemberInsertButtons();
  }

  // Call the setup functions
  subnavSetup();
  navmemberSetup();
})();
