import axios from 'axios'
import { clearNeonToken, getNeonToken, neonEnabled, refreshNeonToken, setNeonToken } from './neonAuth'
import { getSocketId } from './socket'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5050/api'
const LEGACY_TOKEN_KEY = 'whiteboard_token'

export function getToken() {
  if (neonEnabled) return getNeonToken()
  return localStorage.getItem(LEGACY_TOKEN_KEY) || ''
}

export function setToken(token) {
  if (neonEnabled) {
    setNeonToken(token)
    return
  }
  localStorage.setItem(LEGACY_TOKEN_KEY, token || '')
}

export function clearToken() {
  if (neonEnabled) {
    clearNeonToken()
    return
  }
  localStorage.removeItem(LEGACY_TOKEN_KEY)
}

const api = axios.create({ baseURL: BASE_URL })

api.interceptors.request.use(async (config) => {
  try {
    let token = getToken()
    if (neonEnabled && !token) token = await refreshNeonToken()

    if (token) config.headers.Authorization = `Bearer ${token}`

    const socketId = getSocketId()
    if (socketId) config.headers['x-socket-id'] = socketId
  } catch {
    // never block a request on token plumbing
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config || {}
    const status = error.response?.status

    if (status === 401 && neonEnabled && !original._retried) {
      original._retried = true
      try {
        const token = await refreshNeonToken()
        if (token) {
          original.headers = { ...original.headers, Authorization: `Bearer ${token}` }
          return api(original)
        }
      } catch {
        // fall through to the clean error below
      }
    }

    if (status === 401 && !neonEnabled) {
      clearToken()
      if (!['/login', '/'].includes(window.location.pathname)) {
        window.location.assign('/login')
      }
    }

    const message =
      error.response?.data?.error || error.response?.data?.message || error.message || 'Request failed'
    return Promise.reject(new Error(message))
  },
)

const unwrap = (request) => request.then((response) => response.data)

export const authApi = {
  register: (name, email, password) =>
    unwrap(api.post('/auth/register', { name, email, password })),
  login: (email, password) => unwrap(api.post('/auth/login', { email, password })),
  me: () => unwrap(api.get('/auth/me')).then((data) => data.user),
}

export const userApi = {
  search: (q) => unwrap(api.get('/users/search', { params: { q } })).then((data) => data.users),
}

export const boardApi = {
  list: () => unwrap(api.get('/whiteboards')).then((data) => data.boards),
  create: (payload) => unwrap(api.post('/whiteboards', payload)).then((data) => data.board),
  get: (id) => unwrap(api.get(`/whiteboards/${id}`)),
  update: (id, payload) =>
    unwrap(api.patch(`/whiteboards/${id}`, payload)).then((data) => data.board),
  remove: (id) => unwrap(api.delete(`/whiteboards/${id}`)),
  addMember: (id, payload) =>
    unwrap(api.post(`/whiteboards/${id}/members`, payload)).then((data) => data.member),
  removeMember: (id, userId) => unwrap(api.delete(`/whiteboards/${id}/members/${userId}`)),
}

export const uploadApi = {
  image: (boardId, blob, filename) => {
    const form = new FormData()
    form.append('image', blob, filename)
    return unwrap(api.post(`/whiteboards/${boardId}/uploads`, form)).then((data) => data.url)
  },
}

export const elementApi = {
  create: (boardId, payload) =>
    unwrap(api.post(`/whiteboards/${boardId}/elements`, payload)).then((data) => data.element),
  bulkCreate: (boardId, elements) =>
    unwrap(api.post(`/whiteboards/${boardId}/elements/bulk`, { elements })).then(
      (data) => data.elements,
    ),
  update: (boardId, elementId, payload) =>
    unwrap(api.patch(`/whiteboards/${boardId}/elements/${elementId}`, payload)).then(
      (data) => data.element,
    ),
  remove: (boardId, elementId) =>
    unwrap(api.delete(`/whiteboards/${boardId}/elements/${elementId}`)),
}

const aiCall = (name) => (boardId, payload) =>
  unwrap(api.post(`/whiteboards/${boardId}/ai/${name}`, payload)).then((data) => data.elements)

export const aiApi = {
  brainstorm: aiCall('brainstorm'),
  outline: aiCall('outline'),
  diagram: aiCall('diagram'),
  chart: aiCall('chart'),
  edit: aiCall('edit'),
  summary: (boardId, payload) =>
    unwrap(api.post(`/whiteboards/${boardId}/ai/summary`, payload)).then(
      (data) => data.summary,
    ),
}

export default api
