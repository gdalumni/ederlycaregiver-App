# ruoyi-ai 前端对接清单

依据 `docs/ruoyi-ai-api.md` 与当前 Java 源码整理。字段、错误文案和 WebSocket 信封以该文档为准。本文只标出对接时要用的路径和页面关系。

后端根地址：`http://{host}:8080`，`context-path` 为 `/`。Vue 代理前缀（常见 `/dev-api`）不是后端路径。

可交互的 HTTP 文档：`http://{host}:8080/swagger-ui.html`，右上角分组选择「AI 模块」。JSON 为 `http://{host}:8080/v3/api-docs/ai`。页面可匿名打开，调试时 `Authorization` 填 `Bearer {token}`。WebSocket 帧不在这份 OpenAPI 里。

判断成功看 JSON 的 `code === 200`。未登录也是 HTTP 200，业务码 `401`。无菜单权限是 HTTP 200，业务码 `403`。参数和业务错误多数是 HTTP 200，业务码 `500`。

## 1. 十二项能力对照

| 检查项 | 类别 | 说明 |
| --- | --- | --- |
| 1. 创建会话 | 已实现 | `POST /ai/session` |
| 2. 查询会话列表 | 已实现 | `GET /ai/session/list` |
| 3. 查询会话详情 | 已实现 | `GET /ai/session/{sessionId}` |
| 4. 查询历史消息 | 已实现 | `GET /ai/session/{sessionId}/messages` |
| 5. 发送普通消息 | 已实现 | `POST /ai/chat`，同步等待完整正文，不走 WebSocket |
| 6. 流式对话 | 已实现 | `POST /ai/chat/stream` 只返回 id；正文增量在 `/ws` |
| 7. 停止生成 | 已实现 | `POST /ai/chat/stop`，或 WebSocket `AI_CANCEL` |
| 8. 删除或关闭会话 | 已实现 | 关闭 `PUT /ai/session/close/{sessionId}`；删除 `DELETE /ai/session/{sessionIds}`。二者都有，语义不同 |
| 9. 查询智能体列表 | 待实现 | 没有智能体 Controller、表或 URL。`GET /ai/model/list` 是模型配置，不是智能体 |
| 10. 创建智能体任务 | 待实现 | 没有任务创建接口。意图 `TASK` 仍走聊天补全 |
| 11. 确认、拒绝及补充任务参数 | 待实现 | 没有确认、拒绝、补参接口 |
| 12. 查询任务状态 | 待实现 | 没有任务查询接口。消息 `status` 和 WebSocket 事件只表示这一轮聊天生成，不是智能体任务 |

配套但未列入上面 12 项、源码中已存在的接口：消息详情、重试、校正中断生成、模型配置 CRUD。见第 3 节。

## 2. 已实现 HTTP 接口

登录要求写成「需登录 + 权限标识」。令牌放在 `Authorization: Bearer {token}`。

| 功能 | Method | URL | 登录要求 | 请求参数 | 响应字段 | 前端调用场景 |
| --- | --- | --- | --- | --- | --- | --- |
| 创建会话 | POST | `/ai/session` | 需登录，`ai:session:add` | JSON：`title?` 最长 100，空则后端写成 `新对话`；`modelId?`；`remark?`。`userId`、`status` 会被后端改写 | `AjaxResult.data`：`sessionId`、`userId`、`title`、`modelId`、`status=0`、`delFlag=0`、`lastMessageTime`、`createBy`、`remark`。`createTime` 经常为 `null`，`nickName` 为 `null` | 点击「新对话」。随后用返回的 `sessionId` 发消息 |
| 查询会话列表 | GET | `/ai/session/list` | 需登录，`ai:session:list` | Query：`pageNum` 默认 1，`pageSize` 默认 10，`title?` 模糊，`status?`（`0` 正常 / `1` 已关闭），`modelId?`。不要传 `orderByColumn`。非管理员的 `userId` 无效 | `TableDataInfo`：`code`、`msg`、`total`、`rows[]`。行字段含 `sessionId`、`title`、`modelId`、`status`、`lastMessageTime`、`nickName`、`createTime` | 进入 AI 会话页，左侧会话栏。下拉加载下一页 |
| 查询会话详情 | GET | `/ai/session/{sessionId}` | 需登录，`ai:session:query` | Path：`sessionId` | `AjaxResult.data` 与列表行相同。不存在时 `code=500`，`msg=session not found` | 从路由打开指定会话，刷新标题和状态。管理员可读他人会话 |
| 查询历史消息 | GET | `/ai/session/{sessionId}/messages` | 需登录，`ai:session:query` | Path：`sessionId`。Query：`pageNum`、`pageSize`、`role?`（`user`/`assistant`/`system`）、`status?`（`0`/`1`/`2`/`3`）。`content`、`requestId` 传了也不过滤 | `TableDataInfo.rows[]`：`messageId`、`sessionId`、`userId`、`role`、`content`、`status`、`requestId`、`errorMsg`、`promptTokens`、`completionTokens`、`totalTokens`、`createTime`、`updateTime`。按 `messageId` 升序 | 点开会话后渲染气泡。打开时可能把中断中的生成标成失败并推 `AI_ERROR` |
| 发送普通消息 | POST | `/ai/chat` | 需登录，`ai:chat:chat` | JSON：`sessionId` 必填，`content` 必填且最长 8000，`modelId?`，`requestId?` 最长 64 | `AjaxResult.data` 是**助手消息**：`messageId`、`content`、`status`（成功为 `1`）、`requestId`、token 三字段。不返回用户消息 id | 不需要打字机效果时使用。同一会话已有运行中任务会失败：`session has a running generation task` |
| 流式对话 | POST | `/ai/chat/stream` | 需登录，`ai:chat:chat` | 与普通消息相同 | `AjaxResult.data`：`sessionId`、`requestId`、`userMessageId`、`assistantMessageId`、`intent`、`intentConfidence`、`intentReason`、`executionPath`。`executionPath` 当前恒为 `CHAT`。正文不在这里 | 聊天主路径。先连 `/ws`，再调用本接口，用 `assistantMessageId` 接收增量。幂等命中时 `userMessageId` 为 `null` 且不再推流 |
| 停止生成 | POST | `/ai/chat/stop` | 需登录，`ai:chat:chat` | JSON：`requestId` 必填 | 成功无 `data`，仅 `code`、`msg`。真正取消时 WebSocket 另推 `AI_CANCELLED`。未知或已结束的 `requestId` 也返回成功且不推事件 | 用户点击「停止」。也可以改发 WebSocket `AI_CANCEL`，二选一即可 |
| 关闭会话 | PUT | `/ai/session/close/{sessionId}` | 需登录，`ai:session:edit` | Path：`sessionId`。无 Body | 成功无 `data`。会话 `status` 变为 `1`。已关闭不能再聊、不能再关 | 「结束会话」。记录保留，列表里仍可查 |
| 删除会话 | DELETE | `/ai/session/{sessionIds}` | 需登录，`ai:session:remove` | Path：逗号分隔 id，例如 `/ai/session/1,2`。无 Body | 成功无 `data`。逻辑删除，消息行不级联删除 | 「删除对话」。删除后不要再请求该会话消息 |

约束（已实现，对接时要处理）：

- 发消息、流式、重试、关闭、删除都必须是会话所有者。`userId == 1` 只能多看会话和消息，不能替他人操作。
- 会话 `status=1` 后，聊天、流式、重试、再次关闭都会失败，`msg=session is closed`。
- 同一会话同时只能有一路生成。
- `intent` 为 `KNOWLEDGE` 或 `TASK` 时，前端仍按普通聊天展示。没有第二套任务 UI 协议。

## 3. 已实现的配套接口

聊天页和模型管理页会用到，源码中可用。

| 功能 | Method | URL | 登录要求 | 请求参数 | 响应字段 | 前端调用场景 |
| --- | --- | --- | --- | --- | --- | --- |
| 消息详情 | GET | `/ai/session/{sessionId}/messages/{messageId}` | 需登录，`ai:session:query` | Path：`sessionId`、`messageId` | `AjaxResult.data` 为单条消息，字段与历史行相同 | 断线后按 `assistantMessageId` 对齐正文；`AI_ERROR` 不带半截文本，要从这里读 `content` |
| 重试失败或已停止的助手消息 | POST | `/ai/chat/retry` | 需登录，`ai:chat:chat` | JSON：`sessionId`、`messageId` 必填，`modelId?`。没有 `requestId` | 与流式开始结果相同，但 `userMessageId` 为 `null`。`assistantMessageId` 是**新**消息 | 仅当旧助手消息 `status` 为 `2` 或 `3` 时显示重试。不要覆盖旧气泡 |
| 校正中断中的生成 | POST | `/ai/session/{sessionId}/reconcile` | 需登录，`ai:session:query` | Path：`sessionId`。无 Body | `data.recovered`：本次被标为失败的条数 | WebSocket 重连后，若本地仍显示运行中，调用一次。可能再收到 `AI_ERROR`，`msg=generation interrupted` |
| 模型列表 | GET | `/ai/model/list` | 需登录，`ai:model:list` | Query：`pageNum`、`pageSize`、`name?`、`modelName?`、`provider?`、`status?` | `rows[]`：`modelId`、`name`、`provider`、`baseUrl`、`modelName`、`apiKeyMask`、`temperature`、`maxTokens`、`status`、`isDefault`。`apiKey`、`apiKeyEnc` 恒为 `null` | 模型管理页；聊天页若要做模型下拉，也用这个列表。这不是智能体列表 |
| 模型详情 | GET | `/ai/model/{modelId}` | 需登录，`ai:model:query` | Path：`modelId` | 与列表行相同。id 不存在时 `code=200` 且**没有** `data` | 编辑前回填。要用「有没有 `data`」判断是否存在 |
| 新增模型 | POST | `/ai/model` | 需登录，`ai:model:add` | JSON：`name`、`modelName`、`apiKey` 必填；`provider?`、`baseUrl?`、`temperature?`、`maxTokens?`、`status?`、`isDefault?`、`remark?`。`baseUrl` 一旦填写，去掉末尾 `/` 后必须以 `/v1` 结尾 | 成功无 `data`，不返回 `modelId`。地址不合法时 `code=500`，消息为 `model baseUrl must end with /v1 (OpenAI-compatible path)` | 管理页新增后重新拉列表。聊天不再回退 yml 地址，空 `baseUrl` 能保存，但发起对话会失败 |
| 修改模型 | PUT | `/ai/model` | 需登录，`ai:model:edit` | JSON：`modelId` 以及要改的字段。`apiKey` 为空表示不改密钥。非空 `baseUrl` 规则与新增相同 | 成功无 `data`。保存成功后当前进程丢掉该模型客户端缓存 | 管理页保存。已发出的生成仍用旧客户端，下一轮才用新地址 |
| 删除模型 | DELETE | `/ai/model/{modelIds}` | 需登录，`ai:model:remove` | Path：逗号分隔 id | 成功无 `data` | 管理页删除。逻辑删除 |

消息 `status`：`0` 运行中，`1` 完成，`2` 已停止，`3` 失败。用户消息写入后就是 `1`。流式成功不回写 token，这三项只在普通消息成功时有值。

模型地址只来自 `ai_model_config.baseUrl`。表单应要求 OpenAI 兼容地址以 `/v1` 结尾，例如 `https://api.openai.com/v1` 或 `http://127.0.0.1:9997/v1`。流式接口可能先返回成功，地址或密钥错误再通过 `AI_ERROR` 送到已连接的 WebSocket。

## 4. 待实现或待确认

下列能力在 Controller、Service 和库表中都不存在。不要调用猜测路径。

| 功能 | Method | URL | 登录要求 | 请求参数 | 响应字段 | 前端调用场景 |
| --- | --- | --- | --- | --- | --- | --- |
| 查询智能体列表 | 无 | 无 | 无 | 无 | 无 | 不要做智能体选择器，除非后端另交付接口。模型列表不能代替 |
| 创建智能体任务 | 无 | 无 | 无 | 无 | 无 | 用户输入即使被标成 `intent=TASK`，也只调用 `POST /ai/chat/stream`，按聊天展示 |
| 确认任务 | 无 | 无 | 无 | 无 | 无 | 不要做确认弹窗协议 |
| 拒绝任务 | 无 | 无 | 无 | 无 | 无 | 不要做拒绝协议 |
| 补充任务参数 | 无 | 无 | 无 | 无 | 无 | 不要做补参表单提交 |
| 查询任务状态 | 无 | 无 | 无 | 无 | 无 | 没有 `taskId`。进度只看当前助手消息的 `status` 和 WebSocket 的 `AI_START` / `AI_DELTA` / `AI_DONE` / `AI_CANCELLED` / `AI_ERROR` |

源码里与「任务」相关、但不能当成接口使用的事实：

- `AiIntentType.TASK`、`KNOWLEDGE` 只写入流式响应和 `AI_ROUTE`。`executionPath` 固定 `CHAT`。
- Redis 键 `ai:run:{requestId}` 保存运行上下文，没有查询 HTTP。
- 不存在 `ai_task` 表。

待确认（接口已有，行为需要产品接受）：

- 浏览器多标签会互相挤掉 WebSocket，只有最后一条连接能收到增量。
- 停止未知 `requestId` 返回成功。
- 模型详情不存在时 `code` 仍为 200。
- 菜单权限脚本只授予角色 1，其他角色要在系统菜单里授权后才能调这些接口。

## 5. Axios 请求示例

`baseURL` 使用前端环境变量。路径从 `/ai` 开始。

```typescript
import axios from 'axios'

const http = axios.create({
  baseURL: import.meta.env.VITE_APP_BASE_API || 'http://localhost:8080',
  timeout: 60000
})

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export interface AjaxResult<T> {
  code: number
  msg: string
  data?: T
}

export interface TableData<T> {
  code: number
  msg: string
  total: number
  rows: T[]
}

export async function unwrapAjax<T>(promise: Promise<{ data: AjaxResult<T> }>): Promise<T | undefined> {
  const body = (await promise).data
  if (body.code === 401) {
    throw new Error(body.msg || '未登录')
  }
  if (body.code === 403) {
    throw new Error(body.msg || '没有权限')
  }
  if (body.code !== 200) {
    throw new Error(body.msg || '请求失败')
  }
  return body.data
}

export function createSession(modelId?: number) {
  return unwrapAjax<AiSession>(http.post('/ai/session', { modelId }))
}

export function listSessions(params: { pageNum: number; pageSize: number; title?: string; status?: string }) {
  return http.get<TableData<AiSession>>('/ai/session/list', { params }).then((res) => {
    if (res.data.code !== 200) {
      throw new Error(res.data.msg)
    }
    return res.data
  })
}

export function getSession(sessionId: number) {
  return unwrapAjax<AiSession>(http.get(`/ai/session/${sessionId}`))
}

export function listMessages(sessionId: number, params: { pageNum: number; pageSize: number; role?: string; status?: string }) {
  return http.get<TableData<AiMessage>>(`/ai/session/${sessionId}/messages`, { params }).then((res) => {
    if (res.data.code !== 200) {
      throw new Error(res.data.msg)
    }
    return res.data
  })
}

export function sendMessage(body: AiChatRequest) {
  return unwrapAjax<AiMessage>(http.post('/ai/chat', body, { timeout: 300000 }))
}

export function startStream(body: AiChatRequest) {
  return unwrapAjax<AiChatStartResult>(http.post('/ai/chat/stream', body))
}

export function stopGeneration(requestId: string) {
  return unwrapAjax<undefined>(http.post('/ai/chat/stop', { requestId }))
}

export function retryMessage(body: { sessionId: number; messageId: number; modelId?: number }) {
  return unwrapAjax<AiChatStartResult>(http.post('/ai/chat/retry', body))
}

export function closeSession(sessionId: number) {
  return unwrapAjax<undefined>(http.put(`/ai/session/close/${sessionId}`))
}

export function removeSessions(sessionIds: number[]) {
  return unwrapAjax<undefined>(http.delete(`/ai/session/${sessionIds.join(',')}`))
}

export function reconcileSession(sessionId: number) {
  return unwrapAjax<{ recovered: number }>(http.post(`/ai/session/${sessionId}/reconcile`))
}
```

普通发送的超时要单独加大。服务端运行上限默认 300 秒，上面的实例默认 60 秒只适合列表和流式「开始」请求。

## 6. WebSocket 连接及消息发送示例

只存在 `ws://{host}:8080/ws`。浏览器使用 Query 传令牌。没有 SockJS，没有 `/ai/ws`。

```typescript
export function connectAiSocket(token: string, onEvent: (msg: AiSocketMessage) => void) {
  const url = `ws://localhost:8080/ws?token=${encodeURIComponent(token)}`
  const ws = new WebSocket(url)

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data) as AiSocketMessage
    onEvent(msg)
  }

  const timer = window.setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'PING' }))
    }
  }, 30000)

  return {
    ws,
    cancel(requestId: string) {
      ws.send(JSON.stringify({ type: 'AI_CANCEL', requestId }))
    },
    close() {
      window.clearInterval(timer)
      ws.close()
    }
  }
}
```

客户端可发送的真实消息：

```json
{ "type": "PING" }
```

```json
{ "type": "AI_CANCEL", "requestId": "8a1b2c3d-4e5f-4678-9abc-def012345678" }
```

服务端系统帧：`CONNECTED`、`PONG`、`ERROR`（`code` 为 `INVALID_MESSAGE`、`UNKNOWN_MESSAGE` 或 `BIZ_ERROR`）。

服务端 AI 帧信封是 `type`、`requestId`、`data`、`timestamp`。处理顺序：

| type | 前端动作 |
| --- | --- |
| `AI_ROUTE` | 可忽略，或仅展示 `data.intent`。不要据此进入任务流程 |
| `AI_START` | 用 `data.messageId` 建立助手气泡，状态 `0` |
| `AI_DELTA` | 把 `data.delta` **追加**到该气泡 |
| `AI_DONE` | 用 `data.content` 覆盖为全文，状态改为 `1` |
| `AI_CANCELLED` | 用 `data.content` 作为已生成部分，状态改为 `2` |
| `AI_ERROR` | 展示 `data.msg`，状态改为 `3`；半截正文再请求消息详情 |

`PING` 的 30 秒间隔是前端示例，服务端没有定时心跳，也没有断线补发。重连后调用消息详情或 `reconcile`。同一用户新连接会关闭旧连接。关闭 WebSocket 不会取消生成。

## 7. TypeScript 类型定义建议

类型对应后端已有对象。未实现的智能体、任务类型不要加。

```typescript
export type SessionStatus = '0' | '1'
export type MessageStatus = '0' | '1' | '2' | '3'
export type MessageRole = 'user' | 'assistant' | 'system'
export type IntentCode = 'CHAT' | 'KNOWLEDGE' | 'TASK'

export interface AiSession {
  sessionId: number
  userId: number
  title: string
  modelId: number | null
  status: SessionStatus
  delFlag: string
  lastMessageTime: string | null
  createBy: string | null
  createTime: string | null
  updateBy: string | null
  updateTime: string | null
  remark: string | null
  nickName: string | null
}

export interface AiMessage {
  messageId: number
  sessionId: number
  userId: number
  role: MessageRole
  content: string | null
  status: MessageStatus
  requestId: string | null
  errorMsg: string | null
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
  createTime: string | null
  updateTime: string | null
}

export interface AiChatRequest {
  sessionId: number
  content: string
  modelId?: number
  requestId?: string
}

export interface AiChatStartResult {
  sessionId: number
  requestId: string
  userMessageId: number | null
  assistantMessageId: number
  intent?: IntentCode
  intentConfidence?: number
  intentReason?: string
  executionPath?: 'CHAT'
}

export interface AiModelConfig {
  modelId: number
  name: string
  provider: string
  /** 提供方地址。有值时必须以 /v1 结尾；null 表示库中为空，调用会失败 */
  baseUrl: string | null
  modelName: string
  apiKey: null
  apiKeyEnc: null
  apiKeyMask: string | null
  temperature: number | null
  maxTokens: number | null
  status: '0' | '1'
  isDefault: '0' | '1'
  delFlag: string
  createBy: string | null
  createTime: string | null
  updateBy: string | null
  updateTime: string | null
  remark: string | null
}

export interface AiWsEnvelope<T extends Record<string, unknown>> {
  type: 'AI_ROUTE' | 'AI_START' | 'AI_DELTA' | 'AI_DONE' | 'AI_ERROR' | 'AI_CANCELLED'
  requestId: string | null
  data: T
  timestamp: number
}

export type AiSocketMessage =
  | { type: 'CONNECTED' | 'PONG'; message: string; timestamp: number }
  | { type: 'ERROR'; code: 'INVALID_MESSAGE' | 'UNKNOWN_MESSAGE' | 'BIZ_ERROR'; message: string; timestamp: number }
  | AiWsEnvelope<{ intent: IntentCode; confidence: number; reason: string; executionPath: 'CHAT' }>
  | AiWsEnvelope<{ sessionId: number; messageId: number }>
  | AiWsEnvelope<{ sessionId: number; messageId: number; delta: string }>
  | AiWsEnvelope<{ sessionId: number; messageId: number; content: string }>
  | AiWsEnvelope<{ sessionId?: number; messageId?: number; msg: string }>
```

主键是 JSON 数字。当前自增 id 在 JS 安全整数范围内；若以后改为雪花 id，需要再约定字符串。

## 8. 前端页面与 API 的对应关系

本仓库没有 Vue3 页面。下表的组件路径来自 `sql/ai_20261012.sql` 的菜单 `component`。RuoYi-Vue3 通常落在 `src/views/` 下，文件是否已经建好要在前端仓库确认。

| 页面 | 菜单组件路径 | 使用的已实现接口 | 不要调用 |
| --- | --- | --- | --- |
| AI 会话 / 聊天 | `ai/session/index` | 创建、列表、详情、历史消息、流式（主路径）或普通发送、停止、关闭、删除、消息详情、重试、reconcile；WebSocket `/ws` | 智能体列表、创建任务、确认/拒绝/补参、任务状态 |
| 模型配置 | `ai/model/index` | 模型列表、详情、新增、修改、删除 | 不要把本页做成智能体管理 |
| 聊天页里的模型下拉 | 无独立菜单，可复用模型列表 | `GET /ai/model/list`，把选中的 `modelId` 传给创建会话或 `/ai/chat/stream` | 不存在「当前用户可选智能体」接口 |
| 智能体 / 任务页 | 菜单中不存在 | 无 | 全部待实现，页面先不要接假接口 |

聊天页建议顺序：

1. 带登录令牌连接 `/ws`。
2. `GET /ai/session/list` 渲染左侧列表。
3. 选中会话后 `GET /ai/session/{sessionId}/messages` 渲染历史。
4. 发送时 `POST /ai/chat/stream`，立刻插入用户气泡和空的助手气泡（id 用 `userMessageId`、`assistantMessageId`）。
5. 按 WebSocket 增量更新该助手气泡。
6. 停止用 `AI_CANCEL` 或 `POST /ai/chat/stop`。
7. 断开后用消息详情恢复，必要时 `reconcile`。

权限与按钮：

| 按钮 | 权限 |
| --- | --- |
| 进入会话页 | `ai:session:list` |
| 看历史、详情 | `ai:session:query` |
| 新建会话 | `ai:session:add` |
| 关闭 | `ai:session:edit` |
| 删除 | `ai:session:remove` |
| 发送、流式、停止、重试 | `ai:chat:chat` |
| 模型管理 | `ai:model:list`，以及 `query` / `add` / `edit` / `remove` |
