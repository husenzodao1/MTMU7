/**
 * A photo made small in the browser before it is uploaded: a phone's photo is
 * several megabytes, and an avatar shown forty pixels wide, or a news cover,
 * fetched that size on a school's line arrives late or not at all. Redrawn
 * the right way up at `maxEdge` as a JPEG, it is a few dozen kilobytes. What
 * cannot be read, or would not come out smaller, goes up as it was.
 */
export async function shrinkPhoto(file: File, maxEdge: number): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    let source: CanvasImageSource;
    let width: number;
    let height: number;
    let release = () => {};
    if ("createImageBitmap" in window) {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      [source, width, height, release] = [bitmap, bitmap.width, bitmap.height, () => bitmap.close()];
    } else {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.src = url;
      await image.decode();
      [source, width, height, release] = [image, image.naturalWidth, image.naturalHeight, () => URL.revokeObjectURL(url)];
    }
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      release();
      return file;
    }
    // White under a transparent PNG, or it turns black as a JPEG.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    release();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]*$/, "") || "photo"}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
