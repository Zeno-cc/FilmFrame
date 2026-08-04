# 实施计划

## Phase 1: 数据与核心规则

1. 新增 004 additive migration，并为旧库回填 `redeem_from = created_at`。
2. 实现集中式时间窗口解析与校验，保持旧请求默认立即生效、7 天截止。
3. 扩展 store row/summary/status，加入 `scheduled`、`redeemable` 和 `activeSessionCount`。
4. 在兑换事务中增加开始时间条件，保持截止边界、一次兑换和撤销级联不变。
5. 补齐 migration、store 边界、状态优先级、会话独立性和并发测试。

## Phase 2: 管理 API 与幂等性

1. 扩展单码和批次 Zod schema、响应序列化及审计安全测试。
2. 将批次时间意图纳入 payload hash，验证省略时间的重试稳定、不同时间的 key 复用返回冲突。
3. 更新列表、创建和 CLI 输出，确保所有返回均不包含 code hash、会话 token 或历史邀请码明文。
4. 增加 HTTP 正反测试：默认、双时间、单时间、非法格式、缺失时区、倒置窗口、零写入和边界兑换。

## Phase 3: 管理界面

1. 在单码/批次共用创建区加入生效与截止输入、本地时区提示和窗口摘要。
2. 扩展邀请列表的状态、当前可兑换、生效时间、截止时间和有效设备列。
3. 更新筛选、计数、新建结果即时插入、撤销后的行状态与响应校验。
4. 保持移动端表格可读、键盘可操作、动态数据使用 `textContent`，并增加 HTML/脚本契约测试。

## Phase 4: 运维契约与验证

1. 更新 `server/access/README.md`、`.trellis/spec/backend/access-control.md` 和 API/数据库契约。
2. 更新备份恢复字段比较、部署验证和真实代理测试中的邀请码时间场景。
3. 运行完整质量门，检查 migration 可重复执行、旧请求兼容、备份恢复以及工作区差异。
4. 通过独立 Trellis check 后再提交；生产部署和线上验证另按现有可信发布流程执行。

## Validation Commands

```bash
npm --prefix server/access run check
npm run test:e2e:access-proxy
npm run test:backup
npm run verify:deployment
npm run check:all
docker compose config --quiet
git diff --check
```

## Risky Files And Rollback Points

- `server/access/migrations/004_invite_schedule.sql`：只能新增 migration；必须验证历史数据回填和旧镜像忽略新列后的行为。
- `server/access/src/store.ts`：兑换 SQL 是授权边界；开始和截止条件必须与派生状态使用相同的包含边界。
- `server/access/src/routes/adminRoutes.ts`：不能削弱 Host、Cloudflare JWT、Origin、CSRF、JSON、限流和幂等约束。
- `server/access/src/views/html.ts`：时间本地化不能引入 XSS，动态响应不得直接写入 `innerHTML`。
- `ops/backup/restore-access.sh`：新增字段必须进入恢复比较，不能更改在线卷或现有严格路径边界。
- `scripts/test-invite-proxy.mjs`：测试时间必须使用可控时钟或足够确定的窗口，避免依赖脆弱的真实等待。

## Review Gates

- 列表显示与兑换事务对五种状态给出一致结果。
- `redeemable` 只读且不参与授权，数据库不存在会随时间过期的布尔状态。
- 历史邀请码升级后行为不变，旧请求默认值不变。
- 邀请码自然过期不踢设备，撤销仍立即级联。
- 批次幂等重试不因默认 `now` 漂移产生冲突。
- 普通用户无法区分未生效、过期、撤销、已用尽或不存在的邀请码。
