import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  authClient,
  clearNeonToken,
  neonEnabled,
  neonSignIn,
  neonSignOut,
  neonSignUp,
  refreshNeonToken,
} from '../lib/neonAuth'
import { authApi, clearToken, getToken, setToken } from '../lib/api'
import { connectSocket, disconnectSocket } from '../lib/socket'

const AuthContext = createContext(null)

const TOKEN_REFRESH_INTERVAL = 10 * 60 * 1000

function NeonAuthProvider({ children }) {
  const session = authClient.useSession()
  const user = useMemo(() => {
    const account = session?.data?.user
    if (!account) return null

    return {
      id: account.id || account.email,
      name: account.name || account.email,
      email: account.email,
      avatar_url: account.image || null,
    }
  }, [session?.data?.user])

  const userId = user?.id || null

  useEffect(() => {
    if (userId) {
      refreshNeonToken()
        .then(connectSocket)
        .catch(() => {})
    } else {
      disconnectSocket()
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return undefined

    const interval = setInterval(() => {
      refreshNeonToken()
        .then(connectSocket)
        .catch(() => {})
    }, TOKEN_REFRESH_INTERVAL)

    return () => clearInterval(interval)
  }, [userId])

  const login = useCallback(async (email, password) => {
    const result = await neonSignIn(email, password)
    await refreshNeonToken()
    connectSocket()
    return result
  }, [])

  const register = useCallback(async (name, email, password) => {
    const result = await neonSignUp(name, email, password)
    await refreshNeonToken()
    connectSocket()
    return result
  }, [])

  const logout = useCallback(async () => {
    try {
      await neonSignOut()
    } finally {
      clearNeonToken()
      disconnectSocket()
    }
  }, [])

  const value = useMemo(
    () => ({ user, loading: session.isPending, login, register, logout, session: session.data }),
    [user, session.isPending, session.data, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function LocalAuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    const restore = async () => {
      try {
        if (getToken()) {
          const restored = await authApi.me()
          if (active) setUser(restored)
        }
      } catch {
        clearToken()
      } finally {
        if (active) setLoading(false)
      }
    }

    restore()
    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (email, password) => {
    const data = await authApi.login(email, password)
    if (data.token) setToken(data.token)
    setUser(data.user || null)
    connectSocket()
    return data
  }, [])

  const register = useCallback(async (name, email, password) => {
    const data = await authApi.register(name, email, password)
    if (data.token) setToken(data.token)
    setUser(data.user || null)
    connectSocket()
    return data
  }, [])

  const logout = useCallback(async () => {
    clearToken()
    disconnectSocket()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const AuthProvider = neonEnabled ? NeonAuthProvider : LocalAuthProvider

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside an AuthProvider')
  return context
}
