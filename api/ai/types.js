/**
 * ruoyi-ai 协议常量与 JSDoc 类型。
 * 本项目是 JavaScript，没有 TypeScript。字段与 D:\java\RuoYi-Vue-master 的 ruoyi-ai 源码一致。
 * 这里不发起请求，也不补后端不存在的智能体、任务接口。
 */

/** 会话 status。AiConstants.SESSION_STATUS_* */
export const SessionStatus = {
  NORMAL: '0',
  CLOSED: '1'
}

/** 消息 status。AiConstants.MSG_STATUS_* */
export const MessageStatus = {
  RUNNING: '0',
  DONE: '1',
  STOPPED: '2',
  FAILED: '3'
}

export function readAttachment(value) {
  if (!value) {
    return null
  }
  if (typeof value === 'object') {
    return value
  }
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (error) {
    return null
  }
}

export function applyMessageAttachment(message, attachmentJson) {
  const attachment = readAttachment(attachmentJson)
  if (!message || !attachment) {
    return message
  }
  if (attachment.tool) {
    message.tool = attachment.tool
  }
  if (message.status === MessageStatus.DONE && attachment.citations) {
    message.citations = attachment.citations.citations || []
    message.grounded = attachment.citations.grounded === true
    message.citationStatus = attachment.citations.status || ''
  }
  return message
}

/** 消息 role。AiConstants.ROLE_* */
export const MessageRole = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system'
}

/**
 * 意图代码。executionPath 恒为 CHAT，页面不因意图跳转。
 * TASK 是健康记录。ELDERLY_ADAPTATION 是适老化。不要使用 HEALTH、GENERAL。
 */
export const IntentCode = {
  CHAT: 'CHAT',
  KNOWLEDGE: 'KNOWLEDGE',
  TASK: 'TASK',
  ELDERLY_ADAPTATION: 'ELDERLY_ADAPTATION',
  MIXED: 'MIXED',
  UNCERTAIN: 'UNCERTAIN'
}

/** 当前阶段唯一执行路径。 */
export const ExecutionPath = {
  CHAT: 'CHAT'
}

/**
 * 同步聊天超时（毫秒）。
 * 后端 ruoyi.ai.run-timeout-seconds 默认 300 秒，需大于 utils/request.js 的 10 秒默认值。
 */
export const SYNC_CHAT_TIMEOUT = 300000

/**
 * 后端未提供的能力。不要给这些项编 URL，也不要调用。
 * /ai/model/list 只给聊天页选择启用中的 chat 模型，不在这里做密钥管理。
 */
export const missingAiCapabilities = [
  {
    name: '查询智能体列表',
    note: '没有 Agent Controller 或智能体表。'
  },
  {
    name: '创建智能体任务',
    note: '没有任务创建接口。intent=TASK 是健康记录，不是另一套任务系统。'
  },
  {
    name: '查询任务状态',
    note: '没有 taskId，也没有任务查询接口。'
  },
  {
    name: '通用智能体工具状态',
    note: '没有任务工具接口。健康查询和写入只通过 WebSocket 的 AI_TOOL_START、AI_TOOL。'
  },
  {
    name: '确认任务',
    note: '没有确认 REST。待保存时下一条消息整句发送“确认”或“确定”。'
  },
  {
    name: '拒绝任务',
    note: '没有拒绝 REST。下一条消息整句发送“取消”或“不用了”。'
  },
  {
    name: '补充任务参数',
    note: '没有补参接口。'
  },
  {
    name: '取消智能体任务',
    note: '没有任务取消接口。只能停止一轮聊天生成，见 api/ai/chat.js 的 stopChat。'
  },
  {
    name: '修改会话标题',
    note: '没有独立更新接口。标题只在创建会话时写入。'
  },
  {
    name: '聊天附件',
    note: 'AiChatRequest 只有 sessionId、content、modelId、requestId。'
  },
  {
    name: 'SSE 流式输出',
    note: '后端没有 SseEmitter。正文增量只走 WebSocket /ws，留到阶段 C。'
  }
]

/**
 * 若依 AjaxResult。单对象在 data，部分成功响应没有 data。
 * @template T
 * @typedef {Object} AjaxResult
 * @property {number} code 200 成功，401 未登录，403 无权限，500 参数或业务错误
 * @property {string} msg
 * @property {T} [data]
 */

/**
 * 若依 TableDataInfo。列表在 rows，不在 data。
 * @template T
 * @typedef {Object} TableData
 * @property {number} code
 * @property {string} msg
 * @property {number} total
 * @property {T[]} rows
 */

/**
 * @typedef {Object} AiSession
 * @property {number} sessionId
 * @property {number} userId 服务端写入，请求里不要传
 * @property {string} title
 * @property {number|null} modelId
 * @property {'0'|'1'} status 0 正常，1 已关闭
 * @property {string} delFlag
 * @property {string|null} lastMessageTime
 * @property {string|null} createBy
 * @property {string|null} createTime 创建接口返回时经常为 null
 * @property {string|null} remark
 * @property {string|null} nickName
 */

/**
 * @typedef {Object} AiMessage
 * @property {number} messageId
 * @property {number} sessionId
 * @property {number} userId
 * @property {'user'|'assistant'|'system'} role
 * @property {string|null} content
 * @property {'0'|'1'|'2'|'3'} status 0 运行中，1 完成，2 已停止，3 失败
 * @property {string|null} requestId
 * @property {string|null} errorMsg
 * @property {number|null} promptTokens 流式成功不回写
 * @property {number|null} completionTokens
 * @property {number|null} totalTokens
 * @property {string|null} createTime
 * @property {string|null} updateTime
 */

/**
 * @typedef {Object} AiChatRequest
 * @property {number} sessionId
 * @property {string} content 必填，最长 8000
 * @property {number} [modelId]
 * @property {string} [requestId] 可选，最长 64。相同值在同一用户同一会话上幂等
 */

/**
 * POST /ai/chat/stream 与 POST /ai/chat/retry 的 data。
 * @typedef {Object} AiChatStartResult
 * @property {number} sessionId
 * @property {string} requestId
 * @property {number|null} userMessageId 幂等命中或重试时为 null
 * @property {number} assistantMessageId
 * @property {'CHAT'|'KNOWLEDGE'|'TASK'|'ELDERLY_ADAPTATION'|'MIXED'|'UNCERTAIN'} [intent]
 * @property {number} [intentConfidence]
 * @property {string} [intentReason]
 * @property {'CHAT'} [executionPath] 当前恒为 CHAT
 */

/**
 * @typedef {Object} SessionListQuery
 * @property {number} [pageNum]
 * @property {number} [pageSize]
 * @property {string} [title] 模糊
 * @property {'0'|'1'} [status]
 * @property {number} [modelId]
 */

/**
 * @typedef {Object} MessageListQuery
 * @property {number} [pageNum]
 * @property {number} [pageSize]
 * @property {'user'|'assistant'|'system'} [role]
 * @property {'0'|'1'|'2'|'3'} [status]
 */

/**
 * @typedef {Object} CreateSessionBody
 * @property {string} [title] 空则后端写成「新对话」，最长 100
 * @property {number} [modelId]
 * @property {string} [remark]
 */

/**
 * @typedef {Object} RetryChatBody
 * @property {number} sessionId
 * @property {number} messageId 旧助手消息，status 必须是 2 或 3
 * @property {number} [modelId]
 */
