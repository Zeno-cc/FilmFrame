# 公网管理端非邮箱认证选型

## 结论

在“必须公网访问、不使用邮箱或 OAuth、单管理员、现代手机与桌面浏览器、已有 HTTPS 和 SSH”约束下，WebAuthn Passkey 是首选。

它免费、抗钓鱼，服务端只保存公钥凭据；Node 服务可使用成熟的 SimpleWebAuthn 库，SQLite 保存 credential、challenge 和会话状态。实现复杂度高于 Cloudflare Access，但低于自行维护密码、TOTP、恢复码和完整防爆破体系。

“任意设备”仍然需要管理员持有可用的通行密钥：可以使用系统同步通行密钥、跨设备二维码认证，或预先登记第二枚凭据。老旧浏览器与部分应用内 WebView 不在兼容承诺内。

## 首次注册

1. SSH 命令生成至少 192 bit 熵的一次性 enrollment grant。
2. 数据库只保存 grant 哈希、用途和过期时间；grant 10 分钟过期，只能原子消费一次，固定用途为 `register-admin`。
3. grant 仅通过 HTTPS POST body 提交，不进入 URL、Referer 或日志。
4. 服务端签发一次性 WebAuthn challenge，并绑定临时注册会话。
5. 校验 exact origin、exact RP ID、challenge、credential ID、签名以及 `userVerification: required`。
6. 在同一事务中创建管理员凭据并消费 grant；并发重放只能有一个成功。

禁止公开自助注册，也禁止“第一个访问者自动成为管理员”。attestation 使用 `none`，不收集设备硬件身份证明。

## 登录与管理员会话

- 登录 challenge 保存在服务端，5 分钟过期、单次使用。
- 同步型 Passkey 的 sign counter 可能不递增，异常只记录风险信号，不能仅因 counter 为零或不变锁死管理员。
- 登录成功后签发随机 opaque session，数据库只存 session 哈希。
- Cookie 使用 `__Host-` 前缀、`Secure`、`HttpOnly`、`SameSite=Strict`、`Path=/` 和有限寿命；管理会话建议 8-12 小时。
- 所有生成、查询和撤销路由都在服务端再次验证管理员会话，不能依赖 React 隐藏、Cloudflare 橙云或请求头存在性。
- 所有写操作校验 exact Origin 和 CSRF token，限制请求体、关闭凭据 CORS 并执行限速。

## 恢复与冗余

- 公网不提供“忘记通行密钥”或管理员重置入口。
- SSH recovery 命令先撤销全部管理员会话，可选择移除丢失凭据，再签发同样短时、单次使用的恢复 grant。
- 登录后允许登记第二枚 Passkey，正式上线前建议至少登记两枚；删除凭据时必须保留至少一枚。
- SSH 是最终恢复根信任；SSH 访问本身丢失时，不存在网页旁路恢复。

## 其他方案

### Google/GitHub OAuth

跨设备体验好且通常免费，但引入第三方账号、Client Secret 和 provider 配置，违背当前不做外部登录的决定。未来采用时必须按 provider 的不可变用户 ID allowlist，不能只信邮箱字符串。

### 密码 + TOTP

兼容性广，但易被钓鱼，并需要 Argon2id、TOTP secret、恢复码、爆破保护和安全秘密分发，维护面更大，只作为次选。

### mTLS

安全性强，但手机证书安装、跨设备使用、撤销和轮换体验较差，不符合“任意设备直接访问”的目标。

## 验收重点

- 无 grant 不得注册；同一 grant 并发注册时恰好一次成功。
- 错误 origin、RP ID、challenge、无用户验证和重放均失败。
- iOS Safari、Android Chrome、桌面 Safari/Chrome/Edge 覆盖注册与登录；至少验证一条跨设备二维码流程。
- 匿名用户、普通邀请码用户和过期/篡改管理员会话调用管理 API 均失败。
- SSH 恢复后旧管理员会话及被移除凭据立即失效。
- 管理服务与应用端口不对公网直接监听；直连源站和伪造 Host 不能签发邀请码。
- grant、session 明文和凭据私钥不进入数据库、日志、仓库或镜像。
