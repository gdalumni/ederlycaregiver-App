import request from '@/utils/request'
import { SYNC_CHAT_TIMEOUT } from '@/api/ai/types'

/**
 * 聊天。对应 AiChatController，前缀 /ai/chat，权限均为 ai:chat:chat。
 * 不传 userId。流式正文不在 HTTP 响应里，阶段 C 再接 WebSocket /ws。
 *
 * 成功时 Promise 得到 AjaxResult。code 不是 200 时公共封装会 toast 并 reject。
 */

/**
 * 只保留聊天请求允许的字段。
 * @param {import('./types').AiChatRequest} data
 */
function chatBody(data) {
  const source = data || {}
  const body = {
    sessionId: source.sessionId,
    content: source.content
  }
  if (source.modelId !== undefined && source.modelId !== null && source.modelId !== '') {
    body.modelId = source.modelId
  }
  if (source.requestId) {
    body.requestId = source.requestId
  }
  return body
}

/**
 * 同步聊天。等待模型完整正文，不推 WebSocket。
 * data 只含助手消息，不含用户消息 id。
 * @param {import('./types').AiChatRequest} data
 * @returns {Promise<import('./types').AjaxResult<import('./types').AiMessage>>}
 */
export function sendChat(data) {
  return request({
    url: '/ai/chat',
    method: 'post',
    data: chatBody(data),
    timeout: SYNC_CHAT_TIMEOUT
  })
}

/**
 * 发起流式聊天。HTTP 只返回消息 id 和意图，正文增量在 /ws。
 * 请先连接 WebSocket。未连接时本接口仍可能成功，增量会被服务端丢弃。
 * @param {import('./types').AiChatRequest} data
 * @returns {Promise<import('./types').AjaxResult<import('./types').AiChatStartResult>>}
 */
export function startChatStream(data) {
  return request({
    url: '/ai/chat/stream',
    method: 'post',
    data: chatBody(data)
  })
}

/**
 * 停止一轮生成。未知或已结束的 requestId 也返回成功，且不推事件。
 * 真正取消时 WebSocket 另推 AI_CANCELLED。与 WebSocket AI_CANCEL 二选一，本期使用本接口。
 * @param {string} requestId
 * @returns {Promise<import('./types').AjaxResult<undefined>>}
 */
export function stopChat(requestId) {
  return request({
    url: '/ai/chat/stop',
    method: 'post',
    data: {
      requestId: requestId
    }
  })
}

/**
 * 重试失败或已停止的助手消息。只接受 status 为 2 或 3。
 * 不新增用户消息，assistantMessageId 是新消息。随后走 WebSocket 流式事件。
 * @param {import('./types').RetryChatBody} data
 * @returns {Promise<import('./types').AjaxResult<import('./types').AiChatStartResult>>}
 */
export function retryChat(data) {
  const source = data || {}
  const body = {
    sessionId: source.sessionId,
    messageId: source.messageId
  }
  if (source.modelId !== undefined && source.modelId !== null && source.modelId !== '') {
    body.modelId = source.modelId
  }
  return request({
    url: '/ai/chat/retry',
    method: 'post',
    data: body
  })
}
