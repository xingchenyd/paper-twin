# 对页 · Paper Twin

面向英文论文的浏览器端英中对照阅读器。上传有文本层的 PDF 后，可以全文翻译，也可以双击查词、点击翻译句子或框选翻译段落；译文可原位对照、保存到当前浏览器并导出为中文 PDF。

- 在线使用：<https://xingchenyd.github.io/paper-twin/>
- 源码仓库：<https://github.com/xingchenyd/paper-twin>
- 部署方式：GitHub Pages，无自建服务器、数据库或付费域名

## 功能

- 英文原文与中文译文左右同页显示；纵向、横向滚动和 50%–250% 缩放均可双页联动。
- 鼠标移入句子时，两侧对应区域联动高亮。
- 双击英文单词，优先查询内置 ECDICT 英汉词典；查不到时调用翻译 API。
- 词典命中后可点击“AI 结合上下文”，让模型结合所在句子重新翻译。
- 点击识别出的句子，立即调用 API 翻译并写入当前论文。
- 点击“段落框选”后在左页拖出矩形，批量翻译区域内的句子。
- 全文翻译在独立 Web Worker 中分批执行，切换普通标签页或其他程序时仍可继续。
- 历史记录、阅读页码和译文保存在当前浏览器。
- 支持导出中文 PDF 和完整 JSON 备份，并在另一浏览器导入恢复。
- 支持 OpenAI 兼容的 `/models` 与 `/chat/completions` 接口。

## 使用方法

1. 打开在线网页，点击“翻译设置”。
2. 填写 API 基础地址、API Key 和模型 ID。也可以点击“获取模型”。
3. 上传 PDF。首次解析完成后会进入左右对照阅读页。
4. 根据需要选择操作：
   - 双击单词：查询本地词典，不要求 API Key；
   - 点击句子：通过 API 翻译该句；
   - 点击“段落框选”：在英文页拖出矩形，翻译其中的完整句子；
   - 点击“开始翻译”：翻译整篇论文。
5. 通过“下载中文 PDF”保存阅读结果，或通过“导出备份”保存可恢复的完整记录。

阅读器工具栏中的 `− / 百分比 / ＋` 会同时缩放两页；点击百分比恢复到 100%。开启“同步滚动”后，两页在放大状态下也会同步横向位置。

句子和段落译文会写入论文记录，并可进入最终 PDF。单词词典结果只显示在当前页面，不写入论文数据库。

## 词典

项目使用 [ECDICT](https://github.com/skywind3000/ECDICT) 的英汉数据，许可证为 MIT。构建源固定在提交 `bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b`，源 CSV 的 SHA-256 为：

```text
1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf
```

发布版本保留单词、音标、中文释义和词性，共 400,847 个英文单词，生成 699 个按字母分片的 JSON 文件。全部分片约 26.3 MB，但浏览器查一个单词时只请求对应分片，通常不会下载整个词库。分片由普通 HTTP 缓存管理，可由浏览器自动回收。

词典只处理单词。句子、段落和全文仍使用用户配置的 API。词形变化会尝试复数、所有格、`-ed` 和 `-ing` 等常见还原；专业术语可使用“AI 结合上下文”。

词典许可证副本位于 `site/dictionary/ECDICT-LICENSE.txt`，第三方组件清单位于 `site/THIRD-PARTY.md`。

## API 兼容要求

请求使用 Bearer API Key，模型需兼容以下接口：

```http
GET  /models
POST /chat/completions
```

非流式翻译响应需包含 `choices[0].message.content`。网页要求模型按照提示返回一个以句子 ID 为键的 JSON 对象。模型 ID 通常必须填写；服务不提供 `/models` 时可以手动输入。

API 服务必须允许网页来源 `https://xingchenyd.github.io` 的 CORS 请求，包括：

- 无鉴权的 `OPTIONS` 预检；
- `Authorization` 和 `Content-Type` 请求头；
- `GET /models`；
- `POST /chat/completions`。

`127.0.0.1` 和 `localhost` 指每位访问者自己的电脑。本机 API 代理需要保持运行，并允许浏览器访问本地网络。公网 API 应使用 HTTPS。

默认同时翻译 2 批，每批最多 20 个片段、约 6,000 个字符。可以在设置中把并发调整为 1–4；接口频繁限流时使用 1。停止、网络错误或 HTTP 503 不会删除已经保存的批次。

## 数据、内存与缓存

| 内容 | 保存位置 | 生命周期 |
| --- | --- | --- |
| 原始 PDF、副本译文、句子坐标、阅读页码 | IndexedDB：`paper-twin-browser/documents` | 删除论文记录或清除网站数据前一直保留 |
| API 地址、模型和并发数 | `localStorage` | 清除网站数据前保留 |
| API Key | 当前页面内存 | 刷新或关闭页面后消失 |
| 当前 PDF、PDF.js 状态和画布 | 运行内存 | 刷新或关闭标签页后由浏览器释放 |
| ECDICT 分片、脚本、字体 | 浏览器 HTTP 缓存 | 由浏览器管理，可自动回收或手动清除 |
| 单词查询结果 | 当前页面内存 | 刷新或关闭页面后消失 |

在 Edge 或 Chrome 中按 `F12`，进入“应用程序 / Application”，可以查看 IndexedDB 和 Local Storage；词典分片请求可在“网络 / Network”面板查看。浏览器的网站设置也会显示 `xingchenyd.github.io` 的网站数据占用。

在历史记录中删除一篇论文，会删除网页 IndexedDB 中该论文的 PDF 副本、译文、坐标和阅读进度，但不会删除电脑原有的 PDF、下载目录中的中文 PDF 或已经导出的 JSON 备份。浏览器数据库文件可能稍后才进行磁盘压缩。

清理方式：

- 释放运行内存：刷新或关闭网页；
- 删除一篇论文：历史记录 → 删除记录；
- 删除所有论文、设置和网站缓存：浏览器网站设置 → 清除 `xingchenyd.github.io` 的网站数据；
- 清除词典和程序的 HTTP 缓存：使用浏览器“清除浏览数据”中的“缓存的图片和文件”；
- 清除全部网站数据前应先导出需要保留的论文备份。

## 隐私与安全

- PDF 的浏览器副本和历史记录不会上传到本项目的服务器，因为项目没有应用服务器。
- 只有需要翻译的文本会发送到用户填写的 API 服务。
- API Key 不保存到 IndexedDB、Local Storage、备份文件或 GitHub。
- JSON 备份包含原始 PDF、译文和对应关系，应按论文文件本身的敏感程度保管。
- 中文 PDF 使用白色区域覆盖原文并绘制译文，原始英文文字可能仍存在于 PDF 底层；它不是保密涂黑工具。

## PDF 支持范围

- 最大 60 MB、150 页；
- 需要可提取的文本层，扫描图片 PDF 暂不支持 OCR；
- 旋转页面暂不支持原位导出；
- 双栏正文使用页面空隙和行位置进行识别，并修复常见行末断词；
- 译文按原句的实际行框自适应排版，不跨入相邻正文、公式或表格单元格；同一段的已完成句子会连续排入可用行框；
- 单句排版失败不会再导致整段恢复成英文；下载按钮会在所有已识别正文翻译完成后启用，并在导出时报告仍无法安全排入的句子数；
- 数学符号、公式密集区域、复杂图表、算法、表格和参考文献可能保留英文；
- PDF.js 提供的是文本片段和估算坐标，特殊字体或复杂排版不能保证完全还原；
- 译文无法安全排入原区域时，页面保留原文，完整译文仍可在结果卡片查看。

排版思路参考了 [BabelDOC](https://github.com/funstory-ai/BabelDOC)，但本项目保持纯静态浏览器架构，没有嵌入其 Python 运行时。

## 本地开发

最终用户不需要安装任何程序。仓库开发和测试可使用 Node.js 与任意静态文件服务器：

```bash
npm install
npm test
python -m http.server 8768 --directory site
```

然后打开 `http://127.0.0.1:8768/`。不要直接双击 `index.html`，浏览器会限制模块、PDF Worker 和词典分片加载。

主要目录：

```text
site/                       公网页面
site/app.js                 阅读器交互与局部翻译
site/pdf-engine.js          PDF 解析、渲染与导出
site/text-layout.js         分栏、段落和断词识别
site/translation-worker.js  全文后台翻译
site/dictionary.js          浏览器词典查询
site/dictionary/ecdict/     生成后的词典分片
scripts/build-dictionary.py 词典构建脚本
```

重新构建词典时，先取得 README 中固定提交的 `ecdict.csv`，再执行：

```bash
python scripts/build-dictionary.py /path/to/ecdict.csv site/dictionary/ecdict
```

脚本会校验源文件 SHA-256，不匹配时停止，避免无意发布来源不明的数据。

## 部署

推送到 `main` 后，`.github/workflows/pages.yml` 会发布 `site/` 到 GitHub Pages。网页完全静态，不需要云端数据库、服务器环境变量或域名。GitHub Pages 中应将 Source 设置为 GitHub Actions。

## 验证

当前回归检查覆盖：

- 双栏分离与 `trans-port` 等行末断词；
- 句子对应高亮；
- 全文翻译的后台执行、停止、恢复和逐批保存；
- 双击词典查询、AI 语境翻译、单句翻译和段落框选；
- 中文 PDF 导出、备份恢复以及 API Key 不进入备份；
- 译文行框不越界、部分句子缺失时逐句回退，以及双页 50%–250% 联动缩放；
- 独立浏览器配置之间的历史隔离。

## 第三方许可证

PDF.js、PDF-lib、fontkit、Noto 字体和 ECDICT 的许可证及来源见 `site/THIRD-PARTY.md`。本仓库自身代码尚未单独声明开源许可证；如需允许他人复制、修改和再发布，应由仓库所有者选择并添加项目许可证。
