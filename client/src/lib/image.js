/**
 * Image helpers shared by uploads and export:
 *  - fileToDownscaledBlob: shrink a picked file before we send it to the API
 *  - urlToDataURL: inline a (possibly remote) image as a data: URL so SVG/PNG
 *    export can embed it — an <svg> loaded as an image can't fetch anything.
 */

/** Does the drawn canvas contain any non-opaque pixel? (samples every 4th) */
function hasAlpha(ctx, width, height) {
  const { data } = ctx.getImageData(0, 0, width, height)
  for (let i = 3; i < data.length; i += 16) {
    if (data[i] < 255) return true
  }
  return false
}

/**
 * Draw `file` into an offscreen canvas, downscale so the longest side is at
 * most `maxDim`, and export it. PNG sources (or anything with real alpha)
 * stay PNG so transparency survives; everything else becomes JPEG.
 *
 * @returns {Promise<{ blob: Blob, width: number, height: number, type: string }>}
 */
export function fileToDownscaledBlob(file, maxDim = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      let canvas = null
      try {
        const naturalW = img.naturalWidth || img.width
        const naturalH = img.naturalHeight || img.height
        if (!naturalW || !naturalH) throw new Error('Image has no dimensions')

        const scale = Math.min(1, maxDim / Math.max(naturalW, naturalH))
        const width = Math.max(1, Math.round(naturalW * scale))
        const height = Math.max(1, Math.round(naturalH * scale))

        canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.clearRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)

        let type = 'image/jpeg'
        if (file.type === 'image/png') type = 'image/png'
        else if (file.type !== 'image/jpeg' && hasAlpha(ctx, width, height)) type = 'image/png'

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url)
            if (!blob) {
              reject(new Error('Could not encode the image'))
              return
            }
            resolve({ blob, width, height, type })
          },
          type,
          quality,
        )
      } catch (error) {
        URL.revokeObjectURL(url)
        reject(error)
      }
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read that image file'))
    }

    img.src = url
  })
}

/**
 * Fetch a URL (CORS permitting) and return it as a `data:` URL string.
 * Data URLs pass straight through.
 */
export async function urlToDataURL(url) {
  if (typeof url === 'string' && url.startsWith('data:')) return url

  const response = await fetch(url, { mode: 'cors' })
  if (!response.ok) throw new Error(`Could not load image (HTTP ${response.status})`)

  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read image data'))
    reader.readAsDataURL(blob)
  })
}
