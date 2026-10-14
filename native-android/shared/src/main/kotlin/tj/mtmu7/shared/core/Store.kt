package tj.mtmu7.shared.core

import kotlinx.serialization.KSerializer
import tj.mtmu7.shared.db.AppDatabase

/** Small values and JSON documents the app keeps between launches. */
class Store(private val db: AppDatabase) {
    fun get(key: String): String? = db.storeQueries.get(key).executeAsOneOrNull()
    fun put(key: String, value: String) {
        db.storeQueries.put(key, value)
    }

    fun remove(key: String) {
        db.storeQueries.remove(key)
    }

    fun <T> getJson(key: String, serializer: KSerializer<T>): T? =
        get(key)?.let { runCatching { AppJson.decodeFromString(serializer, it) }.getOrNull() }

    fun <T> putJson(key: String, serializer: KSerializer<T>, value: T) {
        put(key, AppJson.encodeToString(serializer, value))
    }

    /** A cached document and when it was fetched. */
    fun <T> cached(key: String, serializer: KSerializer<T>): Pair<T, Long>? =
        db.storeQueries.cached(key).executeAsOneOrNull()?.let { row ->
            runCatching { AppJson.decodeFromString(serializer, row.json) }.getOrNull()?.let { it to row.fetched_at }
        }

    fun <T> putCached(key: String, serializer: KSerializer<T>, value: T) {
        db.storeQueries.putCache(key, AppJson.encodeToString(serializer, value), System.currentTimeMillis())
    }

    /** Signing out: nothing of this person stays on the phone. */
    fun wipe() {
        db.transaction {
            db.storeQueries.clear()
            db.storeQueries.clearCache()
            db.storeQueries.clearPendingReads()
            db.conversationQueries.clear()
            db.messageQueries.clear()
            db.memberQueries.clear()
        }
    }
}
