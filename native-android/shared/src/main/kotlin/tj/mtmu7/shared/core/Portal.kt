package tj.mtmu7.shared.core

import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * The few things only the portal's server may do, called with the app's own
 * session: signing in by login (MT10001) or nickname, whose address only the
 * server may look up; and asking for the push that tells the others a
 * message has come.
 */
class Portal(private val baseUrl: String, private val token: () -> String?) {
    private val http = HttpClient(OkHttp) {
        install(HttpTimeout) {
            requestTimeoutMillis = 25_000
            connectTimeoutMillis = 15_000
        }
        expectSuccess = false
    }

    data class Answer(val status: Int, val body: String)

    suspend fun post(path: String, body: JsonObject, signed: Boolean = true): Answer {
        val response = http.post(baseUrl.trimEnd('/') + path) {
            contentType(ContentType.Application.Json)
            if (signed) token()?.let { header("Authorization", "Bearer $it") }
            setBody(AppJson.encodeToString(JsonObject.serializer(), body))
        }
        return Answer(response.status.value, response.bodyAsText())
    }

    /** "This message is sent": the portal sends the push to the others (src/app/api/push/message). */
    suspend fun announceMessage(id: String) {
        runCatching { post("/api/push/message", buildJsonObject { put("id", id) }) }
    }

    fun isOk(status: Int) = io.ktor.http.HttpStatusCode.fromValue(status).isSuccess()
}
