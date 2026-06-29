# Userscripts

Some useful userscripts to use with your favorite manager such as Violentmonkey or Tampermonkey.

## [Wayback URLs quick open](Wayback%20URLs%20quick%20open.user.js)

Insert buttons on Wayback machine URLs page to quickly open respective urls.

### Features

When this script is enabled, clickable buttons will be inserted next to all urls opening the respective page:
| **Button** | **Opened URL type** |
| ---------- | -------------------------------------- |
| o | Original url (outside archive.org) |
| n | Newest saved page |
| f | First (oldest) saved page |

A **Batch open** button will also be inserted at the top. This button will prompt for url type and batch size to open, allowing to quickly open found urls.

<img width="2621" height="1168" alt="Wayback URLs quick open" src="https://github.com/user-attachments/assets/1c43aa91-9dfc-4b86-aa33-38cd7d04eb5a" />

## [VGMDB menu tweaks](VGMDB%20menu%20tweaks.user.js)

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

<img width="1201" height="567" alt="VGMDB menu tweaks" src="https://github.com/user-attachments/assets/6e44b200-9575-4c22-8614-65d9db82443a" />

## [VGMDB album page tweaks](VGMDB%20album%20page%20tweaks.user.js)

Add quality of life features to VGMdb album pages.

Will import (through @require statement) the [VGMdb Custom Settings](#vgmdb-custom-settings-library) library automatically.

### Features

When this script is enabled, the following features will be added to album pages:

**Custom date format**, the displayed date format can be customized through the `formatDateOverride` function. By default, the date format will be overridden to `YYYY.MM.DD`.

**Metadata copy**, buttons will be inserted next to several fields that will allow copying their content to clipboard when clicked. This applies to titles, album info and credits.

**Tracklist copy**, buttons will be inserted to copy tracklists easily. Title only or with track number and length buttons are provided, as well as per-disc and per-language buttons.

<img width="1302" height="1451" alt="VGMDB album page tweaks" src="https://github.com/user-attachments/assets/624b71bd-0e7d-44ee-99c5-05e7599a67c3" />

### Settings

New settings will be inserted in the VGMdb preferences panel. 
<img width="1284" height="141" alt="image" src="https://github.com/user-attachments/assets/0e025074-04be-4dca-8165-a8c03c4590a9" />

### Acknowledgements

The date format part of this script was inspired by [VGMdb Date Format YYYY-MM-DD](https://greasyfork.org/en/scripts/527467-vgmdb-date-format-yyyy-mm-dd).

## [VGMdb album formatted info copy](VGMDB%20album%20formatted%20info%20copy.user.js)

Copy album metadata as a formatted string to clipboard, made very easy to customize.

### Features

When this script is enabled, buttons will be inserted next to the _Discuss | Edit_ buttons on VGMdb album pages. When clicked, the button will copy to clipboard the user-defined formatted string containing album metadata.

Formatted string buttons are defined in the `albummetadataButtonSettings` list, please refer to the example format button for further details on provided metadata, here is a quick summary of available metadata:
| **Variable** | **Type** | **Description** |
| ------------ | -------- | --------------- |
| url | String | URL of the current album page |
| coverurl | String | URL of the album cover image |
| titles | Array | List of titles for the album |
| notes | String | Album notes |
| links | Array | List of 3rd party links (Websites) |
| albuminfo | Object (refer to script) | From `album_infobit_large` table, containing fields such as Catalog Number, Publisher and Release Date |
| credits | Object (refer to script) | From `collapse_credits` div containing Credits information |
| tracklists | Object (refer to script) | Contains all tracklists |

<img width="806" height="182" alt="VGMdb album formatted info copy" src="https://github.com/user-attachments/assets/489a6d00-e1cc-4fcd-ad23-f0ddf186183a" />

## [VGMdb add album tweaks](VGMDB%20add%20album%20tweaks.user.js)

Insert quality of life features to VGMdb add album pages.

### Features

When this script is enabled, the following features will be added to the add album page:

**Quick date**, a new button will allow parsing text for dates to quickly set the date. Default supported expressions are of the form `DD*MM*YYYY` `YYYY*MM*DD`, more can be added by the user in the `albumAddQuickDateDateRegexes` array.

**Selected items display**, the selected items of all `select[multiple]` elements will be displayed below them. The font color of the displayed items can be customized in the `albumAddSelectedItemsFontColor` variable.

**Product query and insertion**, a new button will allow querying the VGMdb database for products and inserting them in the form. The language priority telling which name to keep for products is defined in the customizable `albumAddQueryProductsLanguagePriority` array.

**Organization query and insertion**, a new button will allow querying the VGMdb database for organizations and inserting them in the form.

<img width="2500" height="1275" alt="VGMdb add album tweaks" src="https://github.com/user-attachments/assets/464a3b6e-5161-4857-a7f8-9275559786b0" />

### Settings

New settings will be inserted in the VGMdb preferences panel. 
<img width="1278" height="132" alt="image" src="https://github.com/user-attachments/assets/a439c06b-c375-4904-b9a9-654abb6efefe" />

## [VGMdb mosaic album list](VGMdb%20mosaic%20album%20list.user.js)

Add a button that will show a mosaic view with album thumbnails for album lists. Disclaimer: This script fetches each album page to build the mosaic and may generate substantial network traffic. Please use this feature sparingly to avoid unnecessary site traffic.

### Features

When this script is enabled, a new button will be added to album lists (should work for all of them). When clicked, the button will fetch album pages to get the thumbnail urls and show them in a mosaic view.

### Settings

The user may configure various parameters such as `mosaicMaxConcurrentRequests` at the top of the script.

A setting to toggle the mosaic view container (button / mosaic) will be added to the VGMdb preferences panel. There will also be settings to toggle displayed info fields. If all fields are disabled, the compact mosaic view will be shown (thumbnails only).
<img width="2609" height="1283" alt="image" src="https://github.com/user-attachments/assets/11fdc63b-3375-4b62-bc6b-6a6255e4a7ab" />


## [VGMdb language variants](VGMdb%20language%20variants.user.js)

Display language variants (titles, names, etc) on VGMdb.

### Features

When this script is enabled, language variants will be displayed for all applicable fields (titles, names, etc). A new setting will be added to the VGMdb preferences panel to toggle the visibility of these variants.

### Settings
The user may define the color of the language variants by setting the `showLanguageVariantsColor` variable at the top of the script. The user may also define fields to exclude from showing language variants by adding CSS selectors to the `showLanguageVariantsExcludedSelectors` array.

A setting to toggle the visibility of language variants will be added to the VGMdb preferences panel. Checkboxes dedicated to toggling specific container types will also be added, allowing users to choose which containers show language variants. If a container type has no dedicated toggle, it will follow the master switch setting.

<img width="1755" height="560" alt="image" src="https://github.com/user-attachments/assets/1a4a0dae-baf0-4258-8e3b-23759bad5517" />

## [VGMdb draft export as text](VGMdb%20draft%20export%20as%20text.user.js)

Adds a button to export draft content as text on VGMdb.

### Features

When this script is enabled, a new button will be added to the draft page that will allow exporting the draft content as text. The exported text should be suitable for mass add, or be used with the `.ca` command of nstzbot. An example of such an export would be:

```
作詞, 歌: コツキミヤ
歌: kaya, GINGA
作曲, 編曲: Dozest
作曲: SID;DAN, 浅川ユキムネ
作詞: mitogi, カヤ, ＧＩＮＧＡ
編曲: 宮川弾
イラスト: KEI, 各務
ブックレット, 装丁: Yukimune Asakawa
``` 

### Settings

A new section will be added to the VGMdb preferences panel allowing to choose the language of the artists/roles, grouping method and optionally append the artist ids.

<img width="2632" height="264" alt="image" src="https://github.com/user-attachments/assets/4ee2b6ef-9418-447c-915a-1be44df45802" />


## [VGMdb draft tweaks](VGMdb%20draft%20tweaks.user.js)

Tweaks for the VGMdb draft page.

### Features

When this script is enabled, the following features will be added to the draft page:
- Modified entries will be highlighted in yellow, and automatically selected for changes to apply
- Insert buttons in artist dropdown to quickly open respective artist pages
- Add buttons to select / deselect all entries of given role type

### Settings

A new section will be added to the VGMdb preferences panel allowing to enable / disable the corresponding features.

<img width="2572" height="452" alt="image" src="https://github.com/user-attachments/assets/8276b7af-e84a-4278-b3a7-0b290e609574" />

## [VGMdb Custom Settings minimal example](VGMDB%20Custom%20Settings%20minimal%20example.user.js)

Example of how to use the VGMdb Custom Settings library to insert custom buttons in the VGMdb settings component.

Will import (through @require statement) the [VGMdb Custom Settings](#vgmdb-custom-settings-library) library automatically.

### Features

Inserts an example checkbox.

### Settings

New settings will be inserted in the VGMdb preferences panel. 
<img width="1279" height="149" alt="image" src="https://github.com/user-attachments/assets/38d99ad8-e869-46fa-88e6-0d0c47754ac1" />


## [VGMdb Custom Settings (library)](components/VGMdb%20Custom%20Settings.js)

Library made to add custom settings to VGMdb pages, allowing users to easily insert their own settings buttons in the VGMdb settings component. To use it, refer to the [VGMdb Custom Settings minimal example](#vgmdb-custom-settings-minimal-example) userscript.
