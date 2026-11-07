/* JHELIX · 通用工具（无第三方依赖） */
(function () {
  "use strict";

  const CV = (window.CV = window.CV || {});
  const DAY = 86400000;
  const MIN = 60000;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function attr(value) {
    return esc(value).replace(/`/g, "&#96;");
  }

  function icon(name, cls) {
    return `<svg class="ico ${cls || ""}" aria-hidden="true"><use href="#i-${attr(name)}"></use></svg>`;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function shuffle(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function sample(list, n, excludeIds) {
    const skip = new Set(excludeIds || []);
    const pool = list.filter((x) => !skip.has(x.id));
    return shuffle(pool).slice(0, n);
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function dateKey(date) {
    const d = date || new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function todayKey() {
    return dateKey(new Date());
  }

  function addDays(date, n) {
    const d = new Date(date.getTime());
    d.setDate(d.getDate() + n);
    return d;
  }

  function startOfDay(date) {
    const d = new Date(date.getTime());
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function daysBetween(a, b) {
    return Math.round((startOfDay(a) - startOfDay(b)) / DAY);
  }

  function shortDate(key) {
    const parts = String(key).split("-");
    return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : key;
  }

  function weekdayCN(date) {
    return "日一二三四五六"[date.getDay()];
  }

  function fmtDuration(ms) {
    const sec = Math.max(0, Math.round(ms / 1000));
    if (sec < 60) return `${sec} 秒`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} 分 ${sec % 60} 秒`;
    return `${Math.floor(min / 60)} 小时 ${min % 60} 分`;
  }

  function debounce(fn, wait) {
    let timer = null;
    return function () {
      const args = arguments;
      const ctx = this;
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(ctx, args), wait || 220);
    };
  }

  let toastTimer = 0;
  function toast(message, type, ms) {
    const root = $("#toast-root");
    if (!root) return;
    const node = document.createElement("div");
    node.className = `toast toast--${type || "info"}`;
    node.innerHTML = `${icon(type === "success" ? "check" : type === "error" ? "x" : "info")}<span>${esc(message)}</span>`;
    root.appendChild(node);
    requestAnimationFrame(() => node.classList.add("is-on"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      node.classList.remove("is-on");
      setTimeout(() => node.remove(), 260);
    }, ms || 2400);
  }

  const synth = window.speechSynthesis;
  let voices = [];
  function refreshVoices() {
    if (!synth) return;
    try {
      voices = synth.getVoices() || [];
    } catch (err) {
      voices = [];
    }
  }
  if (synth) {
    refreshVoices();
    if (typeof synth.addEventListener === "function") synth.addEventListener("voiceschanged", refreshVoices);
    else synth.onvoiceschanged = refreshVoices;
  }

  function pickVoice() {
    if (!voices.length) refreshVoices();
    const en = voices.filter((v) => /^en([-_]|$)/i.test(v.lang || ""));
    const preferred = en.find((v) => /(aria|jenny|guy|zira|david|samantha|google us english)/i.test(v.name || ""));
    return preferred || en.find((v) => /en-US/i.test(v.lang || "")) || en[0] || null;
  }

  function speak(text, rate) {
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
      toast("当前环境不支持语音朗读", "error");
      return false;
    }
    try {
      synth.cancel();
      const utter = new SpeechSynthesisUtterance(String(text));
      utter.lang = "en-US";
      utter.rate = Number(rate || 0.9);
      utter.pitch = 1;
      const voice = pickVoice();
      if (voice) utter.voice = voice;
      synth.speak(utter);
      return true;
    } catch (err) {
      toast("朗读失败：" + err.message, "error");
      return false;
    }
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type: type || "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function readTextFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("读取失败"));
      reader.readAsText(file, "utf-8");
    });
  }

  function progressRing(percent, size, stroke, color) {
    const p = clamp(Number(percent) || 0, 0, 100);
    const s = size || 128;
    const w = stroke || 10;
    const r = (s - w) / 2;
    const c = 2 * Math.PI * r;
    const offset = c * (1 - p / 100);
    return `<svg class="ring" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" role="img" aria-label="完成度 ${Math.round(p)}%">
      <circle class="ring__track" cx="${s / 2}" cy="${s / 2}" r="${r}" fill="none" stroke-width="${w}"></circle>
      <circle class="ring__bar" cx="${s / 2}" cy="${s / 2}" r="${r}" fill="none" stroke-width="${w}"
        stroke="${color || "var(--lime)"}" stroke-linecap="round"
        stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"
        transform="rotate(-90 ${s / 2} ${s / 2})"></circle>
    </svg>`;
  }

  function modalOpen(html, onMount) {
    const root = $("#modal-root");
    if (!root) return;
    root.innerHTML = `<div class="modal-backdrop" data-modal-close></div><div class="modal" role="dialog" aria-modal="true">
      <button class="modal__close icon-btn" data-modal-close aria-label="关闭">${icon("close")}</button>
      ${html}
    </div>`;
    root.hidden = false;
    document.body.classList.add("is-modal");
    requestAnimationFrame(() => root.classList.add("is-on"));
    const close = () => modalClose();
    $$("[data-modal-close]", root).forEach((el) => el.addEventListener("click", close));
    setTimeout(() => {
      const focusable = $("button, input, select, textarea, a", root);
      if (focusable) focusable.focus();
    }, 60);
    if (typeof onMount === "function") onMount(root, close);
  }

  function modalClose() {
    const root = $("#modal-root");
    if (!root || root.hidden) return;
    root.classList.remove("is-on");
    setTimeout(() => {
      root.hidden = true;
      root.innerHTML = "";
      document.body.classList.remove("is-modal");
    }, 180);
  }

  function confirmBox(options) {
    const opts = options || {};
    return new Promise((resolve) => {
      modalOpen(
        `<div class="modal__head">
          <div class="modal__kicker">${esc(opts.kicker || "请确认")}</div>
          <h3>${esc(opts.title || "确定继续？")}</h3>
          <p>${esc(opts.message || "")}</p>
        </div>
        <div class="modal__actions">
          <button class="btn btn--ghost" data-cancel>${esc(opts.cancelText || "取消")}</button>
          <button class="btn ${opts.danger ? "btn--danger" : "btn--primary"}" data-ok>${esc(opts.okText || "确定")}</button>
        </div>`,
        (root, close) => {
          const finish = (value) => {
            close();
            resolve(value);
          };
          $("[data-cancel]", root).addEventListener("click", () => finish(false));
          $("[data-ok]", root).addEventListener("click", () => finish(true));
        }
      );
    });
  }

  function confetti(count) {
    const root = $("#confetti-root");
    if (!root) return;
    const colors = ["#c9f56a", "#5eead4", "#8b7cf6", "#ffb86b", "#ff6b81", "#ffffff"];
    const n = count || 70;
    for (let i = 0; i < n; i++) {
      const bit = document.createElement("i");
      bit.className = "confetti-bit";
      bit.style.left = `${Math.random() * 100}%`;
      bit.style.background = colors[i % colors.length];
      bit.style.width = `${4 + Math.random() * 7}px`;
      bit.style.height = `${6 + Math.random() * 10}px`;
      bit.style.animationDelay = `${Math.random() * 0.25}s`;
      bit.style.setProperty("--dx", `${(Math.random() - 0.5) * 260}px`);
      bit.style.setProperty("--rot", `${Math.random() * 720 - 360}deg`);
      root.appendChild(bit);
      setTimeout(() => bit.remove(), 1800);
    }
  }

  function emptyState(iconName, title, text, actionHTML) {
    return `<div class="empty">
      <div class="empty__ico">${icon(iconName || "book")}</div>
      <h3>${esc(title)}</h3>
      <p>${esc(text || "")}</p>
      ${actionHTML || ""}
    </div>`;
  }

  function statusMeta(status) {
    if (status === 2) return { label: "熟悉", cls: "is-familiar" };
    if (status === 3) return { label: "掌握", cls: "is-mastered" };
    if (status === 1) return { label: "学习中", cls: "is-learning" };
    return { label: "新词", cls: "is-new" };
  }

  function statCard(opts) {
    return `<article class="stat-card ${opts.tone || ""}" ${opts.action ? `data-go="${attr(opts.action)}"` : ""}>
      <div class="stat-card__top">
        <span class="stat-card__ico">${icon(opts.icon || "chart")}</span>
        ${opts.hint ? `<span class="stat-card__hint">${esc(opts.hint)}</span>` : ""}
      </div>
      <div class="stat-card__value">${opts.value}<small>${opts.unit || ""}</small></div>
      <div class="stat-card__label">${esc(opts.label || "")}</div>
      ${opts.sub ? `<div class="stat-card__sub">${opts.sub}</div>` : ""}
    </article>`;
  }

  CV.$ = $;
  CV.$$ = $$;
  CV.esc = esc;
  CV.attr = attr;
  CV.icon = icon;
  CV.clamp = clamp;
  CV.shuffle = shuffle;
  CV.sample = sample;
  CV.pick = pick;
  CV.dateKey = dateKey;
  CV.todayKey = todayKey;
  CV.addDays = addDays;
  CV.startOfDay = startOfDay;
  CV.daysBetween = daysBetween;
  CV.shortDate = shortDate;
  CV.weekdayCN = weekdayCN;
  CV.fmtDuration = fmtDuration;
  CV.debounce = debounce;
  CV.toast = toast;
  CV.speak = speak;
  CV.download = download;
  CV.readTextFile = readTextFile;
  CV.progressRing = progressRing;
  CV.modalOpen = modalOpen;
  CV.modalClose = modalClose;
  CV.confirmBox = confirmBox;
  CV.confetti = confetti;
  CV.emptyState = emptyState;
  CV.statusMeta = statusMeta;
  CV.statCard = statCard;
  CV.DAY = DAY;
  CV.MIN = MIN;
})();
