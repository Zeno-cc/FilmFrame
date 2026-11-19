# 联网摄影示意轮换：技术设计

## 边界

新增 `services/darkroomGallery.ts` 负责许可解析、候选筛选和换批规则；新增 `services/darkroomGalleryCache.ts` 负责独立的 IndexedDB 缓存；`EmptyDarkroom` 只负责显示、轮换和交互暂停。继续使用现有本地照片作为首屏与永久降级，不改 `App.tsx` 的用户照片状态。

## 数据与网络

```ts
interface DarkroomGalleryPhoto {
  id: string;
  title: string;
  artist: string;
  sourceUrl: string;
  licenseName: string;
  licenseUrl: string;
  imageUrl: string;
  width: number;
  height: number;
}

interface DarkroomGalleryBatch {
  id: string;
  fetchedAt: number;
  expiresAt: number;
  photos: DarkroomGalleryPhoto[];
}
```

- API 使用 `origin=*`、`formatversion=2`、24 个已审核的公共档案作品 ID 及 `prop=imageinfo` 请求许可元数据；使用 `credentials: 'omit'`、`referrerPolicy: 'no-referrer'`。每次从两个不重复的 12 张子集中选新批次，旧缓存不属于审核池时先采用完整首轮。
- 只接受 `LicenseShortName` 为 `CC BY 4.0`、`CC BY-SA 4.0`、`CC0`、`Public domain` 的条目，其他条目拒绝。保存 `Artist` 的纯文本、原图描述页、许可名称和许可 URL；缺少许可 URL 时，由已接受的许可名称映射到固定官方规范链接。
- 使用 API 返回的官方 `thumburl` 获取宽度受限的 JPEG/PNG，避免下载超大原图。响应要求 HTTPS 官方域名、允许的 MIME 和明确体积上限。
- 请求和图像解码均有超时；没有成功解码的图片不能进入批次。

## 缓存与换批事务

- IndexedDB 数据库 `filmframe-darkroom-gallery` 只含 `batches` 和 `assets` 两个 object store。批次记录含许可元数据和资源 ID，资源记录含 `ArrayBuffer` 字节与 MIME；读取时为显示重建 Blob，避免 WebKit 对 IndexedDB Blob 持久化的限制。
- `loadLatestBatch()` 只读最近完整批次；Blob 展示通过当前组件拥有的 Object URL，不写 localStorage。未过期但作品 ID 不属于当前 24 张审核池的旧批次不会被直接发布，仍可在刷新失败时保留为降级内容。
- `refreshBatch()` 先完成全部候选的许可与内容校验、解码和持久化，再发布新批次；保存成功后用独立事务只保留当前批次及其资源，不使用数据库清空。
- 若新批次无法完整就绪，中止发布并保留旧批次。清理失败必须向上暴露，不能静默伪装成成功。到期缓存只允许在替换完成后清理。
- 用 `navigator.locks` 防止同源标签页重复换批；无锁 API 时依赖本地 Promise 去重，单页失败退化为已有内容，不做复杂跨标签协调。
- 到期后仅重新发起换批，不直接删掉旧内容。没有新批次就不删除，避免把网络故障误当作删除指令。

## 展示与生命周期

- `EmptyDarkroom` 初始显示 12 张本地经典纪实摄影，挂载时读取缓存，缓存可用则显示，否则后台刷新。素材来自 Lange、Parks、Evans 的公共档案，不再使用随机人物分类。
- 多个真实 3:2 画幅组成连续片轨，以 24 px/s 持续向左运动，桌面可见两张不同照片，手机保留相邻画幅预览。悬停、focus-within、拖动和页面隐藏冻结实际位移；`prefers-reduced-motion` 保持静态多画幅。
- 动画按原图与复制帧的实际宽度差计算周期，由 Web Animations API 线性播放；暂停与尺寸变化保留归一化进度，不重建回零。每个完整周期后更新一次左侧画幅署名，不做每帧 React 更新。
- 组件卸载、换批或批次替换时取消进行中的 fetch、清除轮换/过期 timer，并 revoke 旧 Object URL。
- `aria-live="off"`，来源说明不抢焦点；不增加分页圆点、手动轮播控制或加载弹窗。

## 验证

- Vitest 注入 `fetch`、时钟和缓存适配器，覆盖许可缺失、域名/MIME 拒绝、完整换批、失败保留、删除 ID、超时和卸载清理。
- Playwright 通过 `page.route` 模拟 API 和图片响应，验证到期换批、旧资源删除和失败降级；再使用真实 Wikimedia 请求验证至少一个许可候选和本地 Blob 展示。
- 复跑空暗房桌面/手机几何、动画、拖放、键盘、减弱动态和类型检查。
- 原始内置素材不删除，现有用户照片、配方和设置持久化不变。

## 风险与回滚

- 第三方条款和许可可能变化：运行时只接受白名单许可，保留原始来源和许可链接；不自动扩展到新站点。
- 浏览器隐私模式下 IndexedDB 不可用：使用内存缓存或永久本地降级，不阻断首屏。
- 7 天后换批增加少量公共图片网络流量：只在空状态可见且联网时请求，不后台持续轮询。
- 回滚只移除新增服务、缓存、展示绑定和测试，保留用户已有渲染和发布改动；不执行 destructive Git 操作。
