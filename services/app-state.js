class AppState {
  constructor() {
    this._state = { user: null, config: {}, errorLog: [], routeCleanups: [] }
    this._listeners = {}
  }
  get(key) { return this._state[key] }
  set(key, val) { this._state[key] = val; this._emit(key, val) }
  on(key, fn) { if (!this._listeners[key]) this._listeners[key] = []; this._listeners[key].push(fn); return () => this._listeners[key] = this._listeners[key].filter(f=>f!==fn) }
  _emit(key, val) { (this._listeners[key]||[]).forEach(fn => fn(val)) }
  update(key, fn) { this.set(key, fn(this._state[key])) }
}
export const appState = new AppState()
