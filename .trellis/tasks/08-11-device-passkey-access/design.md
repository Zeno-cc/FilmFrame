# 技术设计

## Architecture

```text
首次邀请码兑换
  -> access sidecar 创建 session（token hash 不轮换）
  -> 用户点击“记住此设备”
  -> registration options/challenge
  -> 浏览器平台 Passkey
  -> verification -> passkey_credentials

日常访问
  -> 稳定 HttpOnly session Cookie
  -> OpenResty auth_request
  -> 进入静态应用
  -> /auth/refresh 只滚动时间，不替换 token

Cookie 丢失 / 换浏览器
  -> /access
  -> authentication options/challenge
  -> Passkey 签名
  -> verification 找到所属 invite
  -> 创建新的 session Cookie
  -> 进入静态应用
```

## Backend boundaries

### Dependencies

- `@simplewebauthn/server` 负责 registration/authentication options 生成和 assertion/attestation 验证。
- `@simplewebauthn/browser` 通过 Access 服务自己的同源脚本打包，负责浏览器 API 的 ArrayBuffer 转换和平台兼容调用。
- 不从 CDN 加载认证脚本，不把依赖版本或凭据放进前端环境变量。

### Session change

`refreshSession` 保留 `token_hash`，在一个事务中更新 `last_seen_at` 与 `expires_at`。路由继续使用同一个 token 调用 `setSessionCookie`，因此可以滚动浏览器 Max-Age；客户端不需要等待刷新结果，也不会因 Abort 使数据库和 Cookie 分叉。

抽取 `createSessionForInvite`，让邀请码兑换和 Passkey 恢复共用随机 token、哈希存储和会话 TTL 逻辑。Passkey 恢复不更新 invite redemption count。

### Database migration

新增迁移 `006_passkeys.sql`：

- `passkey_credentials`: credential ID 唯一键、invite ID、公钥、counter、device type、backup flag、transports、created/last-used/revoked 时间。
- `webauthn_challenges`: challenge ID、challenge、purpose、invite/session 绑定、created/expires/used 时间。
- 为 invite、session、credential 和 challenge 的状态查询增加索引。

Challenge 由服务端生成并在验证事务中一次性标记，过期记录由 maintenance 清理。Challenge ID 可出现在 JSON，因为真正的防伪是 WebAuthn 签名、exact origin 和一次性消费。

Passkey user handle 使用邀请码 UUID 的稳定二进制表示，不保存邮箱或设备序列号。验证时只允许未撤销邀请码下的 credential。

### API contract

```text
POST /auth/passkeys/registration/options   session + origin/csrf
POST /auth/passkeys/registration/verify    session + origin/csrf
POST /auth/passkeys/authentication/options public origin/csrf
POST /auth/passkeys/authentication/verify  public origin/csrf -> session cookie
GET  /access/passkey/setup                 session-protected HTML
GET  /auth/passkeys/client.js              same-origin bundled client

GET  /api/passkeys                         admin JWT
POST /api/passkeys/:id/revoke              admin JWT + csrf
```

所有认证路由 `no-store`、限制 JSON 体积、exact Host/Origin，错误文案统一。Options 和 verify 均限速；verify 必须检查 challenge purpose、绑定 session/invite、过期和未使用状态。

## Frontend behavior

- Access SSR 页增加 Passkey 解锁按钮和能力检测；不支持 WebAuthn 时只展示原邀请码输入。
- 首次兑换成功进入一次性 setup 页面，按钮触发注册；“稍后设置”直接进入应用。
- 应用 MoreMenu 增加“设备授权”入口，链接到 session-protected setup 页面。
- Passkey client 状态只存在当前页面，不写入 localStorage；只显示 loading、成功、失败和重试状态。
- 正常应用启动只发原有 runtime-config 与稳定 token refresh，不触发 WebAuthn。

## Admin behavior

复用现有管理页的列表/撤销模式，增加“设备凭证”区块。只返回短 ID、类型、日期和状态；撤销后立即更新 UI 并显示受影响设备为已撤销。

## Security and compatibility

- `rpID` 固定为 `filmframe.astrocean.space`，origin 固定为 `https://filmframe.astrocean.space`。
- `userVerification: required`，`residentKey: required`，`attestation: none`；允许同步凭证以覆盖 Apple/Google 密码管理器。
- Passkey 是恢复凭证而非唯一物理设备证明；系统同步可能让同一账号的其他设备使用它。
- 不输出 credential 公钥、challenge、Cookie 或 token；审计只记录目标 ID/计数。
- 生产 vhost 不需要新增公开 upstream，所有 Passkey API 仍走现有 Access sidecar 路由边界；新增路径必须纳入 no-store 和 session/auth_request 规则。

## Migration and rollback

- 迁移只新增表和索引，`schema_from=5`、`schema_to=6`，回滚到旧应用时旧表保留。
- 旧 session token 仍按原哈希校验；没有 Passkey 的老会话继续使用 Cookie。
- 已经丢失旧 Cookie 的老设备无法从哈希恢复，需一次新邀请码激活；本任务不伪造恢复旧 token。
- 若 WebAuthn 验证异常，关闭 Passkey 入口不影响普通邀请码和既有 Cookie；不得降级为匿名访问。
