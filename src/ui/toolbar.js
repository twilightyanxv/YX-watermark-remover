import { State } from '../core/state.js'

export class Toolbar {
  constructor(stateMachine, selectionManager, uploadManager, canvasView, workerClient) {
    this.state = stateMachine
    this.sel = selectionManager
    this.upload = uploadManager
    this.canvas = canvasView
    this.worker = workerClient

    this._btnUpload = document.getElementById('btn-upload')
    this._btnUndo = document.getElementById('btn-undo')
    this._btnClear = document.getElementById('btn-clear')
    this._btnProcess = document.getElementById('btn-process')
    this._btnExport = document.getElementById('btn-export')
    this._btnCompare = document.getElementById('btn-compare')
    this._selCount = document.getElementById('sel-count')
    this._statusBar = document.getElementById('status-bar')
    this._exportFormat = document.getElementById('export-format')

    this._initEvents()
    this._initStateListeners()
  }

  _initEvents() {
    this._btnUpload.addEventListener('click', () => this.upload.openFileDialog())

    this._btnUndo.addEventListener('click', () => {
      this.sel.clear()
      this.canvas.processedImage = null
      this.canvas.showOriginal = true
      this.state.set(State.IMAGE_LOADED)
      this._updateUI()
      this.canvas.render()
    })

    this._btnClear.addEventListener('click', () => {
      this.sel.clear()
      this._updateUI()
      this.canvas.render()
    })

    this._btnProcess.addEventListener('click', () => this._process())

    this._btnExport.addEventListener('click', () => this._export())

    this._btnCompare.addEventListener('click', () => {
      this.canvas.toggleCompare()
      this._btnCompare.textContent = this.canvas.showOriginal ? '查看结果' : '对比原图'
    })

    // Listen for selection changes from canvas
    const container = document.getElementById('canvas-container')
    container.addEventListener('selectionchange', () => this._updateUI())
    container.addEventListener('comparechange', (e) => {
      this._btnCompare.textContent = e.detail.showOriginal ? '查看结果' : '对比原图'
    })
  }

  _initStateListeners() {
    this.state.on(State.IDLE, () => this._updateUI())
    this.state.on(State.IMAGE_LOADED, () => this._updateUI())
    this.state.on(State.PROCESSING, () => this._updateUI())
    this.state.on(State.COMPLETED, () => this._updateUI())
    this.state.on(State.ERROR, () => this._updateUI())
  }

  _updateUI() {
    const st = this.state.state
    const hasImage = st !== State.IDLE
    const hasSel = this.sel.count > 0
    const hasResult = st === State.COMPLETED
    const isProcessing = st === State.PROCESSING

    this._btnUndo.disabled = (!hasSel && !hasResult) || isProcessing
    this._btnClear.disabled = !hasSel || isProcessing
    this._btnProcess.disabled = !hasImage || !hasSel || isProcessing
    this._btnCompare.disabled = !hasResult
    this._btnExport.disabled = !hasResult
    this._exportFormat.disabled = !hasResult
    this._btnUpload.disabled = isProcessing

    this._selCount.textContent = this.sel.count

    switch (st) {
      case State.IDLE:
        this._setStatus('等待上传图片...', 'idle')
        break
      case State.IMAGE_LOADED:
        this._setStatus(`图片已加载 · ${this.sel.count} 个选区`, '')
        break
      case State.PROCESSING:
        this._setStatus('正在去水印...', 'processing')
        break
      case State.COMPLETED:
        this._setStatus('去水印完成 ✓', 'completed')
        break
      case State.ERROR:
        this._setStatus('处理出错，请重试', 'error')
        break
    }
  }

  _setStatus(text, className) {
    this._statusBar.textContent = text
    this._statusBar.className = 'status' + (className ? ' ' + className : '')
  }

  async _process() {
    if (!this.canvas.originalImage || this.sel.count === 0) return

    this.state.set(State.PROCESSING)

    try {
      // Get image data from canvas
      const img = this.canvas.originalImage
      const offscreen = new OffscreenCanvas(img.width, img.height)
      const octx = offscreen.getContext('2d')
      octx.drawImage(img, 0, 0)
      const imageData = octx.getImageData(0, 0, img.width, img.height)

      const selections = this.sel.getAll()

      const result = await this.worker.process(imageData, selections)
      this.canvas.setProcessedResult(result)
      this.sel.clear()
      this.state.set(State.COMPLETED)
      this._btnCompare.textContent = '对比原图'
      this._updateUI()
    } catch (err) {
      console.error('Processing error:', err)
      this.state.set(State.ERROR)
    }
  }

  _export() {
    if (!this.canvas.processedImage) return

    const img = this.canvas.processedImage
    const w = img.width
    const h = img.height
    const format = this._exportFormat.value

    const offscreen = new OffscreenCanvas(w, h)
    const octx = offscreen.getContext('2d')
    octx.drawImage(img, 0, 0)

    const quality = format === 'jpeg' ? 0.92 : 1.0

    offscreen.convertToBlob({ type: `image/${format}`, quality }).then((blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `watermark_removed.${format}`
      a.click()
      URL.revokeObjectURL(url)
    })
  }
}
