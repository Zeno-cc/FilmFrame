# 技术设计

## 1. 边界与原则

- 改动仅落在 `server/access`、邀请码部署验证和相应文档，不改变前端照片处理、Cloudflare Access、OpenResty 门禁结构或设备会话续期策略。
- “是否有效”拆成两个明确事实：邀请码当前是否可兑换，以及已经签发的设备会话是否仍有效。两者不能共用一个静态状态字段。
- 时间相关状态由服务端按同一时钟实时派生，数据库不保存会随时间失真的 `is_valid` 布尔值，也不依赖定时任务推进状态。
- 普通兑换端继续使用统一错误，只有受保护的管理端可以看到精确生命周期状态。

## 2. 数据模型与迁移

新增 `server/access/migrations/004_invite_schedule.sql`：

```sql
ALTER TABLE invites
  ADD COLUMN redeem_from INTEGER NOT NULL DEFAULT 0;

UPDATE invites
SET redeem_from = created_at
WHERE redeem_from = 0;

CREATE TRIGGER invites_set_legacy_redeem_from
AFTER INSERT ON invites
WHEN NEW.redeem_from = 0
BEGIN
  UPDATE invites SET redeem_from = NEW.created_at WHERE id = NEW.id;
END;
```

- `redeem_from` 与现有 `redeem_by` 都使用 Unix 毫秒。
- 历史记录以 `created_at` 回填，确保升级前后的状态和兑换边界不变。
- 新代码始终显式写入 `redeem_from`；默认值和触发器让旧版本应用在数据库已迁移后回滚运行时，仍能创建以 `created_at` 为生效时间的兼容记录。
- 不修改已经应用的 001–003 migration，不执行破坏性表重建。

## 3. 领域模型

`InviteSummary` 增加：

- `redeemFrom: number`
- `redeemable: boolean`
- `activeSessionCount: number`

`InviteStatus` 增加 `scheduled`。统一派生顺序：

1. `revoked_at != null` -> `revoked`
2. `redemption_count >= max_redemptions` -> `redeemed`
3. `now < redeem_from` -> `scheduled`
4. `now > redeem_by` -> `expired`
5. 其余 -> `active`

`redeemable` 只在状态为 `active` 时为 `true`。兑换 SQL 在原有条件上增加 `redeem_from <= now`，并保留 `redeem_by >= now`，因此两个边界时刻均允许兑换。列表查询聚合未撤销且未到期的子会话数量，用于向管理员解释“邀请码不能兑换但设备仍有效”的情况。

## 4. 创建与幂等契约

单码请求扩展为：

```json
{
  "label": "访客",
  "redeemFrom": "2026-08-10T01:00:00.000Z",
  "redeemBy": "2026-08-17T01:00:00.000Z"
}
```

批次请求在现有 `name`、`count` 外接受相同两个可选字段。规则：

- 两者都省略：`redeemFrom = now`，`redeemBy = now + 7 days`。
- 只给 `redeemFrom`：`redeemBy = redeemFrom + 7 days`。
- 只给 `redeemBy`：`redeemFrom = now`。
- 两者都给：按输入使用；必须满足 `redeemFrom < redeemBy`。
- 输入必须是带 `Z` 或明确 offset 的 ISO 8601 字符串；响应继续使用 UTC ISO 8601。

批次幂等 payload hash 包含规范化后的可选时间意图。省略时间的重试以 `null` 参与哈希，不能把每次请求的 `now` 写入哈希，否则响应丢失后的合法重试会错误地产生冲突。首次事务解析出实际窗口并让整批共享它。单码继续沿用现有一次性明文和幂等返回契约。

## 5. HTTP 与管理界面

- `GET /api/invites` 和创建响应增加 `redeemFrom`、`redeemable`、`activeSessionCount`，保留现有字段。
- Zod schema 只接受已知字段；时间解析、默认值和窗口校验集中在一个小型纯函数中，路由与 store 不各写一份规则。
- 创建区增加“生效时间”和“兑换截止”两个 `datetime-local` 输入，默认显示当前本地时间和 7 天后；旁边显示浏览器 IANA 时区及可读窗口摘要。
- 浏览器提交前将本地输入转换为 ISO 字符串。服务端渲染使用 UTC 作为无脚本回退，内联脚本根据 `<time datetime>` 在浏览器内本地化列表时间。
- 邀请码表格增加“当前可兑换”和“有效设备”，状态筛选增加“未生效”；计数器、客户端筛选和创建后的即时插入支持新状态。
- 仍使用 DOM `textContent` 和属性赋值处理动态响应，不把 API 字段拼进 `innerHTML`。

## 6. 安全、兼容与回滚

- 未生效、过期、撤销、已用尽、未知及畸形邀请码继续返回同一公开错误，不泄露状态。
- 原子条件更新仍是最终授权边界；管理页面显示的 `redeemable` 仅供观察，不能参与授权决策。
- 旧管理客户端不传时间仍保持现有行为；旧数据库自动增量迁移；回滚到旧应用时新列被忽略且默认值保持兼容。
- 邀请码自然过期仍不终止已签发会话，撤销邀请码仍在同一事务中级联撤销会话。
- 备份和恢复清单加入 `redeem_from`，确保恢复演练比较完整生命周期数据。

## 7. 测试策略

- Store：五状态优先级、`redeemable`、开始/截止边界、未来生效拒绝、自然过期不影响会话、撤销级联、有效设备计数。
- Migration：旧 schema 回填、fresh database、重复启动、回滚兼容和数据库重开。
- HTTP：单码/批次默认值、显式双时间、单字段默认、格式/时区/顺序校验、零写入、幂等重试及批次 payload conflict。
- UI：表单字段、时区提示、未生效筛选、当前可兑换标记、有效设备数、新建行和无秘密渲染。
- 代理 E2E：未来邀请码在开始前失败、开始边界成功；不扩大到生产部署，待本地质量门通过后再按发布流程上线。

## 8. 取舍

- 不增加“启用/停用”可编辑开关：现有撤销操作已经提供不可逆停用，额外开关会引入恢复语义、并发和审计复杂度。
- 不允许修改已创建邀请码窗口：邀请码可能已分发，静默改期不利于审计；管理员应撤销后重建。
- 不引入日期库：浏览器 `Date`、`Intl.DateTimeFormat` 和服务端严格 ISO 校验足够覆盖单管理员场景。
