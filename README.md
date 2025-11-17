# Userscripts

Some useful userscripts to use with your favorite manager such as Violentmonkey or Tampermonkey.

# Scripts

## VGMdb metadata copy

A script that inserts buttons on VGMdb album pages ([https://vgmdb.net/album/*](https://vgmdb.net/album/*)) to easily copy to clipboard the related metadata.

### Usage
Click the buttons inserted next to the various fields.

Allows copying:
- Title and alternative titles
- Release date, event and the mix of the two
- Publisher
- A tagged string encoding relevant information of the following format: '${PREFIX}?[${date}][${event}]? ${publisher} - ${catalognumber}${SUFFIX}?' (ex: [1996.02.16] 新世紀エヴァンゲリオン II {KICA-290})

A *PREFIX* and a *SUFFIX* variable are defined at the top of the script, they can be used to append a string on the tagged string defined above.

### About

A script mostly made with ChatGPT with some manual tweaking. 

Find it on Greasy Fork [here](https://greasyfork.org/en/scripts/532969-vgmdb-metadata-copy)

## VGMdb Tracklist copy

A script that inserts buttons on VGMdb album pages (https://vgmdb.net/album/*) to easily copy to clipboard the tracklists of given album.

### Usage

CLick the buttons inserted next to either the tracklist language or the wanted disc.

Allows copying the tracklist (names only or fully formatted):
- Of a given disc of selected language
- All the discs of selected language

### About

This script was mostly written using ChatGPT with some manual tweaking. I made it because I did not find the other such scripts on GreasyFork to be 1. working properly 2. working with several languages etc...

Find it on Greasy Fork [here](https://greasyfork.org/en/scripts/532970-vgmdb-tracklist-copy).


## VGMdb Date Format
Fork of [VGMdb Date Format YYYY-MM-DD](https://greasyfork.org/en/scripts/527467-vgmdb-date-format-yyyy-mm-dd) by [tglsf](https://greasyfork.org/en/users/930481-tglsf)
Convert album page dates to YYYY-MM-DD (YYYY.MM.DD) format for easier metadata entry.

## VGMdb Metadata Format
Copy album metadata as a formatted string to clipboard.

Find it on Greasy Fork [here](https://greasyfork.org/en/scripts/556103-vgmdb-metadata-format).