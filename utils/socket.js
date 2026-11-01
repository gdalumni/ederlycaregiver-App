import config from '@/config'
import { getToken } from '@/utils/auth'

const PING_INTERVAL = 30000
const RECONNECT_MAX = 15000

/**
 * 握手回退地址。后端优先读 Authorization 头，没有头才读 Query token。
 * H5 的浏览器 WebSocket 不能自定义头，所以地址里仍带 token，且不写 Bearer。
 */
export function buildAiSocketUrl(baseUrl, token) {
  const base = String(baseUrl || '').replace(/\/$/, '')
  const wsBase = base.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:')
  return wsBase + '/ws?token=' + encodeURIComponent(token || '')
}

function authorizationHeader(token) {
  return 'Bearer ' + token
}

/**
 * 项目里原来没有 WebSocket 封装。这里只用 uni.connectSocket 连接现有 /ws。
 * 一个页面只保持一条连接。身份来自 getToken()，不读取调用方传入的 userId。
 */
export function createAiSocket(options) {
  const handlers = options || {}
  let task = null
  let opened = false
  let connecting = false
  let manualClose = false
  let pingTimer = null
  let reconnectTimer = null
  let attempt = 0

  function clearPing() {
    if (pingTimer) {
      clearInterval(pingTimer)
      pingTimer = null
    }
  }

  function clearReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function startPing() {
    clearPing()
    pingTimer = setInterval(function() {
      if (!opened || !task || !task.send) {
        return
      }
      task.send({
        data: JSON.stringify({
          type: 'PING',
          requestId: '',
          data: {},
          timestamp: 0
        })
      })
    }, PING_INTERVAL)
  }

  function scheduleReconnect() {
    if (manualClose) {
      return
    }
    clearReconnect()
    const delay = Math.min(RECONNECT_MAX, 1000 * Math.pow(2, attempt))
    attempt += 1
    reconnectTimer = setTimeout(function() {
      connect()
    }, delay)
  }

  function bindTask(socketTask) {
    socketTask.onOpen(function() {
      connecting = false
      opened = true
      attempt = 0
      startPing()
      if (handlers.onOpen) {
        handlers.onOpen()
      }
    })
    socketTask.onMessage(function(event) {
      if (!event || event.data == null || event.data === '') {
        return
      }
      let message = null
      try {
        message = JSON.parse(event.data)
      } catch (error) {
        return
      }
      if (handlers.onMessage) {
        handlers.onMessage(message)
      }
    })
    socketTask.onError(function() {
      connecting = false
      opened = false
      clearPing()
      if (handlers.onError) {
        handlers.onError()
      }
    })
    socketTask.onClose(function() {
      connecting = false
      opened = false
      clearPing()
      task = null
      if (handlers.onClose) {
        handlers.onClose()
      }
      scheduleReconnect()
    })
  }

  function connect() {
    if (manualClose || opened || connecting) {
      return
    }
    const token = getToken()
    if (!token) {
      if (handlers.onAuthMissing) {
        handlers.onAuthMissing()
      }
      return
    }
    connecting = true
    const socketTask = uni.connectSocket({
      url: buildAiSocketUrl(config.baseUrl, token),
      header: {
        Authorization: authorizationHeader(token)
      },
      complete: function() {}
    })
    if (!socketTask || !socketTask.onOpen) {
      connecting = false
      if (handlers.onError) {
        handlers.onError()
      }
      scheduleReconnect()
      return
    }
    task = socketTask
    bindTask(socketTask)
  }

  function close() {
    manualClose = true
    opened = false
    connecting = false
    clearPing()
    clearReconnect()
    if (task && task.close) {
      task.close({})
    }
    task = null
  }

  return {
    connect: connect,
    close: close,
    isOpen: function() {
      return opened
    }
  }
}
