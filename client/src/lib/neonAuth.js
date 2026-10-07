import { createClient } from '@neondatabase/neon-js'
import { BetterAuthReactAdapter } from '@neondatabase/neon-js/auth/react/adapters'

const authUrl = import.meta.env.VITE_NEON_AUTH_URL
const dataUrl = import.meta.env.VITE_NEON_DATA_API_URL || authUrl

export const neonEnabled = Boolean(authUrl)

const client = neonEnabled
  ? createClient({
      auth: { adapter: BetterAuthReactAdapter(), url: authUrl },
      dataApi: { url: dataUrl },
    })
  : null

export const authClient = client?.auth

let cachedToken = ''

export function getNeonToken() {
  return cachedToken
}

export function setNeonToken(token) {
  cachedToken = typeof token === 'string' ? token : ''
}

export function clearNeonToken() {
  cachedToken = ''
}

/** Dig a JWT string out of the many shapes the SDK can return. */
export function asTokenString(value) {
  if (!value) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value !== 'object') return ''

  if (typeof value.token === 'string') return value.token.trim()
  if (typeof value.data === 'string') return value.data.trim()

  if (value.data && typeof value.data === 'object') {
    if (typeof value.data.token === 'string') return value.data.token.trim()
    if (value.data.session && typeof value.data.session.token === 'string') {
      return value.data.session.token.trim()
    }
  }

  if (value.session && typeof value.session.token === 'string') {
    return value.session.token.trim()
  }

  return ''
}

/** Refresh (and cache) the Neon session JWT. Returns "" when signed out. */
export async function refreshNeonToken() {
  if (!authClient) return ''

  try {
    let token = ''

    if (typeof authClient.token === 'function') {
      token = asTokenString(await authClient.token())
    }

    if (!token && typeof authClient.getSession === 'function') {
      token = asTokenString(await authClient.getSession())
    }

    if (token) {
      cachedToken = token
      return token
    }

    return cachedToken
  } catch {
    return cachedToken
  }
}

export async function neonSignIn(email, password) {
  return authClient.signIn.email({ email, password })
}

export async function neonSignUp(name, email, password) {
  return authClient.signUp.email({ name, email, password })
}

export async function neonSignOut() {
  return authClient.signOut()
}

export async function neonSession() {
  return authClient.getSession()
}
