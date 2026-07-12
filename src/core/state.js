export const State = Object.freeze({
  IDLE: 'idle',
  IMAGE_LOADED: 'image_loaded',
  SELECTING: 'selecting',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  ERROR: 'error',
})

export class StateMachine {
  constructor() {
    this._state = State.IDLE
    this._listeners = new Map()
  }

  get state() {
    return this._state
  }

  set(state, ...args) {
    const prev = this._state
    this._state = state
    this._emit(state, prev, ...args)
    this._emit('*', state, prev, ...args)
  }

  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set())
    this._listeners.get(event).add(fn)
    return () => this._listeners.get(event)?.delete(fn)
  }

  _emit(event, ...args) {
    this._listeners.get(event)?.forEach(fn => fn(...args))
  }
}
