# ruoyi-ai 接口文档

本文档依据当前仓库代码整理，供 RuoYi-Vue3 前端对接。只描述已经存在的接口和协议。未实现的能力单独标明，不按预期设计补写。

核对日期以仓库当前源码为准。HTTP 入口不在 `ruoyi-ai` 模块内，而在 `ruoyi-admin` 的三个 Controller。`ruoyi-ai` 提供领域对象、Service、WebSocket 入站处理器和流式事件协议。

实现状态用语：

| 标记 | 含义 |
| --- | --- |
| 已实现 | 代码中有完整调用链，可按本文档对接 |
| 已声明但实现不完整 | 类型、字段或分支已存在，但当前不会走独立业务 |
| 未实现 | 代码中不存在对应接口、表或协议 |

## 1. 模块概述和调用架构

### 1.1 模块职责

`ruoyi-ai` 当前阶段提供：

- 模型配置的增删改查（API Key 加密存储，查询只返回掩码）。
- 会话的创建、列表、详情、关闭、逻辑删除。
- 会话消息的分页查询和单条详情。
- 同步聊天、流式聊天、停止生成、失败或停止后的流式重试。
- 基于规则的意图识别。识别结果只作为元数据返回，实际一律走聊天补全。
- 流式增量通过项目已有 WebSocket `/ws` 推送给当前登录用户。

当前没有独立的“任务”表，也没有任务查询 HTTP 接口。一次生成任务只存在于 Redis（`ai:run:{requestId}`）和 `ai_message.status = 0` 的助手消息上。

### 1.2 调用架构

```text
Vue3
  |  HTTP  Authorization: Bearer {jwt}
  |  ----> ruoyi-admin Controller
  |           AiChatController      /ai/chat/**
  |           AiSessionController   /ai/session/**
  |           AiModelConfigController /ai/model/**
  |         |
  |         v
  |       ruoyi-ai Service
  |         |-- MySQL  ai_model_config / ai_session / ai_message
  |         |-- Redis  会话锁、运行上下文
  |         |-- 按 ai_model_config 懒创建 OpenAI 兼容 ChatModel（进程内缓存，含 Xinference）
  |
  |  WebSocket  ws://{host}:{port}/ws?token={jwt}
  |  ----> framework WebSocketHandler
  |           握手鉴权：RuoYiWebSocketAuthInterceptor
  |           入站 AI 消息：AiWebSocketBizHandler（仅 AI_CANCEL）
  |           出站推送：WebSocketPushServiceImpl.sendToUser(userId, event)
```

类级映射与方法级映射拼接后的路径见第 3 节。启动类 `com.ruoyi.RuoYiApplication` 没有额外的 `servlet path` 或 `context-path` 前缀。`server.servlet.context-path` 为 `/`。

Springdoc 已分组扫描 AI Controller。页面 `http://{host}:8080/swagger-ui.html`，分组选「AI 模块」；OpenAPI JSON 为 `http://{host}:8080/v3/api-docs/ai`。WebSocket 帧不在该 JSON 里，仍以本文第 5 节为准。

### 1.3 数据权限

AI 接口没有使用 `@DataScope`。隔离规则在 Service 中手写：

| 操作 | 规则 |
| --- | --- |
| 会话列表 | 非管理员强制 `userId = 当前用户`，忽略客户端传入的 `userId`。管理员（`userId == 1`）可查全部，并可按 `userId` 筛选 |
| 会话详情、消息列表、消息详情、手动 reconcile | 管理员可读任意会话；其他人必须是会话所有者 |
| 发消息、流式、重试、关闭会话 | 必须是会话所有者，且会话状态为正常。管理员不能代他人操作 |
| 删除会话 | 必须是所有者。不存在的 id 跳过；有一个不属于自己则整批失败 |
| 停止生成 | 必须是该 `requestId` 的任务所有者。管理员不能代停 |
| 模型配置 | 无按用户隔离。持有对应菜单权限即可操作全部模型 |

管理员判定是 `SecurityUtils.isAdmin()`，即 `userId == 1`，不是“拥有某角色”的泛化判断。

## 2. 基础地址及环境配置

### 2.1 基础地址

| 项 | 代码中的值 |
| --- | --- |
| HTTP 根地址 | `http://{host}:8080` |
| context-path | `/` |
| WebSocket | `ws://{host}:8080/ws` |
| 协议 | 原生 WebSocket。未启用 SockJS，不存在 `/ws/info`、`/ws/websocket` |

前端开发代理（常见为 `/dev-api`）是 Vue 工程自己的前缀，后端路径不包含该前缀。请求到达后端后应为 `/ai/...` 和 `/ws`。

生产若启用 HTTPS，WebSocket 应使用 `wss`。当前 `application.yml` 未配置 SSL，仓库内只有 `ws://`。

### 2.2 与 AI 相关的配置

配置来自 `ruoyi-admin/src/main/resources/application.yml`。密钥、令牌签名和数据库密码不写入本文档。

| 配置项 | 当前非敏感取值 | 作用 |
| --- | --- | --- |
| `server.port` | `8080` | HTTP / WebSocket 端口 |
| `server.servlet.context-path` | `/` | 无额外前缀 |
| `token.header` | `Authorization` | HTTP 与 WebSocket 握手读取的头名 |
| `token.expireTime` | `30`（分钟） | 登录态 Redis 过期时间。距过期不足 20 分钟时，**HTTP 请求**会延长 Redis，JWT 字符串本身不变 |
| `ruoyi.ai.history-limit` | `20` | 送入模型的近期消息条数 |
| `ruoyi.ai.stream-persist-interval-ms` | `500` | 流式过程中把已生成文本写回数据库的间隔 |
| `ruoyi.ai.run-timeout-seconds` | `300` | 运行中任务超时阈值，也是 Redis 运行键 TTL |
| `ruoyi.ai.intent-enabled` | `true` | `false` 时意图路由器固定返回 `CHAT` |
| `ruoyi.ai.http-timeout-seconds` | `120` | 按模型行创建客户端时的连接与读取超时（秒）。代码缺省也是 120，且至少按 1 秒处理 |
| `ruoyi.ai.encrypt-key` | 环境变量 `RUOYI_AI_ENCRYPT_KEY` | 模型 API Key 的 AES-GCM 密钥。至少 16 位。空值、短于 16 位、或等于历史内置值 `ruoyi-ai-default-key` 时启动失败。未设置环境变量时，yml 里有仅供本地开发的占位，占位字符串不写入本文档；生产必须设置该环境变量 |
| `ruoyi.ai.encrypt-key-previous` | 环境变量 `RUOYI_AI_ENCRYPT_KEY_PREVIOUS`，默认为空 | 仅启动时使用一次：当前密钥解不开的旧密文（含迁移前的 ECB 行）再用上一把密钥解密，然后用当前密钥重写成 `v2:` 密文。升级日志 `failed=0` 后应去掉 |
| `spring.ai.model.chat` 等 | `none` | `chat`、`embedding`、`image`、`moderation`、`audio.speech`、`audio.transcription` 都是 `none`。启动时不创建 OpenAI 模型 Bean。`spring.ai.openai.*` 已从 yml 删除，不再作为地址、密钥或模型名回退 |

`application-druid.yml` 中没有 AI 专用项。Redis 为运行锁和登录态所必需，连接信息在 `spring.data.redis`，此处不摘录地址和密码。

线程池 `aiChatExecutor`（代码内，不是 yml）：核心 4、最大 16、队列 200。队列满时流式启动失败，HTTP 返回业务错误 `failed to start stream generation`。

超时扫描 `AiTimeoutTask` 每 60 秒执行一次，不是 HTTP 接口。

### 2.3 跨域

`CorsFilter` 对 `/**` 允许任意 Origin、任意头、任意方法，预检缓存 1800 秒。未开启 `allowCredentials`。前端使用 `Authorization` 头即可，不要依赖 Cookie 会话。

## 3. HTTP 接口总表

统一前缀无额外 servlet path。下表路径即后端完整路径。

| # | 名称 | 方法 | 路径 | 权限 | 响应包装 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 同步聊天 | POST | `/ai/chat` | `ai:chat:chat` | `AjaxResult` | 已实现 |
| 2 | 发起流式聊天 | POST | `/ai/chat/stream` | `ai:chat:chat` | `AjaxResult` | 已实现 |
| 3 | 停止生成 | POST | `/ai/chat/stop` | `ai:chat:chat` | `AjaxResult`（无 data） | 已实现 |
| 4 | 重试失败或已停止的助手消息 | POST | `/ai/chat/retry` | `ai:chat:chat` | `AjaxResult` | 已实现 |
| 5 | 会话分页列表 | GET | `/ai/session/list` | `ai:session:list` | `TableDataInfo` | 已实现 |
| 6 | 会话详情 | GET | `/ai/session/{sessionId}` | `ai:session:query` | `AjaxResult` | 已实现 |
| 7 | 新建会话 | POST | `/ai/session` | `ai:session:add` | `AjaxResult` | 已实现 |
| 8 | 关闭会话 | PUT | `/ai/session/close/{sessionId}` | `ai:session:edit` | `AjaxResult`（无 data） | 已实现 |
| 9 | 删除会话 | DELETE | `/ai/session/{sessionIds}` | `ai:session:remove` | `AjaxResult`（无 data） | 已实现 |
| 10 | 消息分页列表 | GET | `/ai/session/{sessionId}/messages` | `ai:session:query` | `TableDataInfo` | 已实现 |
| 11 | 消息详情 | GET | `/ai/session/{sessionId}/messages/{messageId}` | `ai:session:query` | `AjaxResult` | 已实现 |
| 12 | 手动校正中断中的生成 | POST | `/ai/session/{sessionId}/reconcile` | `ai:session:query` | `AjaxResult` | 已实现 |
| 13 | 模型分页列表 | GET | `/ai/model/list` | `ai:model:list` | `TableDataInfo` | 已实现 |
| 14 | 模型详情 | GET | `/ai/model/{modelId}` | `ai:model:query` | `AjaxResult` | 已实现 |
| 15 | 新增模型 | POST | `/ai/model` | `ai:model:add` | `AjaxResult`（无 data） | 已实现 |
| 16 | 修改模型 | PUT | `/ai/model` | `ai:model:edit` | `AjaxResult`（无 data） | 已实现 |
| 17 | 删除模型 | DELETE | `/ai/model/{modelIds}` | `ai:model:remove` | `AjaxResult`（无 data） | 已实现 |

HTTP 接口数量：**17**。WebSocket 连接端点：**1**（复用 `/ws`，没有 `/ai/ws`）。

菜单与权限在 `sql/ai_20261012.sql` 中只授予 `role_id = 1`。其他角色需要在系统菜单里另行授权，否则接口返回权限不足。

| 权限标识 | 菜单 |
| --- | --- |
| `ai:session:list` | AI 会话菜单 |
| `ai:session:query` | 会话查询、消息、reconcile |
| `ai:session:add` | 新建会话 |
| `ai:session:edit` | 关闭会话 |
| `ai:session:remove` | 删除会话 |
| `ai:chat:chat` | 同步、流式、停止、重试 |
| `ai:model:list` | 模型菜单 |
| `ai:model:query` | 模型详情 |
| `ai:model:add` | 新增模型 |
| `ai:model:edit` | 修改模型 |
| `ai:model:remove` | 删除模型 |

不存在的接口（未实现）：

- 修改会话标题、备注的独立接口。标题仅在首条用户消息且原标题为 `新对话` 时自动截取前 30 个字符。
- 会话的通用 PUT 更新。
- 任务列表、任务详情、按 `requestId` 查询运行状态的 HTTP 接口。
- 独立的 AI WebSocket 路径。
- 知识库检索、工具调用、Agent 执行接口。

## 4. 每个接口的详细说明

公共约定：

- 除特别说明外，业务 JSON 的 `Content-Type` 为 `application/json`。GET 使用 Query，不要求 Body。
- 登录后所有 AI HTTP 都要带 `Authorization: Bearer {token}`。`token` 来自既有 `POST /login` 响应字段 `token`，不是 AI 模块签发的。
- 时间字段格式 `yyyy-MM-dd HH:mm:ss`，时区 `GMT+8`。
- 主键在 JSON 中是数字，没有全局 Long 转字符串配置。
- 成功时 HTTP 状态码一般为 200，业务结果看 JSON 里的 `code`。认证失败同样是 HTTP 200 + `code: 401`。详见第 6 节。
- 写操作里，会话新增/关闭/删除和模型增删改记操作日志。聊天四个接口不记 `@Log`。

下文每个接口的“参数错误 / 认证失败 / 权限不足”都遵循第 6 节的统一结构，接口小节只列该接口特有的业务错误文案。

### 4.1 同步聊天

- 用途：在指定会话写入一条用户消息和一条助手消息，等待模型完整返回后再响应。不推送 WebSocket。
- 方法：`POST`
- 路径：`/ai/chat`
- Content-Type：`application/json`
- 登录：需要
- 权限：`ai:chat:chat`
- 源码：`ruoyi-admin/src/main/java/com/ruoyi/web/controller/ai/AiChatController.java` `chat`，第 48–54 行
- 状态：已实现

Body：`AiChatRequest`

| 字段 | 类型 | 必填 | 校验 | 示例 |
| --- | --- | --- | --- | --- |
| `sessionId` | number | 是 | `@NotNull`，会话必须存在、属于当前用户、状态为 `0` | `1` |
| `content` | string | 是 | `@NotBlank`，最长 8000。Service 会再次 trim 和长度校验 | `"你好"` |
| `modelId` | number | 否 | 无注解。优先于会话上的 `modelId`；都为空则用默认模型 | `1` |
| `requestId` | string | 否 | 最长 64。空白则服务端生成 UUID（带连字符）。同一用户、同一会话重复提交时返回已有助手消息，不再调用模型 | `"7f3c2a40-1b2e-4d55-9a10-0c1d2e3f4a5b"` |

请求示例：

```json
{
  "sessionId": 1,
  "content": "你好",
  "modelId": 1,
  "requestId": "7f3c2a40-1b2e-4d55-9a10-0c1d2e3f4a5b"
}
```

成功时 `data` 是**助手消息** `AiMessage`，不是用户消息。用户消息已入库，但本接口不返回其 id。

```json
{
  "code": 200,
  "msg": "操作成功",
  "data": {
    "messageId": 12,
    "sessionId": 1,
    "userId": 2,
    "role": "assistant",
    "content": "你好，有什么可以帮你？",
    "status": "1",
    "requestId": "7f3c2a40-1b2e-4d55-9a10-0c1d2e3f4a5b",
    "errorMsg": null,
    "promptTokens": 20,
    "completionTokens": 12,
    "totalTokens": 32,
    "createTime": "2026-10-16 13:40:00",
    "updateTime": "2026-10-16 13:40:01"
  }
}
```

幂等命中时同样返回已存在的助手消息，`status` 可能不是 `1`。

业务错误（`code` 为 500，无 `data`）：

| msg | 场景 |
| --- | --- |
| `session not found` | 会话不存在或已逻辑删除 |
| `no permission to operate this session` | 不是所有者 |
| `session is closed` | 会话状态不是 `0` |
| `session has a running generation task` | 该会话已有运行中的助手消息，或 Redis 会话锁被占用 |
| `requestId already used by another session` | `requestId` 已被其他用户或其他会话使用 |
| `content is required` / `content max length is 8000` / `sessionId is required` | 注解或 Service 校验 |
| `model config not found` | 指定模型不存在 |
| `model config is disabled` | 模型 `status != 0` |
| `default model is not configured` | 未指定模型且没有默认可用模型 |
| `model API Key is not configured` | 解密后密钥为空 |
| `model name is not configured` | 模型名为空 |
| `model baseUrl is not configured` | 模型行没有 `baseUrl`。不再回退到 yml |
| `model baseUrl must end with /v1 (OpenAI-compatible path)` | `baseUrl` 去掉末尾斜杠后不以 `/v1` 结尾 |
| `failed to init chat model (modelId=...): ...` | 按该行创建客户端失败，明细最长约 200 字符 |
| `API Key decrypt failed` | 密钥无法解密 |
| `empty model response` | 模型返回空文本 |
| `AI model call failed: ...` | 调用提供方失败，明细最长约 300 字符 |
| `AI chat failed: ...` | 其他异常被包装；助手消息会被标为失败（`status=3`）后再把该错误返回给前端 |

同一会话同时只允许一个生成任务。同步调用在方法返回前的 `finally` 中释放会话锁；流式调用要等完成、取消或失败后才释放。

### 4.2 发起流式聊天

- 用途：立即返回本轮消息 id，正文通过 WebSocket 增量推送。
- 方法：`POST`
- 路径：`/ai/chat/stream`
- Content-Type：`application/json`
- 登录：需要
- 权限：`ai:chat:chat`
- 源码：`AiChatController.stream`，第 66–72 行
- 状态：已实现。知识库和任务执行路径未实现，见 `intent` 说明。

Body 与 4.1 相同。地址、密钥、模型名是否可调用是在异步任务里检查的。HTTP 可能已经返回成功，随后 WebSocket `AI_ERROR` 的 `data.msg` 才是 `model baseUrl is not configured`、`model baseUrl must end with /v1 (OpenAI-compatible path)`、`model API Key is not configured`、`failed to init chat model (modelId=...): ...` 或 `AI model stream failed: ...`。同步聊天则直接作为 HTTP `code=500` 返回。

请求示例：

```json
{
  "sessionId": 1,
  "content": "解释一下会话和消息的区别",
  "modelId": 1
}
```

成功 `data` 类型为 `AiChatStartResult`：

```json
{
  "code": 200,
  "msg": "操作成功",
  "data": {
    "sessionId": 1,
    "requestId": "8a1b2c3d-4e5f-4678-9abc-def012345678",
    "userMessageId": 21,
    "assistantMessageId": 22,
    "intent": "KNOWLEDGE",
    "intentConfidence": 0.75,
    "intentReason": "matched knowledge keywords; execute as CHAT this stage",
    "executionPath": "CHAT"
  }
}
```

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `sessionId` | number | 会话 id |
| `requestId` | string | 本轮助手消息的幂等号。停止和 WebSocket 都用它 |
| `userMessageId` | number | 新写入的用户消息 id。幂等命中时为 `null` |
| `assistantMessageId` | number | 助手消息 id。流式事件里的 `messageId` 是这个值 |
| `intent` | string | `CHAT`、`KNOWLEDGE` 或 `TASK` |
| `intentConfidence` | number | 规则命中时 `TASK` 为 0.8，`KNOWLEDGE` 为 0.75，默认聊天为 1.0 |
| `intentReason` | string | 命中原因，英文 |
| `executionPath` | string | 当前恒为 `CHAT` |

`intent` 为已声明但实现不完整：规则可以识别知识和任务口吻，但 Service 注释写明始终执行聊天补全，不会检索知识库，也不会调用工具。`intent-enabled=false` 时 `intent` 为 `CHAT`，`intentReason` 为 `intent routing disabled`。

幂等：同一用户、同一会话再次提交相同 `requestId` 时，直接返回已有助手消息 id，`userMessageId` 为 `null`，且**不带** `intent` 四个字段，也**不会**重新推送 WebSocket。

业务错误与 4.1 相同，另有 `failed to start stream generation`（线程池拒绝时）。此时助手消息会被标为失败，并可能已经推过一条 `AI_ERROR`。

前端应先连上 `/ws` 再调用本接口。用户不在线时生成仍会继续并落库，但增量会被丢弃，不会补发。

流式路径不回写 `promptTokens`、`completionTokens`、`totalTokens`。这三项只在同步聊天中有值。

### 4.3 停止生成

- 用途：按 `requestId` 取消当前用户的运行中生成。也可改用 WebSocket `AI_CANCEL`，效果相同。
- 方法：`POST`
- 路径：`/ai/chat/stop`
- Content-Type：`application/json`
- 登录：需要
- 权限：`ai:chat:chat`
- 源码：`AiChatController.stop`，第 83–90 行
- 状态：已实现

| 字段 | 位置 | 类型 | 必填 | 校验 |
| --- | --- | --- | --- | --- |
| `requestId` | Body | string | 是 | `@NotBlank` |

```json
{
  "requestId": "8a1b2c3d-4e5f-4678-9abc-def012345678"
}
```

成功且任务确实从运行中被取消时，响应没有 `data`，同时会向该用户推送 `AI_CANCELLED`：

```json
{
  "code": 200,
  "msg": "操作成功"
}
```

以下情况也返回上面的成功体，且不推送事件：

- Redis 和数据库都找不到该 `requestId`。
- 助手消息已经不是运行中（`status != 0`）。
- 条件更新没有改到行（并发下已被完成、失败或取消）。

业务错误：

| msg | 场景 |
| --- | --- |
| `requestId is required` | 空白 |
| `no permission to stop this task` | `requestId` 属于其他用户 |

### 4.4 重试

- 用途：对失败（`status=3`）或已停止（`status=2`）的助手消息再发起一次**流式**生成。不新增用户消息，不修改旧助手消息，而是插入一条新的助手消息。
- 方法：`POST`
- 路径：`/ai/chat/retry`
- Content-Type：`application/json`
- 登录：需要
- 权限：`ai:chat:chat`
- 源码：`AiChatController.retry`，第 101–107 行
- 状态：已实现

| 字段 | 类型 | 必填 | 校验 |
| --- | --- | --- | --- |
| `sessionId` | number | 是 | `@NotNull`，且必须可写（所有者、未关闭） |
| `messageId` | number | 是 | `@NotNull`。必须是该会话下、当前用户的助手消息，状态为 `2` 或 `3` |
| `modelId` | number | 否 | 同聊天接口 |

请求体没有 `requestId`。服务端总是新生成 UUID。

```json
{
  "sessionId": 1,
  "messageId": 22,
  "modelId": 1
}
```

成功体与 4.2 相同，但 `userMessageId` 为 `null`。`assistantMessageId` 是**新**助手消息，不是被重试的那条。

```json
{
  "code": 200,
  "msg": "操作成功",
  "data": {
    "sessionId": 1,
    "requestId": "9b8c7d6e-5f4a-4321-9abc-111122223333",
    "userMessageId": null,
    "assistantMessageId": 30,
    "intent": "CHAT",
    "intentConfidence": 1.0,
    "intentReason": "default CHAT",
    "executionPath": "CHAT"
  }
}
```

重试内容取该助手消息之前最近的一条用户消息。送入模型的历史会排除这条用户消息，再由模型适配层追加一次，避免重复。已停止的旧助手消息仍可能留在历史上下文中；失败消息不会进入历史。

业务错误：

| msg | 场景 |
| --- | --- |
| `sessionId and messageId are required` | 空对象或字段为空（注解失败时文案是 `sessionId is required` 或 `messageId is required`） |
| `message not found` | 消息不存在 |
| `message does not belong to this session` | 消息不属于该会话 |
| `no permission to retry this message` | 消息不属于当前用户。此处没有管理员豁免 |
| `only assistant messages can be retried` | `role` 不是 `assistant` |
| `only failed or stopped messages can be retried` | 状态不是 `2` 或 `3` |
| `previous user message not found for retry` | 前面没有可用的用户消息 |
| 以及 4.2 的会话忙、模型、启动失败错误 | 同流式聊天 |

### 4.5 会话分页列表

- 用途：分页查询未删除会话，按最后消息时间、会话 id 倒序。
- 方法：`GET`
- 路径：`/ai/session/list`
- Content-Type：无 Body
- 登录：需要
- 权限：`ai:session:list`
- 源码：`AiSessionController.list`，第 50–57 行
- 状态：已实现

Query：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `pageNum` | number | 否 | 默认 `1` |
| `pageSize` | number | 否 | 默认 `10` |
| `orderByColumn` | string | 否 | 传了才会让 PageHelper 追加排序，可能覆盖 Mapper 默认排序。一般不要传 |
| `isAsc` | string | 否 | `asc`、`desc`、`ascending`、`descending`。默认 `asc` |
| `reasonable` | boolean | 否 | 默认 `true`。页码小于 1 时归到第 1 页，超出末页时归到末页 |
| `title` | string | 否 | 模糊匹配 |
| `status` | string | 否 | 精确匹配。`0` 正常，`1` 已关闭 |
| `modelId` | number | 否 | 精确匹配 |
| `userId` | number | 否 | 仅管理员有效。非管理员会被改写为当前用户 id |

`beginTime` / `endTime` 这类 `params` 范围查询未实现，Mapper 未使用。

请求示例：

```http
GET /ai/session/list?pageNum=1&pageSize=10&title=对话&status=0
Authorization: Bearer {token}
```

成功体是 `TableDataInfo`，不是 `AjaxResult`，没有 `data` 包裹：

```json
{
  "code": 200,
  "msg": "查询成功",
  "total": 1,
  "rows": [
    {
      "sessionId": 1,
      "userId": 2,
      "title": "你好",
      "modelId": 1,
      "status": "0",
      "delFlag": "0",
      "lastMessageTime": "2026-10-16 13:40:01",
      "createBy": "ry",
      "createTime": "2026-10-16 13:00:00",
      "updateBy": null,
      "updateTime": null,
      "remark": null,
      "nickName": "若依"
    }
  ]
}
```

`nickName` 来自 `sys_user` 联表，不是 `ai_session` 列。`searchValue` 不输出。`params` 为空时不输出。

本接口没有 AI 特有业务异常。未登录、无权限见第 6 节。查询不到数据时 `rows` 为 `[]`，`total` 为 `0`，`code` 仍为 200。

### 4.6 会话详情

- 方法：`GET`
- 路径：`/ai/session/{sessionId}`
- 登录：需要
- 权限：`ai:session:query`
- 源码：`AiSessionController.getInfo`，第 59–64 行
- 状态：已实现

| 参数 | 位置 | 类型 | 必填 |
| --- | --- | --- | --- |
| `sessionId` | Path | number | 是 |

```http
GET /ai/session/1
Authorization: Bearer {token}
```

成功 `data` 字段与列表中的单条会话相同。

业务错误：

| msg | 场景 |
| --- | --- |
| `session not found` | 不存在或 `del_flag != 0` |
| `no permission to access this session` | 非管理员且不是所有者 |

Path 不是数字时：`code` 500，`msg` 为参数类型不匹配说明。

### 4.7 新建会话

- 方法：`POST`
- 路径：`/ai/session`
- Content-Type：`application/json`
- 登录：需要
- 权限：`ai:session:add`
- 源码：`AiSessionController.add`，第 66–73 行
- 状态：已实现

| 字段 | 类型 | 必填 | 校验 | 服务端是否采用 |
| --- | --- | --- | --- | --- |
| `title` | string | 否 | 最长 100。空白时写成 `新对话` | 采用 |
| `modelId` | number | 否 | 无 | 采用，可空 |
| `remark` | string | 否 | 无 | 采用 |
| `userId` | number | 否 | 无 | 忽略，改为当前用户 |
| `status` | string | 否 | 无 | 忽略，固定 `0` |
| `delFlag` | string | 否 | 无 | 忽略，固定 `0` |
| `sessionId` | number | 否 | 无 | 由数据库自增回填 |

```json
{
  "title": "",
  "modelId": 1,
  "remark": "前端创建"
}
```

成功时返回写入后的 Java 对象。`sessionId` 已回填。`createTime` 由 SQL `sysdate()` 写入数据库，响应对象里通常仍是 `null`，要展示创建时间需再查详情。

```json
{
  "code": 200,
  "msg": "操作成功",
  "data": {
    "sessionId": 3,
    "userId": 2,
    "title": "新对话",
    "modelId": 1,
    "status": "0",
    "delFlag": "0",
    "lastMessageTime": "2026-10-16 13:50:00",
    "createBy": "ry",
    "createTime": null,
    "updateBy": null,
    "updateTime": null,
    "remark": "前端创建",
    "nickName": null
  }
}
```

业务错误主要是 `title max length is 100`。

### 4.8 关闭会话

- 方法：`PUT`
- 路径：`/ai/session/close/{sessionId}`
- 无 Body
- 登录：需要
- 权限：`ai:session:edit`
- 源码：`AiSessionController.close`，第 75–81 行
- 状态：已实现

关闭后 `status` 变为 `1`。关闭的会话不能再聊天、重试或再次关闭。

```http
PUT /ai/session/close/1
Authorization: Bearer {token}
```

影响行数大于 0：

```json
{
  "code": 200,
  "msg": "操作成功"
}
```

影响行数为 0：

```json
{
  "code": 500,
  "msg": "操作失败"
}
```

业务错误：`session not found`、`no permission to operate this session`、`session is closed`。

### 4.9 删除会话

- 方法：`DELETE`
- 路径：`/ai/session/{sessionIds}`
- 登录：需要
- 权限：`ai:session:remove`
- 源码：`AiSessionController.remove`，第 83–89 行
- 状态：已实现。逻辑删除，`del_flag` 置为 `2`，不是物理删除。不级联删除 `ai_message`。

`sessionIds` 为逗号分隔的数字。单个 id 不需要方括号。

```http
DELETE /ai/session/1,2
Authorization: Bearer {token}
```

成功、失败包装与关闭接口相同（无 `data`）。

业务错误：`no permission to delete others' session: {sessionId}`。不存在的 id 跳过。全部 id 都已删除或不存在时，更新 0 行，返回 `操作失败`。

### 4.10 消息分页列表

- 用途：查询某会话消息。查询前会先校正该会话里已经中断的运行中消息。
- 方法：`GET`
- 路径：`/ai/session/{sessionId}/messages`
- 登录：需要
- 权限：`ai:session:query`
- 源码：`AiSessionController.messages`，第 95–109 行
- 状态：已实现

| 参数 | 位置 | 类型 | 必填 | 是否参与 SQL |
| --- | --- | --- | --- | --- |
| `sessionId` | Path | number | 是 | 是，并覆盖 Query 中的同名字段 |
| `pageNum` | Query | number | 否 | 分页，默认 1 |
| `pageSize` | Query | number | 否 | 分页，默认 10 |
| `orderByColumn` | Query | string | 否 | 同会话列表，一般不要传。默认 `message_id asc` |
| `isAsc` | Query | string | 否 | 同上 |
| `reasonable` | Query | boolean | 否 | 同上 |
| `role` | Query | string | 否 | 精确匹配：`user`、`assistant`、`system` |
| `status` | Query | string | 否 | 精确匹配：`0` 运行中，`1` 完成，`2` 已停止，`3` 失败 |
| `userId` | Query | number | 否 | 会作为附加过滤。不传则不过滤用户 |

`content`、`requestId`、`messageId` 即使出现在 Query 中，当前 Mapper **不会**按它们过滤。

```http
GET /ai/session/1/messages?pageNum=1&pageSize=20&role=assistant&status=1
Authorization: Bearer {token}
```

```json
{
  "code": 200,
  "msg": "查询成功",
  "total": 2,
  "rows": [
    {
      "messageId": 21,
      "sessionId": 1,
      "userId": 2,
      "role": "user",
      "content": "你好",
      "status": "1",
      "requestId": null,
      "errorMsg": null,
      "promptTokens": null,
      "completionTokens": null,
      "totalTokens": null,
      "createTime": "2026-10-16 13:40:00",
      "updateTime": "2026-10-16 13:40:00"
    }
  ]
}
```

调用本接口时，若运行中消息的创建时间早于 `run-timeout-seconds`（默认 300 秒），或 Redis 运行键已消失，会把该消息标为失败，`errorMsg` 为 `generation interrupted`，并向所有者推送 `AI_ERROR`。因此“打开历史”可能伴随一条 WebSocket 错误事件。这是已实现行为。

业务错误：`session not found`、`no permission to access this session`。

### 4.11 消息详情

- 方法：`GET`
- 路径：`/ai/session/{sessionId}/messages/{messageId}`
- 登录：需要
- 权限：`ai:session:query`
- 源码：`AiSessionController.messageInfo`，第 114–130 行
- 状态：已实现

```http
GET /ai/session/1/messages/22
Authorization: Bearer {token}
```

成功 `data` 为单条 `AiMessage`，字段同列表行。

业务错误：

| msg | 场景 |
| --- | --- |
| `session not found` | 会话不可读 |
| `no permission to access this session` | 非管理员且不是会话所有者 |
| `message not found` | 消息不存在，或不属于该 `sessionId` |
| `no permission to access this message` | 非管理员且消息 `userId` 不是当前用户 |

### 4.12 手动校正中断生成

- 用途：与消息列表开头的校正逻辑相同，并返回本次改写条数。适合前端在重连后主动拉取，而不只依赖打开历史。
- 方法：`POST`
- 路径：`/ai/session/{sessionId}/reconcile`
- 无 Body
- 登录：需要
- 权限：`ai:session:query`
- 源码：`AiSessionController.reconcile`，第 135–143 行
- 状态：已实现

```http
POST /ai/session/1/reconcile
Authorization: Bearer {token}
```

```json
{
  "code": 200,
  "msg": "操作成功",
  "data": {
    "recovered": 1
  }
}
```

`recovered` 是本次被标为失败的消息数。没有需要校正的消息时为 `0`。被校正的消息会推送 `AI_ERROR`，`data.msg` 为 `generation interrupted`。

业务错误：`session not found`、`no permission to access this session`、`sessionId is required`（路径缺失时更常见的是路径变量错误，而不是这句）。

### 4.13 模型分页列表

- 方法：`GET`
- 路径：`/ai/model/list`
- 登录：需要
- 权限：`ai:model:list`
- 源码：`AiModelConfigController.list`，第 33–40 行
- 状态：已实现

Query：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `pageNum` / `pageSize` / `orderByColumn` / `isAsc` / `reasonable` | 同会话列表 | 否 | 默认排序：`is_default desc, model_id desc` |
| `name` | string | 否 | 模糊 |
| `modelName` | string | 否 | 模糊 |
| `provider` | string | 否 | 精确 |
| `status` | string | 否 | 精确。`0` 正常，`1` 停用 |

```http
GET /ai/model/list?pageNum=1&pageSize=10&status=0
Authorization: Bearer {token}
```

```json
{
  "code": 200,
  "msg": "查询成功",
  "total": 1,
  "rows": [
    {
      "modelId": 1,
      "name": "默认对话",
      "provider": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "modelName": "gpt-4o-mini",
      "apiKey": null,
      "apiKeyEnc": null,
      "apiKeyMask": "****abcd",
      "temperature": 0.7,
      "maxTokens": 2048,
      "status": "0",
      "isDefault": "1",
      "delFlag": "0",
      "createBy": "admin",
      "createTime": "2026-10-16 10:00:00",
      "updateBy": null,
      "updateTime": null,
      "remark": null
    }
  ]
}
```

`apiKey` 与 `apiKeyEnc` 在返回前被清空。`apiKeyMask` 为 `****` 加明文最后 4 位；明文不足等于 4 位或解密失败时为 `****`。前端不得期望拿到可用密钥。

### 4.14 模型详情

- 方法：`GET`
- 路径：`/ai/model/{modelId}`
- 登录：需要
- 权限：`ai:model:query`
- 源码：`AiModelConfigController.getInfo`，第 42–47 行
- 状态：已实现。不存在时**不会**报错。

存在时 `data` 字段与列表行相同，密钥同样被掩码。

不存在或已删除时，`success(null)` 不输出 `data`：

```json
{
  "code": 200,
  "msg": "操作成功"
}
```

前端要把“无 `data`”当成未找到，不能只判断 `code === 200`。

### 4.15 新增模型

- 方法：`POST`
- 路径：`/ai/model`
- Content-Type：`application/json`
- 登录：需要
- 权限：`ai:model:add`
- 源码：`AiModelConfigController.add`，第 77–84 行
- 状态：已实现。成功响应不带回 `modelId`，需要再查列表。

| 字段 | 类型 | 必填 | 校验与默认 |
| --- | --- | --- | --- |
| `name` | string | 是 | `@NotBlank`，最长 64 |
| `modelName` | string | 是 | `@NotBlank`，最长 64。这是调用提供方时的模型名 |
| `apiKey` | string | 是 | 注解未标必填，Service 为空则报错。只用于写入，响应和后续查询都不返回明文 |
| `provider` | string | 否 | 空则 `openai` |
| `baseUrl` | string | 调用时必填 | 新增时可以为空并入库。一旦传入，会去掉末尾 `/`，并且必须以 `/v1` 结尾，否则本次保存失败。聊天不再使用 yml 地址回退；空地址要到真正调用时才报 `model baseUrl is not configured` |
| `temperature` | number | 否 | 无范围校验。表默认 0.70 |
| `maxTokens` | number | 否 | 无范围校验 |
| `status` | string | 否 | 空则 `0` |
| `isDefault` | string | 否 | 空则 `0`。传 `1` 时会把其他未删除模型的默认标记清掉 |
| `remark` | string | 否 | 原样保存 |

```json
{
  "name": "默认对话",
  "provider": "openai",
  "baseUrl": "https://api.openai.com/v1",
  "modelName": "gpt-4o-mini",
  "apiKey": "<由管理员填写，不要写入前端仓库>",
  "temperature": 0.7,
  "maxTokens": 2048,
  "status": "0",
  "isDefault": "1",
  "remark": ""
}
```

成功：

```json
{
  "code": 200,
  "msg": "操作成功"
}
```

业务错误：`name is required`、`modelName is required`、长度错误、`API Key is required`。传入的 `baseUrl` 为空串时是 `model baseUrl is not configured`；不以 `/v1` 结尾时是 `model baseUrl must end with /v1 (OpenAI-compatible path)`。

### 4.16 修改模型

- 方法：`PUT`
- 路径：`/ai/model`
- Content-Type：`application/json`
- 登录：需要
- 权限：`ai:model:edit`
- 源码：`AiModelConfigController.edit`，第 92–99 行
- 状态：已实现

`modelId` 没有 `@NotNull`，但 Service 会按它查询。不存在时 `model config not found`。

`apiKey` 非空才重新加密；不传或空字符串表示不改密钥。`isDefault=1` 同样会取消其他默认模型。`baseUrl` 非空时按新增规则规范化，不合法则本次更新失败、缓存不变。更新或删除成功后，当前 JVM 会丢掉该 `modelId` 的客户端缓存；已经在跑的调用仍用拿到的旧实例。多实例之间不会互相通知失效。

```json
{
  "modelId": 1,
  "name": "默认对话",
  "provider": "openai",
  "baseUrl": "http://127.0.0.1:9997/v1",
  "modelName": "qwen2.5-instruct",
  "temperature": 0.7,
  "maxTokens": 2048,
  "status": "0",
  "isDefault": "1"
}
```

成功与失败包装同新增（无 `data`）。更新 0 行时 `code` 500、`msg` 为 `操作失败`。

### 4.17 删除模型

- 方法：`DELETE`
- 路径：`/ai/model/{modelIds}`
- 登录：需要
- 权限：`ai:model:remove`
- 源码：`AiModelConfigController.remove`，第 67–73 行
- 状态：已实现。逻辑删除，无所有者校验。

```http
DELETE /ai/model/1,2
Authorization: Bearer {token}
```

成功、0 行失败的包装与删除会话相同。

## 5. WebSocket 接口与消息协议

### 5.1 连接

| 项 | 实际值 | 状态 |
| --- | --- | --- |
| 路径 | `/ws` | 已实现 |
| 完整地址 | `ws://{host}:8080/ws` | 已实现 |
| SockJS | 无 | 未实现 |
| 独立 AI 路径如 `/ai/ws` | 无 | 未实现 |
| 允许的 Origin | `*` | 已实现 |

注册位置：`ruoyi-framework/.../websocket/WebSocketConfig.java`，`registerWebSocketHandlers` 绑定 `"/ws"`。

Spring Security 对 `/ws` 配置了 `permitAll`，匿名请求能进入握手。身份校验在握手拦截器中完成，失败时握手 HTTP 状态为 **401**，不会升级为 WebSocket。这与业务 HTTP 的“HTTP 200 + JSON code 401”不同。

### 5.2 连接认证

两种方式，都复用登录 JWT。拦截器优先读 Header，没有 Header 再读 Query。

| 方式 | 示例 | 适用 |
| --- | --- | --- |
| Header | `Authorization: Bearer {token}` | 能自定义握手头的客户端 |
| Query | `/ws?token={token}` | 浏览器 `WebSocket` API。不要再加 `Bearer `，加了也会被去掉 |

校验步骤：去掉 `Bearer ` 前缀，交给 `TokenService.getLoginUser`。JWT 能解析且 Redis 中仍有登录用户、且 `userId` 非空才通过。无效、过期、Redis 无登录态均为握手 401。

用户 id 只来自握手，不接受连接后的 `AUTH` 消息改身份。服务端收到 `AUTH` 只打警告日志，不回复。

握手成功后**不会**因为 token 后来过期而主动断开。过期只影响下一次握手。WebSocket 握手本身也不刷新 Redis 过期时间。

### 5.3 连接成功与用户隔离

建连成功后服务端立即发送一条系统消息（注意字段是 `message`，不是 AI 事件的 `data`）：

```json
{
  "type": "CONNECTED",
  "message": "WebSocket连接成功",
  "timestamp": 1760590800000
}
```

隔离规则（已实现）：

- 内存映射是 `userId -> 一条 WebSocketSession`。
- 同一用户新连接会关闭旧连接。多标签只有最后一条连接能收到推送。
- 推送只发给该 `userId`，不会按 AI `sessionId` 再分房间。
- 关闭旧连接时按 session 对象删除，避免误删新连接。
- 用户不在线或会话已关闭时，`sendToUser` 直接丢弃，不排队、不补发。

### 5.4 心跳

| 方向 | 状态 | 格式 |
| --- | --- | --- |
| 客户端心跳 | 已实现 | `{"type":"PING"}`。`type` 大小写不敏感 |
| 服务端回复 | 已实现 | `{"type":"PONG","message":"pong","timestamp":1760590800000}` |
| 客户端回复 PONG | 已实现为忽略 | 服务端不处理 |
| 服务端定时心跳 | 未实现 | 没有服务端主动 PING，也没有空闲超时断开 |

### 5.5 客户端发往服务端

AI 模块只注册了一种业务类型：`AI_CANCEL`。`type` 会先转成大写再路由。

推荐格式（`requestId` 放在信封上）：

```json
{
  "type": "AI_CANCEL",
  "requestId": "8a1b2c3d-4e5f-4678-9abc-def012345678"
}
```

也接受放在 `data` 里。信封上的 `requestId` 优先：

```json
{
  "type": "AI_CANCEL",
  "data": {
    "requestId": "8a1b2c3d-4e5f-4678-9abc-def012345678"
  }
}
```

`data` 里不要传 `userId`。传了也不会当作身份。

取消成功时 HTTP 不会返回，结果是服务端推送的 `AI_CANCELLED`（见 5.6）。取消被拒绝时推送 `AI_ERROR`，`data.msg` 为 `requestId is required`、`no permission to stop this task` 或 `cancel failed`。未知 `requestId`、任务已结束时与 HTTP stop 一样静默成功，不推送。

其他入站类型：

| type | 行为 | 状态 |
| --- | --- | --- |
| `PING` | 回 `PONG` | 已实现 |
| `PONG` | 忽略 | 已实现 |
| `AUTH` | 忽略 | 已实现为拒绝改身份 |
| 没有 `type` | 回系统错误 `UNKNOWN_MESSAGE` | 已实现 |
| JSON 无法解析，或空串以外的非法文本 | 回系统错误 `INVALID_MESSAGE` | 已实现 |
| 空文本 | 忽略 | 已实现 |
| 其他未知 `type` | 只打调试日志，**不回复** | 已实现为无响应 |
| 业务处理器抛出未捕获异常 | 回系统错误 `BIZ_ERROR` | 已实现。`AI_CANCEL` 内部已捕获异常，正常走 `AI_ERROR` |

系统错误帧：

```json
{
  "type": "ERROR",
  "code": "INVALID_MESSAGE",
  "message": "消息格式错误",
  "timestamp": 1760590800000
}
```

| code | message |
| --- | --- |
| `INVALID_MESSAGE` | `消息格式错误` |
| `UNKNOWN_MESSAGE` | `未知消息类型` |
| `BIZ_ERROR` | `业务消息处理失败` |

这里的 `code` 是字符串，与 HTTP JSON 里的数字 `code` 不是同一套。

### 5.6 服务端 AI 事件

流式聊天和重试才会推送。同步聊天不推送。事件由 `AiWsProtocol` 构造，经独立 `ObjectMapper` 序列化。信封如下：

```json
{
  "type": "AI_DELTA",
  "requestId": "8a1b2c3d-4e5f-4678-9abc-def012345678",
  "data": {},
  "timestamp": 1760590800000
}
```

| 信封字段 | 类型 | 含义 |
| --- | --- | --- |
| `type` | string | 事件名 |
| `requestId` | string | 本轮生成 id。错误且无法解析 requestId 时可能为 `null` |
| `data` | object | 事件体 |
| `timestamp` | number | 毫秒时间戳 |

正常顺序：`AI_ROUTE` → `AI_START` → 若干 `AI_DELTA` → `AI_DONE`。取消则在增量之后收到 `AI_CANCELLED`，不再收到 `AI_DONE`。失败收到 `AI_ERROR`，不再收到 `AI_DONE`。

#### AI_ROUTE

意图已判定，生成尚未开始吐字。已实现。`executionPath` 当前恒为 `CHAT`。

```json
{
  "type": "AI_ROUTE",
  "requestId": "8a1b2c3d-4e5f-4678-9abc-def012345678",
  "data": {
    "intent": "KNOWLEDGE",
    "confidence": 0.75,
    "reason": "matched knowledge keywords; execute as CHAT this stage",
    "executionPath": "CHAT"
  },
  "timestamp": 1760590800000
}
```

| data 字段 | 类型 | 含义 |
| --- | --- | --- |
| `intent` | string | `CHAT` / `KNOWLEDGE` / `TASK` |
| `confidence` | number | 0 到 1 |
| `reason` | string | 规则说明 |
| `executionPath` | string | 当前实际执行路径，恒为 `CHAT` |

#### AI_START

助手占位消息已创建，开始读取模型流。

```json
{
  "type": "AI_START",
  "requestId": "8a1b2c3d-4e5f-4678-9abc-def012345678",
  "data": {
    "sessionId": 1,
    "messageId": 22
  },
  "timestamp": 1760590800100
}
```

`messageId` 是助手消息 id，不是用户消息 id。

#### AI_DELTA

文本增量。`delta` 是本段新增文本，不是累计全文。前端应追加。

```json
{
  "type": "AI_DELTA",
  "requestId": "8a1b2c3d-4e5f-4678-9abc-def012345678",
  "data": {
    "sessionId": 1,
    "messageId": 22,
    "delta": "你好"
  },
  "timestamp": 1760590800200
}
```

约每 500ms 把当时累计文本写回数据库，消息状态仍为 `0`。这不是单独的 WebSocket 类型。

#### AI_DONE

生成正常结束。`content` 是累计全文。数据库状态改为 `1`。

```json
{
  "type": "AI_DONE",
  "requestId": "8a1b2c3d-4e5f-4678-9abc-def012345678",
  "data": {
    "sessionId": 1,
    "messageId": 22,
    "content": "你好，有什么可以帮你？"
  },
  "timestamp": 1760590803000
}
```

不包含 token 用量。

#### AI_CANCELLED

用户通过 HTTP stop 或 `AI_CANCEL` 取消，且数据库仍处于运行中、更新成功。状态改为 `2`。`content` 为已生成的部分，可能是空字符串。

```json
{
  "type": "AI_CANCELLED",
  "requestId": "8a1b2c3d-4e5f-4678-9abc-def012345678",
  "data": {
    "sessionId": 1,
    "messageId": 22,
    "content": "部分已生成文本"
  },
  "timestamp": 1760590802500
}
```

#### AI_ERROR

生成失败、超时、校正中断，或取消参数不合法。状态改为 `3`（取消参数错误时可能还没有消息，则没有 `sessionId` / `messageId`）。

```json
{
  "type": "AI_ERROR",
  "requestId": "8a1b2c3d-4e5f-4678-9abc-def012345678",
  "data": {
    "sessionId": 1,
    "messageId": 22,
    "msg": "AI model stream failed: connection reset"
  },
  "timestamp": 1760590802600
}
```

| data 字段 | 类型 | 含义 |
| --- | --- | --- |
| `sessionId` | number | 有消息时才有 |
| `messageId` | number | 有消息时才有 |
| `msg` | string | 错误摘要，最长约 400 字符 |

失败时已生成的部分写在数据库 `content` 里，**不在** `AI_ERROR.data` 中。前端要显示半截文本，需再调消息详情。

已知 `msg`：

| msg | 来源 |
| --- | --- |
| `generation timeout` | 定时任务。运行超过 `run-timeout-seconds` |
| `generation interrupted` | 打开消息列表或调用 reconcile 时，运行键丢失或已超时 |
| `AI model stream failed: ...` | 模型流错误 |
| `requestId is required` | WebSocket 取消缺少 id |
| `no permission to stop this task` | 取消了别人的任务 |
| `cancel failed` | 取消过程出现未预期异常 |
| 其他 ServiceException 文案 | 原样放入 `msg` |

### 5.7 重连与关闭

| 能力 | 状态 |
| --- | --- |
| 断线后服务端续传增量 | 未实现 |
| 重连握手协议、resume 游标 | 未实现 |
| 关闭连接时自动取消生成 | 未实现。生成继续跑，后续事件发给该用户当前连接；若没有连接则丢弃 |
| 同一用户只保留一条连接 | 已实现 |
| 传输异常 | 已实现。移除会话并按 `CloseStatus.SERVER_ERROR`（1011）关闭 |
| 握手后缺少 userId | 已实现。按 `CloseStatus.NOT_ACCEPTABLE`（1003）关闭 |

前端重连策略需要自己实现：重新 `new WebSocket('/ws?token=...')`，再用消息列表或消息详情对齐 `assistantMessageId` 的 `content` 和 `status`。若页面仍显示运行中、但 Redis 已丢失，调用 `POST /ai/session/{sessionId}/reconcile`。

## 6. 统一响应结构和错误码

AI 模块没有单独的错误码枚举。业务失败绝大多数是 `code = 500` 加英文 `msg`。

### 6.1 AjaxResult

聊天、会话写操作、模型写操作、详情、reconcile 使用 `AjaxResult`（一个 Map）。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `code` | number | 200 成功，401 未认证，403 无权限，500 失败，601 警告（AI 接口未使用） |
| `msg` | string | 成功默认 `操作成功` |
| `data` | object | 仅当数据非 null 时出现 |

无数据的成功：

```json
{
  "code": 200,
  "msg": "操作成功"
}
```

`toAjax` 在影响行数不大于 0 时：

```json
{
  "code": 500,
  "msg": "操作失败"
}
```

### 6.2 TableDataInfo

只用于三个列表：`/ai/session/list`、`/ai/session/{sessionId}/messages`、`/ai/model/list`。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `code` | number | 成功为 200 |
| `msg` | string | 成功为 `查询成功` |
| `total` | number | 总条数 |
| `rows` | array | 当前页 |

分页 Query 默认：`pageNum=1`，`pageSize=10`，`reasonable=true`。

这三个列表若在进入查询前抛出业务异常（例如消息列表的会话无权访问），返回的是 `AjaxResult` 错误，不是 `TableDataInfo`。

### 6.3 HTTP 状态与业务码

| 场景 | HTTP 状态 | JSON |
| --- | --- | --- |
| 成功 | 200 | `code: 200` |
| 未登录、JWT 无效、Redis 无登录态 | 200 | `code: 401`，`msg` 为 `请求访问：{uri}，认证失败，无法访问系统资源` |
| 已登录但无 `@PreAuthorize` 权限 | 200 | `code: 403`，`msg` 为 `没有权限，请联系管理员授权` |
| `@Validated` 失败 | 200 | `code: 500`，`msg` 为第一条字段错误，例如 `content is required` |
| `ServiceException` | 200 | 未设置自定义 code 时为 `code: 500`，`msg` 为异常原文。AI 代码没有传入自定义 code |
| Path 类型不匹配 | 200 | `code: 500`，`msg` 含参数名、要求类型和输入值 |
| 方法不允许 | 200 | `code: 500`，`msg` 为 Spring 原文 |
| WebSocket 握手失败 | 401 | 无统一 JSON 体，连接建立失败 |

前端应判断 JSON `code`，不要只看 HTTP 状态。

参数校验文案（注解）：

| 场景 | msg |
| --- | --- |
| 聊天缺会话 | `sessionId is required` |
| 聊天缺内容 | `content is required` |
| 聊天内容超长 | `content max length is 8000` |
| requestId 超长 | `requestId max length is 64` |
| 停止缺 requestId | `requestId is required` |
| 重试缺消息 | `messageId is required` |
| 会话标题超长 | `title max length is 100` |
| 模型名称 | `name is required` / `name max length is 64` |
| 模型调用名 | `modelName is required` / `modelName max length is 64` |

## 7. 登录认证与权限说明

AI 接口本身不提供登录。沿用 RuoYi：

1. `POST /login`，Body 为 `username`、`password`、`code`、`uuid`。成功体在 `AjaxResult` 上额外有 `token` 字段（与 `data` 平级）。
2. 之后请求头 `Authorization: Bearer {token}`。前缀是 `Bearer `（含空格）。
3. 无状态，不使用 HTTP Session。CSRF 已关闭。
4. 登出是既有 `POST /logout`，与 AI 模块无关。登出后 Redis 登录态删除，HTTP 与新的 WebSocket 握手都会失败。已经建立的 WebSocket 不会被登出逻辑主动关闭。

权限使用 `@PreAuthorize("@ss.hasPermi('...')")`，标识见第 3 节。`userId == 1` 的数据读取豁免不能代替菜单权限：没有 `ai:session:query` 时，管理员一样会得到 403。

获取当前用户的方式是 `SecurityUtils.getUserId()` / `getUsername()`，来自 JWT 对应的 Redis `LoginUser`。请求体里的 `userId` 不能冒充身份。

## 8. 前端调用示例

下面的路径是后端路径。若 Vue3 的 `baseURL` 已是 `/dev-api` 且代理会去掉该前缀，则 axios 的 url 仍写 `/ai/...`。请与前端环境变量核对，不要把 `/dev-api` 写进后端路径。

### 8.1 请求头

```javascript
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

function unwrap(res) {
  const body = res.data
  if (body.code !== 200) {
    throw new Error(body.msg || 'request failed')
  }
  return body
}
```

### 8.2 创建会话并同步发送

```javascript
const created = unwrap(await http.post('/ai/session', { modelId: 1 }))
const sessionId = created.data.sessionId

const chat = unwrap(await http.post('/ai/chat', {
  sessionId,
  content: '你好'
}))
const assistant = chat.data
```

同步接口超时要大于模型耗时。服务端运行上限默认 300 秒，axios 默认超时远小于它，前端需要自行加大 `timeout`。

### 8.3 流式

```javascript
let buffer = ''

function connectAiSocket(token) {
  const ws = new WebSocket(`ws://localhost:8080/ws?token=${encodeURIComponent(token)}`)
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.type === 'PING') {
      return
    }
    if (msg.type === 'AI_DELTA') {
      buffer += msg.data.delta || ''
    } else if (msg.type === 'AI_DONE' || msg.type === 'AI_CANCELLED') {
      buffer = msg.data.content || buffer
    } else if (msg.type === 'AI_ERROR') {
      // msg.data.msg 是错误；半截正文要再查消息详情
    }
  }
  return ws
}

function startHeartbeat(ws) {
  const timer = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'PING' }))
    }
  }, 30000)
  return () => clearInterval(timer)
}

const started = unwrap(await http.post('/ai/chat/stream', {
  sessionId,
  content: '什么是会话'
}))
const { requestId, assistantMessageId } = started.data

function stop() {
  ws.send(JSON.stringify({ type: 'AI_CANCEL', requestId }))
  // 或者：
  // await http.post('/ai/chat/stop', { requestId })
}
```

`startHeartbeat` 是前端自发心跳。服务端没有对应的定时心跳要求，30 秒只是示例。

### 8.4 重试与历史

```javascript
await http.post('/ai/chat/retry', {
  sessionId,
  messageId: assistantMessageId
})

const page = unwrap(await http.get(`/ai/session/${sessionId}/messages`, {
  params: { pageNum: 1, pageSize: 50 }
}))
const messages = page.rows
```

重试返回的 `assistantMessageId` 是新消息。旧的失败或停止消息仍然留在历史里。

### 8.5 断线对齐

```javascript
const detail = unwrap(await http.get(
  `/ai/session/${sessionId}/messages/${assistantMessageId}`
))
const message = detail.data
if (message.status === '0') {
  await http.post(`/ai/session/${sessionId}/reconcile`)
}
```

`status`：`0` 运行中，`1` 完成，`2` 已停止，`3` 失败。

## 9. 尚未实现或无法确认的事项

### 9.1 未实现

- 知识库检索、RAG 引用、文档上传。
- 工具调用、Agent、任务确认流。`TASK` / `KNOWLEDGE` 只出现在 `intent` 和 `AI_ROUTE` 中。
- 数据库任务表，以及按任务 id 查询进度的 HTTP 接口。
- 流式 token 用量回写。
- 修改会话标题、备注的接口。
- 删除会话时级联删除消息。
- 服务端 WebSocket 心跳、空闲断开、断线续传、按 AI 会话分房间。
- 同一用户多连接广播。新连接会踢掉旧连接。
- SockJS、STOMP、独立 `/ai/ws`。
- 模型详情不存在时的 404 业务码。当前是成功且无 `data`。
- 用 OpenAPI 描述 WebSocket 帧。springdoc 只覆盖 HTTP，帧协议见第 5 节。

### 9.2 已声明但实现不完整

- 意图路由：规则和返回字段已实现，执行路径固定 `CHAT`。
- `AiMessage.role = system`：常量、历史拼装已支持，但没有写入 system 消息的 HTTP 接口。
- Redis 运行状态 `RUNNING` / `DONE` / `CANCELLED` / `FAILED`：只在服务端使用，没有查询接口。
- 流式失败时数据库保存了部分 `content`，WebSocket `AI_ERROR` 不携带该字段。

### 9.3 需要前后端再确认

1. Vue3 的 `VITE_APP_BASE_API` 代理是否把 `/ai` 和 `/ws` 转到 `localhost:8080`，以及 WebSocket 代理是否放行 Upgrade。
2. 生产域名、HTTPS 与 `wss` 由部署决定，仓库未配置。
3. 浏览器多标签会互踢 WebSocket。若产品需要多标签同时收流，当前协议不支持。
4. 流式接口立即返回，正文只在 WebSocket。未连接时增量丢失，只能事后查消息。
5. 同步聊天的 axios 超时需要大于预期模型耗时，最长可到配置的 300 秒。
6. 模型“查无此 id”是 `code: 200` 且没有 `data`。
7. 停止一个不存在或已结束的 `requestId` 也是成功，且没有 WebSocket 事件。
8. 权限脚本只绑定了角色 1。普通角色要单独授权后才能调用。
9. `userId == 1` 可以读他人会话，不能替他人发消息、关闭、删除或重试。
10. 分页的 `orderByColumn` 会改变默认排序。建议前端不传。
11. 消息列表上的 `content`、`requestId` 查询参数当前无效。
12. 打开消息列表可能触发 `generation interrupted` 的 `AI_ERROR`。
13. 重试会产生新的助手消息，前端不应覆盖旧 `messageId`。
14. 新增模型的成功响应没有 `modelId`。
15. 新建会话的成功响应里 `createTime` 多为 `null`。

## 10. 后端接口与数据库实体的对应关系

没有 `ai_task` 表。生成任务不是数据库实体。

### 10.1 `ai_session` ? `AiSession`

| 列 | 字段 | 接口 |
| --- | --- | --- |
| `session_id` | `sessionId` | 全部会话与聊天接口 |
| `user_id` | `userId` | 创建时写当前用户；列表非管理员强制过滤 |
| `title` | `title` | 创建入参；首条消息可把 `新对话` 改成内容前 30 字 |
| `model_id` | `modelId` | 创建入参；聊天未传 `modelId` 时使用 |
| `status` | `status` | `0` 正常，`1` 关闭 |
| `del_flag` | `delFlag` | `0` 存在，`2` 删除。查询均排除已删除 |
| `last_message_time` | `lastMessageTime` | 创建时写入；同步完成、流式完成、取消成功时更新 |
| `create_by` / `create_time` / `update_by` / `update_time` / `remark` | 同名驼峰 | 创建写入 `createBy`、`remark` |
| 无列 | `nickName` | 仅查询时由 `sys_user.nick_name` 填充 |

索引：`idx_ai_session_user (user_id, del_flag, last_message_time)`。

### 10.2 `ai_message` ? `AiMessage`

| 列 | 字段 | 接口 |
| --- | --- | --- |
| `message_id` | `messageId` | 详情、重试、流式返回、WebSocket `messageId` |
| `session_id` | `sessionId` | 所属会话 |
| `user_id` | `userId` | 消息所有者，取当时登录用户 |
| `role` | `role` | 本模块实际写入 `user`、`assistant` |
| `content` | `content` | 用户原文或助手正文。流式中会周期性覆盖 |
| `status` | `status` | `0` 运行中，`1` 完成，`2` 停止，`3` 失败。用户消息写入时即为 `1` |
| `request_id` | `requestId` | 只写在助手消息上。唯一索引 `uk_ai_msg_request`。用户消息为 null |
| `error_msg` | `errorMsg` | 失败原因，最长按列 `varchar(500)`，Service 截断约 400 |
| `prompt_tokens` / `completion_tokens` / `total_tokens` | 同名驼峰 | 仅同步聊天在成功时写入 |
| `create_time` / `update_time` | `createTime` / `updateTime` | SQL `sysdate()` |

送入模型的历史只取该会话中状态为 `1` 或 `2`、角色为 `user` / `assistant` / `system` 的最近 `history-limit` 条（默认 20），按 `message_id` 升序。失败和运行中消息不进入历史。

### 10.3 `ai_model_config` ? `AiModelConfig`

| 列 | 字段 | 接口 |
| --- | --- | --- |
| `model_id` | `modelId` | 模型 CRUD；聊天 Body 的 `modelId` |
| `name` | `name` | 展示名 |
| `provider` | `provider` | 默认 `openai`。当前调用链都走 OpenAI 兼容客户端，没有按 provider 分支的第二套协议 |
| `base_url` | `baseUrl` | 该模型唯一的提供方地址，须以 `/v1` 结尾。客户端按 `modelId` 加配置指纹缓存在当前进程，连接参数来自这一行，不来自 `application.yml` |
| `model_name` | `modelName` | 提供方模型名 |
| `api_key_enc` | 响应中的 `apiKeyEnc` 恒为 null | 库存密文。查询接口解密后只给 `apiKeyMask` |
| 无列 | `apiKey` | 仅新增和修改的入参 |
| 无列 | `apiKeyMask` | 仅响应 |
| `temperature` | `temperature` | 调用选项 |
| `max_tokens` | `maxTokens` | 调用选项 |
| `status` | `status` | `0` 可调用，`1` 停用 |
| `is_default` | `isDefault` | `1` 为默认。聊天未指定模型时使用 `status=0` 且 `is_default=1` 的一条 |
| `del_flag` | `delFlag` | `2` 为删除 |

### 10.4 Redis 中的运行任务（非表）

| 键 | 值 | TTL |
| --- | --- | --- |
| `ai:run:{requestId}` | `AiRunContext`：`requestId`、`userId`、`sessionId`、`assistantMessageId`、`status`、`intent`、`intentConfidence`、`intentReason`、`executionPath` | `run-timeout-seconds` |
| `ai:session:run:{sessionId}` | 当前占用该会话的 `requestId` | 同上 |

`status` 取值：`RUNNING`、`DONE`、`CANCELLED`、`FAILED`。没有 HTTP 读接口。会话锁用于拒绝并发的第二路生成。

## 附录 A. 路径核对

以下路径由类上的 `@RequestMapping` 与方法映射直接拼接，无额外前缀。

| Controller | 类映射 | 方法映射 | 完整路径 |
| --- | --- | --- | --- |
| `AiChatController` | `/ai/chat` | `POST` 方法本身 | `POST /ai/chat` |
| `AiChatController` | `/ai/chat` | `POST /stream` | `POST /ai/chat/stream` |
| `AiChatController` | `/ai/chat` | `POST /stop` | `POST /ai/chat/stop` |
| `AiChatController` | `/ai/chat` | `POST /retry` | `POST /ai/chat/retry` |
| `AiSessionController` | `/ai/session` | `GET /list` | `GET /ai/session/list` |
| `AiSessionController` | `/ai/session` | `GET /{sessionId}` | `GET /ai/session/{sessionId}` |
| `AiSessionController` | `/ai/session` | `POST` 方法本身 | `POST /ai/session` |
| `AiSessionController` | `/ai/session` | `PUT /close/{sessionId}` | `PUT /ai/session/close/{sessionId}` |
| `AiSessionController` | `/ai/session` | `DELETE /{sessionIds}` | `DELETE /ai/session/{sessionIds}` |
| `AiSessionController` | `/ai/session` | `GET /{sessionId}/messages` | `GET /ai/session/{sessionId}/messages` |
| `AiSessionController` | `/ai/session` | `GET /{sessionId}/messages/{messageId}` | `GET /ai/session/{sessionId}/messages/{messageId}` |
| `AiSessionController` | `/ai/session` | `POST /{sessionId}/reconcile` | `POST /ai/session/{sessionId}/reconcile` |
| `AiModelConfigController` | `/ai/model` | `GET /list` | `GET /ai/model/list` |
| `AiModelConfigController` | `/ai/model` | `GET /{modelId}` | `GET /ai/model/{modelId}` |
| `AiModelConfigController` | `/ai/model` | `POST` 方法本身 | `POST /ai/model` |
| `AiModelConfigController` | `/ai/model` | `PUT` 方法本身 | `PUT /ai/model` |
| `AiModelConfigController` | `/ai/model` | `DELETE /{modelIds}` | `DELETE /ai/model/{modelIds}` |
| `WebSocketConfig` | 无 HTTP 类映射 | 注册路径 `"/ws"` | `WS /ws` |
