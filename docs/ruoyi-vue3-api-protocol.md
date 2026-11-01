# ruoyi-Vue3 接口协议

本文按当前后端实现整理，供 Vue3 对接 `ruoyi-ai`、`ruoyi-elderlyperson` 和 `ruoyi-digitalhuman`。数字人形象的字段、校验和错误文案以 [ruoyi-digitalhuman-api.md](ruoyi-digitalhuman-api.md) 为准。基础路径是服务根路径，`server.servlet.context-path` 当前为 `/`。除特别说明外，请求和响应都是 JSON，时间格式为 `yyyy-MM-dd HH:mm:ss`，日期格式为 `yyyy-MM-dd`。

## 1. 通用约定

登录后每个请求带：

```http
Authorization: Bearer <token>
```

业务是否成功看 JSON 里的 `code`，不要只看 HTTP 状态。沿用若依约定：成功 `code === 200`；未登录 `code === 401`；无权限 `code === 403`；业务失败 `code === 500`。这些响应的 HTTP 状态通常仍是 200。

普通对象：

```json
{ "code": 200, "msg": "操作成功", "data": {} }
```

分页：

```json
{ "code": 200, "msg": "查询成功", "rows": [], "total": 0 }
```

分页参数是 Query：`pageNum`、`pageSize`。健康记录的排序由服务端固定，页面不要传 `orderByColumn`。

主键是 JSON 数字。当前自增 id 在 JS 安全整数范围内。

访问过于频繁时 `msg` 为 `访问过于频繁，请稍候再试`。限流按接口分开计算，聊天相关接口各为 60 秒 30 次，知识库写入各为 60 秒 10 次，知识库检索和回答各为 60 秒 30 次。

## 2. 聊天页怎么接

推荐顺序：

1. 用现有登录 token 连接 `ws://<host>/ws?token=<token>`。也可以在握手时带 `Authorization: Bearer <token>`。同一用户只保留一条连接。
2. `POST /ai/session` 创建会话，或 `GET /ai/session/list` 打开已有会话。
3. `GET /ai/session/{sessionId}/messages` 拉历史。历史里只有正文，没有工具帧和引用帧。
4. 发消息优先用 `POST /ai/chat/stream`。用返回的 `assistantMessageId` 接收 WebSocket。
5. 用户点停止时调用 `POST /ai/chat/stop`，或发送 WebSocket `AI_CANCEL`。两个不要对同一次生成各发一次。
6. 只有失败或已停止的助手消息可以 `POST /ai/chat/retry`。重试会新建一条助手消息，不覆盖旧消息。

`executionPath` 恒为 `CHAT`。`intent` 可以是 `CHAT`、`KNOWLEDGE`、`TASK`、`ELDERLY_ADAPTATION`、`MIXED`、`UNCERTAIN`。页面仍按普通气泡展示，不要因为这些意图跳到另一套任务界面。语音、适老化知识和引用扩展见第 11 节。

聊天里没有单独的确认接口。录入健康数据后，助手正文会包含 `尚未保存`。用户下一条必须整句是 `确认`、`确定`、`同意`、`是的`、`没问题`、`取消` 或 `不用了`。`好的` 和 `可以` 不会保存。不要从正文里解析 `actionId` 再调接口。

同步 `POST /ai/chat` 不推 WebSocket。成功时 `data` 就是助手消息，正文在 `data.content`。

流式受理成功时 `data` 为：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `sessionId` | number | 会话 |
| `requestId` | string | 本轮编号。页面不传时由服务端生成 |
| `userMessageId` | number 或 null | 幂等命中时为 null |
| `assistantMessageId` | number | 用来匹配 WebSocket |
| `intent` | string | `CHAT`、`KNOWLEDGE`、`TASK`、`ELDERLY_ADAPTATION`、`MIXED`、`UNCERTAIN` |
| `intentConfidence` | number | 规则置信度 |
| `intentReason` | string | 短原因，不含血压数值、档案编号和证件号 |
| `executionPath` | string | 恒为 `CHAT` |

请求体：

```json
{
  "sessionId": 4,
  "content": "查询血压",
  "modelId": 1,
  "requestId": "可选，最长64"
}
```

`content` 必填，最长 8000。`modelId` 可空，只能选启用中的 chat 模型。不要在请求里传 `baseUrl` 或 `apiKey`。

同一用户、同一会话、同一个 `requestId` 再提交，返回已有助手消息，不再生成，也不再推流。

## 3. WebSocket

出站和入站共用信封：

```json
{
  "type": "AI_DELTA",
  "requestId": "uuid",
  "data": {},
  "timestamp": 1760590800000
}
```

用 `requestId` 或 `data.messageId` 归到当前气泡。不认识的 `type` 忽略，不要把整包显示出来。

入站只实现两种：

```json
{ "type": "PING", "requestId": "", "data": {}, "timestamp": 0 }
```

```json
{ "type": "AI_CANCEL", "requestId": "<本轮 requestId>", "data": {}, "timestamp": 0 }
```

没有入站确认事件。

出站事件：

| type | 何时出现 | data |
| --- | --- | --- |
| `AI_ROUTE` | 开始前 | `intent`、`confidence`、`reason`、`executionPath` |
| `AI_START` | 助手消息已创建 | `sessionId`、`messageId` |
| `AI_TOOL_START` | 即将查询或写入健康数据 | `sessionId`、`messageId`、`name`、`saved` |
| `AI_TOOL` | 健康工具返回后 | 见下表 |
| `AI_CITATIONS` | 知识回答前 | `sessionId`、`messageId`、`grounded`、`citations` |
| `AI_DELTA` | 正文增量 | `sessionId`、`messageId`、`delta` |
| `AI_DONE` | 成功结束 | `sessionId`、`messageId`、`content` |
| `AI_ERROR` | 失败 | `msg`，通常还有 `sessionId`、`messageId` |
| `AI_CANCELLED` | 已停止 | `sessionId`、`messageId`、`content` |

模型闲聊会逐段推 `AI_DELTA`。血糖、身高体重、睡眠和知识各只有一条 `AI_DELTA`，内容就是全文。血压查询和血压分析也是逐段推 `AI_DELTA`：模型每产生一段就推一条，不等全文生成完再切开。拼起来才是全文。

正常顺序：

`AI_ROUTE` → `AI_START` → 零个或一个 `AI_TOOL_START` → 零个或一个 `AI_TOOL` → 零个或一个 `AI_CITATIONS` → 一条或多条 `AI_DELTA` → `AI_DONE`

失败以 `AI_ERROR` 结束，取消以 `AI_CANCELLED` 结束。二者后面都没有 `AI_DONE`。断线不补发。关闭 WebSocket 不会取消生成。

`AI_TOOL_START.saved` 恒为 `false`。`name` 是下面八个名字之一：

`query_blood_pressure`、`insert_blood_pressure`、`query_blood_glucose`、`insert_blood_glucose`、`query_body_metric`、`insert_body_metric`、`query_sleep`、`insert_sleep`。

`AI_TOOL`：

| 字段 | 说明 |
| --- | --- |
| `name` | 工具名 |
| `status` | `ok`、`pending`、`saved`、`cancelled`、`refused`、`ambiguous` |
| `saved` | 只有确认成功才是 `true` |
| `message` | 与气泡正文相同 |
| `actionId` | 待确认或回执才有 |
| `recordId` | 仅 `saved === true` |
| `expireTime` | 待确认到期时间 |
| `records` | 查询结果。字段与第 9 节记录出参一致，不含老人编号 |
| `candidates` | 多名档案时只有 `name`、`deptName` |

页面可以在 `pending` 时显示“尚未保存”，并提供两个按钮，点击后发送整句 `确认` 或 `取消`。不要在 `saved !== true` 时显示已保存。`AI_ERROR` 且 `msg` 为 `健康记录保存失败` 时，不要显示已保存。

`AI_CITATIONS.citations[]` 固定字段：`chunkId`、`documentId`、`title`、`source`、`chunkIndex`、`category`、`score`、`excerpt`。适老化回答还可能带第 11 节的附加字段。没有全文。`grounded === false` 且数组为空时，正文固定为 `知识库未检索到足够依据`。

`AI_DONE.data.content` 是全文，用它覆盖气泡，避免增量拼接误差。`AI_ERROR` 没有正文，半截内容用消息详情接口读 `content`。

助手消息状态：`0` 生成中，`1` 完成，`2` 已停止，`3` 失败。

## 4. 聊天能识别的健康句子

这些句子由服务端规则解析。页面可以做成快捷输入，但必须发送下面这种完整文本，不要另造 JSON。

查询词：`查`、`查询`、`看看`、`最近`、`历史`。写入词：`记录`、`录入`、`记一下`、`帮我记`。同时出现时按写入处理。一次只能包含一种指标：血压、血糖、身高体重、睡眠。

血糖、身高体重、睡眠必须带绝对时间 `yyyy-MM-dd HH:mm:ss`。不把“今天”当成日期。血压在收缩压和舒张压都有、句子里没有绝对时间时，`今天早上` 记为当天 08:00:00，`今天中午` 为 12:00:00，`今天下午` 为 15:00:00，`今天晚上` 为 20:00:00，其余用服务器当前时间。血压也可以写成 `高压115、低压84`，脉搏可选。两种写法同时出现时采用 `120/80`。

```text
记录血压 120/80 2026-10-22 08:00:00
记录血压 120/80 脉搏 70 2026-10-22 08:00:00
希望记一下我的血压，高压115、低压84，脉搏78
录入血糖 5.6 空腹 2026-10-22 08:00:00
记录身高 170 体重 60.5 2026-10-22 08:00:00
记录睡眠 2026-10-22 2026-10-22 22:00:00 2026-10-23 06:00:00
```

血糖类型写成 `空腹`、`餐后` 或 `随机`。血糖只接受 mmol/L，出现 mg 时拒绝换算。血压或身高体重缺字段时仍发出 `pending` 的 `AI_TOOL`，`saved` 为 false。血糖和睡眠缺字段时只要求补充，没有 `AI_TOOL`。

查询示例：`查询血压`、`查询血糖 2026-10-01 2026-10-22`。查询日期只用 `yyyy-MM-dd`。聊天查询最多返回该范围内最新 30 条。REST 列表仍是默认 10 条、最多 20 条。APP 展示查询结果、分析和适老化图片时按第 12 节，不要从正文反拆数字。

确认和取消只认整句：

```text
确认
确定
同意
是的
没问题
取消
不用了
```

当前登录用户必须只绑定一位老人，否则助手拒绝，不会写入。绑定在档案的 `managerUserId`，不是聊天里的 `elderlyId`。

## 5. 会话与消息

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/ai/session/list` | `ai:session:list` | 分页。可按 `title` 模糊、`status`、`modelId` 过滤 |
| GET | `/ai/session/{sessionId}` | `ai:session:query` | 详情 |
| POST | `/ai/session` | `ai:session:add` | 创建。`title` 空则“新对话”，最长 100 |
| PUT | `/ai/session/close/{sessionId}` | `ai:session:edit` | 关闭。无请求体。关闭后不能再聊 |
| DELETE | `/ai/session/{sessionIds}` | `ai:session:remove` | 逻辑删除，逗号分隔。不删消息 |
| GET | `/ai/session/{sessionId}/messages` | `ai:session:query` | 历史，默认按 `messageId` 升序 |
| GET | `/ai/session/{sessionId}/messages/{messageId}` | `ai:session:query` | 单条 |
| POST | `/ai/session/{sessionId}/reconcile` | `ai:session:query` | 校正中断。`data.recovered` 为条数 |
| POST | `/ai/chat` | `ai:chat:chat` | 同步聊天 |
| POST | `/ai/chat/stream` | `ai:chat:chat` | 流式受理 |
| POST | `/ai/chat/stop` | `ai:chat:chat` | `{ "requestId": "..." }` |
| POST | `/ai/chat/retry` | `ai:chat:chat` | `{ "sessionId": 4, "messageId": 20, "modelId": null }` |

会话 `status`：`0` 正常，`1` 已关闭。非管理员只能看自己的会话。用户 id 为 1 的超级管理员可以看他人会话，但不能代写、关闭、删除或停止。

消息字段：`messageId`、`sessionId`、`userId`、`role`（`user`、`assistant`、`system`）、`content`、`status`、`requestId`、`errorMsg`、`promptTokens`、`completionTokens`、`totalTokens`、`createTime`、`updateTime`。流式成功不回写 token。历史过滤只用 `role` 和 `status`。

常见 `msg`：

| msg | 含义 |
| --- | --- |
| `session not found` | 会话不存在 |
| `no permission to access this session` | 不能看他人会话 |
| `no permission to operate this session` | 不能写他人会话 |
| `session is closed` | 已关闭 |
| `session has a running generation task` | 该会话已有生成中的消息 |
| `requestId already used by another session` | requestId 被别人占用 |
| `no permission to stop this task` | 不能停止他人生成 |
| `content max length is 8000` | 正文过长 |
| `message not found` | 消息不存在或不属于该会话 |

## 6. 模型配置

这是连接配置，不是智能体列表。聊天页只需要下拉启用中的 `modelType=chat`。

| 方法 | 路径 | 权限 |
| --- | --- | --- |
| GET | `/ai/model/list` | `ai:model:list` |
| GET | `/ai/model/{modelId}` | `ai:model:query` |
| POST | `/ai/model` | `ai:model:add` |
| PUT | `/ai/model` | `ai:model:edit` |
| DELETE | `/ai/model/{modelIds}` | `ai:model:remove` |

列表可按 `name`、`modelName` 模糊，以及 `provider`、`modelType`、`status` 精确过滤。`modelType` 为 `chat`、`embedding`、`asr`、`rerank`。空白保存时仍写成 `chat`。聊天下拉只选启用中的 `chat`，不要把 `asr` 或 `rerank` 传给 `/ai/chat`。`status` 为 `0` 正常、`1` 停用。

响应里 `apiKey` 和 `apiKeyEnc` 始终为 null，只看 `apiKeyMask`。新增必须带 `name`、`modelName`、`apiKey`、`baseUrl`。`baseUrl` 必须以 `/v1` 结尾，主机还必须在服务端白名单内，否则 `msg` 为 `model baseUrl host is not allowed`。修改时 `apiKey` 空字符串表示不改密钥。`isDefault` 为 `1` 时，只取消同一 `modelType` 的其他默认项。

详情 id 不存在时 `code` 仍是 200，并且没有 `data`。新增成功没有 `data`，也不返回新 id，需要再查列表。

## 7. 知识库

`ai:knowledge:query`、`ai:knowledge:add`、`ai:knowledge:remove` 是按钮权限，菜单编号 2130、2131、2132，挂在 AI Session 下面，没有页面路由。脚本是 `sql/ai_20261023_menu.sql`，只授权角色 1。对话页不调用这组接口，知识问答走第 2 节聊天。适老化主数据见第 11 节。

| 方法 | 路径 | 权限 |
| --- | --- | --- |
| POST | `/ai/knowledge/documents` | `ai:knowledge:add` |
| DELETE | `/ai/knowledge/documents/{documentId}` | `ai:knowledge:remove` |
| POST | `/ai/knowledge/search` | `ai:knowledge:query` |
| POST | `/ai/knowledge/answer` | `ai:knowledge:query` |

入库：

```json
{
  "title": "高龄津贴",
  "source": "政策文件",
  "category": "pension_policy",
  "content": "正文，最长 20000"
}
```

`category` 只能是 `pension_policy`、`health_education`、`aging_friendly`。不要提交个人健康记录。成功 `data` 含 `documentId`、`chunkCount`、`chunkIds`。删除时使用入库返回的 `documentId`。

检索和回答：

```json
{
  "query": "什么是适老化",
  "topK": 5,
  "similarityThreshold": 0.5,
  "category": "aging_friendly"
}
```

`query` 必填，最长 2000。`topK` 为 1 到 20。`category` 可空。检索的 `data` 是引用数组。回答的 `data` 是 `{ "grounded": true, "answer": "...", "citations": [] }`。没有足够依据时 `grounded` 为 false，`answer` 为 `知识库未检索到足够依据`。

## 8. 老人档案

| 方法 | 路径 | 权限 |
| --- | --- | --- |
| GET | `/elderly/person/list` | `elderly:person:list` |
| GET | `/elderly/person/{elderlyId}` | `elderly:person:query` |
| POST | `/elderly/person` | `elderly:person:add` |
| PUT | `/elderly/person` | `elderly:person:edit` |
| DELETE | `/elderly/person/{elderlyIds}` | `elderly:person:remove` |

列表 Query：`name`、`idCard`、`phonenumber`、`sex`、`status`、`deptId`、`beginTime`、`endTime`，外加分页。非管理员只看数据权限内的部门。

列表和详情的出参：

| 字段 | 说明 |
| --- | --- |
| `elderlyId` | 档案主键 |
| `deptId`、`deptName` | 部门 |
| `name` | 最长 30 |
| `sex` | `0` 男，`1` 女，`2` 未知 |
| `idCard` | 非管理员脱敏 |
| `birthday` | `yyyy-MM-dd` |
| `phonenumber`、`emergencyPhone` | 非管理员脱敏 |
| `address`、`emergencyContact`、`remark` | 文本 |
| `status` | `0` 正常，`1` 停用。停用仍允许录入健康记录 |
| `createBy`、`createTime` | 审计 |

当前出参没有 `managerUserId`。保存请求可以带这个字段：新增时不传，服务端写成当前登录用户；修改时不传，保留原值；传入具体用户 id 则改成该用户。聊天录入依赖这个绑定。一个登录用户只能绑定一位老人，多位时聊天会拒绝。

新增必填 `deptId`、`name`、`idCard`。身份证 18 位，末位可为 `X`，未删除档案中不可重复。修改时 `elderlyId` 必填。身份证和电话如果提交的是详情里的脱敏值，服务端保留原值，页面不要自己再打星号。`deptId` 必须是当前用户有数据权限的部门，否则 `msg` 为 `没有权限访问部门数据！`。

无档案：`老人档案不存在`。无数据权限：`没有权限访问该老人档案`。

## 9. 四类健康记录

四类 URL 相同，`{elderlyId}` 是档案 id。请求体不要再传 `elderlyId`，也不能把记录改挂到另一个老人。访问前都会检查档案权限。记录不存在时 `msg` 为 `记录不存在`。

| 资源 | 前缀 | 权限前缀 |
| --- | --- | --- |
| 血压 | `/elderly/person/{elderlyId}/blood-pressure` | `elderly:bp` |
| 血糖 | `/elderly/person/{elderlyId}/blood-glucose` | `elderly:glucose` |
| 身高体重 | `/elderly/person/{elderlyId}/body-metric` | `elderly:body` |
| 睡眠 | `/elderly/person/{elderlyId}/sleep` | `elderly:sleep` |

每类都有：

| 方法 | 路径 | 权限后缀 |
| --- | --- | --- |
| GET | `/list` | `:list` |
| GET | `/{recordId}` | `:query` |
| POST | `/` | `:add` |
| PUT | `/` | `:edit` |
| DELETE | `/{recordIds}` | `:remove` |

列表 Query 除分页外还有 `beginTime`、`endTime`。血糖还可加 `measureType`。

血压请求：

```json
{
  "recordId": 5,
  "systolic": 120,
  "diastolic": 80,
  "pulse": 70,
  "measureTime": "2026-10-22 08:00:00",
  "remark": ""
}
```

新增不传 `recordId`。收缩压必须大于舒张压。脉搏可空。出参还有 `elderlyId`、`createBy`、`createTime`。单位 mmHg 不单独占字段。

血糖请求：

```json
{
  "glucoseValue": 5.6,
  "measureType": "1",
  "measureTime": "2026-10-22 08:00:00",
  "remark": ""
}
```

`measureType`：`1` 空腹，`2` 餐后，`3` 随机。值必须大于 0，最多 3 位整数和 1 位小数。单位 mmol/L 不单独占字段。

身高体重请求：

```json
{
  "heightCm": 170,
  "weightKg": 60.5,
  "measureTime": "2026-10-22 08:00:00",
  "remark": ""
}
```

两者都必须大于 0，最多 4 位整数和 1 位小数。出参额外有 `bmi`，由服务端计算，提交时不要传。

睡眠请求：

```json
{
  "sleepDate": "2026-10-22",
  "startTime": "2026-10-22 22:00:00",
  "endTime": "2026-10-23 06:00:00",
  "remark": ""
}
```

结束时间必须晚于开始时间，时长不能超过 24 小时。出参额外有 `durationMinutes`，由服务端计算，提交时不要传。

新增和修改成功时没有记录对象，只有 `code` 和 `msg`。需要新 `recordId` 时再查列表。删除路径是逗号分隔的记录 id。

## 10. 页面实现时注意

- 聊天确认只发文本 `确认` 或 `取消`，不要调用不存在的确认 REST。
- 聊天请求不要带 `elderlyId`。档案页录入仍使用第 9 节 REST，并在路径里放档案 id。
- `AI_TOOL.saved !== true` 时，气泡不能显示已保存。
- 旧页面如果只处理六种旧事件，仍然能靠 `AI_DELTA` 和 `AI_DONE` 显示正文。新页面再用 `AI_TOOL` 和 `AI_CITATIONS` 做卡片。
- 知识库引用不要从回答正文里拆标题。用 `AI_CITATIONS` 或回答接口的 `citations`。
- 模型密钥只在新增或修改时提交，任何查询结果都不会返回明文。
- 非管理员看到的身份证和电话是脱敏值。编辑时原样回传或不传该字段。
- 超级管理员可以阅读他人会话，前端仍不要提供代他人发送、关闭或停止的按钮。服务端会拒绝。
- 语音识别只返回文字。用户改完后再调用第 2 节的聊天接口。不要把录音发给 `/common/upload`。
- `rerankScore` 是相关度，不是事实准确性，也不是法规是否有效。

## 11. 语音、适老化与引用扩展

本节是对第 2、3、6、7 节的补充。事件种类和顺序不变。旧页面忽略不认识的字段，仍然用 `AI_DELTA` 和 `AI_DONE` 显示正文。

### 11.1 模型类型

`GET /ai/model/list` 可以同时返回 `chat`、`embedding`、`asr`、`rerank`。四种类型各自有一条默认模型。聊天请求的 `modelId` 仍然只能是启用中的 `chat`。语音和重排序由服务端读取默认模型，页面不传它们的 `modelId`。非法类型的 `msg` 为 `model type is invalid`。缺少默认模型时，`msg` 分别是 `default model is not configured`、`default embedding model is not configured`、`default asr model is not configured`、`default rerank model is not configured`。

### 11.2 语音识别

| 方法 | 路径 | 权限 | 限流 |
| --- | --- | --- | --- |
| POST | `/ai/asr/recognize` | `ai:chat:chat` | 60 秒 20 次 |

`Content-Type` 是 `multipart/form-data`。字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `audio` | 是 | 扩展名 `.wav`。MIME 为 `audio/wav`、`audio/x-wav`、`audio/wave` 或 `application/octet-stream`。内容是可计量时长的 wav，或 16 kHz、单声道、16 bit 的裸 PCM。服务端把裸 PCM 补成 wav 再识别。最大 10MB，最长 60 秒 |
| `language` | 否 | 小写，形如 `zh` 或 `zh-cn`。空则不传给模型 |
| `sessionId` | 否 | 传入时必须是当前用户可读的会话 |
| `requestId` | 否 | 最长 64，只含字母、数字、下划线和减号。空则服务端生成 |

成功 `data` 只有：

```json
{ "recognizedText": "卫生间应安装扶手", "requestId": "abc", "asrId": 1 }
```

`recognizedText` 可以是空字符串。这个接口不创建聊天消息，也不选择智能体。页面应允许用户修改文字，再调用 `POST /ai/chat/stream`。

没有取消识别的接口。`AI_CANCEL` 不作用于识别。中途断开 HTTP 时，服务端仍可能完成识别并保留文件。响应和任何字段都不包含文件路径。

格式不对、超过 10MB 或超过 60 秒时，文件不会保存。识别失败时文件会保留，接口仍返回失败。常见 `msg`：

| msg | 含义 |
| --- | --- |
| `audio file is required` | 没有文件 |
| `audio format is not supported` | 不是可计量时长的 wav，也不是约定采样率的裸 PCM。mp3、m4a、amr、ogg、webm 仍拒绝 |
| `audio file is too large` | 超过 10MB |
| `audio is too long` | 超过 60 秒 |
| `audio language is invalid` | 语言格式不对 |
| `requestId is invalid` | 编号格式不对 |
| `audio file save failed` | 校验已通过，但落盘失败 |
| `default asr model is not configured` | 没有可用的默认识别模型 |

会话不存在或不能阅读时，`msg` 与第 5 节相同。

### 11.3 适老化知识

这组接口维护主数据。只有发布后的记录会进入聊天。草稿和停用记录不会被回答。`effectiveStatus` 只能由人填写，模型不会判断法规是否有效。

| 方法 | 路径 | 权限 |
| --- | --- | --- |
| GET | `/ai/aging/knowledge/list` | `ai:knowledge:query` |
| GET | `/ai/aging/knowledge/{knowledgeId}` | `ai:knowledge:query` |
| POST | `/ai/aging/knowledge/image` | `ai:knowledge:add` |
| POST | `/ai/aging/knowledge` | `ai:knowledge:add` |
| PUT | `/ai/aging/knowledge` | `ai:knowledge:add` |
| POST | `/ai/aging/knowledge/{knowledgeId}/publish` | `ai:knowledge:add` |
| POST | `/ai/aging/knowledge/{knowledgeId}/disable` | `ai:knowledge:add` |
| DELETE | `/ai/aging/knowledge/{knowledgeId}` | `ai:knowledge:remove` |

写入接口各限流 60 秒 10 次，与第 7 节共用 `ai:knowledge:write` 这个键的前缀，但按方法分开计数。

列表 Query：`pageNum`、`pageSize`、`knowledgeType`、`status`、`title`、`applicableSpace`。`title` 和 `applicableSpace` 模糊匹配。

请求体：

```json
{
  "knowledgeId": 8,
  "knowledgeType": "LAYOUT_COMPONENT",
  "title": "卫生间扶手",
  "commonQuestion": "卫生间要不要装扶手",
  "initialResponse": "湿区应设置扶手",
  "furtherResponse": "",
  "hazardWarning": "",
  "dataSource": "",
  "implementationMeasures": "",
  "imageRefs": "/profile/upload/2026/10/24/a.png,/profile/upload/2026/10/24/b.jpg",
  "regulationContent": "",
  "regulationSource": "",
  "regulationVersion": "",
  "effectiveStatus": "0",
  "keywords": "扶手",
  "applicableSpace": "卫生间",
  "remark": ""
}
```

新增不传 `knowledgeId`。服务端固定写成草稿，`status` 为 `0`，`versionNo` 为 `1`。页面不要提交 `status` 或 `versionNo` 来改变它们。

`knowledgeType` 只能是 `LAYOUT_COMPONENT`、`LIGHTING`、`MATERIAL`、`COLOR`。`effectiveStatus` 为 `0` 未核验、`1` 有效、`2` 已废止；空则保存为 `0`。`status` 出参为 `0` 草稿、`1` 已发布、`2` 已停用。

图片先调用 `POST /ai/aging/knowledge/image`。表单字段名是 `file`，一次一张，只接受 `bmp`、`gif`、`jpg`、`jpeg`、`png`，单张不超过 5MB。成功时除 `code`、`msg` 外还有 `fileName` 和 `url`。`fileName` 形如 `/profile/upload/2026/10/24/{uuid}.png`，文件在 `ruoyi.profile` 的 `upload` 目录。`url` 是当前请求主机加上 `fileName`，只用于当次预览。保存档案时把 `fileName` 写入 `imageRefs`，不要写 `url`，也不要写本机绝对路径。

`imageRefs` 可空。有值时用英文逗号分隔，每一项必须是 `/profile/upload/` 开头、后缀为上述五种图片之一的路径，不能包含 `..` 或反斜杠，总长不超过 2000。外链会返回 `image ref is invalid`。详情接口仍返回库里的原值，历史外链要等这条档案再次保存时改成上传得到的 `fileName`。聊天引用里的 `imageRefs` 不沿用这个原值，规则见第 12.3 节。修改或删除档案不删除磁盘上的图片。`GET /profile/upload/...` 可直接作为图片地址。

标题必填，最长 200。标题、常见问题、初步回应、进一步回应、风险提示、实施措施、关键词、适用空间、法规正文和法规来源至少有一项有内容。发布和停用没有请求体。删除是逻辑删除，并停用该条。

发布成功后才会写入向量。修改一条已发布记录会重新发布。发布或修改已发布记录失败时，不要把页面显示成已更新到新版本。

常见 `msg`：`aging knowledge type is invalid`、`effective status is invalid`、`image ref is invalid`、`aging knowledge title is required`、`aging knowledge text is required`、`aging knowledge is required`、`aging knowledge not found`、`milvus is unavailable`。

### 11.4 聊天里的意图

`AI_ROUTE.data.intent` 和流式受理里的 `intent` 使用同一组值。`executionPath` 仍是 `CHAT`。

| intent | 何时出现 | 页面怎么处理 |
| --- | --- | --- |
| `CHAT` | 普通闲聊 | 普通气泡 |
| `KNOWLEDGE` | 既有养老政策、健康宣教类问题 | 等待 `AI_CITATIONS`，再显示正文 |
| `TASK` | 健康查询、录入、确认、取消 | 按第 3、4 节处理 |
| `ELDERLY_ADAPTATION` | 适老化改造问题 | 等待 `AI_CITATIONS`，再显示正文 |
| `MIXED` | 同一句同时包含健康和适老化 | 先收到 `AI_TOOL`，再收到 `AI_CITATIONS`。正文先是健康结果，换行后再接适老化回答 |
| `UNCERTAIN` | 整句只是 `怎么办`、`怎么弄` 或 `这个怎么处理` | 正文是 `请补充是健康记录，还是适老化改造问题。` 此时没有工具帧和引用帧 |

适老化提示词包括：适老、扶手、防滑、照明、无障碍、地面材料、色彩、门槛、通道。健康确认句仍然优先。依据不足时正文仍是 `知识库未检索到足够依据`。

### 11.5 引用附加字段

`AI_CITATIONS` 不新增事件类型。旧字段保持不变，并且仍然没有 `text`。下面这些键只在值不为空时出现：

`knowledgeId`、`knowledgeType`、`initialResponse`、`furtherResponse`、`hazardWarning`、`implementationMeasures`、`imageRefs`、`regulationContent`、`regulationSource`、`regulationVersion`、`effectiveStatus`、`limitations`、`rerankScore`。

`rerankScore` 是数字。重排序失败时没有这个字段，列表保持向量检索顺序。它表示和问题的相关度，不表示内容正确，也不表示法规有效。`score` 仍是向量相似度。

`effectiveStatus` 不是 `1` 时，`limitations` 为 `法规有效状态未经人工核验`。有足够资料时，适老化正文先由对话模型改写一次；模型失败或返回空文本时，才退回已发布字段的拼接。卡片仍用引用字段，不要把正文当成字段来源，也不要把建议渲染成强制性条文。

`AI_CITATIONS` 可多一个 `status`：`ok`、`insufficient`、`failed`。混合问题只有一边失败时，成功的一半留在正文里，`status` 为 `failed`。两边都失败，或健康保存失败时，仍以 `AI_ERROR` 结束。旧页面可以忽略 `status`。

既有知识库回答也可能带 `rerankScore`。适老化字段只出现在适老化引用上。`category` 在适老化引用里等于 `knowledgeType`，取值是四种类型之一，不是第 7 节的 `pension_policy`、`health_education`、`aging_friendly`。

## 12. APP 聊天实现

本节只描述已经实现的聊天行为。没有新增 WebSocket 事件，也没有新增 `analysis`、`recordType`、`unit` 字段。列表和趋势图只用 `AI_TOOL.records`。气泡只用 `AI_DONE.data.content`。同步 `POST /ai/chat` 不推这些帧，成功时同一份正文在 `data.content`，结构化记录不在该接口里。

### 12.1 健康查询

用户句子仍按第 4 节识别。一次只能查一种指标。两种指标出现在同一句时，没有 `AI_TOOL`，正文是 `一次只能处理一项健康数据`。

查询成功时事件顺序是：

1. `AI_ROUTE`，`intent` 为 `TASK`，`executionPath` 为 `CHAT`。
2. `AI_START`。
3. `AI_TOOL_START`，`saved` 为 `false`。
4. `AI_TOOL`，`status` 为 `ok`，`saved` 为 `false`。记录在 `records`。没有记录时 `records` 是空数组。
5. 一条或多条 `AI_DELTA`。血压查询和分析的 `delta` 只含说明文字，不再重复 `records`。
6. `AI_DONE`，`content` 是这些 `delta` 拼成的全文。用它覆盖气泡。

血压查询和血压分析都是先 `AI_TOOL`，再逐段 `AI_DELTA`。含「分析」「怎么样」「趋势」「正常吗」「波动」时用分析提示词，其余血压查询用查询提示词。「查询血压情况」仍是查询。「分析血压情况」不要求再写「查」，也会走血压分析。安全句和「范围内共N条，这里展示最近M条。」先于模型文字到达。模型每产生一段就推一条 `AI_DELTA`。有记录而模型失败时，`records` 已经在，正文末尾是 `分析暂不可用`。没有记录时不调用模型，正文不含这句。`AI_TOOL.message` 只是「已返回最近N条血压记录。」或「暂无血压记录，可以先录入血压等健康数据。」，完整说明以 `AI_DONE.content` 为准。

「看看最近一个月血压怎么样」会按服务器当天算出起止日期。统计按这个完整范围计算，`records` 仍最多 30 条。正文会写明范围内总条数和实际展示条数。没有写日期时，统计和展示都是这 30 条。

`name` 与记录字段：

| `name` | `records[]` 字段 | APP 使用的单位 |
| --- | --- | --- |
| `query_blood_pressure` | `recordId`、`systolic`、`diastolic`、`pulse`、`measureTime`、`remark` | mmHg。脉搏可空 |
| `query_blood_glucose` | `recordId`、`glucoseValue`、`measureType`、`measureTime`、`remark` | mmol/L。`measureType` 为 `1` 空腹、`2` 餐后、`3` 随机 |
| `query_body_metric` | `recordId`、`heightCm`、`weightKg`、`bmi`、`measureTime`、`remark` | 身高 cm，体重 kg。`bmi` 由服务端计算 |
| `query_sleep` | `recordId`、`sleepDate`、`startTime`、`endTime`、`durationMinutes`、`remark` | 时长单位是分钟 |

这些对象不含 `elderlyId`、身份证和电话。时间格式是 `yyyy-MM-dd HH:mm:ss`，睡眠日期是 `yyyy-MM-dd`。排序已经按测量时间降序，同一时间再按 `recordId` 降序。睡眠按 `sleepDate`、`startTime`、`recordId` 降序。APP 不要再排序后当作另一套结果。

没有写日期时，最多 30 条。血糖、身高体重和睡眠会在正文另写 `仅返回最新30条，不是全部历史`。写了 `yyyy-MM-dd` 范围时，也只返回该范围内最新 30 条，这三种指标没有这句提示。不足 30 条就返回实际条数，不会补记录。

血糖、身高体重和睡眠的正文先列出记录行，再接服务端统计。少于 2 条时包含 `数据不足，不能据此判断。`，不再调用模型。达到 2 条才接一段模型说明。

血压不在正文里重复 `120/80` 这类记录行，列表只用 `records`。`AI_TOOL.message` 是「已返回最近N条血压记录。」或「暂无血压记录，可以先录入血压等健康数据。」。有记录时正文以「范围内共N条，这里展示最近M条。」开头，再接服务端算出的平均和时段对比；少于 2 条时仍包含 `数据不足，不能据此判断。`。只要展示条数大于 0，查询和分析都会调用模型，两段提示词不同，模型片段按到达顺序逐条推送。0 条不调用模型，正文以录入提示开头，并包含 `数据不足，不能据此判断。`，不会出现 `分析暂不可用`。用户原话里出现危险症状，或范围内有收缩压达到 180、舒张压达到 120 的记录时，对应安全句由服务端写在正文最前。有记录但模型失败、返回空文本或模型不可用时，`records` 已经发出，正文末尾是 `分析暂不可用`。

`最近一个月`、`近一个月`、`最近一周`、`近一周`、`最近N天` 由服务端按当天换算成闭区间。句子里已有 `yyyy-MM-dd` 时以这个绝对日期为准。单独的「今天」不是查询日期。有日期时 N 是该范围的全部条数，M 是 `records` 的条数，最多 30。没有日期时 N 和 M 都是这 30 条。APP 不要自行诊断，也不要用正文里的平均覆盖图表上的原始点。

未绑定档案时 `status` 为 `refused`，没有 `records`，正文是 `当前登录用户没有绑定老人档案`。绑定了多位老人时 `status` 为 `ambiguous`，`candidates` 只有 `name` 和 `deptName`。没有权限时正文是 `没有权限，请联系管理员授权`。

### 12.2 录入、补充和确认

血压、身高体重缺字段时仍有 `AI_TOOL`，`status` 为 `pending`，`saved` 为 `false`，并带 `actionId`、`expireTime`。正文包含 `尚未保存`。同一会话同时只有一条待确认。补一句 `低压 84` 或 `体重 60` 会更新这一条，而不是再插入一条。字段补齐后仍是 `pending`，必须再次确认。

血糖缺类型、时间，或句子里出现 `mg` 时，不换算，也没有 `AI_TOOL`。睡眠缺时间同样没有 `AI_TOOL`。

只有一条待确认时，下一条整句必须是 `确认`、`确定`、`同意`、`是的` 或 `没问题` 才会保存。`好的` 和 `可以` 不会保存。取消整句是 `取消` 或 `不用了`。按钮发送整句即可，不要调用确认接口，也不要解析正文中的 `actionId`。只有 `saved === true` 才显示已保存，此时才有 `recordId`。

### 12.3 适老化图片和正文

适老化问题先到 `AI_CITATIONS`，再是一条 `AI_DELTA` 和 `AI_DONE`。卡片用 `citations[]`。气泡用 `content`。有资料时正文优先是一次模型改写；模型失败时才是已发布字段拼接。末尾另有“标题 来源”，不要把它拆回卡片。

`imageRefs` 是英文逗号分隔的路径。聊天里只保留相关度达到配置阈值、并且服务器磁盘上真实存在的 `/profile/upload/` 图片。不相关、外链或文件不存在时，这个键不出现。APP 把每一项接到接口主机后面显示，例如 `https://{host}/profile/upload/2026/10/24/a.png`。不要渲染 `http` 外链，也不要在正文里查找图片地址。`GET /profile/**` 当前不需要登录。

## 13. 数字人形象

管理接口和 App 读取接口的请求体、响应体、坐标公式和错误文案见 [ruoyi-digitalhuman-api.md](ruoyi-digitalhuman-api.md)。这里只列路径，避免两处字段各写一套。

通用约定仍是第 1 节。管理接口要登录，并且要有下表权限。App 读取接口只要登录，不看按钮权限，也只返回已发布快照。

| 方法 | 路径 | 权限 |
| --- | --- | --- |
| GET | `/digitalhuman/avatar/list` | `digitalhuman:avatar:list` |
| GET | `/digitalhuman/avatar/{avatarId}` | `digitalhuman:avatar:query` |
| POST | `/digitalhuman/avatar` | `digitalhuman:avatar:add` |
| PUT | `/digitalhuman/avatar` | `digitalhuman:avatar:edit` |
| DELETE | `/digitalhuman/avatar/{avatarIds}` | `digitalhuman:avatar:remove` |
| PUT | `/digitalhuman/avatar/draft` | `digitalhuman:avatar:edit` |
| POST | `/digitalhuman/avatar/asset` | `digitalhuman:avatar:edit` |
| DELETE | `/digitalhuman/avatar/asset/{assetId}` | `digitalhuman:avatar:edit` |
| POST | `/digitalhuman/avatar/validate/{avatarId}` | `digitalhuman:avatar:preview` |
| POST | `/digitalhuman/avatar/publish/{avatarId}` | `digitalhuman:avatar:publish` |
| GET | `/digitalhuman/avatar/{avatarId}/versions` | `digitalhuman:avatar:query` |
| POST | `/digitalhuman/avatar/rollback/{avatarId}` | `digitalhuman:avatar:rollback` |
| PUT | `/digitalhuman/avatar/status` | `digitalhuman:avatar:disable` |
| GET | `/digitalhuman/published/default` | 登录即可 |
| GET | `/digitalhuman/published/list` | 登录即可。只返回已发布形象的编码、名称、发布缩略图、版本号和是否首页默认 |
| GET | `/digitalhuman/published/{avatarCode}` | 登录即可 |

聊天 WebSocket 协议没有变化。图片地址仍是 `GET /profile/upload/digital-human/...`，沿用现有匿名读取。

