/**
 * Create a binary mask from selection rects.
 * @param {number} w
 * @param {number} h
 * @param {Array<{x:number,y:number,w:number,h:number}>} selections
 * @returns {Uint8Array} mask[w*h] — 1 = selected, 0 = known
 */
function buildMask(w, h, selections) {
  const mask = new Uint8Array(w * h)
  for (const s of selections) {
    const x1 = Math.max(0, Math.round(s.x))
    const y1 = Math.max(0, Math.round(s.y))
    const x2 = Math.min(w, Math.round(s.x + s.w))
    const y2 = Math.min(h, Math.round(s.y + s.h))
    for (let row = y1; row < y2; row++) {
      mask.fill(1, row * w + x1, row * w + x2)
    }
  }
  return mask
}

/* ──────────── 1. 快速邻近填充 ──────────── */

export function neighborFill(imageData, w, h, selections) {
  const src = new Uint8ClampedArray(imageData)
  const dst = new Uint8ClampedArray(imageData)
  const mask = buildMask(w, h, selections)

  const maxR = Math.max(w, h)
  // 4 main directions
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]]

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const mi = y * w + x
      if (!mask[mi]) continue

      let r = 0, g = 0, b = 0, count = 0

      for (const [dx, dy] of dirs) {
        for (let s = 1; s <= maxR; s++) {
          const nx = x + dx * s
          const ny = y + dy * s
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) break
          if (!mask[ny * w + nx]) {
            const pi = (ny * w + nx) * 4
            r += src[pi]
            g += src[pi + 1]
            b += src[pi + 2]
            count++
            break
          }
        }
      }

      if (count > 0) {
        const di = mi * 4
        dst[di] = r / count
        dst[di + 1] = g / count
        dst[di + 2] = b / count
      }
    }
  }
  return dst
}

/* ──────────── 2. 均值模糊 + 羽化 ──────────── */

export function blurFill(imageData, w, h, selections) {
  const src = new Uint8ClampedArray(imageData)
  const dst = new Uint8ClampedArray(imageData)
  const mask = buildMask(w, h, selections)

  const radius = 5
  const size = radius * 2 + 1

  // Horizontal pass
  const tmp = new Uint8ClampedArray(src)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const mi = y * w + x
      if (!mask[mi]) continue
      let r = 0, g = 0, b = 0, n = 0
      for (let kx = -radius; kx <= radius; kx++) {
        const sx = x + kx
        if (sx < 0 || sx >= w) continue
        const si = (y * w + sx) * 4
        r += src[si]; g += src[si + 1]; b += src[si + 2]; n++
      }
      if (n > 0) {
        const di = mi * 4
        tmp[di] = r / n; tmp[di + 1] = g / n; tmp[di + 2] = b / n
      }
    }
  }

  // Vertical pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const mi = y * w + x
      if (!mask[mi]) continue
      let r = 0, g = 0, b = 0, n = 0
      for (let ky = -radius; ky <= radius; ky++) {
        const sy = y + ky
        if (sy < 0 || sy >= h) continue
        const si = (sy * w + x) * 4
        r += tmp[si]; g += tmp[si + 1]; b += tmp[si + 2]; n++
      }
      if (n > 0) {
        const di = mi * 4
        dst[di] = r / n; dst[di + 1] = g / n; dst[di + 2] = b / n
      }
    }
  }

  // Feather edges: blend with original at selection boundary
  feather(dst, src, mask, w, h)

  return dst
}

function feather(dst, src, mask, w, h) {
  // Find boundary pixels and blend them with original
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const mi = y * w + x
      if (!mask[mi]) continue

      // Check if this is a boundary pixel (adjacent to non-selected)
      let boundary = false
      const neighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]]
      for (const [dx, dy] of neighbors) {
        const nx = x + dx, ny = y + dy
        if (nx >= 0 && nx < w && ny >= 0 && ny < h && !mask[ny * w + nx]) {
          boundary = true
          break
        }
      }

      if (boundary) {
        const di = mi * 4
        dst[di] = (dst[di] + src[di]) / 2
        dst[di + 1] = (dst[di + 1] + src[di + 1]) / 2
        dst[di + 2] = (dst[di + 2] + src[di + 2]) / 2
      }
    }
  }
}

/* ──────────── 3. Criminisi 纹理合成 ──────────── */

const PATCH_HALF = 4
const PATCH_SIZE = 9

export function criminisiInpaint(imageData, w, h, selections) {
  const src = new Uint8ClampedArray(imageData)
  const dst = new Uint8ClampedArray(imageData)
  const mask = buildMask(w, h, selections)

  let remaining = 0
  const conf = new Float64Array(w * h)
  const filled = new Uint8Array(w * h)

  for (let i = 0; i < w * h; i++) {
    if (mask[i]) {
      conf[i] = 0
      filled[i] = 0
      remaining++
    } else {
      conf[i] = 1
      filled[i] = 1
    }
  }
  if (remaining === 0) return dst

  const maxIter = Math.max(remaining * 2, w * h)
  const patchArea = PATCH_SIZE * PATCH_SIZE

  for (let iter = 0; iter < maxIter && remaining > 0; iter++) {
    const front = []
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x
        if (!mask[idx] || filled[idx]) continue
        if (_hasKNeighbor(x, y, filled, w, h)) {
          front.push({ x, y })
        }
      }
    }

    if (front.length === 0) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (mask[y * w + x] && !filled[y * w + x]) {
            front.push({ x, y })
          }
        }
      }
    }
    if (front.length === 0) break

    let bestP = null
    let bestPri = -1

    for (const p of front) {
      const pri = _priority(dst, conf, filled, p.x, p.y, w, h, patchArea)
      if (pri > bestPri) {
        bestPri = pri
        bestP = p
      }
    }

    if (!bestP) break

    const { sx: bestSX, sy: bestSY } = _findPatch(
      dst, filled, bestP.x, bestP.y, w, h
    )

    let copied = 0
    if (bestSX >= 0) {
      const srcConf = conf[bestSY * w + bestSX]
      for (let dy = -PATCH_HALF; dy <= PATCH_HALF; dy++) {
        for (let dx = -PATCH_HALF; dx <= PATCH_HALF; dx++) {
          const tx = bestP.x + dx, ty = bestP.y + dy
          if (tx < 0 || tx >= w || ty < 0 || ty >= h) continue
          const ti = ty * w + tx
          if (!mask[ti] || filled[ti]) continue
          const si = ((bestSY + dy) * w + (bestSX + dx)) * 4
          const di = ti * 4
          dst[di] = dst[si]
          dst[di + 1] = dst[si + 1]
          dst[di + 2] = dst[si + 2]
          filled[ti] = 1
          conf[ti] = srcConf
          remaining--
          copied++
        }
      }
    }

    if (copied === 0) {
      if (!filled[bestP.y * w + bestP.x]) {
        _fillNearest(dst, conf, filled, bestP.x, bestP.y, w, h)
        remaining--
      }
    }
  }

  return dst
}

function _hasKNeighbor(x, y, filled, w, h) {
  return (
    (x > 0     && filled[y * w + x - 1]) ||
    (x < w - 1 && filled[y * w + x + 1]) ||
    (y > 0     && filled[(y - 1) * w + x]) ||
    (y < h - 1 && filled[(y + 1) * w + x])
  )
}

function _priority(dst, conf, filled, px, py, w, h, patchArea) {
  // Confidence term C(p) = Σ C(q) for q in patch / |patch|
  let confSum = 0
  for (let dy = -PATCH_HALF; dy <= PATCH_HALF; dy++) {
    for (let dx = -PATCH_HALF; dx <= PATCH_HALF; dx++) {
      const sx = px + dx, sy = py + dy
      if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue
      confSum += conf[sy * w + sx]
    }
  }
  const C = confSum / patchArea
  if (C <= 0) return 0

  // Data term D(p) = |∇I_p^⊥ · n_p| / 255
  // Sobel gradient on filled pixels only
  let gx = 0, gy = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const sx = px + dx, sy = py + dy
      if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue
      if (!filled[sy * w + sx]) continue
      const si = (sy * w + sx) * 4
      const gray = dst[si] * 0.299 + dst[si + 1] * 0.587 + dst[si + 2] * 0.114
      const wx = dx === 0 ? 0 : (dx < 0 ? -1 : 1)
      const wy = dy === 0 ? 0 : (dy < 0 ? -1 : 1)
      if (dx !== 0) gx += wx * (dy === 0 ? 2 : 1) * gray
      if (dy !== 0) gy += wy * (dx === 0 ? 2 : 1) * gray
    }
  }

  // Isophote = perpendicular to gradient
  const isoX = -gy, isoY = gx
  const isoLen = Math.sqrt(isoX * isoX + isoY * isoY) || 1

  // Boundary normal: points from boundary into unknown region
  // Gradient of filled map at boundary
  let nx = 0, ny = 0
  if (px > 0 && px < w - 1) {
    const r = filled[py * w + px + 1] ? 1 : 0
    const l = filled[py * w + px - 1] ? 1 : 0
    nx = r - l
  }
  if (py > 0 && py < h - 1) {
    const b = filled[(py + 1) * w + px] ? 1 : 0
    const t = filled[(py - 1) * w + px] ? 1 : 0
    ny = b - t
  }
  const nLen = Math.sqrt(nx * nx + ny * ny) || 1

  const D = Math.abs(isoX * nx + isoY * ny) / (isoLen * nLen * 255)
  return C * D
}

function _findPatch(dst, filled, px, py, w, h) {
  // Collect target patch info
  const offsets = []
  const tgtKnown = []
  const tgtVals = []

  for (let dy = -PATCH_HALF; dy <= PATCH_HALF; dy++) {
    for (let dx = -PATCH_HALF; dx <= PATCH_HALF; dx++) {
      const sx = px + dx, sy = py + dy
      if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue
      offsets.push({ dx, dy })
      const k = filled[sy * w + sx]
      tgtKnown.push(k)
      if (k) {
        const si = (sy * w + sx) * 4
        tgtVals.push(dst[si], dst[si + 1], dst[si + 2])
      } else {
        tgtVals.push(0, 0, 0)
      }
    }
  }

  const knownCount = tgtKnown.filter(Boolean).length
  if (knownCount === 0) return { sx: -1, sy: -1 }
  const totalOffsets = offsets.length

  // Search with expanding radius
  for (let searchR = 60; searchR <= 200; searchR *= 2) {
    let bestSSD = Infinity, bestSX = -1, bestSY = -1
    const x0 = Math.max(PATCH_HALF, px - searchR)
    const x1 = Math.min(w - PATCH_HALF - 1, px + searchR)
    const y0 = Math.max(PATCH_HALF, py - searchR)
    const y1 = Math.min(h - PATCH_HALF - 1, py + searchR)

    for (let sy = y0; sy <= y1; sy += 2) {
      for (let sx = x0; sx <= x1; sx += 2) {
        // Source patch center must be known
        if (!filled[sy * w + sx]) continue
        // All pixels in source patch must be known
        let valid = true
        for (const { dx, dy } of offsets) {
          const csx = sx + dx, csy = sy + dy
          if (csx < 0 || csx >= w || csy < 0 || csy >= h || !filled[csy * w + csx]) {
            valid = false
            break
          }
        }
        if (!valid) continue

        let ssd = 0
        for (let t = 0; t < totalOffsets; t++) {
          if (!tgtKnown[t]) continue
          const { dx, dy } = offsets[t]
          const csi = ((sy + dy) * w + (sx + dx)) * 4
          const dr = tgtVals[t * 3] - dst[csi]
          const dg = tgtVals[t * 3 + 1] - dst[csi + 1]
          const db = tgtVals[t * 3 + 2] - dst[csi + 2]
          ssd += dr * dr + dg * dg + db * db
        }
        ssd /= knownCount
        if (ssd < bestSSD) { bestSSD = ssd; bestSX = sx; bestSY = sy }
      }
    }

    if (bestSX >= 0) return { sx: bestSX, sy: bestSY }
  }

  return { sx: -1, sy: -1 }
}

function _fillNearest(dst, conf, filled, x, y, w, h) {
  let bestDist = Infinity, bestSI = -1
  const maxR = Math.max(w, h)

  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue
        const sx = x + dx, sy = y + dy
        if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue
        if (!filled[sy * w + sx]) continue
        const d = dx * dx + dy * dy
        if (d < bestDist) { bestDist = d; bestSI = (sy * w + sx) * 4 }
      }
    }
    if (bestSI >= 0) break
  }

  if (bestSI >= 0) {
    const di = (y * w + x) * 4
    dst[di] = dst[bestSI]; dst[di + 1] = dst[bestSI + 1]; dst[di + 2] = dst[bestSI + 2]
    filled[y * w + x] = 1
    conf[y * w + x] = 0.5
  }
}
