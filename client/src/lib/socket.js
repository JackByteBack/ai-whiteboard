import { io } from 'socket.io-client'
import { getToken } from './api'
import { refreshNeonToken } from './neonAuth'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5050'

let socket = null

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      auth: { token: getToken() },
      transports: ['websocket'],
    })
  }
  return socket
}

export async function connectSocket() {
  await refreshNeonToken()

  const instance = getSocket()
  instance.auth = { token: getToken() }

  if (!instance.connected) instance.connect()

  return instance
}

export function disconnectSocket() {
  if (socket) socket.disconnect()
}

export function getSocketId() {
  return socket?.connected ? socket.id : null
}
