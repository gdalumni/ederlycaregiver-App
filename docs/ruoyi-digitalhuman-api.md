# 数字人形象接口

本文按当前后端实现整理，供 Vue3 管理端和 ruoyi-app 对接。基础路径是服务根路径，`server.servlet.context-path` 当前为 `/`。除上传接口外，请求和响应都是 JSON。时间格式为 `yyyy-MM-dd HH:mm:ss`。

本次只提供后端。管理页面和 App 加载由前端按本文实现。坐标公式与 App 里 `components/digital-human/layout.js` 相同，后台预览必须用同一套，不能另写一套百分比或屏幕坐标。

## 1. 通用约定

登录后每个请求带：

```http
Authorization: Bearer <token>
```

业务是否成功看 JSON 里的 `code`，不要只看 HTTP 状态。成功 `code === 200`；未登录 `code === 401`；无权限 `code === 403`；业务失败 `code === 500`。这些响应的 HTTP 状态通常仍是 200。

普通对象：

```json
{ "code": 200, "msg": "操作成功", "data": {} }
```

分页：

```json
{ "code": 200, "msg": "查询成功", "rows": [], "total": 0 }
```

分页参数是 Query：`pageNum`、`pageSize`。

主键是 JSON 数字。

管理接口使用下表权限。菜单脚本是 `sql/digitalhuman_20261026.sql`，只授权角色 1。执行脚本后重新登录，路由才会出现。

| 权限 | 用途 |
| --- | --- |
| `digitalhuman:avatar:list` | 列表 |
| `digitalhuman:avatar:query` | 详情、历史版本 |
| `digitalhuman:avatar:add` | 新建 |
| `digitalhuman:avatar:edit` | 修改资料、保存草稿、上传和删除素材。隐藏路由 `/digitalhuman/editor` |
| `digitalhuman:avatar:remove` | 删除 |
| `digitalhuman:avatar:preview` | 发布前校验 |
| `digitalhuman:avatar:publish` | 发布 |
| `digitalhuman:avatar:rollback` | 回滚 |
| `digitalhuman:avatar:disable` | 停用和启用 |

App 读取接口没有这些权限。任意登录用户可以调用，响应里只有已发布快照，没有草稿。

发布和回滚有 5 秒重复提交限制。过快时 `msg` 为 `不允许重复提交，请稍候再试`。

客户端提交的 `releaseVersion`、发布状态、当前版本指针都会被忽略。版本号只由服务端生成。

## 2. 渲染配置

草稿和发布快照使用同一结构。`schemaVersion` 固定为 `2`。未传时按 2 保存；传了其他数字会失败，`msg` 含 `配置版本不受支持`。

`coordinateSystem.space` 必须是 `source-image-pixels`。`referenceWidth` 和 `referenceHeight` 是主体图的真实像素，不是屏幕尺寸，也不是写死的 1024。1024 只是现有样例图的尺寸。

```json
{
  "schemaVersion": 2,
  "releaseVersion": 3,
  "avatarCode": "home",
  "sourceImage": "/profile/upload/digital-human/2026/10/26/uuid.png",
  "coordinateSystem": {
    "space": "source-image-pixels",
    "referenceWidth": 1024,
    "referenceHeight": 1024
  },
  "mouth": {
    "centerX": 505,
    "centerY": 168,
    "width": 88,
    "height": 38,
    "scale": 0.56
  },
  "visemes": {
    "rest": {
      "file": "/profile/upload/digital-human/2026/10/26/uuid.png",
      "canvasWidth": 300,
      "canvasHeight": 144,
      "contentX": 118,
      "contentY": 70.1,
      "offsetX": 2,
      "offsetY": 0.2
    }
  }
}
```

`visemes` 必须正好包含这六个键，顺序建议保持为 `rest`、`closed`、`open`、`wide`、`round`、`narrow`。多出来的键会失败，`msg` 含 `存在未知嘴型`。缺任何一个键会失败，`msg` 含 `嘴型配置不完整`。

草稿里的 `releaseVersion` 不要显示成已发布版本。保存草稿时服务端会去掉它。只有发布快照和 App 接口带 `releaseVersion`，它等于该快照的 `versionNo`。

`sourceImage` 和 `visemes.*.file` 是资源路径，不是完整 URL。页面把它接到接口主机后面：`{baseUrl}/profile/upload/digital-human/...`。`GET /profile/**` 当前不需要登录，`<image>` 和 `<img>` 可以直接用。每次上传都是新的 UUID 路径，缓存按路径更新，不要再追加随机查询参数。

`contentX`、`contentY` 是这张嘴型 PNG 里皮肤块的中心，不是图片几何中心。透明边大的图要用锚点对准嘴唇。上传一张新尺寸的嘴型时，服务端把锚点放到图片中心，并把这张图的 `offsetX`、`offsetY` 置 0，响应里 `anchorsReset === true`。尺寸没变时保留原来的锚点和偏移。

六张嘴型共用 `mouth.centerX`、`centerY`、`width`、`height`、`scale`。单张只拥有自己的 `offsetX`、`offsetY` 和锚点。重置「当前嘴型」时只恢复这一张的偏移；恢复共用中心和宽高时改 `mouth`。

绘制公式：

```text
drawWidth = mouth.width * mouth.scale
drawHeight = mouth.height * mouth.scale
x = centerX - contentX * (drawWidth / canvasWidth) + offsetX
y = centerY - contentY * (drawHeight / canvasHeight) + offsetY
```

底图矩形是 `(0, 0, referenceWidth, referenceHeight)`。预览容器用 contain，底图和嘴型共用这一次缩放：

```text
scale = min(容器宽 / referenceWidth, 容器高 / referenceHeight)
显示宽 = referenceWidth * scale
显示高 = referenceHeight * scale
显示左 = (容器宽 - 显示宽) / 2
显示上 = (容器高 - 显示高) / 2
```

再把上面的像素矩形乘上这个 `scale`，加上显示左和显示上。图片节点按算好的矩形拉伸，不要再对整张容器做一次 contain。

现有样例可以用来对算式：`mouth` 为中心 `(505,168)`、宽 `88`、高 `38`、缩放 `0.56`，`rest` 画布 `300×144`、锚点 `(118, 70.1)`、偏移 `(2, 0.2)` 时，嘴型像素矩形约为 `x=487.61653333333334`、`y=157.84077777777776`、`width=49.28`、`height=21.28`。容器 `375×812`、参考图 `1024×1024` 时，contain 缩放为 `0.3662109375`，底图框为 `x=0`、`y=218.5`、`375×375`。

数值范围：

| 字段 | 范围 |
| --- | --- |
| `mouth.scale` | 0.4 到 2.5 |
| `mouth.centerX` / `centerY` | 0 到参考宽高。还没有主体图时必须是 0 |
| `mouth.width` / `height` | 大于 0，且不超过参考宽高的 2 倍。还没有主体图时不超过 4096 |
| `offsetX` / `offsetY` | 负的参考宽高到正的参考宽高。还没有主体图时必须是 0 |
| `contentX` / `contentY` | 0 到该嘴型图片宽高 |
| `canvasWidth` / `canvasHeight` | 等于该 PNG 的真实像素。JSON 用整数 |

嘴型矩形必须和主体图相交，否则 `msg` 含 `嘴型不在画布内：rest` 这种键名。超出数值范围时 `msg` 含 `坐标超出范围：mouth.scale` 或 `坐标超出范围：visemes.rest.offsetX` 这类字段名。

保存草稿时，还没上传的 `sourceImage` 和 `file` 用空字符串。发布时六个嘴型和主体图都必须有文件。

## 3. 形象列表

`GET /digitalhuman/avatar/list`

权限 `digitalhuman:avatar:list`。

Query：

| 参数 | 说明 |
| --- | --- |
| `avatarName` | 名称模糊 |
| `avatarCode` | 编码精确 |
| `status` | `0` 正常，`1` 停用 |
| `publishStatus` | `published` 已发布，`unpublished` 未发布，`disabled` 停用。其他值返回空列表 |
| `pageNum` `pageSize` | 分页 |

`rows[]` 不带草稿配置：

| 字段 | 说明 |
| --- | --- |
| `avatarId` | 主键 |
| `avatarName` | 名称 |
| `avatarCode` | 编码 |
| `status` | `0` 或 `1` |
| `publishStatus` | `published`、`unpublished`、`disabled` |
| `isDefault` | 是否勾选为首页默认。未发布时也是 `true`，但 App 还不会用它 |
| `defaultActive` | 当前是不是 App 首页正在使用的形象 |
| `draftRevision` | 草稿修订号。新建为 1，每次保存草稿或更换素材加 1 |
| `releaseVersionId` | 当前发布版本。未发布时没有这个字段 |
| `releaseVersionNo` | 当前发布版本号 |
| `thumbnail` | 草稿主体图路径 |
| `releaseThumbnail` | 当前发布主体图路径 |
| `remark` | 备注 |
| `updateTime` | 更新时间 |

停用优先于发布状态：`status === "1"` 时 `publishStatus` 一定是 `disabled`。

## 4. 详情、新建、修改、删除

### 4.1 详情

`GET /digitalhuman/avatar/{avatarId}`

权限 `digitalhuman:avatar:query`。

`data` 在列表字段之外还有：

| 字段 | 说明 |
| --- | --- |
| `draft` | 第 2 节的配置，没有 `releaseVersion` |
| `assets` | 仍保留的素材。已发布版本引用过的旧文件也会在这里，编辑器以 `draft` 里的路径为准 |

`assets[]`：`assetId`、`assetType`（`body` 或 `viseme`）、`visemeKey`、`filePath`、`fileHash`、`width`、`height`。

形象不存在时 `msg` 为 `数字人形象不存在`。

### 4.2 新建

`POST /digitalhuman/avatar`

权限 `digitalhuman:avatar:add`。

```json
{
  "avatarName": "首页数字人",
  "avatarCode": "home",
  "isDefault": true,
  "remark": ""
}
```

`avatarName` 必填，最长 50。`avatarCode` 必填，`^[a-z][a-z0-9_]{1,31}$`。`default` 和 `list` 是保留编码，不能作为形象编码。`isDefault` 必填。`remark` 最长 500。

新建后的草稿修订号是 1。嘴型框初始宽 88、高 38、缩放 1，中心在 0。六个嘴型文件都是空的。此时即使 `isDefault` 为 `true`，`defaultActive` 仍是 `false`，要等发布成功后才会对 App 生效。

成功时 `data` 是详情。

失败文案：

| `msg` | 原因 |
| --- | --- |
| `数字人名称不能为空` | 名称空 |
| `数字人编码不能为空` | 编码空 |
| `数字人编码格式不正确` | 不符合规则，或使用了 `default`、`list` |
| `数字人编码已存在` | 编码重复。删除后的编码可以再次使用 |
| `是否默认不能为空` | 没传 `isDefault` |
| `备注不能超过500个字符` | 备注过长 |

### 4.3 修改资料

`PUT /digitalhuman/avatar`

权限 `digitalhuman:avatar:edit`。

请求体与新建相同，并带 `avatarId`。这个接口只改名称、编码、默认标记和备注，不改草稿坐标。编码变化时，草稿里的 `avatarCode` 会跟着改，修订号加 1。

已发布且状态正常时，`isDefault: true` 会立刻成为首页形象，并取消原来的 `defaultActive`。未发布时只记下愿望，`defaultActive` 仍是 `false`。`isDefault: false` 会取消这个形象的首页资格。

`defaultActive` 被并发抢占时 `msg` 为 `默认形象设置冲突，请重试`。

成功时 `data` 是详情。

### 4.4 删除

`DELETE /digitalhuman/avatar/{avatarIds}`

权限 `digitalhuman:avatar:remove`。多个 id 用英文逗号分隔。

这是逻辑删除。已发布版本和仍被版本引用的文件会留下。没有被任何发布版本引用的草稿文件会删除。成功时没有 `data`，`msg` 为 `操作成功`。

## 5. 素材

不要调用 `/common/upload`。数字人素材只走下面的接口，文件会落到 `/profile/upload/digital-human/`。

### 5.1 上传

`POST /digitalhuman/avatar/asset`

权限 `digitalhuman:avatar:edit`。`Content-Type` 为 `multipart/form-data`。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `avatarId` | 是 | 形象 |
| `assetType` | 是 | `body` 或 `viseme` |
| `visemeKey` | 嘴型必填 | `rest`、`closed`、`open`、`wide`、`round`、`narrow`。主体不要传 |
| `file` | 是 | 主体可以是 png、jpg、jpeg。嘴型必须是 png。按文件头判断，不只看扩展名 |

单张受服务端上传限制，当前是 10MB。必须先上传主体，再上传嘴型。

成功时 `data`：

| 字段 | 说明 |
| --- | --- |
| `assetId` | 新素材 |
| `assetType` | `body` 或 `viseme` |
| `visemeKey` | 主体为空字符串 |
| `filePath` | 资源路径 |
| `width` `height` | 真实像素 |
| `fileHash` | SHA-256 |
| `draftRevision` | 加 1 后的修订号 |
| `anchorsReset` | 嘴型画布尺寸变化时为 `true` |
| `previousReleased` | 被换掉的上一张仍被某个发布版本使用，文件还在 |
| `draft` | 更新后的整份草稿 |

主体上传会把 `referenceWidth`、`referenceHeight` 改成这张图的像素。若现有嘴型框因此超出范围，接口失败，`msg` 以 `底图尺寸与当前坐标不匹配` 开头，草稿和线上版本都不变。

其他失败文案：

| `msg` | 原因 |
| --- | --- |
| `请上传文件` | 文件空 |
| `请先上传主体图片` | 还没有主体就传嘴型 |
| `嘴型必须是png` | 嘴型不是 png |
| `主体图片格式不正确` | 主体不是 png、jpg、jpeg |
| `图片无法解析` | 文件打不开 |
| `存在未知嘴型：` | `assetType` 或 `visemeKey` 不对 |
| `素材与嘴型不匹配` | 主体传了 `visemeKey` |
| `嘴型配置不完整` | 草稿里没有这六个键 |
| `配置不能为空` | 草稿结构坏了 |

### 5.2 删除素材

`DELETE /digitalhuman/avatar/asset/{assetId}`

权限 `digitalhuman:avatar:edit`。

被任一发布版本引用时失败，`msg` 为 `素材仍被发布版本引用`，文件仍在。未被引用时删除文件，并把草稿里对应的 `sourceImage` 或 `file` 清成空字符串。锚点和画布尺寸保留。修订号加 1。成功时 `data` 是详情。

素材不存在时 `msg` 为 `素材不存在`。

## 6. 草稿

`PUT /digitalhuman/avatar/draft`

权限 `digitalhuman:avatar:edit`。

```json
{
  "avatarId": 1,
  "config": {}
}
```

`config` 用第 2 节的结构。服务端会改写 `avatarCode` 为形象编码，去掉 `releaseVersion`，并把合法的 `schemaVersion` 写成 2。坐标、路径和文件都会检查。缺图可以保存，所以编辑器可以分步上传。

成功时 `data` 是详情，用返回的 `draft` 和 `draftRevision` 覆盖编辑器里的未保存状态。

失败时 `msg` 是第 2 节的错误，多条用中文分号 `；` 连接。这次保存不会写入。已发布版本不受影响。

配置整体缺失时 `msg` 为 `配置不能为空`。库里的草稿损坏时 `msg` 为 `配置无法解析`。

## 7. 校验、发布、版本和回滚

### 7.1 发布前校验

`POST /digitalhuman/avatar/validate/{avatarId}`

权限 `digitalhuman:avatar:preview`。没有请求体。

这个接口不修改线上版本。HTTP 业务码仍是 200。看 `data.valid`。

```json
{
  "code": 200,
  "msg": "操作成功",
  "data": {
    "valid": false,
    "errors": ["缺少主体图片", "缺少嘴型 open"]
  }
}
```

`errors` 使用第 2 节的文案，另外还有：

| 文案 | 原因 |
| --- | --- |
| `缺少主体图片` | 发布时没有主体 |
| `缺少嘴型 rest` | 发布时缺这张嘴型，键名会变 |
| `主体图片不存在` | 路径在，磁盘上没有文件 |
| `嘴型图片不存在：rest` | 这张嘴型文件不在磁盘上 |
| `图片尺寸与配置不一致` | 配置里的参考尺寸或画布尺寸和真实图片不一致 |
| `素材不存在` | 路径不是这个形象的有效素材 |

发布校验要求六张嘴型都有 png，主体是 png、jpg 或 jpeg，并且文件真实可读。

### 7.2 发布

`POST /digitalhuman/avatar/publish/{avatarId}`

权限 `digitalhuman:avatar:publish`。

请求体可省略。有说明时：

```json
{ "remark": "第一版" }
```

`remark` 最长 500。不要传版本号。

服务端在同一事务里锁定形象、再次校验、写入新版本、记下素材引用，然后把当前发布指针指到这个版本。校验失败时事务回滚，当前线上版本不变，操作日志记失败。`msg` 为 `发布校验未通过：` 加上 `；` 连接的错误列表，内容和校验接口的 `errors` 相同。

停用中的形象不能发布，`msg` 为 `数字人已停用`。

成功时 `data` 是版本对象，见 7.3。草稿保持原样，仍可继续编辑。若这个形象 `isDefault` 为 `true` 且状态正常，发布成功后 `defaultActive` 变为 `true`。

版本说明过长时 `msg` 为 `版本说明不能超过500个字符`。

### 7.3 历史版本

`GET /digitalhuman/avatar/{avatarId}/versions`

权限 `digitalhuman:avatar:query`。

`data` 是数组，按 `versionNo` 从大到小。已发布快照不能通过保存草稿改掉。

| 字段 | 说明 |
| --- | --- |
| `versionId` | 版本主键，回滚时提交这个 |
| `avatarId` | 形象 |
| `versionNo` | 从 1 开始递增 |
| `publishStatus` | 固定 `1`，表示已发布快照 |
| `remark` | 版本说明 |
| `createBy` | 发布人 |
| `createTime` | 发布时间 |
| `current` | 是不是当前线上版本 |
| `config` | 第 2 节的快照，带 `releaseVersion` |

### 7.4 回滚

`POST /digitalhuman/avatar/rollback/{avatarId}`

权限 `digitalhuman:avatar:rollback`。

```json
{ "versionId": 12 }
```

只把当前发布指针改到本形象的这个历史版本，不改快照，也不改草稿。版本不属于这个形象时 `msg` 为 `历史版本不存在`。

成功时 `data` 是该版本，`current` 为 `true`。

停用中的形象也可以回滚指针，但 App 要等重新启用后才能读到。启用时如果 `isDefault` 仍为 `true` 并且已有发布版本，会重新成为首页形象。

## 8. 停用和启用

`PUT /digitalhuman/avatar/status`

权限 `digitalhuman:avatar:disable`。

```json
{ "avatarId": 1, "status": "1" }
```

`status` 只接受 `0` 和 `1`。`1` 是停用，会取消 `defaultActive`，App 不再拿到它。`0` 是启用。取值不对时 `msg` 为 `状态取值不正确`。

成功时 `data` 是详情。

## 9. App 读取已发布形象

这三个接口只要登录。没有权限字符。不要用它们拿草稿。

### 9.1 首页默认形象

`GET /digitalhuman/published/default`

返回当前 `defaultActive` 的形象。没有，或默认形象已停用、未发布时，`msg` 为 `没有已发布的默认数字人`。App 此时继续使用包内 `static/digital-human/config.json`。

成功时 `data` 就是第 2 节的配置，并且带 `releaseVersion`。

### 9.2 按编码读取

`GET /digitalhuman/published/{avatarCode}`

| `msg` | 原因 |
| --- | --- |
| `数字人形象不存在` | 编码不存在，或传了保留编码 `default`、`list` |
| `数字人已停用` | 形象停用 |
| `数字人未发布` | 还没有发布版本 |

成功时 `data` 与默认接口相同。`releaseVersion` 没变时不要重新下载图片。变了之后按新的 `sourceImage` 和 `visemes.*.file` 加载。全部加载成功后再替换当前形象；任一失败就保持上一份配置。

### 9.3 已发布形象列表

`GET /digitalhuman/published/list`

没有查询参数，也不分页。只返回启用且已发布的形象。停用、未发布和已删除都不在里面。没有记录时 `data` 是 `[]`，`code` 仍是 200。这和首页接口不同：首页没有默认形象时才是业务错误。

`data[]` 只有这些字段：

| 字段 | 说明 |
| --- | --- |
| `avatarCode` | 编码。选中后再调 9.2 |
| `avatarName` | 名称 |
| `releaseThumbnail` | 已发布主体图路径。不是草稿 `thumbnail`。接到接口主机后面显示 |
| `releaseVersion` | 当前发布版本号，与 9.1、9.2 的 `releaseVersion` 相同 |
| `defaultActive` | 是否当前首页形象。最多一条为 `true` |

不返回主键、草稿、素材和备注。首页形象排在最前，其余按 `avatarCode` 升序。App 用 `avatarCode` 读取完整配置，不要把这五项当成渲染配置。

## 10. 页面怎么接

管理列表路由是 `/digitalhuman/avatar`，组件 `digitalhuman/avatar/index`。编辑页路由是 `/digitalhuman/editor`，组件 `digitalhuman/avatar/editor`，菜单隐藏。编辑页用查询参数 `avatarId`。

建议顺序：

1. 新建后进入编辑页，调用详情。
2. 先上传主体，再上传六张嘴型。每次用返回的 `draft` 刷新画布。
3. 拖动、改宽高和缩放、切换嘴型后，调用保存草稿。重新进入时以详情里的 `draftRevision` 和 `draft` 为准。
4. 预览可以画草稿，也可以画历史版本里的 `config`。已发布的 `config` 不要写回保存接口。
5. 发布前先调用校验接口，把 `errors` 列出来。通过后再发布。
6. 发布失败时不要改列表上的 `releaseVersionNo`。以发布接口失败为准。
7. 回滚后重新拉详情和版本列表。草稿预览仍用 `draft`，线上预览用 `current === true` 的那条 `config`。

App 首页只在进入时请求默认形象。聊天、嘴型切换和 WebSocket 协议不变。`releaseVersion` 是缓存版本。图片 URL 用资源路径本身，不加随机参数。
