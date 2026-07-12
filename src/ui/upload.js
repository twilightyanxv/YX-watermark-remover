export class UploadManager {
  constructor(container, onImageLoaded) {
    this.container = container
    this.onImageLoaded = onImageLoaded
    this._input = document.getElementById('file-input')
    this._dropHint = document.getElementById('drop-hint')

    this._initEvents()
  }

  _initEvents() {
    this._input.addEventListener('change', () => {
      if (this._input.files.length > 0) {
        this._loadFile(this._input.files[0])
      }
    })

    // Drag and drop
    this.container.addEventListener('dragover', (e) => {
      e.preventDefault()
      this.container.classList.add('dragover')
    })

    this.container.addEventListener('dragleave', () => {
      this.container.classList.remove('dragover')
    })

    this.container.addEventListener('drop', (e) => {
      e.preventDefault()
      this.container.classList.remove('dragover')
      const files = e.dataTransfer.files
      if (files.length > 0 && files[0].type.startsWith('image/')) {
        this._loadFile(files[0])
      }
    })
  }

  openFileDialog() {
    this._input.value = ''
    this._input.click()
  }

  _loadFile(file) {
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const blob = new Blob([e.target.result], { type: file.type })
        const bitmap = await createImageBitmap(blob)
        this._dropHint.classList.add('hidden')
        this.onImageLoaded(bitmap)
      } catch (err) {
        console.error('Failed to load image:', err)
        alert('图片加载失败，请尝试其他格式。')
      }
    }
    reader.readAsArrayBuffer(file)
  }
}
