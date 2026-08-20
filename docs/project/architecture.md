# 系统架构与数据流

> 最后核验：2026-07-30。邀请码门禁代码和部署模板已在仓库实现；Cloudflare、Google 与线上 OpenResty 的外部配置仍需在生产切换前完成并验证。

## 总体结构

FilmFrame 现在由两部分组成：浏览器中的静态图片应用，以及独立的服务端访问门禁。门禁保护官方站点的分发入口，不参与图片处理。

```text
普通访客
  -> Cloudflare（整站缓存绕过）
  -> OpenResty：filmframe.astrocean.space
       -> /access、/auth/* -> Express access sidecar
       -> 其他路径 -> auth_request /internal/session-check
            -> 会话有效 -> 静态 Nginx -> React/Vite 应用
            -> 会话无效 -> 303 /access
            -> 鉴权故障 -> 503，禁止匿名放行

管理员
  -> Cloudflare Access
       -> 精确邮箱白名单的 Google IdP
       -> Independent MFA WebAuthn
  -> OpenResty：filmframe-admin.astrocean.space
  -> Express access sidecar 验证 Cf-Access-Jwt-Assertion
  -> 邀请码管理页/API

Express access sidecar
  -> SQLite 持久卷
       -> 邀请码 SHA-256 哈希
       -> opaque session token 的 SHA-256 哈希
       -> 有效期、兑换次数与撤销状态
```

Compose 中静态容器只发布到 `127.0.0.1:18082`，鉴权容器只发布到 `127.0.0.1:18083`，两者同时加入私有 `filmframe_private` 网络。OpenResty 是公开入口，不能把这两个端口直接暴露到公网。

## 信任边界

| 边界 | 结论 |
| --- | --- |
| React state、localStorage、前端环境变量 | 不可信，不能决定访问权限 |
| 邀请码与用户会话 | 由 access sidecar 和 SQLite 判定，浏览器只持有 HttpOnly Cookie |
| Cloudflare Access 请求头 | 验签前不可信；源站必须校验签名、issuer、audience、时效和管理员邮箱 |
| OpenResty `auth_request` | 所有 HTML、JS、Worker、overlay、mask 和其他静态资源的统一执行点 |
| 浏览器图片工作区 | 照片、EXIF、构图、渲染结果和 Object URL 只在当前浏览器会话中存在 |
| 已授权前端产物 | 用户下载到浏览器后可以保存或复制；本方案不承诺阻止离线复制 |

服务端门禁能阻止匿名用户从官方入口取得应用和素材，但无法让已交付给合法浏览器的纯前端代码不可复制。若要改变这个上限，必须把核心算法或素材迁到服务端，这与当前“照片不上传”的产品边界冲突。

## 公开站点门禁

### 路由契约

| Host / 路由 | 访问条件 | 行为 |
| --- | --- | --- |
| FilmFrame `GET /access` | 公开 | 返回服务端渲染的邀请码页，不加载 Vite bundle |
| FilmFrame `POST /auth/redeem` | 表单 nonce + 限速 | 原子兑换，成功后设置会话 Cookie 并 303 到 `/` |
| FilmFrame `POST /auth/refresh` | 有效会话 + exact Origin + CSRF header | 将当前设备会话和持久 Cookie 的有效期滚动延长 400 天 |
| internal `GET /internal/session-check` | 私有/回环来源且 `Host: access` | 有效会话返回 204，否则 401 |
| internal `GET /healthz` | 私有/回环来源且 `Host: access` | 检查进程与数据库 |

OpenResty 只把会话 Cookie 传给内部鉴权子请求，并主动覆盖转发 Host、协议和客户端地址。`/healthz` 与 `/internal/*` 在公开 vhost 返回 404。鉴权服务超时或异常时返回 503，不能回退为静态文件直出。

生产 Cookie 名为 `__Host-filmframe_session`，使用 `Secure`、`HttpOnly`、`SameSite=Strict`、`Path=/` 和 400 天持久寿命。React 无法读取 Cookie；应用启动时只发送固定同源 `POST /auth/refresh` 和 `X-FilmFrame-CSRF: 1`，由服务端续期。

### 邀请码生命周期

- 邀请码由 16 个随机字节生成，使用带 `FF1-` 版本前缀的 Crockford Base32 展示格式。
- 服务端先规范化大小写、分隔符和 Crockford 别名，再计算 SHA-256；数据库从不保存明文。
- 固定策略为生成后 7 天内可兑换、最多兑换一次；兑换采用 SQLite immediate transaction，20 路并发也只能有一个成功者。
- 成功兑换生成 256 bit opaque session token，数据库只保存 token 哈希；设备会话每次进入应用滚动续期 400 天。
- 邀请码自然过期只阻止新兑换，不提前终止已签发会话；管理员撤销邀请码会同时撤销其有效会话。
- 错误码、已用码、过期码和撤销码对外使用同一失败文案，不泄露内部状态。

SQLite 启用 foreign keys、WAL、`synchronous=NORMAL` 和 5 秒 busy timeout。数据目录权限为 `0700`，数据库/WAL/SHM 文件权限为 `0600`，Compose named volume 保证容器替换后状态仍在。

## 管理端认证

管理域名暂定 `filmframe-admin.astrocean.space`。它不是普通邀请码会话的延伸，而是独立的高权限入口：

1. Cloudflare Access 只 Include 精确管理员邮箱，并 Require Google 登录方式。
2. Independent MFA 只允许 WebAuthn biometrics/security key，关闭 IdP MFA 的 AMR 复用。
3. 管理员至少登记两个 WebAuthn 凭据，避免单设备丢失后锁死。
4. access sidecar 使用远程 JWKS 验证 `Cf-Access-Jwt-Assertion`，固定 RS256、exact issuer、管理应用 audience、时效和邮箱。
5. 管理写接口还要求 exact Origin、JSON 和 `X-FilmFrame-CSRF: 1`，并应用请求体限制与限速。

Google Client Secret 只进入 Google Cloud 与 Cloudflare Zero Trust 配置。项目不自行实现 Google OAuth callback，不保存 Google token 或 Passkey 私钥。

管理 API 只返回邀请码 ID、备注、时间、状态与兑换计数。新邀请码明文只在创建响应显示一次；管理页支持复制和主动清除，并在页面离开时清除 DOM 中的一次性明文。

## 浏览器应用入口

1. `index.html` 只设置中文页面元信息、favicon、`#root` 和 `/index.tsx` module 入口；旧的 `window.process` polyfill 已删除。
2. `index.tsx` 使用 `ReactDOM.createRoot` 挂载 `React.StrictMode` 下的 `<App />`。
3. `App` 初始化默认胶片设置，并从 localStorage 读取非敏感偏好和本地配方。

静态容器通过响应头提供 CSP、Permissions Policy、frame policy、`nosniff` 和 `Cache-Control: private, no-store`。受保护静态资源不能使用匿名公共缓存。

## 浏览器渲染数据流

```text
FileList / DataTransfer.files
  -> JPEG/PNG/WebP 直接使用
  -> HEIC/HEIF 由 heic-to/csp 本地转换为单张 JPEG render File
  -> 原始 File 做 best-effort EXIF；render File 做尺寸解码
  -> ImageItem + Object URL
  -> Worker / OffscreenCanvas（满足能力和策略时）
       -> 失败或不支持 -> 主线程 Canvas
  -> Blob / Object URL
  -> 单图、胶片长条或 ZIP 下载
```

UI 通过 `filmWorkerClient` 门面选择 Worker 或主线程。classic 当前固定主线程；已注册的真实 135 模板可进入 Worker。Worker 请求使用递增 ID 与 pending Map 配对，支持 120 秒超时、错误回退、取消和晚到结果丢弃。

单张处理使用图片、设置与 generation 快照，结果按图片 ID 合并。设置、构图或顺序变化后，旧结果变为 stale，不能再下载。长条签名还包含入选顺序与每张照片的 transform。

### Object URL 所有权

| URL | 创建点 | 回收点 |
| --- | --- | --- |
| 原图 `previewUrl` | 上传准备 | 删除图片、清空整卷、App 卸载 |
| 单图 `processedUrl` | Worker 或主线程 | 替换、删除、晚到拒绝、卸载 |
| `stripResult.url` | 长条渲染 | 图片/设置变化、替换、卸载 |
| 即时预览 URL | preview controller | 新预览替换、generation 拒绝、关闭编辑器 |
| 下载临时 URL | download helper | 触发下载后延迟回收 |

## 本地存储与隐私

设置偏好使用 `filmFrame.preferences.v1`，本地配方使用 `filmFrame.recipes.v1`。两者只保存白名单设置，不保存图片、EXIF、Blob、Object URL、邀请码、会话 token 或构图中的临时草稿。

应用没有图片上传、云同步或遥测接口。access sidecar 也没有接收图片的路由，只处理邀请码、会话和管理员断言。HEIC/HEIF 转换模块在首次候选导入时从同源静态包延迟加载，照片 Blob、EXIF、JPEG 中间结果与成片始终留在当前页面会话。正常运行时的网络请求限于同源 HTML、JS/转换代码、Worker、胶片模板、齿孔蒙版与本地发布的摄影名言快照；只有用户主动点击出处链接时才访问 Wikiquote。

## 缓存与部署边界

- Cloudflare 必须对 FilmFrame hostname 整站 cache bypass，并在切换门禁前 purge 旧缓存。
- OpenResty 必须用 `auth_request` 覆盖 `/` 下全部应用路径；不能只保护首页。
- 静态 Nginx 与 OpenResty 都覆盖受保护响应为 `private, no-store`，不返回 ETag。
- 源站端口只监听回环；直连源站并伪造 Host/SNI 仍必须经过会话或 Access JWT 验证。
- 管理端和公开端使用独立 vhost，只修改对应 1Panel 站点，不影响其他域名。

仓库已经提供上述代码和模板，但真实 Cloudflare Access、Google OAuth Client、DNS、证书路径、缓存规则及线上 vhost 尚属于外部状态。完成外部配置和完整验证前，不应宣称生产门禁已启用。
