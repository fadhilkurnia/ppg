import { io, Socket } from 'socket.io-client'
import { getToken } from './api'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (socket && socket.connected) return socket
  if (!socket) {
    socket = io('/', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: { token: getToken() },
      withCredentials: true,
      autoConnect: true,
    })
  } else {
    socket.auth = { token: getToken() }
    socket.connect()
  }
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
