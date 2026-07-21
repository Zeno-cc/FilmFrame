# 免费摄影名言轮播设计

## 总体架构

```text
手动命令或免费 GitHub Actions
  -> Wikiquote MediaWiki API
      -> 摄影师页面白名单
      -> 修订号与 Wikitext
      -> 保守提取候选句
      -> 人工核验、翻译、许可检查
      -> data/photography-quotes.json

FilmFrame
  -> 导入审核快照
  -> EmptyDarkroom 本地随机轮播
```

这套设计确实接入第三方 API，但 API 位于内容维护流程，而不是用户浏览器运行链路。这样无需付费、密钥或后端，也不会因为 Wikiquote 超时而让页面空白。

## Wikiquote 同步协议

优先使用 MediaWiki Action API 获取页面修订与 Wikitext：

```http
GET https://en.wikiquote.org/w/api.php
  ?action=query
  &prop=revisions
  &rvprop=ids|timestamp|content
  &rvslots=main
  &titles=Ansel_Adams
  &format=json
  &formatversion=2
```

同步脚本维护页面标题白名单，例如 Ansel Adams、Henri Cartier-Bresson、Dorothea Lange、Robert Capa、Diane Arbus、Gordon Parks 等。中文 Wikiquote 仅作为可选补充源。

## 同步产物

脚本分成两个产物：

1. `generated/photography-quote-candidates.json`：机器提取的候选，只供维护者审阅，不进入生产构建。
2. `data/photography-quotes.json`：人工审核快照，是前端唯一运行数据源。

```ts
interface PhotographyQuote {
  id: string;
  originalText: string;
  displayTextZhHans: string;
  author: string;
  authorZhHans?: string;
  sourceTitle: string;
  sourceDetail?: string;
  wikiquoteUrl: string;
  wikiquoteRevisionId: number;
  translationCredit?: string;
  rightsNote: string;
  verifiedAt: string;
}
```

## 提取与审核规则

- 只解析白名单页面中的顶层名言条目，忽略模板、目录、人物介绍、外部链接区和无来源段落。
- 提取器宁可漏掉，也不能把引文说明、他人评价或页面导航当成名言。
- 新候选、原文变化或修订号变化只生成差异报告，不自动更新审核快照。
- 人工审核确认原文、作者、来源语境和中文译文后，再将记录提升到生产快照。
- 同步失败、页面结构变化或候选为零时保留旧快照，不写空文件。

## 前端轮播

- 新增纯函数校验审核快照并选择下一条索引，相邻两次不重复。
- `EmptyDarkroom` 只维护当前 24 小时时段对应的索引，不执行任何远程请求。
- 以 Unix 时间划分固定 24 小时时段，并用单次 `setTimeout` 在下一个时段边界更新；组件卸载时清理计时器。
- 自动更新区域使用 `aria-live="off"`，不提供手动换句或暂停按钮。
- 为最长名言和出处预留稳定高度，避免轮播引发布局跳动。

## 界面信息

```text
中文摄影名言
— 摄影师中文名 / 原名 · 原始出处
01 选片 / 02 调配 / 03 显影与收卷
```

界面可提供指向具体 Wikiquote 页面修订的来源链接，但不能把链接放成高优先级按钮。

## 许可与隐私

- 遵守 Wikiquote/Wikimedia 的署名要求，并记录页面 URL 与修订号。
- Wikiquote 页面许可不自动解决现代名言本身的原始版权，人工审核需要保留用途与来源备注。
- 项目自行完成或取得许可的中文译文必须明确记录；不使用实时机器翻译。
- 用户浏览器不访问第三方，不发送照片、IP 关联请求、胶片设置或会话信息。

## 回滚

恢复原静态说明或继续使用上一版审核快照即可。同步脚本失败不影响应用构建和运行。
