# Lyrics on the smart speaker player page

The smart speaker player page reads lyrics through the host's `/api/v1/songs/{id}/lyric` endpoint. When a song has no existing lyrics, the host calls registered lyric search plugins and caches successful results in the library. The smart speaker plugin does not need separate lyric provider settings.

1. Install and enable the Lyrics Search plugin.
2. Open its configuration page, turn on lyric search, and save. Enabling the plugin alone does not enable searching; search is off in the default configuration.
3. Play a library song in the smart speaker plugin and click the lyrics button, or swipe left on the mobile fullscreen player.

The page shows a loading message while searching. A missing result prompts you to check the lyric search plugin; a failed request shows an error and a button to fetch lyrics again. Retrying uses the host's `refresh=1` behavior, which still protects file, embedded, and manual lyrics. Responses from an earlier song cannot overwrite the page after switching songs or stopping playback.

The lyric proxy waits up to 30 seconds, allowing room for the host's 15-second search budget per provider. Multiple providers timing out in sequence can still exceed this proxy budget; retry if necessary. Results depend on song metadata, provider coverage, and connectivity.

These are lyrics on the plugin's web page. Lyrics on a speaker's own touchscreen use the separate touchscreen lyrics setting and depend on Music API support and cloud catalog matching. External songs pushed without library import have no valid library song ID and cannot use this lyric endpoint.
