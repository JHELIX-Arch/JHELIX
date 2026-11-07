/* JHELIX · 路由、导航、搜索与全局交互 */
(function () {
  "use strict";

  const CV = window.CV;
  const $ = CV.$;
  const $$ = CV.$$;
  const icon = CV.icon;
  const store = CV.store;

  CV.isDesktop = false;

  const PAGE_META = {
    today: { title: "今日学习", nav: "today" },
    library: { title: "词库", nav: "library" },
    flashcards: { title: "闪卡速记", nav: "flashcards" },
    quiz: { title: "选择测验", nav: "quiz" },
    spelling: { title: "拼写挑战", nav: "spelling" },
    listening: { title: "听音辨词", nav: "listening" },
    families: { title: "词族图谱", nav: "families" },
    starred: { title: "生词本", nav: "starred" },
    stats: { title: "学习统计", nav: "stats" },
    achievements: { title: "成就徽章", nav: "achievements" },
    settings: { title: "设置与帮助", nav: "settings" },
  };

  const NAV_ORDER = ["today", "flashcards", "quiz", "spelling", "listening", "library", "families", "starred", "stats", "achievements", "settings"];

  function parseHash() {
    let raw = String(location.hash || "").replace(/^#\/?/, "");
    if (!raw) raw = "today";
    const [path, query] = raw.split("?");
    const params = {};
    if (query) {
      const usp = new URLSearchParams(query);
      usp.forEach((value, key) => {
        params[key] = value;
      });
    }
    const page = CV.pages[path] ? path : "today";
    return { page, params };
  }

  function applyTheme() {
    const settings = store.getSettings();
    document.documentElement.dataset.theme = settings.theme === "light" ? "light" : "dark";
    const btn = $("#theme-toggle");
    if (btn) {
      const dark = document.documentElement.dataset.theme !== "light";
      btn.innerHTML = icon(dark ? "sun" : "moon");
      btn.title = dark ? "切换到浅色" : "切换到深色";
    }
  }

  function updateChrome() {
    const s = store.computeStats();
    const plan = store.todayPlan(999);
    const pct = plan.goal ? Math.min(100, Math.round((plan.done / plan.goal) * 100)) : 0;

    const streak = $("#top-streak");
    if (streak) streak.innerHTML = `${icon("flame")}<b>${s.streak}</b><span>天</span>`;
    const level = $("#top-level");
    if (level) level.innerHTML = `${icon("bolt")}<b>Lv.${s.level.index}</b><span>${CV.esc(s.level.name)}</span>`;
    const today = $("#top-today");
    if (today) today.innerHTML = `${icon("clock")}<b>${plan.done}/${plan.goal}</b><span>今日</span>`;
    const dueBadge = $("#nav-due");
    if (dueBadge) {
      dueBadge.textContent = s.dueCount ? String(s.dueCount) : "";
      dueBadge.hidden = !s.dueCount;
    }
    const starBadge = $("#nav-star");
    if (starBadge) {
      starBadge.textContent = s.starred ? String(s.starred) : "";
      starBadge.hidden = !s.starred;
    }
    const sideGoalText = $("#side-goal-text");
    if (sideGoalText) sideGoalText.textContent = `${plan.done} / ${plan.goal}`;
    const sideGoalBar = $("#side-goal-bar");
    if (sideGoalBar) sideGoalBar.style.width = `${pct}%`;
    const sideStreak = $("#side-streak");
    if (sideStreak) sideStreak.textContent = `连续 ${s.streak} 天 · Lv.${s.level.index}`;
    const foot = $("#foot-meta");
    const version = (CV.meta && CV.meta.version) || "1.0.0";
    const surface = CV.isDesktop ? "" : "在线版 · ";
    if (foot) foot.textContent = `${surface}词库 ${CV.words.length} 词 · 已学 ${s.learned} · 已掌握 ${s.mastered} · v${version}`;
  }

  function updateNav(page) {
    $$(".nav__item").forEach((el) => {
      el.classList.toggle("is-on", el.dataset.page === page);
    });
  }

  function render() {
    const { page, params } = parseHash();
    CV.pageKeys = null;
    updateNav(page);
    const meta = PAGE_META[page] || PAGE_META.today;
    document.title = `${meta.title} · JHELIX`;

    const root = $("#view");
    if (!root) return;
    try {
      CV.pages[page](params);
    } catch (err) {
      console.error(err);
      root.innerHTML = `<section class="card card--pad error-card">
        <div class="kicker">ERROR</div>
        <h2>这个页面出了点问题</h2>
        <p>${CV.esc(err && err.message ? err.message : String(err))}</p>
        <button class="btn btn--primary" data-go="#/today">${icon("home")}回今日学习</button>
      </section>`;
    }
    root.classList.remove("is-enter");
    void root.offsetWidth;
    root.classList.add("is-enter");
    updateChrome();
    window.scrollTo({ top: 0, behavior: "auto" });
    closeSearch();
  }

  // ---------------------------------------------------------------- 搜索

  function closeSearch() {
    const pop = $("#search-pop");
    if (pop) {
      pop.hidden = true;
      pop.innerHTML = "";
    }
  }

  function showSearch(query) {
    const pop = $("#search-pop");
    if (!pop) return;
    const q = String(query || "").trim();
    if (!q) return closeSearch();
    const rows = CV.searchWords(q, 8);
    if (!rows.length) {
      pop.hidden = false;
      pop.innerHTML = `<div class="search-pop__empty">没有找到“${CV.esc(q)}”，换个关键词试试。</div>`;
      return;
    }
    pop.hidden = false;
    pop.innerHTML = rows
      .map(
        (w) => `<button class="search-hit" data-word="${CV.attr(w.id)}">
          <span class="search-hit__word">${CV.esc(w.word)}</span>
          <span class="search-hit__ph">/${CV.esc(w.phonetic)}/</span>
          <span class="search-hit__def">${CV.esc(w.brief)}</span>
          <span class="search-hit__arrow">${icon("chevron")}</span>
        </button>`
      )
      .join("");
  }

  // ---------------------------------------------------------------- 全局事件

  let lastStarRefresh = 0;

  function bindGlobal() {
    document.addEventListener("click", (e) => {
      const star = e.target.closest("[data-star]");
      if (star) {
        e.preventDefault();
        e.stopPropagation();
        const id = star.dataset.star;
        const on = store.toggleStar(id);
        $$(`[data-star="${id}"]`).forEach((btn) => btn.classList.toggle("is-on", on));
        CV.toast(on ? "已加入生词本" : "已移出生词本", "success", 1600);
        const { page } = parseHash();
        if (page === "starred") {
          const now = Date.now();
          if (now - lastStarRefresh > 500) {
            lastStarRefresh = now;
            setTimeout(() => {
              if (parseHash().page === "starred") render();
            }, 320);
          }
        }
        updateChrome();
        return;
      }

      const speakBtn = e.target.closest("[data-speak-slow]");
      if (speakBtn) {
        e.preventDefault();
        CV.speak(speakBtn.dataset.speakSlow, 0.65);
        return;
      }
      const speak = e.target.closest("[data-speak]");
      if (speak) {
        e.preventDefault();
        CV.speak(speak.dataset.speak, store.getSettings().rate);
        return;
      }

      const word = e.target.closest("[data-word]");
      if (word) {
        e.preventDefault();
        CV.openWord(word.dataset.word);
        return;
      }

      const random = e.target.closest("[data-random-word]");
      if (random) {
        const w = CV.randomWord();
        if (w) CV.openWord(w.id);
        return;
      }

      const openDeckBtn = e.target.closest("[data-open-deck]");
      if (openDeckBtn) {
        const key = openDeckBtn.dataset.openDeck;
        location.hash = `#/flashcards?deck=${encodeURIComponent(key)}`;
        return;
      }

      const go = e.target.closest("[data-go]");
      if (go) {
        e.preventDefault();
        const target = String(go.dataset.go || "");
        if (target.startsWith("#/")) location.hash = target;
        else if (target.startsWith("/")) location.hash = `#${target}`;
        return;
      }

      const pageBtn = e.target.closest("[data-page]");
      if (pageBtn) {
        e.preventDefault();
        location.hash = `#/${pageBtn.dataset.page}`;
      }
    });

    document.addEventListener("keydown", (e) => {
      const modal = $("#modal-root");
      const modalOpen = modal && !modal.hidden;
      if (e.key === "Escape") {
        if (modalOpen) {
          CV.modalClose();
          return;
        }
        closeSearch();
        return;
      }
      if (modalOpen) return;

      const typing = e.target.matches("input, textarea, select, [contenteditable=true]");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const input = $("#global-search");
        if (input) {
          input.focus();
          input.select();
        }
        return;
      }
      if (typing) return;

      if (e.altKey && /^[0-9]$/.test(e.key)) {
        e.preventDefault();
        const idx = Number(e.key);
        const page = idx === 0 ? "settings" : NAV_ORDER[idx - 1];
        if (page) location.hash = `#/${page}`;
        return;
      }
      if (e.key === "/" && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const input = $("#global-search");
        if (input) input.focus();
        return;
      }
      if (typeof CV.pageKeys === "function") CV.pageKeys(e);
    });

    const search = $("#global-search");
    if (search) {
      search.addEventListener(
        "input",
        CV.debounce(() => showSearch(search.value), 120)
      );
      search.addEventListener("focus", () => showSearch(search.value));
      search.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const q = search.value.trim();
          closeSearch();
          location.hash = q ? `#/library?q=${encodeURIComponent(q)}` : "#/library";
        } else if (e.key === "Escape") {
          closeSearch();
          search.blur();
        }
      });
    }
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".topbar__search")) closeSearch();
    });

    const themeBtn = $("#theme-toggle");
    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        const current = store.getSettings().theme;
        const next = current === "light" ? "dark" : "light";
        store.setSetting("theme", next);
        applyTheme();
      });
    }

    const sideExit = $("#side-exit");
    if (sideExit && CV.isDesktop) {
      sideExit.addEventListener("click", async () => {
        const ok = await CV.confirmBox({
          title: "退出 JHELIX？",
          message: "学习记录会自动保存。下次从桌面图标重新打开即可。",
          okText: "退出",
        });
        if (!ok) return;
        try {
          await fetch("/api/exit", { method: "POST" });
        } catch (err) {
          // expected
        }
        setTimeout(() => {
          document.body.innerHTML = `<div class="bye"><div class="bye__mark">JH</div><h1>已退出</h1><p>可以直接关闭这个窗口。</p></div>`;
        }, 350);
      });
    }

    window.addEventListener("hashchange", render);
  }

  // ---------------------------------------------------------------- 心跳

  function startHeartbeat() {
    const beat = () => fetch("/api/beat", { method: "POST", cache: "no-store" }).catch(() => {});
    beat();
    setInterval(beat, 3000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) beat();
    });
  }

  // ---------------------------------------------------------------- 启动

  async function detectDesktop() {
    try {
      const res = await fetch("/api/info", {
        cache: "no-store",
        signal: AbortSignal.timeout(1200),
      });
      if (!res.ok) return false;
      const info = await res.json();
      return !!info && info.app === "jhelix-cet4";
    } catch (err) {
      return false;
    }
  }

  async function boot() {
    applyTheme();
    CV.isDesktop = await detectDesktop();
    document.body.classList.toggle("is-web", !CV.isDesktop);
    bindGlobal();
    if (CV.isDesktop) startHeartbeat();
    try {
      const meta = await CV.loadData();
      const footer = $("#foot-meta");
      if (footer) footer.textContent = `${CV.isDesktop ? "" : "在线版 · "}词库 ${meta.total} 词 · v${meta.version || "1.0.0"}`;
      render();
    } catch (err) {
      console.error(err);
      $("#view").innerHTML = `<section class="card card--pad error-card">
        <div class="kicker">LOAD ERROR</div>
        <h2>词库没有加载成功</h2>
        <p>${CV.esc(err.message || String(err))}</p>
        <p class="muted">请确认 ui/data/words.json 存在；如果通过桌面图标启动，请重新打开一次。</p>
        <button class="btn btn--primary" onclick="location.reload()">${icon("refresh")}重新加载</button>
      </section>`;
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
