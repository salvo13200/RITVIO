package it.ritvio.android

import org.json.JSONObject

/** Only local, user-owned playlists can have personal artwork. */
internal object PlaylistArtworkRules {
    fun validate(kind: String, id: String) {
        require(kind == "playlist" && Regex("^[A-Za-z0-9-]{1,100}$").matches(id))
    }

    /** Retire overrides from the 1.1.0 candidate, preserving all playlist references. */
    fun retireTrackOverrides(state: JSONObject): List<String> {
        val images = state.optJSONObject("artwork")
        state.remove("artwork")
        if (images == null) return emptyList()
        val playlists = state.optJSONArray("playlists")
        val retained = (0 until (playlists?.length() ?: 0)).mapNotNull {
            playlists?.optJSONObject(it)?.optString("cover")
        }.toSet()
        return images.keys().asSequence().map { images.optString(it) }
            .filter { it.isNotEmpty() && it !in retained }.distinct().toList()
    }
}
