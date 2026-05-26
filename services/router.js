import { appState } from './app-state.js'
import { skeletonPage } from '../components/skeleton.js'
import { pageError } from '../components/stats.js'

const routeMap = {
  dashboard: '/app/dashboard',
  activities: '/app/activities',
  sr: '/app/sr',
  'sr-new': '/app/sr-new',
  'sr-detail': '/app/sr-detail',
  'sr-edit': '/app/sr-edit',
  templates: '/app/templates',
  routes: '/app/routes',
  whatsapp: '/app/whatsapp',
  users: '/app/users',
  reports: '/app/reports',
  settings: '/app/settings',
  create: '/app/create',
}

const pageTitles = {
  dashboard: 'Dashboard',
  activities: 'Activities',
  sr: 'Service Requests',
  'sr-new': 'New SR',
  'sr-detail': 'SR Detail',
  'sr-edit': 'Edit SR',
  templates: 'Templates',
  routes: 'Routes',
  whatsapp: 'WhatsApp',
  users: 'Users',
  reports: 'Reports',
  settings: 'Settings',
  create: 'Create',
}

let currentPage = 'dashboard'
let currentParams = {}
let routeListeners = []

function runCleanups() {
  const cleanups = appState.get('routeCleanups') || []
  cleanups.forEach(fn => { try { fn() } catch {} })
  appState.set('routeCleanups', [])
}

function resolveRoute(page, params) {
  runCleanups()
  currentPage = page
  currentParams = params
  appState.set('route', { page, params })
  routeListeners.forEach(fn => { try { fn({ page, params }) } catch {} })
  loadPageModule(page, params)
}

async function loadPageModule(page, params) {
  const container = document.getElementById('page-content')
  if (!container) return

  container.innerHTML = skeletonPage()

  try {
    const mod = await import(`/pages/${page}.js`)
    const fn = mod.default?.render || mod.render
    if (typeof fn === 'function') {
      await fn(container, params)
    } else {
      container.innerHTML = pageError('Invalid page module', `The page "${page}" does not export a render function.`, false)
    }
  } catch(e) {
    container.innerHTML = pageError('Could not load page', `The module for "${page}" could not be loaded. ` + (e?.message || ''), false)
  }
}

export function navigate(page, params = {}) {
  const path = routeMap[page] || '/app/dashboard'
  const qs = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : ''
  history.pushState({ page, params }, '', path + qs)
  resolveRoute(page, params)
}

export function getCurrentRoute() {
  return { page: currentPage, params: currentParams }
}

export function onRouteChange(fn) {
  routeListeners.push(fn)
  return () => { routeListeners = routeListeners.filter(f => f !== fn) }
}

export function getPageTitle(page) {
  return pageTitles[page] || page
}

export function initRouter() {
  const path = window.location.pathname

  let page = 'dashboard'
  for (const [p, route] of Object.entries(routeMap)) {
    if (path === route) {
      page = p
      break
    }
  }

  const searchParams = Object.fromEntries(new URLSearchParams(window.location.search))
  const qs = Object.keys(searchParams).length ? '?' + new URLSearchParams(searchParams).toString() : ''
  history.replaceState({ page, params: searchParams }, '', routeMap[page] + qs)

  window.addEventListener('popstate', e => {
    const state = e.state || { page: 'dashboard', params: {} }
    resolveRoute(state.page, state.params)
  })

  resolveRoute(page, searchParams)
}
