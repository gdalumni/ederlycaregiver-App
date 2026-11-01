# 聊天路由与回答协议

本文给 Vue3 聊天页使用，按当前后端实现编写。基础路径是服务根路径。除语音上传外，请求和响应都是 JSON。会话、档案和四类健康记录的完整字段见 `docs/ruoyi-vue3-api-protocol.md`。

登录后请求带 `Authorization: Bearer <token>`。成功看 `code === 200`，不要只看 HTTP 状态。

## 1. 页面只认这些意图

流式受理和 `AI_ROUTE.data.intent` 使用同一组值。`executionPath` 恒为 `CHAT`。不要因为意图切换页面。

| 对外 `intent` | 页面怎么处理 |
| --- | --- |
| `CHAT` | 普通气泡。没有工具帧，也没有引用帧 |
| `KNOWLEDGE` | 等 `AI_CITATIONS`，再用 `AI_DONE` 覆盖正文 |
| `TASK` | 健康查询、录入、确认、取消。看 `AI_TOOL` |
| `ELDERLY_ADAPTATION` | 适老化。看 `AI_CITATIONS` 和正文 |
| `MIXED` | 健康和适老化在同一轮。先看有没有 `AI_TOOL`，再看 `AI_CITATIONS` |
| `UNCERTAIN` | 只有追问正文，没有工具帧和引用帧 |

`HEALTH`、`GENERAL` 以及 `HEALTH_RECORD`、`MIXED_KNOWLEDGE` 这些名字只存在于服务端，不会出现在接口里。页面不要分支到这些字符串。

聊天请求不要传 `elderlyId`、`baseUrl`、`apiKey`。`modelId` 只能是启用中的 `chat` 模型。`asr` 和 `rerank` 不要放进聊天下拉。

## 2. 一轮对话怎么接

1. 连接 `ws://<host>/ws?token=<token>`。同一用户只保留一条连接。
2. `POST /ai/chat/stream` 发用户原文。权限 `ai:chat:chat`。
3. 用返回的 `assistantMessageId` 接收 WebSocket。
4. 用 `AI_DONE.data.content` 覆盖气泡。不要只靠拼接 `AI_DELTA`。
5. 停止用 `POST /ai/chat/stop` 或 WebSocket `AI_CANCEL`，同一次生成只发一个。

请求：

```json
{
  "sessionId": 4,
  "content": "查询血压",
  "modelId": 1,
  "requestId": "可选，最长64"
}
```

受理成功时 `data` 含 `sessionId`、`requestId`、`userMessageId`、`assistantMessageId`、`intent`、`intentConfidence`、`intentReason`、`executionPath`。

同步 `POST /ai/chat` 不推 WebSocket，成功时正文只在 `data.content`，没有引用帧。历史消息同样只有正文。刷新页面后，工具状态和引用卡片无法从历史恢复，只能看到当时保存的文字。

WebSocket 信封：

```json
{
  "type": "AI_DELTA",
  "requestId": "uuid",
  "data": {},
  "timestamp": 1760590800000
}
```

不认识的 `type` 忽略。入站只有 `PING` 和 `AI_CANCEL`。没有入站确认事件。

正常顺序：

`AI_ROUTE` → `AI_START` → 零个或一个 `AI_TOOL_START` → 零个或一个 `AI_TOOL` → 零个或一个 `AI_CITATIONS` → `AI_DELTA` → `AI_DONE`

`AI_ERROR` 或 `AI_CANCELLED` 后面没有 `AI_DONE`。断线不补发。

助手消息状态：`0` 生成中，`1` 完成，`2` 已停止，`3` 失败。

## 3. 路由对照

服务端用整句规则分类。页面可以做快捷输入，但必须把下表这种完整文本放进 `content`，不要另造 JSON。

| 用户原文 | `intent` | 会收到的帧 | 页面 |
| --- | --- | --- | --- |
| 今天天气不错 | `CHAT` | 多段 `AI_DELTA` | 普通气泡 |
| 帮我创建一个任务 | `CHAT` | 同上 | 不要当成健康录入 |
| 什么是养老政策 | `KNOWLEDGE` | 一条 `AI_CITATIONS`，一条 `AI_DELTA` | 引用卡片加正文 |
| 什么是高血压 | `KNOWLEDGE` | 同上，只含健康宣教 | 不要显示适老化卡片 |
| 查询血压 | `TASK` | `AI_TOOL_START`、`AI_TOOL`，没有引用帧 | 按健康卡片展示 |
| 记录血压 120/80 2026-10-22 08:00:00 | `TASK` | 工具状态 `pending` | 显示尚未保存，并给出确认、取消 |
| 确认 | `TASK` | 仅当本会话恰好一条待确认时执行 | 只有 `saved === true` 才显示已保存 |
| 卫生间扶手多高 | `ELDERLY_ADAPTATION` | `AI_CITATIONS` | 适老化卡片。正文是资料原文，不是模型改写 |
| 查询血压，卫生间扶手 | `MIXED` | 先 `AI_TOOL`，再 `AI_CITATIONS` | 正文先是健康结果，换行后再接适老化原文 |
| 什么是血压，卫生间扶手 | `MIXED` | 没有 `AI_TOOL`，有 `AI_CITATIONS` | 先健康宣教，换行后再接适老化。这不是健康录入 |
| 怎么办 | `UNCERTAIN` | 无工具、无引用 | 正文是“请补充是健康记录，还是适老化改造问题。” |

健康记录只认这些句子：带查询词或录入词，并且只含血压、血糖、身高体重、睡眠中的一项。查询词是 `查`、`查询`、`看看`、`最近`、`历史`。录入词是 `记录`、`录入`、`记一下`、`帮我记`。血糖、身高体重、睡眠必须写绝对时间，不能把“今天”当成日期。血压没有绝对时间时，`今天早上`、`今天中午`、`今天下午`、`今天晚上` 分别记为 08:00、12:00、15:00、20:00，其余使用服务器当前时间，也可以写 `高压`、`低压`。聊天查询最多返回最新 30 条。

确认和取消只认整句 `确认`、`确定`、`同意`、`是的`、`没问题`、`取消`、`不用了`。`好的` 和 `可以` 不会保存。不要从正文里解析 `actionId` 再调接口。

适老化词包括：适老、扶手、防滑、照明、无障碍、地面材料、色彩、门槛、通道。

## 4. 健康卡片

`AI_TOOL_START.saved` 恒为 `false`。`name` 只可能是：

`query_blood_pressure`、`insert_blood_pressure`、`query_blood_glucose`、`insert_blood_glucose`、`query_body_metric`、`insert_body_metric`、`query_sleep`、`insert_sleep`。

`AI_TOOL`：

| 字段 | 说明 |
| --- | --- |
| `name` | 工具名 |
| `status` | `ok`、`pending`、`saved`、`cancelled`、`refused`、`ambiguous` |
| `saved` | 只有确认成功才是 `true` |
| `message` | 与气泡正文相同 |
| `actionId` | 待确认或回执才有。按钮不要依赖它发请求 |
| `recordId` | 仅 `saved === true` |
| `expireTime` | 待确认到期时间 |
| `records` | 查询结果，不含老人编号 |
| `candidates` | 多名档案时只有 `name`、`deptName` |

`pending` 时显示“尚未保存”，两个按钮分别发送整句 `确认` 和 `取消`。`saved !== true` 时不能显示已保存。`AI_ERROR` 且 `msg` 为 `健康记录保存失败` 时也不能显示已保存。

健康工具帧没有适老化字段。不要把 `initialResponse` 等待到 `AI_TOOL` 上。

## 5. 引用卡片

`AI_CITATIONS` 在正文之前到达。先暂存，等 `AI_DONE` 再和气泡放在一起。

帧上的字段：

| 字段 | 说明 |
| --- | --- |
| `grounded` | 有可用资料时为 `true` |
| `status` | `ok`、`insufficient`、`failed`。旧页面可以忽略 |
| `citations` | 引用数组。没有全文 `text` |

`status` 怎么用：

| `status` | 含义 | 页面 |
| --- | --- | --- |
| `ok` | 至少有一条可用资料 | 展示引用卡片 |
| `insufficient` | 没有足够依据 | 正文就是“知识库未检索到足够依据”，不要再补一段解释 |
| `failed` | 混合问题里有一边失败 | 保留正文里成功的一半，失败句原样显示，不要把它画成成功卡片 |

两边都失败，或健康保存失败时，结束事件是 `AI_ERROR`，没有 `AI_DONE`。消息状态是 `3`。`AI_ERROR` 没有正文，已写入的半截文字用消息详情接口读 `content`。

`citations[]` 固定字段：`chunkId`、`documentId`、`title`、`source`、`chunkIndex`、`category`、`score`、`excerpt`。

适老化引用在有值时另外带上下面这些键。不要改成蛇形名称。

| 页面概念 | 实际字段 | 展示 |
| --- | --- | --- |
| 初步回应 | `initialResponse` | 文字 |
| 进一步回应 | `furtherResponse` | 文字 |
| 风险提示 | `hazardWarning` | 文字。库里是一段话，不是数组 |
| 实施措施 | `implementationMeasures` | 文字。这是建议，不是强制性条文 |
| 图片 | `imageRefs` | 英文逗号分隔。新数据是 `/profile/upload/` 下的 `bmp`、`gif`、`jpg`、`jpeg`、`png`，可直接作为图片地址。含 `..` 或反斜杠的项不要渲染。历史外链仍可能出现 |
| 法规 | `regulationContent`、`regulationSource`、`regulationVersion`、`effectiveStatus` | 只展示这四项里有值的内容，不要自行补法规名或条款号 |
| 知识来源 | `knowledgeId`、`title`、`source` | 和 `chunkId`、`documentId` 一起作为来源 |
| 限制 | `limitations` | 有值就必须和正文一起展示 |
| 相关度 | `rerankScore`、`score` | 可选。它们不是事实是否正确，也不是法规是否有效 |

`effectiveStatus`：`0` 未核验，`1` 有效，`2` 已废止。不是 `1` 时，`limitations` 为 `法规有效状态未经人工核验`。这时不要把卡片渲染成“依据法规必须执行”。

`category` 在适老化引用上等于 `knowledgeType`，取值是 `LAYOUT_COMPONENT`、`LIGHTING`、`MATERIAL`、`COLOR`。养老政策和健康宣教的 `category` 仍是 `pension_policy`、`health_education`、`aging_friendly`。两种分类不要混用同一套标签文案。

适老化示例：

```json
{
  "type": "AI_CITATIONS",
  "requestId": "abc",
  "data": {
    "sessionId": 4,
    "messageId": 20,
    "grounded": true,
    "status": "ok",
    "citations": [
      {
        "chunkId": "aging-8",
        "documentId": "aging-8",
        "title": "卫生间扶手",
        "source": "施工说明",
        "category": "LAYOUT_COMPONENT",
        "knowledgeId": 8,
        "knowledgeType": "LAYOUT_COMPONENT",
        "initialResponse": "湿区应设置扶手",
        "hazardWarning": "地面湿滑时容易跌倒",
        "implementationMeasures": "安装在坐便器两侧",
        "imageRefs": "/profile/upload/2026/10/24/a.png",
        "regulationSource": "某设计资料",
        "effectiveStatus": "0",
        "limitations": "法规有效状态未经人工核验",
        "excerpt": "湿区应设置扶手"
      }
    ]
  },
  "timestamp": 1760590800000
}
```

对应正文由这些原文拼接，并在末尾再附一行“标题 来源”。页面以 `AI_DONE.data.content` 作为气泡文字，以 `citations` 作为卡片。不要从正文里反拆字段。

没有依据时：

```json
{
  "grounded": false,
  "status": "insufficient",
  "citations": []
}
```

正文固定为 `知识库未检索到足够依据`。

## 6. 部分失败

混合问题只有一边失败时，本轮仍以 `AI_DONE` 结束，`status` 为 `failed`。正文里成功的一半保留，失败的一半是明确的失败句，例如 `milvus is unavailable`。失败的那一边不会补造引用。

```text
最近血压 120/80 mmHg
milvus is unavailable
```

此时可以显示健康数字，同时把适老化区域标成失败。不能把整张卡片标成已成功，也不能显示已保存。

两边都失败时收到 `AI_ERROR`。健康确认时保存失败也是 `AI_ERROR`，`msg` 为 `健康记录保存失败`。

## 7. 语音再进入聊天

录音不要调用 `/common/upload`。

`POST /ai/asr/recognize`，`multipart/form-data`，权限 `ai:chat:chat`。字段 `audio` 必填，只收 wav，最大 10MB，最长 60 秒。可选 `language`、`sessionId`、`requestId`。

成功 `data` 只有 `recognizedText`、`requestId`、`asrId`。没有文件路径。`recognizedText` 可以是空字符串。这个接口不创建消息，也不选择意图。

页面应让用户改文字，再把改后的文字作为 `content` 调用 `POST /ai/chat/stream`。没有取消识别的接口。`AI_CANCEL` 不作用于识别。

## 8. 实现时不要做的事

- 不要把 `TASK` 显示成另一套任务系统。它就是健康记录。
- 不要在聊天请求里传老人编号。
- 不要从正文解析法规名称、条款号或标准数值。卡片只用引用字段。
- 不要把 `rerankScore` 显示成“法规有效”或“医学正确”。
- 不要在 `saved !== true` 时显示已保存。
- 不要把图片引用当成必填，也不要请求本机绝对路径。
- 历史接口没有引用帧。需要卡片时，只能在当次 WebSocket 里保存。
