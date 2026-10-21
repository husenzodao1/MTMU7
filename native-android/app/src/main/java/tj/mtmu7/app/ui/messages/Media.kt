package tj.mtmu7.app.ui.messages

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID
import kotlin.math.max
import kotlin.math.roundToInt

/** A photo as the site sends it (media.ts): the long edge at 1600 px, JPEG at 82, turned upright. */
data class PreparedPhoto(val file: File, val width: Int, val height: Int)

suspend fun preparePhoto(context: Context, uri: Uri): PreparedPhoto? = withContext(Dispatchers.IO) {
    runCatching {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        val longEdge = max(bounds.outWidth, bounds.outHeight)
        if (longEdge <= 0) return@runCatching null
        var sample = 1
        while (longEdge / (sample * 2) >= 1600) sample *= 2
        val decoded = context.contentResolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
        } ?: return@runCatching null
        val rotation = context.contentResolver.openInputStream(uri)?.use {
            when (ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                else -> 0f
            }
        } ?: 0f
        val scale = 1600f / max(decoded.width, decoded.height)
        val matrix = Matrix().apply {
            if (scale < 1f) postScale(scale, scale)
            if (rotation != 0f) postRotate(rotation)
        }
        val upright = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
        val dir = File(context.cacheDir, "outgoing").apply { mkdirs() }
        val file = File(dir, UUID.randomUUID().toString() + ".jpg")
        file.outputStream().use { upright.compress(Bitmap.CompressFormat.JPEG, 82, it) }
        PreparedPhoto(file, upright.width, upright.height)
    }.getOrNull()
}

/** The box a photo is drawn in, from its own shape (thread.tsx photoBox). */
fun photoBox(width: Long?, height: Long?): Pair<Int, Int> {
    val w = (width ?: 4).coerceAtLeast(1).toFloat()
    val h = (height ?: 3).coerceAtLeast(1).toFloat()
    var bw = w.coerceIn(160f, 260f)
    var bh = bw * h / w
    if (bh > 320f) {
        bh = 320f
        bw = (320f * w / h).coerceAtLeast(160f)
    }
    return bw.roundToInt() to bh.roundToInt()
}
