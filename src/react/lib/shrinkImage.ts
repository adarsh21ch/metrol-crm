/* Shared by the joining form (useJobApplications) and the weekly-views
   screenshots (useWeeklyViews) — one shrink-before-upload, not two. */

/** What actually made Submit look frozen: five files straight off a phone are
 *  20–30 MB, and on an Indian uplink that is a minute of silence.
 *
 *  A 4000px camera photo is shrunk to 1600px on its long edge at JPEG 0.82 —
 *  roughly 300 KB, a ten-fold cut. 1600px is chosen so a PAN or Aadhaar card
 *  stays READABLE: the numbers on one photographed edge-to-edge land around
 *  1100px wide at that size, well above what HR needs to check them. Shrinking
 *  further would start costing legibility, which is the whole point of
 *  collecting the document.
 *
 *  PDFs and anything already under 600 KB pass through untouched — a PDF has
 *  no pixels to resample, and a small file has nothing to win. Every failure
 *  path returns the ORIGINAL file: a browser that cannot decode the image must
 *  still be able to apply. */
const MAX_EDGE = 1600
const SHRINK_ABOVE = 600 * 1024

export async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size <= SHRINK_ABOVE) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    if (scale === 1) { bitmap.close(); return file }

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) { bitmap.close(); return file }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.82))
    // Only take the smaller one. An already-optimised JPEG can come back
    // BIGGER after a re-encode, and shipping that would be a loss.
    if (!blob || blob.size >= file.size) return file
    const base = file.name.replace(/\.[^.]+$/, '')
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
  } catch {
    return file
  }
}
