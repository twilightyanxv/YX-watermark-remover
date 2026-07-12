export class WorkerClient {
  constructor() {
    this._worker = null
    this._callbacks = new Map()
    this._id = 0
  }

  init() {
    if (this._worker) return
    this._worker = new Worker(new URL('../../worker.js', import.meta.url), { type: 'module' })
    this._worker.onmessage = (e) => {
      const { id, result } = e.data
      const cb = this._callbacks.get(id)
      if (cb) {
        cb(result)
        this._callbacks.delete(id)
      }
    }
    this._worker.onerror = (err) => {
      console.error('Worker error:', err)
    }
  }

  terminate() {
    if (this._worker) {
      this._worker.terminate()
      this._worker = null
    }
    this._callbacks.clear()
  }

  /**
   * Send image data to worker for processing.
   * @param {ImageData} imageData
   * @param {Array<{x:number,y:number,w:number,h:number}>} selections
   * @returns {Promise<Uint8ClampedArray>}
   */
  process(imageData, selections) {
    return new Promise((resolve, reject) => {
      const id = ++this._id
      this._callbacks.set(id, resolve)

      const buf = imageData.data.buffer
      try {
        this._worker.postMessage(
          {
            id,
            imageData: imageData.data,
            width: imageData.width,
            height: imageData.height,
            selections,
          },
          { transfer: [buf] }
        )
      } catch (e) {
        this._worker.postMessage({
          id,
          imageData: new Uint8ClampedArray(imageData.data),
          width: imageData.width,
          height: imageData.height,
          selections,
        })
        reject(e)
      }
    })
  }
}
