export class SelectionManager {
  constructor() {
    this._items = []
  }

  get items() {
    return this._items
  }

  get count() {
    return this._items.length
  }

  add(x, y, w, h) {
    const rect = {
      x: w >= 0 ? x : x + w,
      y: h >= 0 ? y : y + h,
      w: Math.abs(w),
      h: Math.abs(h),
    }
    this._items.push(rect)
  }

  remove(index) {
    if (index >= 0 && index < this._items.length) {
      this._items.splice(index, 1)
    }
  }

  pop() {
    return this._items.pop()
  }

  clear() {
    this._items = []
  }

  hitTest(px, py) {
    for (let i = this._items.length - 1; i >= 0; i--) {
      const { x, y, w, h } = this._items[i]
      if (px >= x && px <= x + w && py >= y && py <= y + h) return i
    }
    return -1
  }

  getAll() {
    return this._items.map(r => ({ ...r }))
  }

  /** Build selection mask for a given ImageData region */
  buildMask(width, height) {
    const mask = new Uint8Array(width * height)
    for (const { x, y, w, h } of this._items) {
      const x1 = Math.max(0, Math.round(x))
      const y1 = Math.max(0, Math.round(y))
      const x2 = Math.min(width, Math.round(x + w))
      const y2 = Math.min(height, Math.round(y + h))
      for (let row = y1; row < y2; row++) {
        const start = row * width + x1
        mask.fill(1, start, start + (x2 - x1))
      }
    }
    return mask
  }
}
