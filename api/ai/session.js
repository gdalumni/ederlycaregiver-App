import request from '@/utils/request'

/**
 * 会话与历史消息。对应 AiSessionController，前缀 /ai/session。
 * 身份由 utils/request.js 的 Authorization 注入，请求体和查询参数不传 userId。
 *
 * 成功时 Promise 得到整段 JSON：
 * - 列表是 TableDataInfo：code、msg、total、rows
 * - 单对象是 AjaxResult：code、msg、data
 * code 不是 200 时公共封装会 toast 并 reject，业务页仍应判断 code。
 */

function withoutUserId(source) {
  const params = Object.assign({}, source)
  delete params.userId
  return params
}

/**
 * 查询会话列表。权限 ai:session:list。
 * 不传 orderByColumn。非管理员的 userId 会被后端改写，这里直接去掉。
 * @param {import('./types').SessionListQuery} [query]
 * @returns {Promise<import('./types').TableData<import('./types').AiSession>>}
 */
export function listSession(query) {
  const params = withoutUserId(query)
  delete params.orderByColumn
  delete params.isAsc
  return request({
    url: '/ai/session/list',
    method: 'get',
    params: params
  })
}

/**
 * 查询会话详情。权限 ai:session:query。
 * 不存在时 code=500，msg=session not found。
 * @param {number|string} sessionId
 * @returns {Promise<import('./types').AjaxResult<import('./types').AiSession>>}
 */
export function getSession(sessionId, options) {
  return request({
    url: '/ai/session/' + sessionId,
    method: 'get',
    skipErrorToast: !!(options && options.skipErrorToast)
  })
}

/**
 * 创建会话。权限 ai:session:add。
 * 只提交 title、modelId、remark。userId、status、delFlag 由服务端写入。
 * @param {import('./types').CreateSessionBody} [data]
 * @returns {Promise<import('./types').AjaxResult<import('./types').AiSession>>}
 */
export function createSession(data) {
  const source = data || {}
  const body = {}
  if (source.title) {
    body.title = source.title
  }
  if (source.modelId !== undefined && source.modelId !== null && source.modelId !== '') {
    body.modelId = source.modelId
  }
  if (source.remark) {
    body.remark = source.remark
  }
  return request({
    url: '/ai/session',
    method: 'post',
    data: body
  })
}

/**
 * 关闭会话。权限 ai:session:edit。无请求体。status 变为 1。
 * @param {number|string} sessionId
 * @returns {Promise<import('./types').AjaxResult<undefined>>}
 */
export function closeSession(sessionId) {
  return request({
    url: '/ai/session/close/' + sessionId,
    method: 'put'
  })
}

/**
 * 删除会话。权限 ai:session:remove。逻辑删除，消息不级联删除。
 * @param {number|string|Array<number|string>} sessionIds 单个 id 或 id 数组
 * @returns {Promise<import('./types').AjaxResult<undefined>>}
 */
export function removeSession(sessionIds) {
  const ids = Array.isArray(sessionIds) ? sessionIds.join(',') : sessionIds
  return request({
    url: '/ai/session/' + ids,
    method: 'delete'
  })
}

/**
 * 查询历史消息。权限 ai:session:query。按 messageId 升序。
 * 后端查询前会校正中断中的生成，并可能推送 WebSocket AI_ERROR。
 * content、requestId 即使传入也不参与过滤，这里不转发。
 * @param {number|string} sessionId
 * @param {import('./types').MessageListQuery} [query]
 * @returns {Promise<import('./types').TableData<import('./types').AiMessage>>}
 */
export function listMessage(sessionId, query) {
  const source = withoutUserId(query)
  const params = {}
  if (source.pageNum !== undefined) {
    params.pageNum = source.pageNum
  }
  if (source.pageSize !== undefined) {
    params.pageSize = source.pageSize
  }
  if (source.role) {
    params.role = source.role
  }
  if (source.status !== undefined && source.status !== null && source.status !== '') {
    params.status = source.status
  }
  return request({
    url: '/ai/session/' + sessionId + '/messages',
    method: 'get',
    params: params
  })
}

/**
 * 查询单条消息。权限 ai:session:query。
 * AI_ERROR 不带半截正文，用本接口读取 content。
 * @param {number|string} sessionId
 * @param {number|string} messageId
 * @returns {Promise<import('./types').AjaxResult<import('./types').AiMessage>>}
 */
export function getMessage(sessionId, messageId) {
  return request({
    url: '/ai/session/' + sessionId + '/messages/' + messageId,
    method: 'get'
  })
}

/**
 * 校正中断中的生成。权限 ai:session:query。无请求体。
 * @param {number|string} sessionId
 * @returns {Promise<import('./types').AjaxResult<{recovered: number}>>}
 */
export function reconcileSession(sessionId) {
  return request({
    url: '/ai/session/' + sessionId + '/reconcile',
    method: 'post'
  })
}
