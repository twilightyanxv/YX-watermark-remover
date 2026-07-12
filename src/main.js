import { StateMachine, State } from './core/state.js'
import { SelectionManager } from './core/selection.js'
import { WorkerClient } from './core/workerClient.js'
import { CanvasView } from './ui/canvasView.js'
import { UploadManager } from './ui/upload.js'
import { Toolbar } from './ui/toolbar.js'

function main() {
  const state = new StateMachine()
  const sel = new SelectionManager()
  const worker = new WorkerClient()

  const container = document.getElementById('canvas-container')
  const canvas = new CanvasView(container, state, sel)

  const upload = new UploadManager(container, (bitmap) => {
    canvas.setImage(bitmap)
    sel.clear()
    state.set(State.IMAGE_LOADED)
  })

  const toolbar = new Toolbar(state, sel, upload, canvas, worker)

  // Init worker
  try {
    worker.init()
  } catch (e) {
    console.warn('Worker initialization failed, algorithms will run on main thread (may cause lag):', e)
  }
}

document.addEventListener('DOMContentLoaded', main)
