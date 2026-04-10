# Userscripts

Some useful userscripts to use with your favorite manager such as Violentmonkey or Tampermonkey.

## Wayback URLs quick open

Insert buttons on Wayback machine URLs page to quickly open respective urls.

### Features

When this script is enabled, clickable buttons will be inserted next to all urls opening the respective page:
| **Button** | **Opened URL type** |
| ---------- | -------------------------------------- |
| o | Original url (outside archive.org) |
| n | Newest saved page |
| f | First (oldest) saved page |

A **Batch open** button will also be inserted at the top. This button will prompt for url type and batch size to open, allowing to quickly open found urls.

## VGMDB menu tweaks

Insert user-defined buttons on VGMdb menus: subnav menu (main) and navmember menu (user drop-down, only shown when user is logged in).

### Features

When this script is enabled, buttons will be inserted in the VGMdb menu and submenus. The buttons and their respective urls are defined in the script, allowing to quickly open related pages.

```
  // User-defined buttons to insert in "subnav" menu.
  const subnavButtons = [
    // {title: "...", href: "...", tooltip:"..."}
    {
      title: "game-adgacent",
      href: "/forums/showthread.php?t=29157",
      tooltip: "Game-adgacent description post",
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
```

User info can also be used in these definitions using the built-in `getUserInfo` function which provides logged-in user name and id.

## VGMDB album page tweaks

Add quality of life features to VGMdb album pages.

### Features

When this script is enabled, the following features will be added to album pages:

**Custom date format**, the displayed date format can be customized through the `formatDateOverride` function. By default, the date format will be overridden to `YYYY.MM.DD`.

**Metadata copy**, buttons will be inserted next to several fields that will allow copying their content to clipboard when clicked. This applies to titles, album info and credits.

**Tracklist copy**, buttons will be inserted to copy tracklists easily. Title only or with track number and length buttons are provided, as well as per-disc and per-language buttons.

### Acknowledgements

The date format part of this script was inspired by [VGMdb Date Format YYYY-MM-DD](https://greasyfork.org/en/scripts/527467-vgmdb-date-format-yyyy-mm-dd).

## VGMdb album formatted info copy

Copy album metadata as a formatted string to clipboard, made very easy to customize.

### Features

When this script is enabled, buttons will be inserted next to the _Discuss | Edit_ buttons on VGMdb album pages. When clicked, the button will copy to clipboard the user-defined formatted string containing album metadata.

Formatted string buttons are defined in the `albummetadataButtonSettings` list, please refer to the example format button for further details on provided metadata, here is a quick summary of available metadata:
| **Variable** | **Type** | **Description** |
| ------------ | --------------------------------------- |
| url | String | URL of the current album page |
| coverurl | String | URL of the album cover image |
| titles | Array | List of titles for the album |
| notes | String | Album notes |
| links | Array | List of 3rd party links (Websites) |
| albuminfo | Object (refer to script) | From `album_infobit_large` table, containing fields such as Catalog Number, Publisher and Release Date |
| credits | Object (refer to script) | From `collapse_credits` div containing Credits information |
| tracklists | Object (refer to script) | Contains all tracklists |

## VGMdb add album tweaks

Insert quality of life features to VGMdb add album pages.

### Features

When this script is enabled, the following features will be added to the add album page:

**Quick date**, a new button will allow parsing text for dates to quickly set the date. Default supported expressions are of the form `DD*MM*YYYY` `YYYY*MM*DD`, more can be added by the user in the `albumAddQuickDateDateRegexes` array.

**Selected items display**, the selected items of all `select[multiple]` elements will be displayed below them. The font color of the displayed items can be customized in the `albumAddSelectedItemsFontColor` variable.

**Product query and insertion**, a new button will allow querying the VGMdb database for products and inserting them in the form. The language priority telling which name to keep for products is defined in the customizable `albumAddQueryProductsLanguagePriority` array.
