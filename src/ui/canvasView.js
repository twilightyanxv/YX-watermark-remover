import { State } from '../core/state.js'
import { t } from '../i18n.js'

export class CanvasView {
  constructor(container, stateMachine, selectionManager) {
    this.container = container
    this.state = stateMachine
    this.sel = selectionManager

    this.canvas = document.getElementById('main-canvas')
    this.ctx = this.canvas.getContext('2d')

    this.originalImage = null
    this.processedImage = null
    this.imageWidth = 0
    this.imageHeight = 0

    this.offsetX = 0
    this.offsetY = 0
    this.scale = 1

    this._isPanning = false
    this._isDrawing = false
    this._panStart = { x: 0, y: 0 }
    this._offsetStart = { x: 0, y: 0 }
    this._drawStart = { x: 0, y: 0 }
    this._currentRect = null

    this.showOriginal = true
    this._comparing = false
    this._resizeTimer = null
    this._needsRender = false
    this._animFrameId = null

    this._initEvents()
    this._resize()

    this.state.on(State.PROCESSING, () => this._startAnim())
    this.state.on(State.COMPLETED, () => this._stopAnim())
    this.state.on(State.ERROR, () => this._stopAnim())

    document.addEventListener('localechange', () => this.render())
  }

  _resize() {
    const rect = this.container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    this.canvas.width = rect.width * dpr
    this.canvas.height = rect.height * dpr
    this.canvas.style.width = rect.width + 'px'
    this.canvas.style.height = rect.height + 'px'
    this.ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.ctx.scale(dpr, dpr)
    this._needsRender = true
    this.render()
  }

  setImage(image) {
    this.originalImage = image
    this.processedImage = null
    this.imageWidth = image.width
    this.imageHeight = image.height
    this.showOriginal = true
    this._fitToView()
    this.render()
  }

  async setProcessedResult(imageData) {
    const imgData = new ImageData(
      new Uint8ClampedArray(imageData),
      this.imageWidth,
      this.imageHeight
    )
    const oc = new OffscreenCanvas(imgData.width, imgData.height)
    const octx = oc.getContext('2d')
    octx.putImageData(imgData, 0, 0)
    const blob = await oc.convertToBlob()
    this.processedImage = await createImageBitmap(blob)
    this.showOriginal = false
    this.render()
  }

  toggleCompare() {
    if (!this.processedImage) return
    this.showOriginal = !this.showOriginal
    this.render()
  }

  _fitToView() {
    const rect = this.container.getBoundingClientRect()
    const pad = 40
    const vw = rect.width - pad * 2
    const vh = rect.height - pad * 2

    if (this.imageWidth === 0 || this.imageHeight === 0) return

    const scaleX = vw / this.imageWidth
    const scaleY = vh / this.imageHeight
    this.scale = Math.min(scaleX, scaleY, 1)

    this.offsetX = (rect.width - this.imageWidth * this.scale) / 2
    this.offsetY = (rect.height - this.imageHeight * this.scale) / 2
  }

  _initEvents() {
    window.addEventListener('resize', () => {
      clearTimeout(this._resizeTimer)
      this._resizeTimer = setTimeout(() => this._resize(), 100)
    })
    this._onResize = () => this._resize()

    this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e))
    this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e))
    this.canvas.addEventListener('mouseup', (e) => this._onMouseUp(e))
    this.canvas.addEventListener('mouseleave', (e) => this._onMouseUp(e))
    this.canvas.addEventListener('wheel', (e) => this._onWheel(e), { passive: false })
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault())

    // Touch support
    this.canvas.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: false })
    this.canvas.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false })
    this.canvas.addEventListener('touchend', (e) => this._onTouchEnd(e), { passive: false })
  }

  _screenToImage(sx, sy) {
    const rect = this.canvas.getBoundingClientRect()
    const x = (sx - rect.left - this.offsetX) / this.scale
    const y = (sy - rect.top - this.offsetY) / this.scale
    return { x, y }
  }

  _imageToScreen(ix, iy) {
    const rect = this.canvas.getBoundingClientRect()
    return {
      x: ix * this.scale + this.offsetX + rect.left,
      y: iy * this.scale + this.offsetY + rect.top,
    }
  }

  /* ────────── Mouse ────────── */

  _onMouseDown(e) {
    if (e.button === 2) {
      this._isPanning = true
      this._panStart = { x: e.clientX, y: e.clientY }
      this._offsetStart = { x: this.offsetX, y: this.offsetY }
      this.container.classList.add('grabbing')
      this.container.classList.remove('panning')
      return
    }

    if (e.button !== 0) return

    // Compare mode: hold to see original
    if (this.processedImage && !this.showOriginal) {
      this._comparing = true
      this.showOriginal = true
      this.render()
      this._emitCompare(true)
      return
    }

    if (!this.originalImage) return

    const img = this._screenToImage(e.clientX, e.clientY)
    const hit = this.sel.hitTest(img.x, img.y)
    if (hit >= 0) {
      this.sel.remove(hit)
      this._needsRender = true
      this.render()
      this._emitChange()
      return
    }

    this._isDrawing = true
    this._drawStart = { x: e.clientX, y: e.clientY }
    this._currentRect = null
    this.state.set(State.SELECTING)
  }

  _onMouseMove(e) {
    if (this._isPanning) {
      const dx = e.clientX - this._panStart.x
      const dy = e.clientY - this._panStart.y
      this.offsetX = this._offsetStart.x + dx
      this.offsetY = this._offsetStart.y + dy
      this._needsRender = true
      this.render()
      return
    }

    if (!this._isDrawing || !this.originalImage) return

    const imgStart = this._screenToImage(this._drawStart.x, this._drawStart.y)
    const imgEnd = this._screenToImage(e.clientX, e.clientY)
    this._currentRect = {
      x: imgStart.x,
      y: imgStart.y,
      w: imgEnd.x - imgStart.x,
      h: imgEnd.y - imgStart.y,
    }
    this._needsRender = true
    this.render()
  }

  _onMouseUp(e) {
    if (this._comparing) {
      this._comparing = false
      this.showOriginal = false
      this.render()
      this._emitCompare(false)
      return
    }

    if (this._isPanning) {
      this._isPanning = false
      this.container.classList.remove('grabbing')
      this.container.classList.add('panning')
      return
    }

    if (!this._isDrawing) return
    this._isDrawing = false

    if (this._currentRect && Math.abs(this._currentRect.w) > 2 && Math.abs(this._currentRect.h) > 2) {
      this.sel.add(
        this._currentRect.x,
        this._currentRect.y,
        this._currentRect.w,
        this._currentRect.h
      )
      this._emitChange()
    }

    this._currentRect = null
    this.state.set(State.IMAGE_LOADED)
    this._needsRender = true
    this.render()
  }

  _onWheel(e) {
    e.preventDefault()
    if (!this.originalImage) return

    const rect = this.canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    const factor = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.max(0.1, Math.min(20, this.scale * factor))

    // Zoom toward cursor
    this.offsetX = mx - (mx - this.offsetX) * (newScale / this.scale)
    this.offsetY = my - (my - this.offsetY) * (newScale / this.scale)
    this.scale = newScale

    this._needsRender = true
    this.render()
  }

  /* ────────── Touch ────────── */

  _onTouchStart(e) {
    e.preventDefault()
    if (e.touches.length === 1) {
      const t = e.touches[0]
      if (!this.originalImage) return

      const img = this._screenToImage(t.clientX, t.clientY)
      const hit = this.sel.hitTest(img.x, img.y)
      if (hit >= 0) {
        this.sel.remove(hit)
        this._emitChange()
        this.render()
        return
      }

      this._isDrawing = true
      this._drawStart = { x: t.clientX, y: t.clientY }
      this._currentRect = null
      this.state.set(State.SELECTING)
    } else if (e.touches.length === 2) {
      this._isDrawing = false
      const t = e.touches
      this._pinchDist = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
      this._pinchScale = this.scale
      this._pinchOffset = { x: this.offsetX, y: this.offsetY }
      this._pinchCenter = {
        x: (t[0].clientX + t[1].clientX) / 2,
        y: (t[0].clientY + t[1].clientY) / 2,
      }
    }
  }

  _onTouchMove(e) {
    e.preventDefault()
    if (e.touches.length === 1 && this._isDrawing) {
      const t = e.touches[0]
      if (!this.originalImage) return
      const imgStart = this._screenToImage(this._drawStart.x, this._drawStart.y)
      const imgEnd = this._screenToImage(t.clientX, t.clientY)
      this._currentRect = {
        x: imgStart.x,
        y: imgStart.y,
        w: imgEnd.x - imgStart.x,
        h: imgEnd.y - imgStart.y,
      }
      this.render()
    } else if (e.touches.length === 2 && this._pinchDist) {
      const t = e.touches
      const dist = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
      const newScale = Math.max(0.1, Math.min(20, this._pinchScale * (dist / this._pinchDist)))

      // Pan: track center movement
      const cx = (t[0].clientX + t[1].clientX) / 2
      const cy = (t[0].clientY + t[1].clientY) / 2
      const dx = cx - this._pinchCenter.x
      const dy = cy - this._pinchCenter.y

      // Apply zoom centered on the initial pinch center
      const rect = this.canvas.getBoundingClientRect()
      const mx = this._pinchCenter.x - rect.left
      const my = this._pinchCenter.y - rect.top

      this.offsetX = this._pinchOffset.x + dx
      this.offsetY = this._pinchOffset.y + dy
      this.scale = newScale

      this.render()
    }
  }

  _onTouchEnd(e) {
    if (this._isDrawing) {
      this._isDrawing = false
      if (this._currentRect && Math.abs(this._currentRect.w) > 2 && Math.abs(this._currentRect.h) > 2) {
        this.sel.add(
          this._currentRect.x,
          this._currentRect.y,
          this._currentRect.w,
          this._currentRect.h
        )
        this._emitChange()
      }
      this._currentRect = null
      this.state.set(State.IMAGE_LOADED)
      this.render()
    }
    this._pinchDist = null
  }

  /* ────────── Render ────────── */

  render() {
    const dpr = window.devicePixelRatio || 1
    const ctx = this.ctx
    const w = this.canvas.width / dpr
    const h = this.canvas.height / dpr

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)

    // Clear
    ctx.fillStyle = '#0d0d1a'
    ctx.fillRect(0, 0, w, h)

    if (!this.originalImage) return

    // Draw image
    ctx.save()
    ctx.translate(this.offsetX, this.offsetY)
    ctx.scale(this.scale, this.scale)

    if (this.processedImage && !this.showOriginal) {
      ctx.drawImage(this.processedImage, 0, 0)
    } else {
      ctx.drawImage(this.originalImage, 0, 0)
    }

    // Draw selection regions overlay (semi-transparent red)
    for (const s of this.sel.items) {
      ctx.fillStyle = 'rgba(233, 69, 96, 0.25)'
      ctx.strokeStyle = '#e94560'
      ctx.lineWidth = 2 / this.scale
      ctx.fillRect(s.x, s.y, s.w, s.h)
      ctx.strokeRect(s.x, s.y, s.w, s.h)
    }

    // Processing animation: pulsing overlay on selections
    if (this.state.state === State.PROCESSING) {
      const t = Date.now() / 400
      const pulse = 0.25 + 0.3 * Math.abs(Math.sin(t))
      for (const s of this.sel.items) {
        ctx.fillStyle = `rgba(0, 122, 255, ${pulse})`
        ctx.fillRect(s.x, s.y, s.w, s.h)
        ctx.strokeStyle = `rgba(0, 122, 255, ${pulse + 0.3})`
        ctx.lineWidth = 3 / this.scale
        ctx.setLineDash([6 / this.scale, 4 / this.scale])
        ctx.strokeRect(s.x, s.y, s.w, s.h)
        ctx.setLineDash([])
      }
    }

    // Draw current drawing rect
    if (this._currentRect) {
      ctx.fillStyle = 'rgba(233, 69, 96, 0.2)'
      ctx.strokeStyle = '#ff6b81'
      ctx.lineWidth = 2 / this.scale
      ctx.setLineDash([8 / this.scale, 4 / this.scale])
      ctx.fillRect(
        this._currentRect.x,
        this._currentRect.y,
        this._currentRect.w,
        this._currentRect.h
      )
      ctx.strokeRect(
        this._currentRect.x,
        this._currentRect.y,
        this._currentRect.w,
        this._currentRect.h
      )
      ctx.setLineDash([])
    }

    ctx.restore()

    // Draw watermark text at bottom
    if (!this.originalImage) return
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(
      `${this.imageWidth} × ${this.imageHeight}  ${t('zoom', { pct: Math.round(this.scale * 100) })}`,
      w / 2,
      h - 12
    )
  }

  _startAnim() {
    const tick = () => {
      if (this.state.state !== State.PROCESSING) return
      this.render()
      this._animFrameId = requestAnimationFrame(tick)
    }
    this._animFrameId = requestAnimationFrame(tick)
  }

  _stopAnim() {
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId)
      this._animFrameId = null
    }
  }

  _emitChange() {
    this.container.dispatchEvent(new CustomEvent('selectionchange', {
      detail: { count: this.sel.count },
    }))
  }

  _emitCompare(showOriginal) {
    this.container.dispatchEvent(new CustomEvent('comparechange', {
      detail: { showOriginal },
    }))
  }
}
