# JHELIX（词旋）架构说明

by J. Helix（JH）

本文描述进程模型、HTTP 接口、前端模块、学习状态与数据管线，方便二次开发或替换词库。

## 1. 设计目标

- **离线**：运行时不访问互联网，不依赖 CDN、字体服务或第三方 API。
- **零运行时依赖**：只用 Python 标准库起服务；前端不引入框架和构建工具。
- **单实例**：重复双击图标只复用已有服务，避免多个后台进程和端口漂移。
- **可退出**：窗口关闭后通过心跳看门狗自动结束服务，不留孤儿进程。
- **数据可控**：学习记录留在本机，可导出 / 导入 JSON。
- **易替换**：词库是普通 JSON，构建脚本只做确定性清洗。

明确不追求：账号体系、云同步、移动端、打包 exe、复杂推荐算法。

## 2. 进程模型

```text
pythonw.exe app.py
        │
        ├─ probe_existing()          探测 47840-47879 上的已有实例
        │      └─ 命中：打开新窗口 → 退出
        │
        ├─ bind_server()             找第一个空闲端口
        ├─ ThreadingHTTPServer       只绑定 127.0.0.1
        ├─ open_window()             启动 Edge --app（或默认浏览器）
        └─ watchdog()                心跳看门狗
```

### 启动流程

1. `probe_existing()` 遍历 `47840-47879`，请求 `GET /api/info`。
2. 通过响应头 `X-Jhelix-App: 1` 和响应体 `app === "jhelix-cet4"` 双重确认身份。
3. 命中已有实例时，只打开指向该端口的窗口，当前进程直接退出。
4. 未命中时，先用 `port_in_use()` 做一次连接探测，再绑定端口。Windows 上仅设置 `SO_REUSEADDR` 会让多个进程绑定同一端口，因此必须预检。
5. 服务启动后 0.45 秒打开 Edge 应用窗口：

```text
msedge.exe
  --app=http://127.0.0.1:<port>/#/today
  --user-data-dir=<项目>/.runtime/edge-profile
  --window-size=1460,940
  --no-first-run
  --no-default-browser-check
  --disable-background-mode
```

使用独立 `user-data-dir`，避免污染用户日常浏览器配置，也让 `localStorage` 归属固定。

### 看门狗

| 条件 | 行为 |
| --- | --- |
| 启动后 90 秒内没有任何客户端心跳 | 退出 |
| 已见过客户端，但 120 秒没有新心跳 | 退出（窗口大概率已关闭） |
| 前端调用 `POST /api/exit` | 0.7 秒后退出 |
| `Ctrl+C` / 进程终止 | `finally` 中关闭 server socket |

前端每 3 秒 `POST /api/beat`，页面重新可见时额外补一次。心跳只用于生命周期判断，不携带学习数据。

## 3. HTTP API

服务只监听回环地址，接口同时接受中文和 ASCII 路径。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/info`、`/api/信息` | 应用标识、版本、PID、端口、词数、心跳状态 |
| `POST` | `/api/beat`、`/api/心跳` | 刷新心跳时间 |
| `POST` | `/api/exit`、`/api/退出` | 安排服务退出 |
| `POST` | `/api/open-dir`、`/api/打开目录` | 用资源管理器打开项目目录 |
| `GET` | 其他路径 | 从 `ui/` 读取静态文件 |

`/api/info` 响应示例：

```json
{
  "app": "jhelix-cet4",
  "name": "JHELIX",
  "version": "1.0.0",
  "pid": 12345,
  "port": 47840,
  "startedAt": 1762500000000,
  "words": 752,
  "heartbeatTimeout": 120,
  "clientSeen": true,
  "lastBeat": 1762500012000
}
```

所有 API 响应都带 `Cache-Control: no-store`。静态资源同样不缓存，避免开发时改文件后看到旧版本。

## 4. 静态文件与安全边界

`_serve_static()` 的处理顺序：

1. URL 解码，统一 `/`，去掉前导斜杠；
2. `(UI_DIR / rel).resolve()` 得到真实路径；
3. 校验目标等于 `UI_DIR` 或位于 `UI_DIR` 之下，否则返回 403；
4. 目录补 `index.html`；无扩展名且不存在时回退到 `index.html`（支持 hash 路由刷新）；
5. 按扩展名返回 MIME，读取失败返回 500。

因此 `../`、编码后的路径穿越、指向 `ui/` 之外的符号链接都会被拒绝。

其他边界：

- 没有认证机制。服务只绑定 `127.0.0.1`，安全模型是“本机单用户”。
- 前端只请求同源 `/api/*` 和 `data/words.json`，不加载远程资源。
- 朗读使用浏览器 `speechSynthesis`，不调用云 TTS。
- 导入学习数据时只接受本应用导出的 JSON 结构，导入前有二次确认。

### 4.1 静态在线版

`ui/` 可以原样部署到任意静态托管。GitHub 仓库里的 `.github/workflows/pages.yml` 会把 `ui/` 发布到 GitHub Pages。

启动时前端请求一次 `/api/info`：

- 本机 `app.py` 返回 `app = "jhelix-cet4"`，进入桌面模式，启动心跳与退出按钮；
- 静态托管返回 404 或 HTML，进入在线模式，跳过心跳，隐藏“退出软件”和“打开程序目录”。

两种模式共用同一套界面和 `localStorage`，区别只在窗口外壳。在线版没有服务端，刷新页面不会丢进度，但清理浏览器数据会丢。

## 5. 前端模块

| 文件 | 职责 |
| --- | --- |
| `ui/index.html` | 应用外壳、侧栏、顶栏、根节点、45 个 SVG 图标符号 |
| `ui/css/app.css` | CSS 变量主题、布局、卡片、闪卡、图表、弹窗、响应式 |
| `ui/js/util.js` | `CV` 命名空间、DOM 选择器、转义、图标、日期、Toast、弹窗、朗读、下载、彩带 |
| `ui/js/store.js` | `localStorage` 状态、复习调度、统计、等级、成就、导入导出 |
| `ui/js/data.js` | 加载词库、建立索引、搜索、随机词、词族、形近词 |
| `ui/js/pages.js` | 11 个板块的渲染与交互、单词详情弹窗 |
| `ui/js/app.js` | hash 路由、导航、顶栏状态、全局事件委托、快捷键、心跳 |

脚本按 `util → store → data → pages → app` 顺序加载，全部挂在全局 `CV` 上，不使用 ES Module，避免 `file://` 和旧浏览器限制。

### 路由

- 路由格式：`#/<page>?key=value`
- 未知页面回退到 `today`
- 页面函数签名：`CV.pages[page](params)`
- 页面切换时清空 `CV.pageKeys`，由当前页面注册自己的键盘处理

### 事件模型

- 侧栏、按钮等大量交互使用 `data-*` 属性 + 全局事件委托。
- 页面内部绑定的事件在每次 `render()` 时重新创建，不依赖手动解绑。
- 全局点击统一处理：朗读、收藏、单词详情、板块跳转。

## 6. 学习状态模型

存储键：`jhelix_cet4_state_v1`。旧版本的 `ciyue_cet4_state_v1` 会在首次加载时自动复制到新键，避免改名丢失进度。JSON 结构：

```json
{
  "version": 1,
  "createdAt": "2026-11-07T12:00:00.000Z",
  "settings": {
    "dailyGoal": 25,
    "autoSpeak": true,
    "rate": 0.9,
    "theme": "dark"
  },
  "reviews": {
    "w0001": {
      "seen": true,
      "first": 1762500000000,
      "last": 1762500300000,
      "due": 1762586400000,
      "streak": 2,
      "status": 1,
      "correct": 3,
      "wrong": 1,
      "starred": false
    }
  },
  "history": {
    "2026-11-07": {
      "learned": ["w0001"],
      "reviewed": 2,
      "total": 4,
      "correct": 3,
      "modes": {
        "flash": { "total": 2, "correct": 2 }
      }
    }
  },
  "totals": {
    "answers": 4,
    "correct": 3,
    "modes": {
      "flash": { "total": 2, "correct": 2 },
      "quiz": { "total": 2, "correct": 1 }
    }
  },
  "achievements": {
    "first": 1762500300000
  }
}
```

### 状态与调度

固定间隔表：

```js
INTERVALS = [0, 1, 3, 7, 15, 30, 60]  // 天
```

| 判定 | `streak` | `status` | 下次复习 |
| --- | --- | --- | --- |
| 认识 | `min(6, streak + 1)` | `min(3, max(1, ceil(streak / 2)))` | `now + INTERVALS[streak]` 天 |
| 模糊 | `max(1, streak - 1)` | `max(1, min(3, ceil(streak / 2)))` | 1 天后 |
| 不认识 | `0` | `1` | 10 分钟后 |

状态展示：`0` 新词、`1` 学习中、`2` 熟悉、`3` 掌握。

### 练习模式与调度

- 闪卡判定、单词详情页判定调用 `markWord()`，会推进上面的 SRS。
- 选择测验、拼写挑战、听音辨词调用 `recordAttempt()`，只累计正确率和每日历史；答错会把 `streak` 清零并把 `due` 提前到 10 分钟后，答对不额外推进间隔。
- 每日目标默认 25 词，今日计划优先安排到期复习，再补新词。
- 成就共 14 个，基于累计学习数、连续天数、正确率、收藏数、各模式答对数等条件计算。

## 7. 数据管线

```text
docx 段落
  │  去 BOM，逐行匹配 word [phonetic] definition
  ▼
原始行（word / phonetic / definition / raw）
  │  按小写 word 去重，保留首次出现
  ▼
词条
  │  POS_RE 拆分词性，POS_GROUP 归类
  │  brief() 去掉音标和词性，取前两个分号片段，截断 48 字
  ▼
ui/data/words.json
```

字段：

| 字段 | 说明 |
| --- | --- |
| `id` | `w0001` 形式的稳定序号 |
| `word` | 单词 |
| `phonetic` | 音标（不含方括号） |
| `definition` | 原始释义 |
| `brief` | 用于选项和卡片的短释义 |
| `pos` | 词性标记，如 `n.`、`vt.&vi.` |
| `posGroup` | 中文词性分组 |
| `letter` | 首字母大写 |
| `source` | 来源文件序号（从 1 开始） |
| `order` | 词库顺序 |

顶层还包含 `name`、`version`、`builtAt`、`sources`、`totalParsed`、`total`。

### 派生索引

前端加载后即时计算，不写回 JSON：

- **词族**：取单词小写字母串的 4–7 位前缀；同一前缀下有 2–9 个词时成组，按词数排序。
- **形近词**：首字母相同、长度差 ≤ 2、有界 Levenshtein 距离 ≤ 2，按距离排序，最多保留 6 个。
- **搜索**：依次匹配单词全等、前缀、包含、释义包含、音标包含，再按词序排序。

这些规则是启发式，不保证语言学上的词根准确性。

## 8. 测试

`tests/smoke_test.mjs` 使用浏览器 CDP 做端到端验证：

1. 读取 `ui/data/words.json` 得到期望词数；
2. 探测 `47840-47879`，找不到服务就启动 `python app.py --no-window`；
3. 启动 Edge/Chrome headless，使用临时 `user-data-dir`；
4. 通过 `Runtime.evaluate` 驱动真实 DOM：收藏、详情、翻卡、判定、刷新、测验、搜索、主题；
5. 遍历 11 个板块，检查是否渲染出错误卡片；
6. 收集 `Runtime.exceptionThrown` 和 `console.error`；
7. 关闭浏览器、结束自启动的服务、删除临时配置。

测试不使用 mock DOM，验证的是实际页面与真实 `localStorage`。

## 9. 扩展点

### 增加一个板块

1. 在 `ui/js/pages.js` 注册 `CV.pages.<name>`；
2. 在 `ui/js/app.js` 的 `PAGE_META` 和 `NAV_ORDER` 中登记；
3. 在 `ui/index.html` 侧栏加 `data-page="<name>"` 的导航项；
4. 如需独立快捷键，在页面函数内设置 `CV.pageKeys`。

### 增加一种练习

- 复用 `CV.openDeck(ids, label)` 进入自定义闪卡组；
- 用 `store.markWord()` 写入 SRS，或用 `store.recordAttempt()` 只记录正确率；
- 如需新成就，在 `store.js` 的 `ACHIEVEMENTS` 中追加检查函数。

### 换词库

```bash
python tools/build_data.py 新词表.docx --out ui/data/words.json
```

保持字段兼容即可，前端不需要改代码。

### 改端口

修改 `app.py` 的 `PORTS` 范围。前端不硬编码端口，所有请求都是同源相对路径。

## 10. 已知取舍

- **不打包 exe**：避免 Smart App Control、代码签名和杀毒误报；代价是需要本机 Python。
- **单实例但不加锁**：通过端口探测实现，极端并发双击时仍可能短暂竞争；预检已覆盖常见情况。
- **心跳退出**：如果浏览器标签被系统冻结超过 120 秒，服务会退出；桌面应用窗口通常不会触发。
- **无数据库**：`localStorage` 简单直接，但容量和跨设备能力有限。
- **练习模式不推进 SRS**：这是当前的产品选择，保证只有主动判定才改变复习计划。
- **词族 / 形近词是启发式**：适合作为记忆提示，不适合作为词源结论。
