# 第三方摄影名言 API 调研

## 调研结论

目前没有一个成熟接口能够同时满足：摄影专用、简体中文、免费商用、无需密钥、浏览器可直连、出处可靠。

在“必须零成本”的前提下，推荐使用 **Wikiquote MediaWiki API 作为语料采集源**，通过同步脚本拉取摄影师白名单页面，人工审核后生成随应用发布的名言快照。它无需 API key，但不适合浏览器实时依赖：页面结构不稳定、部分地区访问不可靠，并且中文覆盖有限。

API Ninjas Quotes v2 的字段更规整，但必须使用 API key，官方明确说明免费套餐不可用于商业用途，因此不采用。

## 候选对比

| 服务 | 已验证能力 | 主要问题 | 结论 |
| --- | --- | --- | --- |
| [API Ninjas Quotes](https://api-ninjas.com/api/quotes) | `/v2/quotes`、`/v2/randomquotes`；支持 `author`、`work`、`categories`；返回作者与作品字段 | 必须使用 `X-Api-Key`；商业用途需要付费套餐；不是摄影专用；没有中文译文 | 付费方案中最合适，零成本方案不采用 |
| [ZenQuotes](https://zenquotes.io/) | 无 key 可请求随机英文名言；官方目录约 3,000 条 | 通用励志内容；免费调用需要署名并受限流；官方说明跨域和高级作者能力依赖订阅；测试作者路径未返回摄影师专属结果 | 不适合作为摄影名言主源，可作为通用英文备选 |
| [Quotable](https://github.com/lukePeavey/quotable) | 开源 API；支持作者过滤、随机、多作者查询；运行接口返回 `Access-Control-Allow-Origin: *` | 语料覆盖严重不足：仅查到 1 条 Ansel Adams，Henri Cartier-Bresson、Dorothea Lange、Robert Capa、Diane Arbus、Gordon Parks 均为 0；无作品出处字段；本机正常证书校验失败 | 可用于原型或自托管，不适合当前摄影大师需求 |
| [QuoteGarden](https://github.com/pprathameshmore/QuoteGarden) | README 声称超过 75,000 条，支持作者查询和随机接口 | 实测接口 20 秒超时；只返回文本、作者和分类，不返回权威出处；软件 MIT 不代表名言语料版权已明确 | 不建议用于生产 |
| [Wikiquote MediaWiki API](https://www.mediawiki.org/wiki/API:Main_page) | 可按摄影师页面获取 Wikiquote 内容；MediaWiki 支持跨域请求 | 页面结构不是稳定 JSON 名言结构；需要解析章节与引用；页面许可和现代名言的原始版权不是同一回事；本环境多次超时 | 适合离线采集和核验，不适合前端实时轮播 |
| [They Said So](https://theysaidso.com/api/) | 提供通用名言和每日名言接口 | 实测无凭证返回 401；不是摄影专用 | 不推荐 |
| [一言 Hitokoto](https://developer.hitokoto.cn/) | 免费、中文、支持跨域、无需 key | 内容以动画、文学、网络和影视语句为主，没有摄影大师筛选 | 不符合内容定位 |
| [天行数据名人名言](https://www.tianapi.com/apiview/39) | 中文名人名言接口 | 需要 API key；不是摄影专用；测试请求返回“API 密钥无效” | 不能单独解决摄影内容问题 |

## 零成本推荐接入方式

```text
开发者同步命令 / 可选 GitHub Actions
  -> 免费 Wikiquote MediaWiki API
      -> 摄影师页面白名单
      -> 保存页面修订号与原始出处
      -> 提取候选名言
      -> 人工审核与中文翻译
      -> 生成 photography-quotes.json

FilmFrame 浏览器
  -> 读取构建产物中的审核快照
  -> 本地无重复随机轮播
```

浏览器不应每 12 秒请求第三方，也不应把 Wikiquote 当作运行时硬依赖。第三方 API 负责提供语料来源，审核快照负责保证用户端稳定、离线可用和中文质量。

## 零成本限制

- Wikiquote 页面不是稳定的名言 JSON，必须保留人工审核步骤，不能自动发布抓取结果。
- 中文 Wikiquote 覆盖较少，可能需要从英文页面采集后由项目人工翻译。
- 页面内容采用 Wikimedia 许可，但现代名言本身仍可能存在原始版权；界面需要保留作者、出处和 Wikiquote 来源链接。
- 如果以后要求“每次打开都从远程获得全新内容”，免费方案无法同时保证摄影专用、中文、稳定和准确。
