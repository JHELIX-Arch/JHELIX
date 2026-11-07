#!/usr/bin/env node
/* JHELIX · 交互冒烟测试（Edge/Chrome headless + CDP，无第三方依赖）
 *
 * 用法：
 *   node tests/smoke_test.mjs
 *   JHELIX_BASE=http://127.0.0.1:47840 node tests/smoke_test.mjs
 *   EDGE_PATH="C:\\...\\msedge.exe" node tests/smoke_test.mjs
 *
 * 若本地服务未启动，脚本会用 `python app.py --no-window` 自动拉起；
 * 也可先手动启动服务，再用 JHELIX_BASE 指定地址。需要 Node 22+。
 */

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const META = JSON.parse(readFileSync(join(ROOT, "ui", "data", "words.json"), "utf8"));
const EXPECTED = META.total || META.words.length;
const CDP_PORT = Number(process.env.JHELIX_CDP_PORT) || 9333;
const PROFILE = mkdtempSync(join(tmpdir(), "jhelix-smoke-"));
const PORT_START = 47840;
const PORT_END = 47879;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findBrowser() {
  if (process.env.EDGE_PATH && existsSync(process.env.EDGE_PATH)) return process.env.EDGE_PATH;
  const roots = ["ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA"]
    .map((key) => process.env[key])
    .filter(Boolean);
  const candidates = [];
  for (const root of roots) {
    candidates.push(join(root, "Microsoft", "Edge", "Application", "msedge.exe"));
    candidates.push(join(root, "Google", "Chrome", "Application", "chrome.exe"));
  }
  candidates.push(
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  );
  return candidates.find(existsSync);
}

async function probe(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/info`, {
      headers: { "X-Jhelix-Probe": "1" },
      signal: AbortSignal.timeout(400),
    });
    if (!res.ok) return null;
    const info = await res.json();
    return info.app === "jhelix-cet4" ? `http://127.0.0.1:${port}` : null;
  } catch {
    return null;
  }
}

async function discoverBase() {
  if (process.env.JHELIX_BASE) return process.env.JHELIX_BASE.replace(/\/$/, "");
  for (let port = PORT_START; port <= PORT_END; port++) {
    const base = await probe(port);
    if (base) return base;
  }
  return null;
}

let serverProc = null;

async function ensureServer() {
  let base = await discoverBase();
  if (base) {
    console.log("使用已运行的服务：", base);
    return base;
  }
  if (process.env.JHELIX_BASE) {
    throw new Error("JHELIX_BASE 指向的服务不可用：" + process.env.JHELIX_BASE);
  }

  const python = process.env.PYTHON || "python";
  console.log("未发现本地服务，正在启动：", python, "app.py --no-window");
  serverProc = spawn(python, [join(ROOT, "app.py"), "--no-window"], {
    cwd: ROOT,
    stdio: "ignore",
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });

  for (let i = 0; i < 120; i++) {
    await sleep(250);
    base = await discoverBase();
    if (base) return base;
    if (serverProc.exitCode !== null) break;
  }
  throw new Error("本地服务没有在 30 秒内启动，请手动运行：python app.py --no-window");
}

const BROWSER = findBrowser();
if (!BROWSER) {
  console.error("找不到 Edge/Chrome。请设置 EDGE_PATH 指向浏览器可执行文件。");
  process.exit(1);
}

const edge = spawn(
  BROWSER,
  [
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    "--no-first-run",
    "--remote-allow-origins=*",
    "--remote-debugging-port=" + CDP_PORT,
    "--user-data-dir=" + PROFILE,
    "--window-size=1440,900",
    "about:blank",
  ],
  { stdio: "ignore", windowsHide: true }
);

async function waitVersion() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (r.ok) return await r.json();
    } catch {}
    await sleep(100);
  }
  throw new Error("浏览器调试端口没有就绪");
}

async function newTarget(url) {
  let r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
  if (!r.ok) r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(url)}`);
  if (!r.ok) throw new Error("创建页面失败 " + r.status);
  return await r.json();
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.events = new Map();
    this.consoleErrors = [];
    this.exceptions = [];
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
        return;
      }
      if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
        this.consoleErrors.push(msg.params.args.map((a) => a.value || a.description || "").join(" "));
      }
      if (msg.method === "Runtime.exceptionThrown") {
        this.exceptions.push(msg.params.exceptionDetails.text || "exception");
      }
      const list = this.events.get(msg.method);
      if (list) list.splice(0).forEach((fn) => fn(msg.params));
    };
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  once(method, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const list = this.events.get(method) || [];
      const timer = setTimeout(() => reject(new Error("等待事件超时: " + method)), timeout);
      list.push((params) => {
        clearTimeout(timer);
        resolve(params);
      });
      this.events.set(method, list);
    });
  }

  async eval(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error("页面脚本错误: " + (res.exceptionDetails.exception?.description || res.exceptionDetails.text));
    }
    return res.result.value;
  }

  async waitFor(expression, timeout = 8000, label) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        if (await this.eval(expression)) return true;
      } catch {}
      await sleep(120);
    }
    throw new Error("等待超时: " + (label || expression));
  }
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? "PASS  " : "FAIL  ") + name + (detail ? "  [" + detail + "]" : ""));
}

let cdp;
try {
  const base = await ensureServer();
  await waitVersion();
  const target = await newTarget(base + "/#/today");
  cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  await cdp.send("Page.navigate", { url: base + "/#/today" });
  await sleep(1200);
  await cdp.waitFor(`window.CV && CV.words && CV.words.length === ${EXPECTED}`, 10000, "词库加载");

  check(`词库加载 ${EXPECTED} 词`, true);
  check(
    "品牌与开发者署名",
    await cdp.eval(
      "document.querySelector('.brand__copy b')?.textContent === 'JHELIX' && document.querySelector('meta[name=author]')?.content === 'J. Helix'"
    )
  );
  check("11 个导航板块", (await cdp.eval("document.querySelectorAll('.nav__item').length")) === 11);
  check(
    "零徽章隐藏",
    await cdp.eval("getComputedStyle(document.querySelector('#nav-due')).display === 'none' && getComputedStyle(document.querySelector('#nav-star')).display === 'none'")
  );
  check("今日页标题", (await cdp.eval("document.querySelector('.page-head h1')?.textContent.includes('把词库')")) === true);

  // 词库：收藏第一个词
  await cdp.eval("location.hash='#/library'");
  await cdp.waitFor("document.querySelectorAll('#view .word-row').length > 0", 6000, "词库渲染");
  const rowCount = await cdp.eval("document.querySelectorAll('#view .word-row').length");
  check("词库分页 60 行", rowCount === 60, String(rowCount));
  await cdp.eval("document.querySelector('.word-row [data-star]').click()");
  await cdp.waitFor("document.querySelector('#nav-star').textContent === '1' && !document.querySelector('#nav-star').hidden", 4000, "收藏后徽章");
  check("点星收藏并更新徽章", true);

  // 打开单词详情
  await cdp.eval("document.querySelector('.word-row').click()");
  await cdp.waitFor("!document.querySelector('#modal-root').hidden", 3000, "详情弹窗");
  const modalWord = await cdp.eval("document.querySelector('.detail__word')?.textContent");
  check("单词详情弹窗", !!modalWord, modalWord);
  await cdp.eval("document.querySelector('[data-modal-close]').click()");

  // 生词本出现 1 个词
  await cdp.eval("location.hash='#/starred'");
  await cdp.waitFor("document.querySelectorAll('#star-list .word-row').length === 1", 5000, "生词本");
  check("生词本同步收藏", true);
  await cdp.eval("document.querySelector('#star-list .word-row [data-star]').click()");
  await cdp.waitFor("document.querySelectorAll('#star-list .word-row').length === 0", 5000, "取消收藏");
  check("生词本内取消收藏", true);

  // 闪卡翻面
  await cdp.eval("location.hash='#/flashcards'");
  await cdp.waitFor("!!document.querySelector('#flashcard')", 6000, "闪卡渲染");
  await cdp.eval("document.querySelector('#flashcard').click()");
  await cdp.waitFor("document.querySelector('#flashcard').classList.contains('is-flipped')", 3000, "闪卡翻面");
  check("闪卡点击翻面", true);
  const backHasDef = await cdp.eval("document.querySelector('#flashcard .flash-face--back .flash-def')?.textContent.length > 0");
  check("闪卡背面有释义", backHasDef);
  await cdp.eval("document.querySelector('#flashcard [data-judge=\"know\"]').click()");
  await cdp.waitFor("CV.store.computeStats().learned >= 1", 4000, "闪卡判定写入");
  check("闪卡判定写入进度", true);
  const dueOk = await cdp.eval("Object.values(CV.store.rawState().reviews).some(r => r.seen && r.due > Date.now())");
  check("复习间隔已安排", dueOk);

  await cdp.send("Page.reload");
  await cdp.waitFor(`window.CV && CV.words && CV.words.length === ${EXPECTED}`, 10000, "刷新后加载");
  const learnedAfterReload = await cdp.eval("CV.store.computeStats().learned");
  check("刷新后进度保留", learnedAfterReload >= 1, String(learnedAfterReload));

  // 测验开始与作答
  await cdp.eval("location.hash='#/quiz'");
  await cdp.waitFor("!!document.querySelector('#quiz-start')", 6000, "测验设置");
  await cdp.eval("document.querySelector('#quiz-start').click()");
  await cdp.waitFor("document.querySelectorAll('#quiz-options .quiz-option').length === 4", 6000, "测验题目");
  check("测验生成 4 个选项", true);
  await cdp.eval("document.querySelector('#quiz-options .quiz-option').click()");
  await cdp.waitFor("!!document.querySelector('#quiz-feedback') && !document.querySelector('#quiz-feedback').hidden", 4000, "答题反馈");
  check("测验即时反馈", true);

  // 搜索
  await cdp.eval("location.hash='#/today'");
  await sleep(400);
  await cdp.eval("const i=document.querySelector('#global-search'); i.value='act'; i.dispatchEvent(new Event('input',{bubbles:true}));");
  await cdp.waitFor("document.querySelectorAll('#search-pop .search-hit').length > 0", 4000, "搜索下拉");
  check("全局搜索下拉", true);

  // 主题切换
  await cdp.eval("document.querySelector('#theme-toggle').click()");
  await cdp.waitFor("document.documentElement.dataset.theme === 'light'", 2000, "浅色主题");
  check("主题切换浅色", true);
  await cdp.eval("document.querySelector('#theme-toggle').click()");

  // 全部 11 个板块渲染
  const pages = ["today", "flashcards", "quiz", "spelling", "listening", "library", "families", "starred", "stats", "achievements", "settings"];
  for (const page of pages) {
    await cdp.eval(`location.hash='#/${page}'`);
    await cdp.waitFor("document.querySelector('#view').children.length > 0", 5000, page + " 渲染");
    const bad = await cdp.eval("!!document.querySelector('#view .error-card')");
    check("板块渲染 · " + page, !bad, bad ? "error-card" : "");
  }

  check("无运行时异常", cdp.exceptions.length === 0, cdp.exceptions.join(" | "));
  check("无 console.error", cdp.consoleErrors.length === 0, cdp.consoleErrors.join(" | "));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 通过`);
  process.exitCode = failed.length ? 1 : 0;
  await cdp.send("Browser.close").catch(() => {});
} catch (err) {
  console.error("SMOKE ERROR:", err.message);
  process.exitCode = 1;
  try {
    if (cdp) await cdp.send("Browser.close");
  } catch {}
} finally {
  setTimeout(() => {
    try {
      edge.kill();
    } catch {}
    if (serverProc) {
      try {
        serverProc.kill();
      } catch {}
    }
    try {
      rmSync(PROFILE, { recursive: true, force: true });
    } catch {}
    process.exit(process.exitCode || 0);
  }, 800);
}
