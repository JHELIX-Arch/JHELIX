/* JHELIX · 页面与学习模块 */
(function () {
  "use strict";

  const CV = window.CV;
  const $ = CV.$;
  const $$ = CV.$$;
  const esc = CV.esc;
  const attr = CV.attr;
  const icon = CV.icon;
  const store = CV.store;

  const view = () => document.getElementById("view");

  const QUOTES = [
    "把今天的 25 个词学完，比收藏 100 篇方法帖更有用。",
    "第一遍求眼熟，第二遍求想起来，第三遍求用得上。",
    "不认识的词不可怕，可怕的是它一直躺在“以后再说”里。",
    "一个词看三遍，不如在三个不同场景里各遇见一次。",
    "别追求一次记住，追求每次都更快想起来。",
    "学习进度不会骗人：今天点过的每个“认识”，都算数。",
  ];

  function pageHead(kicker, title, sub, actions) {
    return `<header class="page-head">
      <div class="page-head__copy">
        <div class="kicker">${esc(kicker)}</div>
        <h1>${title}</h1>
        ${sub ? `<p>${sub}</p>` : ""}
      </div>
      ${actions ? `<div class="page-head__actions">${actions}</div>` : ""}
    </header>`;
  }

  function formatDef(text) {
    let s = esc(text);
    s = s.replace(/\[([^\]]+)\]/g, '<span class="gram">[$1]</span>');
    s = s.replace(
      /(^|\s)((?:n|v|vt|vi|a|ad|adv|prep|conj|pron|num|int|art|aux|abbr)\.(?:&(?:vi|vt)\.)?)/g,
      '$1<span class="pos-tag">$2</span>'
    );
    return s;
  }

  function statusOf(id) {
    const r = store.getReview(id);
    return CV.statusMeta(r ? r.status : 0);
  }

  function starOf(id) {
    const r = store.getReview(id);
    return !!(r && r.starred);
  }

  function starButton(id, extraClass) {
    return `<button class="star-btn ${starOf(id) ? "is-on" : ""} ${extraClass || ""}" data-star="${attr(id)}"
      title="${starOf(id) ? "取消收藏" : "加入生词本"}" aria-label="收藏">${icon("star")}</button>`;
  }

  function wordRow(w, opts) {
    const st = statusOf(w.id);
    const options = opts || {};
    const extra = options.extra || "";
    return `<div class="word-row ${options.compact ? "word-row--compact" : ""}" data-word="${attr(w.id)}" tabindex="0" role="button">
      <div class="word-row__main">
        <div class="word-row__title"><span class="word-row__word">${esc(w.word)}</span>
          <span class="word-row__ph">/${esc(w.phonetic)}/</span></div>
        <div class="word-row__def">${esc(w.brief)}</div>
      </div>
      <span class="pos-pill">${esc(w.pos)}</span>
      <span class="badge ${st.cls}">${st.label}</span>
      ${extra}
      ${starButton(w.id)}
    </div>`;
  }

  function wordChip(w) {
    return `<button class="word-chip" data-word="${attr(w.id)}">${esc(w.word)}</button>`;
  }

  function heatClass(n) {
    if (!n) return "heat--0";
    if (n <= 2) return "heat--1";
    if (n <= 5) return "heat--2";
    if (n <= 10) return "heat--3";
    return "heat--4";
  }

  function heatStrip(days) {
    return `<div class="heat-strip">${days
      .map(
        (d) =>
          `<span class="heat-cell ${heatClass(d.learned)}" title="${attr(d.key)} · 新学 ${d.learned} 词 · 作答 ${d.total} 次"><i>${d.learned || ""}</i></span>`
      )
      .join("")}</div>`;
  }

  function deckTabs(active) {
    const tabs = [
      ["today", "今日计划", "clock"],
      ["all", "全部词库", "layers"],
      ["starred", "生词本", "star"],
      ["wrong", "易错词", "target"],
    ];
    return `<div class="segmented segmented--wrap">${tabs
      .map(
        ([key, label, iconName]) =>
          `<button class="segmented__btn ${active === key ? "is-on" : ""}" data-go="#/flashcards?deck=${key}">${icon(iconName)}${esc(label)}</button>`
      )
      .join("")}</div>`;
  }

  function openDeck(ids, label) {
    if (!ids || !ids.length) {
      CV.toast("这个范围里还没有词，先学几个再来", "error");
      return;
    }
    sessionStorage.setItem("jhelix_deck", JSON.stringify({ ids, label: label || "自定义词单", at: Date.now() }));
    location.hash = "#/flashcards?deck=custom";
  }

  function deckFromCustom() {
    try {
      const raw = JSON.parse(sessionStorage.getItem("jhelix_deck") || "null");
      if (!raw || !Array.isArray(raw.ids)) return { words: [], label: "自定义词单" };
      return {
        words: raw.ids.map((id) => CV.byId[id]).filter(Boolean),
        label: raw.label || "自定义词单",
      };
    } catch (err) {
      return { words: [], label: "自定义词单" };
    }
  }

  function scopeWords(scope) {
    if (scope === "today") return store.todayDeck();
    if (scope === "starred") return store.starredList();
    if (scope === "wrong") return store.wrongList();
    return CV.words;
  }

  // ---------------------------------------------------------------- 今日

  CV.pages = CV.pages || {};

  CV.pages.today = function () {
    const s = store.computeStats();
    const plan = store.todayPlan(8);
    const days = store.dailySeries(30);
    const pct = plan.goal ? Math.min(100, Math.round((plan.done / plan.goal) * 100)) : 0;
    const hour = new Date().getHours();
    const greet = hour < 6 ? "夜深了" : hour < 11 ? "早上好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好";
    const quote = QUOTES[new Date().getDate() % QUOTES.length];
    const heroTitle =
      plan.done >= plan.goal
        ? `今日目标已完成，<span class="hl">${plan.done}</span> 个词到手`
        : `今天，拿下 <span class="hl">${plan.remain || plan.goal}</span> 个四级高频词`;
    const planWords = plan.plan.length ? plan.plan : CV.shuffle(CV.words).slice(0, 6);

    const html = `
      ${pageHead(
        "TODAY · 今日学习",
        `${greet}，今天也把词库往前推一点`,
        `待复习 <b>${plan.dueCount}</b> · 新词 <b>${plan.newCount}</b> · 今日已学 <b>${plan.done}</b> 词`,
        `<button class="btn btn--primary" data-go="#/flashcards?deck=today">${icon("play")}开始今日闪卡</button>
         <button class="btn btn--ghost" data-go="#/quiz?autostart=1">${icon("quiz")}来一组 10 题</button>`
      )}

      <section class="hero-card">
        <div class="hero-card__copy">
          <div class="kicker">DAILY MISSION · 每日任务</div>
          <h2>${heroTitle}</h2>
          <p>建议顺序：先过词单，再翻闪卡，最后用选择 / 拼写 / 听音各验一次。不熟的词会自动进入复习队列。</p>
          <div class="hero-card__actions">
            <button class="btn btn--primary btn--lg" data-go="#/flashcards?deck=today">${icon("play")}继续学习</button>
            <button class="btn btn--soft" data-random-word>${icon("shuffle")}随机一词</button>
            <button class="btn btn--ghost" data-go="#/stats">${icon("chart")}看学习曲线</button>
          </div>
          <div class="level-strip">
            <span class="level-strip__badge">Lv.${s.level.index}</span>
            <div class="level-strip__body">
              <div class="level-strip__line"><b>${esc(s.level.name)}</b><span>${s.xp} XP</span></div>
              <div class="meter meter--slim"><i style="width:${s.level.progress}%"></i></div>
              <div class="level-strip__hint">${
                s.level.nextAt ? `再得 ${s.level.toNext} XP 升到「${esc(s.level.nextName)}」` : "已到最高等级"
              }</div>
            </div>
          </div>
        </div>
        <div class="hero-card__ring">
          ${CV.progressRing(pct, 176, 12)}
          <div class="ring-label">
            <b>${plan.done}<small>/${plan.goal}</small></b>
            <span>今日已学</span>
          </div>
          <div class="hero-card__ring-foot">${icon("flame")}连续 ${s.streak} 天 · 最长 ${s.bestStreak} 天</div>
        </div>
      </section>

      <section class="stats-grid">
        ${CV.statCard({ icon: "clock", label: "待复习", value: s.dueCount, unit: " 词", hint: "按到期排序", action: "#/flashcards?deck=today", tone: "tone-cyan" })}
        ${CV.statCard({ icon: "spark", label: "新词库存", value: s.newCount, unit: " 词", hint: "还没见过", action: "#/library?status=new", tone: "tone-lime" })}
        ${CV.statCard({ icon: "flame", label: "连续学习", value: s.streak, unit: " 天", hint: `最长 ${s.bestStreak} 天`, action: "#/stats", tone: "tone-orange" })}
        ${CV.statCard({ icon: "target", label: "总正确率", value: s.accuracy, unit: "%", hint: `${s.correct}/${s.answers} 次作答`, action: "#/stats", tone: "tone-violet" })}
      </section>

      <section class="two-col">
        <article class="card card--pad">
          <div class="card-head">
            <div><div class="kicker">TODAY'S LIST</div><h3>今日词单</h3><p>到期复习优先，其次补新词；点任意词看释义。</p></div>
            <button class="btn btn--ghost btn--sm" data-open-deck="today">${icon("arrow-right")}整组学习</button>
          </div>
          <div class="word-list">
            ${planWords.map((w) => wordRow(w, { compact: true })).join("")}
          </div>
          <div class="card-foot">
            <span class="muted">今日还剩 ${plan.remain} 个目标词未完成</span>
            <button class="link-btn" data-go="#/library">打开完整词库${icon("chevron")}</button>
          </div>
        </article>

        <article class="card card--pad">
          <div class="card-head">
            <div><div class="kicker">LEARNING ROUTES</div><h3>四条学习动线</h3><p>不同场景用不同方式，避免只会“眼熟”。</p></div>
          </div>
          <div class="route-grid">
            <button class="route-tile" data-go="#/flashcards?deck=today">
              <span class="route-tile__ico tone-lime">${icon("cards")}</span>
              <b>闪卡速记</b><span>翻面判断，建立第一印象</span>
            </button>
            <button class="route-tile" data-go="#/quiz">
              <span class="route-tile__ico tone-cyan">${icon("quiz")}</span>
              <b>选择测验</b><span>四选一，快速检查词义</span>
            </button>
            <button class="route-tile" data-go="#/spelling">
              <span class="route-tile__ico tone-orange">${icon("edit")}</span>
              <b>拼写挑战</b><span>看中文，把单词拼出来</span>
            </button>
            <button class="route-tile" data-go="#/listening">
              <span class="route-tile__ico tone-violet">${icon("headphones")}</span>
              <b>听音辨词</b><span>听发音，从四个词里选</span>
            </button>
          </div>
          <div class="card-foot">
            <span class="muted">快捷键 Alt+1…9 切换板块</span>
            <button class="link-btn" data-go="#/settings">查看全部快捷键${icon("chevron")}</button>
          </div>
        </article>
      </section>

      <section class="two-col two-col--wide-left">
        <article class="card card--pad">
          <div class="card-head">
            <div><div class="kicker">LAST 30 DAYS</div><h3>近 30 天学习热力</h3><p>颜色越亮，当天新学的词越多。</p></div>
            <div class="heat-legend"><span>少</span><i class="heat--1"></i><i class="heat--2"></i><i class="heat--3"></i><i class="heat--4"></i><span>多</span></div>
          </div>
          ${heatStrip(days)}
          <div class="mini-stats">
            <span><b>${s.daysStudied}</b> 天有学习记录</span>
            <span><b>${s.learned}</b> 个词已见过</span>
            <span><b>${s.mastered}</b> 个词已掌握</span>
            <span><b>${s.answers}</b> 次作答</span>
          </div>
        </article>
        <article class="card card--pad quote-card">
          <div class="kicker">NOTE TO SELF</div>
          <blockquote>${esc(quote)}</blockquote>
          <p class="muted">今日提示：闪卡里点“模糊”的词会在 1 天后回来；点“不认识”的词会在 10 分钟后回来。</p>
          <div class="quote-card__actions">
            <button class="btn btn--soft btn--sm" data-go="#/starred">${icon("star")}看生词本</button>
            <button class="btn btn--ghost btn--sm" data-go="#/achievements">${icon("trophy")}看成就</button>
          </div>
        </article>
      </section>`;

    view().innerHTML = html;
  };

  // ---------------------------------------------------------------- 词库

  CV.pages.library = function (params) {
    const state = {
      q: (params && params.q) || "",
      letter: "ALL",
      pos: "ALL",
      status: "ALL",
      starred: false,
      sort: "order",
      page: 1,
    };
    const perPage = 60;

    const html = `${pageHead(
      "LIBRARY · 词库",
      `完整词库 <span class="hl">${CV.words.length}</span> 词`,
      "搜索、筛选、按状态查看；点任意词打开详情，点星标加入生词本。",
      `<button class="btn btn--ghost" data-random-word>${icon("shuffle")}随机一词</button>
       <button class="btn btn--soft" data-lib-study>${icon("play")}学习当前筛选</button>`
    )}
      <section class="card card--pad filter-card">
        <div class="filter-row">
          <label class="search search--large">
            ${icon("search")}
            <input id="lib-q" type="search" placeholder="搜单词、释义或音标…" value="${attr(state.q)}" autocomplete="off">
            <kbd>/</kbd>
          </label>
          <select id="lib-sort" class="select" aria-label="排序">
            <option value="order">按原词表顺序</option>
            <option value="alpha">按字母 A→Z</option>
            <option value="wrong">错得最多优先</option>
            <option value="length">按单词长度</option>
          </select>
        </div>
        <div class="filter-row filter-row--wrap">
          <div class="chip-scroll" id="lib-letters"></div>
        </div>
        <div class="filter-row filter-row--wrap">
          <select id="lib-pos" class="select select--sm" aria-label="词性">
            <option value="ALL">全部词性</option>
            ${CV.posGroups.map((p) => `<option value="${attr(p)}">${esc(p)}</option>`).join("")}
          </select>
          <select id="lib-status" class="select select--sm" aria-label="学习状态">
            <option value="ALL">全部状态</option>
            <option value="new">新词</option>
            <option value="learning">学习中</option>
            <option value="familiar">熟悉</option>
            <option value="mastered">掌握</option>
            <option value="starred">已收藏</option>
          </select>
          <button class="chip" id="lib-starred">${icon("star")}只看生词本</button>
          <span class="filter-count" id="lib-count"></span>
        </div>
      </section>
      <section class="card card--pad">
        <div class="list-head">
          <span>单词 / 释义</span><span>词性</span><span>状态</span><span></span>
        </div>
        <div id="lib-list" class="word-list"></div>
        <div class="pager" id="lib-pager"></div>
      </section>`;

    view().innerHTML = html;

    const qInput = $("#lib-q");
    const list = $("#lib-list");
    const count = $("#lib-count");
    const pager = $("#lib-pager");
    const letterBox = $("#lib-letters");

    function renderLetters() {
      const items = [["ALL", "全部", CV.words.length]].concat(
        CV.letters.map((ch) => [ch, ch, CV.letterCounts[ch] || 0])
      );
      letterBox.innerHTML = items
        .map(
          ([value, label, n]) =>
            `<button class="chip ${state.letter === value ? "is-on" : ""}" data-letter="${attr(value)}">${esc(label)}<small>${n}</small></button>`
        )
        .join("");
    }

    function filtered() {
      const q = state.q.trim().toLowerCase();
      let rows = CV.words.filter((w) => {
        if (state.letter !== "ALL" && w.letter !== state.letter) return false;
        if (state.pos !== "ALL" && w.posGroup !== state.pos) return false;
        if (q) {
          const hay = `${w.word} ${w.definition} ${w.phonetic}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        const r = store.getReview(w.id);
        if (state.starred) {
          if (!r || !r.starred) return false;
        }
        if (state.status !== "ALL") {
          if (state.status === "new" && r && r.seen) return false;
          if (state.status === "learning" && (!r || !r.seen || r.status !== 1)) return false;
          if (state.status === "familiar" && (!r || r.status !== 2)) return false;
          if (state.status === "mastered" && (!r || r.status !== 3)) return false;
          if (state.status === "starred" && (!r || !r.starred)) return false;
        }
        return true;
      });
      if (state.sort === "alpha") rows.sort((a, b) => a.word.localeCompare(b.word));
      else if (state.sort === "wrong") {
        rows.sort((a, b) => {
          const ra = store.getReview(a.id);
          const rb = store.getReview(b.id);
          return (rb ? rb.wrong : 0) - (ra ? ra.wrong : 0) || a.order - b.order;
        });
      } else if (state.sort === "length") rows.sort((a, b) => a.word.length - b.word.length);
      else rows.sort((a, b) => a.order - b.order);
      return rows;
    }

    function render() {
      const rows = filtered();
      count.innerHTML = `共 <b>${rows.length}</b> 词 · 当前筛选`;
      const pages = Math.max(1, Math.ceil(rows.length / perPage));
      state.page = Math.min(state.page, pages);
      const start = (state.page - 1) * perPage;
      const slice = rows.slice(start, start + perPage);
      list.innerHTML = slice.length
        ? slice.map((w) => wordRow(w)).join("")
        : CV.emptyState("search", "没有匹配的词", "换个关键词、字母或状态试试。");
      pager.innerHTML =
        rows.length > perPage
          ? `<button class="btn btn--ghost btn--sm" data-page="prev" ${state.page <= 1 ? "disabled" : ""}>${icon("arrow-left")}上一页</button>
             <span>第 ${state.page} / ${pages} 页</span>
             <button class="btn btn--ghost btn--sm" data-page="next" ${state.page >= pages ? "disabled" : ""}>下一页${icon("arrow-right")}</button>`
          : "";
      pager._rows = rows;
    }

    qInput.addEventListener(
      "input",
      CV.debounce(() => {
        state.q = qInput.value;
        state.page = 1;
        render();
      }, 160)
    );
    $("#lib-sort").addEventListener("change", (e) => {
      state.sort = e.target.value;
      render();
    });
    $("#lib-pos").addEventListener("change", (e) => {
      state.pos = e.target.value;
      state.page = 1;
      render();
    });
    $("#lib-status").addEventListener("change", (e) => {
      state.status = e.target.value;
      state.page = 1;
      render();
    });
    $("#lib-starred").addEventListener("click", () => {
      state.starred = !state.starred;
      $("#lib-starred").classList.toggle("is-on", state.starred);
      state.page = 1;
      render();
    });
    letterBox.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-letter]");
      if (!btn) return;
      state.letter = btn.dataset.letter;
      state.page = 1;
      renderLetters();
      render();
    });
    pager.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-page]");
      if (!btn) return;
      const pages = Math.max(1, Math.ceil((pager._rows || []).length / perPage));
      if (btn.dataset.page === "prev") state.page = Math.max(1, state.page - 1);
      if (btn.dataset.page === "next") state.page = Math.min(pages, state.page + 1);
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    $("[data-lib-study]").addEventListener("click", () => {
      const rows = filtered();
      openDeck(rows.map((w) => w.id), `词库筛选 · ${rows.length} 词`);
    });

    renderLetters();
    render();
    if (state.q) setTimeout(() => qInput.focus(), 80);
  };

  // ---------------------------------------------------------------- 闪卡

  CV.pages.flashcards = function (params) {
    const deckKey = (params && params.deck) || "today";
    let deck = [];
    let label = "今日计划";
    if (deckKey === "all") {
      deck = CV.shuffle(CV.words);
      label = "全部词库";
    } else if (deckKey === "starred") {
      deck = store.starredList();
      label = "生词本";
    } else if (deckKey === "wrong") {
      deck = store.wrongList();
      label = "易错词";
    } else if (deckKey === "custom") {
      const custom = deckFromCustom();
      deck = CV.shuffle(custom.words);
      label = custom.label;
    } else {
      deck = store.todayDeck();
      label = "今日计划";
    }

    const settings = store.getSettings();
    let index = 0;
    let flipped = false;
    let counts = { know: 0, fuzzy: 0, unsure: 0 };
    let startedAt = Date.now();

    const html = `${pageHead(
      "FLASHCARDS · 闪卡速记",
      "翻面判断，先把第一印象建立起来",
      "点击卡片或按空格翻面；认识 / 模糊 / 不认识会进入不同的复习间隔。",
      `<button class="btn btn--ghost" data-random-word>${icon("shuffle")}随机一词</button>
       <button class="btn btn--soft" data-go="#/quiz">${icon("quiz")}去测验</button>`
    )}
      ${deckTabs(deckKey)}
      <section class="flash-shell card card--pad">
        <div class="flash-top">
          <div class="flash-top__label">${icon("cards")}<b>${esc(label)}</b><span>${deck.length} 词</span></div>
          <div class="flash-top__bar"><div class="meter"><i id="flash-progress" style="width:0%"></i></div><span id="flash-count">0 / ${deck.length}</span></div>
        </div>
        <div id="flash-stage"></div>
        <div class="flash-bottom">
          <button class="btn btn--ghost btn--sm" data-flash-prev>${icon("arrow-left")}上一张</button>
          <span class="muted" id="flash-hint">空格翻面 · 1 不认识 · 2 模糊 · 3 认识 · P 朗读 · S 收藏</span>
          <button class="btn btn--ghost btn--sm" data-flash-next>下一张${icon("arrow-right")}</button>
        </div>
      </section>`;

    view().innerHTML = html;
    const stage = $("#flash-stage");
    const progress = $("#flash-progress");
    const count = $("#flash-count");

    function updateMeta() {
      const done = Math.min(index, deck.length);
      progress.style.width = `${deck.length ? (done / deck.length) * 100 : 0}%`;
      count.textContent = `${done} / ${deck.length}`;
    }

    function renderSummary() {
      const total = counts.know + counts.fuzzy + counts.unsure;
      const acc = total ? Math.round(((counts.know + counts.fuzzy) / total) * 100) : 0;
      const minutes = Math.round((Date.now() - startedAt) / 60000);
      updateMeta();
      stage.innerHTML = `<div class="round-summary">
        <div class="round-summary__ring">${CV.progressRing(acc, 150, 12)}<div class="ring-label"><b>${acc}<small>%</small></b><span>本轮判断</span></div></div>
        <div class="round-summary__copy">
          <div class="kicker">DECK COMPLETE</div>
          <h2>这组词过完了</h2>
          <p>共 ${total} 词 · 认识 ${counts.know} · 模糊 ${counts.fuzzy} · 不认识 ${counts.unsure} · 用时约 ${Math.max(1, minutes)} 分钟</p>
          <div class="round-summary__actions">
            <button class="btn btn--primary" data-flash-restart>${icon("refresh")}再来一轮</button>
            <button class="btn btn--soft" data-go="#/quiz">${icon("quiz")}选择测验</button>
            <button class="btn btn--ghost" data-go="#/today">${icon("home")}回今日学习</button>
          </div>
        </div>
      </div>`;
      if (acc >= 80) CV.confetti(90);
    }

    function renderCard() {
      updateMeta();
      if (!deck.length) {
        stage.innerHTML = CV.emptyState(
          "cards",
          "这个范围还没有词",
          "先去词库或今日计划里学几个词，再回来复习。",
          `<button class="btn btn--primary" data-go="#/today">${icon("home")}回今日学习</button>`
        );
        return;
      }
      if (index >= deck.length) {
        renderSummary();
        return;
      }
      const w = deck[index];
      const fam = CV.wordFamily(w.id).slice(0, 2);
      const sim = CV.wordSimilar(w.id).slice(0, 4);
      stage.innerHTML = `<div class="flash-wrap">
        <div class="flashcard ${flipped ? "is-flipped" : ""}" id="flashcard" tabindex="0" role="button" aria-label="点击翻面">
          <div class="flash-face flash-face--front">
            <div class="flash-face__top">
              <span class="pos-pill">${esc(w.pos)}</span>
              <span class="muted">${esc(w.letter)} · 第 ${w.order} 词</span>
            </div>
            <div class="flash-word">${esc(w.word)}</div>
            <div class="flash-phonetic">/${esc(w.phonetic)}/</div>
            <div class="flash-face__actions">
              <button class="btn btn--soft btn--sm" data-speak="${attr(w.word)}" data-noflip>${icon("volume")}朗读</button>
              ${starButton(w.id, "star-btn--lg")}
            </div>
            <div class="flash-face__hint">${icon("refresh")}点击卡片 / 按空格翻面</div>
          </div>
          <div class="flash-face flash-face--back">
            <div class="flash-face__top">
              <span class="word-mini">${esc(w.word)}</span>
              <span class="muted">/${esc(w.phonetic)}/</span>
            </div>
            <div class="flash-def">${formatDef(w.definition)}</div>
            ${
              fam.length
                ? `<div class="flash-tags"><span class="muted">同族</span>${fam
                    .flatMap((f) => f.words.filter((x) => x.id !== w.id).slice(0, 3))
                    .slice(0, 4)
                    .map((x) => wordChip(x))
                    .join("")}</div>`
                : ""
            }
            ${
              sim.length
                ? `<div class="flash-tags"><span class="muted">形近</span>${sim.map((x) => wordChip(x)).join("")}</div>`
                : ""
            }
            <div class="flash-judge">
              <button class="judge judge--bad" data-judge="unsure"><b>1</b><span>不认识</span><small>10 分钟后再见</small></button>
              <button class="judge judge--mid" data-judge="fuzzy"><b>2</b><span>模糊</span><small>明天再复习</small></button>
              <button class="judge judge--good" data-judge="know"><b>3</b><span>认识</span><small>拉长复习间隔</small></button>
            </div>
          </div>
        </div>
      </div>`;
      const card = $("#flashcard");
      card.addEventListener("click", (e) => {
        if (e.target.closest("[data-noflip]")) return;
        flipped = !flipped;
        card.classList.toggle("is-flipped", flipped);
      });
      $$("[data-judge]", stage).forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          judge(btn.dataset.judge);
        });
      });
      if (settings.autoSpeak) setTimeout(() => CV.speak(w.word, settings.rate), 180);
    }

    function judge(quality) {
      if (!deck.length || index >= deck.length) return;
      const w = deck[index];
      const newly = store.markWord(w.id, quality, "flash");
      newly.forEach((a) => {
        CV.toast(`解锁成就：${a.name}`, "success", 3000);
        CV.confetti(40);
      });
      counts[quality] += 1;
      index += 1;
      flipped = false;
      renderCard();
    }

    function go(delta) {
      if (!deck.length) return;
      index = CV.clamp(index + delta, 0, deck.length);
      flipped = false;
      renderCard();
    }

    $("[data-flash-prev]").addEventListener("click", () => go(-1));
    $("[data-flash-next]").addEventListener("click", () => go(1));
    document.addEventListener("click", (e) => {
      const restart = e.target.closest("[data-flash-restart]");
      if (restart) {
        index = 0;
        flipped = false;
        counts = { know: 0, fuzzy: 0, unsure: 0 };
        startedAt = Date.now();
        deck = CV.shuffle(deck);
        renderCard();
      }
    });

    CV.pageKeys = (e) => {
      if (e.target.matches("input, textarea, select")) return;
      const w = deck[index];
      if (e.code === "Space") {
        e.preventDefault();
        flipped = !flipped;
        const card = $("#flashcard");
        if (card) card.classList.toggle("is-flipped", flipped);
      } else if (e.key === "1") judge("unsure");
      else if (e.key === "2") judge("fuzzy");
      else if (e.key === "3") judge("know");
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key.toLowerCase() === "p" && w) CV.speak(w.word, settings.rate);
      else if (e.key.toLowerCase() === "s" && w) {
        const on = store.toggleStar(w.id);
        CV.toast(on ? "已加入生词本" : "已移出生词本", "success");
        renderCard();
      }
    };

    renderCard();
  };

  // ---------------------------------------------------------------- 选择测验

  CV.pages.quiz = function (params) {
    let round = null;
    let answered = false;
    let wrongIds = [];
    let lastPicked = null;
    let nextTimer = 0;

    const html = `${pageHead(
      "QUIZ · 选择测验",
      "四选一，快速检查“看到词能不能想起意思”",
      "支持词→义、义→词两种方向；答错的词会进入复习队列。",
      `<button class="btn btn--ghost" data-random-word>${icon("shuffle")}随机一词</button>
       <button class="btn btn--soft" data-go="#/flashcards?deck=today">${icon("cards")}去闪卡</button>`
    )}
      <div id="quiz-body"></div>`;

    view().innerHTML = html;
    const body = $("#quiz-body");

    function pickOptions(correctWord, direction, count) {
      const samePos = CV.words.filter((w) => w.id !== correctWord.id && w.posGroup === correctWord.posGroup);
      const pool = samePos.length >= count * 2 ? samePos : CV.words.filter((w) => w.id !== correctWord.id);
      const picked = CV.shuffle(pool).slice(0, count);
      const options = [correctWord, ...picked].map((w) => {
        const text = direction === "w2m" ? w.brief || w.definition : w.word;
        return { id: w.id, text, correct: w.id === correctWord.id };
      });
      const seen = new Set();
      const unique = [];
      options.forEach((o) => {
        const key = o.text.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(o);
        }
      });
      if (unique.length < count + 1) {
        CV.words.forEach((w) => {
          if (unique.length >= count + 1) return;
          if (w.id === correctWord.id) return;
          const text = direction === "w2m" ? w.definition : w.word;
          const key = text.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            unique.push({ id: w.id, text, correct: false });
          }
        });
      }
      return CV.shuffle(unique);
    }

    function renderSetup() {
      body.innerHTML = `<section class="quiz-setup">
        <article class="card card--pad setup-card">
          <div class="kicker">START A ROUND</div>
          <h2>设置这一组题</h2>
          <p class="muted">每组 10 题，答完会给出正确率和错词清单。</p>
          <div class="setup-block">
            <label>出题方向</label>
            <div class="segmented" id="quiz-direction">
              <button class="segmented__btn is-on" data-direction="w2m">${icon("book")}词 → 义</button>
              <button class="segmented__btn" data-direction="m2w">${icon("list")}义 → 词</button>
            </div>
          </div>
          <div class="setup-block">
            <label>出题范围</label>
            <div class="segmented segmented--wrap" id="quiz-scope">
              <button class="segmented__btn is-on" data-scope="today">${icon("clock")}今日计划</button>
              <button class="segmented__btn" data-scope="all">${icon("layers")}全部词库</button>
              <button class="segmented__btn" data-scope="starred">${icon("star")}生词本</button>
              <button class="segmented__btn" data-scope="wrong">${icon("target")}易错词</button>
            </div>
          </div>
          <div class="setup-block">
            <label>题量</label>
            <div class="segmented" id="quiz-count">
              <button class="segmented__btn is-on" data-count="10">10 题</button>
              <button class="segmented__btn" data-count="20">20 题</button>
            </div>
          </div>
          <button class="btn btn--primary btn--lg" id="quiz-start">${icon("play")}开始测验</button>
        </article>
        <aside class="card card--pad setup-side">
          <div class="kicker">HOW IT WORKS</div>
          <h3>答题规则</h3>
          <ul class="rule-list">
            <li><b>词 → 义</b>：看到单词，从四个中文释义里选。</li>
            <li><b>义 → 词</b>：看到中文，从四个单词里选。</li>
            <li>选中后立即判定，并展示完整释义。</li>
            <li>键盘 <kbd>1</kbd>–<kbd>4</kbd> 选答案，<kbd>Enter</kbd> 下一题。</li>
            <li>答错会记入错词并缩短复习间隔。</li>
          </ul>
          <div class="setup-side__foot">${icon("info")}词库共 ${CV.words.length} 词；题目从所选范围随机抽取。</div>
        </aside>
      </section>`;

      let direction = "w2m";
      let scope = "today";
      let count = 10;
      $("#quiz-direction").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-direction]");
        if (!btn) return;
        direction = btn.dataset.direction;
        $$("#quiz-direction .segmented__btn").forEach((b) => b.classList.toggle("is-on", b === btn));
      });
      $("#quiz-scope").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-scope]");
        if (!btn) return;
        scope = btn.dataset.scope;
        $$("#quiz-scope .segmented__btn").forEach((b) => b.classList.toggle("is-on", b === btn));
      });
      $("#quiz-count").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-count]");
        if (!btn) return;
        count = Number(btn.dataset.count);
        $$("#quiz-count .segmented__btn").forEach((b) => b.classList.toggle("is-on", b === btn));
      });
      $("#quiz-start").addEventListener("click", () => startRound({ direction, scope, count }));
    }

    function startRound(opts) {
      let pool = scopeWords(opts.scope);
      if (pool.length < 1) pool = CV.words;
      const picked = CV.shuffle(pool).slice(0, Math.min(opts.count, pool.length));
      round = {
        direction: opts.direction,
        scope: opts.scope,
        questions: picked.map((w) => ({
          word: w,
          options: pickOptions(w, opts.direction, 3),
        })),
        index: 0,
        score: 0,
        answers: [],
      };
      answered = false;
      wrongIds = [];
      lastPicked = null;
      renderQuestion();
    }

    function renderQuestion() {
      if (!round) return renderSetup();
      if (round.index >= round.questions.length) return renderSummary();
      const q = round.questions[round.index];
      const w = q.word;
      const prompt =
        round.direction === "w2m"
          ? `<div class="quiz-prompt__word">${esc(w.word)}</div><div class="quiz-prompt__ph">/${esc(w.phonetic)}/</div>
             <button class="btn btn--ghost btn--sm" data-speak="${attr(w.word)}">${icon("volume")}朗读</button>`
          : `<div class="quiz-prompt__pos"><span class="pos-pill">${esc(w.pos)}</span></div>
             <div class="quiz-prompt__def">${esc(w.brief)}</div>`;
      body.innerHTML = `<section class="quiz-play card card--pad">
        <div class="quiz-play__top">
          <div class="quiz-play__meta"><span class="kicker">QUESTION</span><b>${round.index + 1}<small>/${round.questions.length}</small></b></div>
          <div class="quiz-play__progress"><div class="meter"><i style="width:${(round.index / round.questions.length) * 100}%"></i></div></div>
          <div class="quiz-play__score">${icon("target")}<b>${round.score}</b><span>正确</span></div>
        </div>
        <div class="quiz-prompt">${prompt}</div>
        <div class="quiz-options" id="quiz-options">
          ${q.options
            .map(
              (o, i) =>
                `<button class="quiz-option" data-option="${i}"><b>${i + 1}</b><span>${esc(o.text)}</span></button>`
            )
            .join("")}
        </div>
        <div id="quiz-feedback" class="quiz-feedback" hidden></div>
        <div class="quiz-play__foot">
          <span class="muted">选择后立即判定 · <kbd>1</kbd>–<kbd>4</kbd> 选择 · <kbd>Enter</kbd> 下一题</span>
          <button class="btn btn--primary" id="quiz-next" disabled>下一题${icon("arrow-right")}</button>
        </div>
      </section>`;

      $("#quiz-options").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-option]");
        if (!btn || answered) return;
        answer(Number(btn.dataset.option));
      });
      $("#quiz-next").addEventListener("click", nextQuestion);
    }

    function answer(index) {
      if (!round || answered) return;
      answered = true;
      const q = round.questions[round.index];
      const w = q.word;
      const picked = q.options[index];
      const correct = !!picked.correct;
      lastPicked = index;
      if (correct) {
        round.score += 1;
      } else {
        wrongIds.push(w.id);
      }
      round.answers.push({ id: w.id, correct });
      const newly = store.recordAttempt(w.id, correct, "quiz");
      newly.forEach((a) => {
        CV.toast(`解锁成就：${a.name}`, "success", 3000);
        CV.confetti(40);
      });

      $$("#quiz-options .quiz-option").forEach((btn, i) => {
        const opt = q.options[i];
        btn.classList.add("is-locked");
        if (opt.correct) btn.classList.add("is-correct");
        if (i === index && !correct) btn.classList.add("is-wrong");
      });
      const feedback = $("#quiz-feedback");
      feedback.hidden = false;
      feedback.className = `quiz-feedback ${correct ? "is-correct" : "is-wrong"}`;
      feedback.innerHTML = `<div class="quiz-feedback__head">${icon(correct ? "check" : "x")}<b>${
        correct ? "答对了" : "正确答案是"
      }</b><span class="word-mini">${esc(w.word)}</span><span class="muted">/${esc(w.phonetic)}/</span>
        <button class="btn btn--ghost btn--sm" data-speak="${attr(w.word)}">${icon("volume")}朗读</button></div>
        <div class="quiz-feedback__def">${formatDef(w.definition)}</div>`;
      const next = $("#quiz-next");
      next.disabled = false;
      next.focus();
      if (correct) setTimeout(() => {
        if (answered && round && round.index < round.questions.length) nextQuestion();
      }, 1200);
    }

    function nextQuestion() {
      if (!round) return;
      round.index += 1;
      answered = false;
      lastPicked = null;
      renderQuestion();
    }

    function renderSummary() {
      const total = round.questions.length;
      const answeredCount = round.answers.length;
      const acc = answeredCount ? Math.round((round.score / answeredCount) * 100) : 0;
      const wrongWords = wrongIds.map((id) => CV.byId[id]).filter(Boolean).slice(0, 8);
      body.innerHTML = `<section class="round-summary card card--pad">
        <div class="round-summary__ring">${CV.progressRing(acc, 168, 12)}<div class="ring-label"><b>${round.score}<small>/${total}</small></b><span>本轮得分</span></div></div>
        <div class="round-summary__copy">
          <div class="kicker">ROUND COMPLETE</div>
          <h2>${acc >= 80 ? "这组题打得漂亮" : acc >= 60 ? "基础有了，再巩固一轮" : "错词已经帮你记下了"}</h2>
          <p>共 ${answeredCount} 题 · 正确 ${round.score} 题 · 正确率 ${acc}%${wrongWords.length ? ` · ${wrongWords.length} 个错词` : ""}</p>
          <div class="round-summary__actions">
            <button class="btn btn--primary" data-quiz-again>${icon("refresh")}再来一组</button>
            ${
              wrongWords.length
                ? `<button class="btn btn--soft" data-quiz-wrong>${icon("target")}复习这 ${wrongWords.length} 个错词</button>`
                : ""
            }
            <button class="btn btn--ghost" data-go="#/today">${icon("home")}回今日学习</button>
          </div>
          ${
            wrongWords.length
              ? `<div class="wrong-strip"><span class="muted">错词</span>${wrongWords.map((w) => wordChip(w)).join("")}</div>`
              : ""
          }
        </div>
      </section>`;
      if (acc >= 80) CV.confetti(100);
      $("[data-quiz-again]").addEventListener("click", () => {
        round = null;
        renderSetup();
      });
      const wrongBtn = $("[data-quiz-wrong]");
      if (wrongBtn) {
        wrongBtn.addEventListener("click", () => openDeck(wrongIds, `本轮错词 · ${wrongIds.length} 词`));
      }
    }

    CV.pageKeys = (e) => {
      if (e.target.matches("input, textarea, select")) return;
      if (!round) return;
      if (round.index >= round.questions.length) return;
      if (!answered && /^[1-4]$/.test(e.key)) {
        const i = Number(e.key) - 1;
        if (i < round.questions[round.index].options.length) answer(i);
      } else if (answered && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        nextQuestion();
      }
    };

    if (params && params.autostart) startRound({ direction: "w2m", scope: "today", count: 10 });
    else renderSetup();
  };

  // ---------------------------------------------------------------- 拼写

  CV.pages.spelling = function () {
    let round = null;
    let index = 0;
    let answered = false;
    let hintCount = 0;
    let correctCount = 0;
    let wrongIds = [];
    let currentInput = "";

    const html = `${pageHead(
      "SPELLING · 拼写挑战",
      "看中文，把单词一个字母一个字母拼出来",
      "先听发音、看首字母，再输入完整拼写；Enter 提交，答错会展示正确拼写。",
      `<button class="btn btn--ghost" data-random-word>${icon("shuffle")}随机一词</button>
       <button class="btn btn--soft" data-go="#/listening">${icon("headphones")}去听音辨词</button>`
    )}
      <div id="spell-body"></div>`;
    view().innerHTML = html;
    const body = $("#spell-body");

    function maskWord(word, reveal) {
      const chars = word.split("");
      let revealed = Math.min(chars.length, 1 + reveal);
      return chars
        .map((ch, i) => {
          if (/[a-zA-Z]/.test(ch)) return i < revealed ? ch : "_";
          return ch;
        })
        .join(" ");
    }

    function renderSetup() {
      body.innerHTML = `<section class="quiz-setup">
        <article class="card card--pad setup-card">
          <div class="kicker">START SPELLING</div>
          <h2>选择词单</h2>
          <p class="muted">每组 10 词，按中文释义拼写；可以先点喇叭听发音。</p>
          <div class="setup-block">
            <label>出题范围</label>
            <div class="segmented segmented--wrap" id="spell-scope">
              <button class="segmented__btn is-on" data-scope="today">${icon("clock")}今日计划</button>
              <button class="segmented__btn" data-scope="all">${icon("layers")}全部词库</button>
              <button class="segmented__btn" data-scope="starred">${icon("star")}生词本</button>
              <button class="segmented__btn" data-scope="wrong">${icon("target")}易错词</button>
            </div>
          </div>
          <button class="btn btn--primary btn--lg" id="spell-start">${icon("play")}开始拼写</button>
        </article>
        <aside class="card card--pad setup-side">
          <div class="kicker">TIPS</div>
          <h3>拼写小提示</h3>
          <ul class="rule-list">
            <li>先按发音把单词拆成音节，再逐段拼。</li>
            <li>不确定时点“提示一个字母”，不会扣分。</li>
            <li>答错会展示正确拼写，并自动进入复习队列。</li>
            <li>键盘 <kbd>Enter</kbd> 提交 / 下一题。</li>
          </ul>
        </aside>
      </section>`;
      let scope = "today";
      $("#spell-scope").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-scope]");
        if (!btn) return;
        scope = btn.dataset.scope;
        $$("#spell-scope .segmented__btn").forEach((b) => b.classList.toggle("is-on", b === btn));
      });
      $("#spell-start").addEventListener("click", () => start(scope));
    }

    function start(scope) {
      let pool = scopeWords(scope);
      if (!pool.length) pool = CV.words;
      round = CV.shuffle(pool).slice(0, 10);
      index = 0;
      answered = false;
      hintCount = 0;
      correctCount = 0;
      wrongIds = [];
      renderQuestion();
    }

    function renderQuestion() {
      if (!round || index >= round.length) return renderSummary();
      const w = round[index];
      answered = false;
      hintCount = 0;
      currentInput = "";
      body.innerHTML = `<section class="spell-play card card--pad">
        <div class="quiz-play__top">
          <div class="quiz-play__meta"><span class="kicker">SPELL IT</span><b>${index + 1}<small>/${round.length}</small></b></div>
          <div class="quiz-play__progress"><div class="meter"><i style="width:${(index / round.length) * 100}%"></i></div></div>
          <div class="quiz-play__score">${icon("check")}<b>${correctCount}</b><span>正确</span></div>
        </div>
        <div class="spell-card">
          <div class="spell-card__def">${esc(w.brief)}</div>
          <div class="spell-card__meta"><span class="pos-pill">${esc(w.pos)}</span><span class="muted">/${esc(w.phonetic)}/</span>
            <button class="btn btn--soft btn--sm" data-speak="${attr(w.word)}">${icon("volume")}听发音</button>
            <button class="btn btn--ghost btn--sm" data-speak-slow="${attr(w.word)}">${icon("play")}慢速</button>
          </div>
          <div class="spell-mask" id="spell-mask">${esc(maskWord(w.word, 0))}</div>
          <div class="spell-input-row">
            <input id="spell-input" class="input input--lg" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="输入完整拼写…">
            <button class="btn btn--primary" id="spell-submit">提交</button>
          </div>
          <div class="spell-tools">
            <button class="btn btn--ghost btn--sm" id="spell-hint">${icon("eye")}提示一个字母</button>
            <button class="btn btn--ghost btn--sm" id="spell-skip">跳过</button>
            <span class="muted" id="spell-hint-count"></span>
          </div>
        </div>
        <div id="spell-feedback" class="quiz-feedback" hidden></div>
        <div class="quiz-play__foot">
          <span class="muted">Enter 提交 / 下一题 · 提示不会扣分</span>
          <button class="btn btn--primary" id="spell-next" disabled>下一题${icon("arrow-right")}</button>
        </div>
      </section>`;

      const input = $("#spell-input");
      input.addEventListener("input", () => {
        currentInput = input.value;
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (answered) next();
          else submit();
        }
      });
      $("#spell-submit").addEventListener("click", submit);
      $("#spell-hint").addEventListener("click", () => {
        if (answered) return;
        hintCount = Math.min(w.word.length - 1, hintCount + 1);
        $("#spell-mask").textContent = maskWord(w.word, hintCount);
        $("#spell-hint-count").textContent = `已提示 ${hintCount} 个字母`;
      });
      $("#spell-skip").addEventListener("click", () => {
        if (answered) return;
        input.value = w.word;
        currentInput = w.word;
        submit(true);
      });
      $("#spell-next").addEventListener("click", next);
      setTimeout(() => {
        input.focus();
        CV.speak(w.word, store.getSettings().rate);
      }, 120);
    }

    function submit(skipped) {
      if (!round || answered) return;
      const w = round[index];
      const input = $("#spell-input");
      const value = String(currentInput || input.value || "").trim();
      if (!value) {
        CV.toast("先输入拼写，或点“跳过”", "error");
        input.focus();
        return;
      }
      answered = true;
      const ok = !skipped && value.toLowerCase() === w.word.toLowerCase();
      if (ok) correctCount += 1;
      else wrongIds.push(w.id);
      const newly = store.recordAttempt(w.id, ok, "spelling");
      newly.forEach((a) => {
        CV.toast(`解锁成就：${a.name}`, "success", 3000);
        CV.confetti(40);
      });
      const feedback = $("#spell-feedback");
      feedback.hidden = false;
      feedback.className = `quiz-feedback ${ok ? "is-correct" : "is-wrong"}`;
      feedback.innerHTML = `<div class="quiz-feedback__head">${icon(ok ? "check" : "x")}<b>${
        ok ? "拼写正确" : "正确拼写是"
      }</b><span class="word-mini">${esc(w.word)}</span><span class="muted">/${esc(w.phonetic)}/</span>
        <button class="btn btn--ghost btn--sm" data-speak="${attr(w.word)}">${icon("volume")}朗读</button></div>
        <div class="quiz-feedback__def">${formatDef(w.definition)}</div>`;
      input.disabled = true;
      $("#spell-submit").disabled = true;
      $("#spell-next").disabled = false;
      $("#spell-next").focus();
      if (ok) CV.confetti(30);
    }

    function next() {
      index += 1;
      renderQuestion();
    }

    function renderSummary() {
      const total = round.length;
      const acc = total ? Math.round((correctCount / total) * 100) : 0;
      const wrongWords = wrongIds.map((id) => CV.byId[id]).filter(Boolean);
      body.innerHTML = `<section class="round-summary card card--pad">
        <div class="round-summary__ring">${CV.progressRing(acc, 168, 12)}<div class="ring-label"><b>${correctCount}<small>/${total}</small></b><span>拼写正确</span></div></div>
        <div class="round-summary__copy">
          <div class="kicker">SPELLING COMPLETE</div>
          <h2>${acc >= 80 ? "拼写手感在线" : "把错词再拼一遍就稳了"}</h2>
          <p>共 ${total} 词 · 正确 ${correctCount} · 正确率 ${acc}%${wrongWords.length ? ` · ${wrongWords.length} 个错词` : ""}</p>
          <div class="round-summary__actions">
            <button class="btn btn--primary" data-spell-again>${icon("refresh")}再来一组</button>
            ${
              wrongWords.length
                ? `<button class="btn btn--soft" data-spell-wrong>${icon("target")}复习错词</button>`
                : ""
            }
            <button class="btn btn--ghost" data-go="#/today">${icon("home")}回今日学习</button>
          </div>
          ${wrongWords.length ? `<div class="wrong-strip"><span class="muted">错词</span>${wrongWords.map((w) => wordChip(w)).join("")}</div>` : ""}
        </div>
      </section>`;
      if (acc >= 80) CV.confetti(100);
      $("[data-spell-again]").addEventListener("click", renderSetup);
      const wrongBtn = $("[data-spell-wrong]");
      if (wrongBtn) wrongBtn.addEventListener("click", () => openDeck(wrongIds, `拼写错词 · ${wrongIds.length} 词`));
    }

    CV.pageKeys = (e) => {
      if (e.target.matches("input, textarea, select")) return;
      if (!round) return;
      if (e.key === "Enter") {
        if (answered) next();
        else submit();
      }
    };

    renderSetup();
  };

  // ---------------------------------------------------------------- 听音

  CV.pages.listening = function () {
    let round = null;
    let index = 0;
    let answered = false;
    let correctCount = 0;
    let wrongIds = [];

    const html = `${pageHead(
      "LISTENING · 听音辨词",
      "先听发音，再从四个单词里选",
      "可以重播、慢速播放；答完才显示中文释义，避免“看着答案选”。",
      `<button class="btn btn--ghost" data-random-word>${icon("shuffle")}随机一词</button>
       <button class="btn btn--soft" data-go="#/spelling">${icon("edit")}去拼写</button>`
    )}
      <div id="listen-body"></div>`;
    view().innerHTML = html;
    const body = $("#listen-body");

    function renderSetup() {
      body.innerHTML = `<section class="quiz-setup">
        <article class="card card--pad setup-card">
          <div class="kicker">START LISTENING</div>
          <h2>选择词单</h2>
          <p class="muted">每组 10 词。先听，再选；听不清可以重播或慢速。</p>
          <div class="setup-block">
            <label>出题范围</label>
            <div class="segmented segmented--wrap" id="listen-scope">
              <button class="segmented__btn is-on" data-scope="today">${icon("clock")}今日计划</button>
              <button class="segmented__btn" data-scope="all">${icon("layers")}全部词库</button>
              <button class="segmented__btn" data-scope="starred">${icon("star")}生词本</button>
              <button class="segmented__btn" data-scope="wrong">${icon("target")}易错词</button>
            </div>
          </div>
          <button class="btn btn--primary btn--lg" id="listen-start">${icon("play")}开始听音</button>
        </article>
        <aside class="card card--pad setup-side">
          <div class="kicker">NOTE</div>
          <h3>关于发音</h3>
          <p class="muted">朗读使用 Windows / Edge 自带的英文语音，不需要联网。如果系统没有英文语音，按钮会提示不可用。</p>
          <ul class="rule-list">
            <li>每题只能作答一次。</li>
            <li>答完显示音标和完整释义。</li>
            <li>键盘 <kbd>1</kbd>–<kbd>4</kbd> 选答案，<kbd>R</kbd> 重播。</li>
          </ul>
        </aside>
      </section>`;
      let scope = "today";
      $("#listen-scope").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-scope]");
        if (!btn) return;
        scope = btn.dataset.scope;
        $$("#listen-scope .segmented__btn").forEach((b) => b.classList.toggle("is-on", b === btn));
      });
      $("#listen-start").addEventListener("click", () => start(scope));
    }

    function start(scope) {
      let pool = scopeWords(scope);
      if (!pool.length) pool = CV.words;
      round = CV.shuffle(pool).slice(0, 10);
      index = 0;
      answered = false;
      correctCount = 0;
      wrongIds = [];
      renderQuestion();
    }

    function renderQuestion() {
      if (!round || index >= round.length) return renderSummary();
      const w = round[index];
      answered = false;
      const pool = CV.words.filter((x) => x.id !== w.id && x.letter === w.letter);
      const distractors = CV.shuffle(pool.length >= 3 ? pool : CV.words.filter((x) => x.id !== w.id)).slice(0, 3);
      const options = CV.shuffle([w, ...distractors]);
      body.innerHTML = `<section class="listen-play card card--pad">
        <div class="quiz-play__top">
          <div class="quiz-play__meta"><span class="kicker">LISTEN & PICK</span><b>${index + 1}<small>/${round.length}</small></b></div>
          <div class="quiz-play__progress"><div class="meter"><i style="width:${(index / round.length) * 100}%"></i></div></div>
          <div class="quiz-play__score">${icon("headphones")}<b>${correctCount}</b><span>正确</span></div>
        </div>
        <div class="listen-stage">
          <button class="listen-orb" id="listen-play" aria-label="播放发音">${icon("volume")}<span>点击播放</span></button>
          <div class="listen-tools">
            <button class="btn btn--ghost btn--sm" id="listen-replay">${icon("refresh")}重播</button>
            <button class="btn btn--ghost btn--sm" id="listen-slow">${icon("play")}慢速 0.65×</button>
            <span class="muted">听发音，选正确的单词</span>
          </div>
        </div>
        <div class="quiz-options quiz-options--words" id="listen-options">
          ${options
            .map(
              (o, i) =>
                `<button class="quiz-option" data-option="${attr(o.id)}"><b>${i + 1}</b><span>${esc(o.word)}</span></button>`
            )
            .join("")}
        </div>
        <div id="listen-feedback" class="quiz-feedback" hidden></div>
        <div class="quiz-play__foot">
          <span class="muted"><kbd>1</kbd>–<kbd>4</kbd> 选择 · <kbd>R</kbd> 重播</span>
          <button class="btn btn--primary" id="listen-next" disabled>下一题${icon("arrow-right")}</button>
        </div>
      </section>`;

      const play = (rate) => CV.speak(w.word, rate || store.getSettings().rate);
      $("#listen-play").addEventListener("click", () => play());
      $("#listen-replay").addEventListener("click", () => play());
      $("#listen-slow").addEventListener("click", () => play(0.65));
      setTimeout(() => play(), 200);
      $("#listen-options").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-option]");
        if (!btn || answered) return;
        answer(btn.dataset.option, w, options);
      });
      $("#listen-next").addEventListener("click", () => {
        index += 1;
        renderQuestion();
      });
    }

    function answer(id, w, options) {
      if (answered) return;
      answered = true;
      const ok = id === w.id;
      if (ok) correctCount += 1;
      else wrongIds.push(w.id);
      const newly = store.recordAttempt(w.id, ok, "listening");
      newly.forEach((a) => {
        CV.toast(`解锁成就：${a.name}`, "success", 3000);
        CV.confetti(40);
      });
      $$("#listen-options .quiz-option").forEach((btn) => {
        const oid = btn.dataset.option;
        btn.classList.add("is-locked");
        if (oid === w.id) btn.classList.add("is-correct");
        if (oid === id && !ok) btn.classList.add("is-wrong");
      });
      const feedback = $("#listen-feedback");
      feedback.hidden = false;
      feedback.className = `quiz-feedback ${ok ? "is-correct" : "is-wrong"}`;
      feedback.innerHTML = `<div class="quiz-feedback__head">${icon(ok ? "check" : "x")}<b>${
        ok ? "听对了" : "正确答案是"
      }</b><span class="word-mini">${esc(w.word)}</span><span class="muted">/${esc(w.phonetic)}/</span>
        <button class="btn btn--ghost btn--sm" data-speak="${attr(w.word)}">${icon("volume")}朗读</button></div>
        <div class="quiz-feedback__def">${formatDef(w.definition)}</div>`;
      $("#listen-next").disabled = false;
      $("#listen-next").focus();
      if (ok) CV.confetti(30);
    }

    function renderSummary() {
      const total = round.length;
      const acc = total ? Math.round((correctCount / total) * 100) : 0;
      const wrongWords = wrongIds.map((id) => CV.byId[id]).filter(Boolean);
      body.innerHTML = `<section class="round-summary card card--pad">
        <div class="round-summary__ring">${CV.progressRing(acc, 168, 12)}<div class="ring-label"><b>${correctCount}<small>/${total}</small></b><span>听音正确</span></div></div>
        <div class="round-summary__copy">
          <div class="kicker">LISTENING COMPLETE</div>
          <h2>${acc >= 80 ? "耳朵已经认识这些词了" : "把错词多听两遍"}</h2>
          <p>共 ${total} 词 · 正确 ${correctCount} · 正确率 ${acc}%${wrongWords.length ? ` · ${wrongWords.length} 个错词` : ""}</p>
          <div class="round-summary__actions">
            <button class="btn btn--primary" data-listen-again>${icon("refresh")}再来一组</button>
            ${wrongWords.length ? `<button class="btn btn--soft" data-listen-wrong>${icon("target")}复习错词</button>` : ""}
            <button class="btn btn--ghost" data-go="#/today">${icon("home")}回今日学习</button>
          </div>
          ${wrongWords.length ? `<div class="wrong-strip"><span class="muted">错词</span>${wrongWords.map((w) => wordChip(w)).join("")}</div>` : ""}
        </div>
      </section>`;
      if (acc >= 80) CV.confetti(100);
      $("[data-listen-again]").addEventListener("click", renderSetup);
      const wrongBtn = $("[data-listen-wrong]");
      if (wrongBtn) wrongBtn.addEventListener("click", () => openDeck(wrongIds, `听音错词 · ${wrongIds.length} 词`));
    }

    CV.pageKeys = (e) => {
      if (e.target.matches("input, textarea, select")) return;
      if (!round || index >= round.length) return;
      if (!answered && /^[1-4]$/.test(e.key)) {
        const btn = $$("#listen-options .quiz-option")[Number(e.key) - 1];
        if (btn) btn.click();
      } else if (answered && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        index += 1;
        renderQuestion();
      } else if (e.key.toLowerCase() === "r" && round[index]) {
        CV.speak(round[index].word, store.getSettings().rate);
      }
    };

    renderSetup();
  };

  // ---------------------------------------------------------------- 词族

  CV.pages.families = function () {
    const covered = new Set();
    CV.families.forEach((f) => f.words.forEach((w) => covered.add(w.id)));
    let q = "";

    const html = `${pageHead(
      "WORD FAMILIES · 词族图谱",
      `按共同词根/前缀聚合出 <span class="hl">${CV.families.length}</span> 个词族`,
      "同一族里的词共享开头，放在一起记更容易形成网络；点任意词看释义。",
      `<button class="btn btn--ghost" data-random-word>${icon("shuffle")}随机一词</button>
       <button class="btn btn--soft" data-go="#/library">${icon("layers")}打开词库</button>`
    )}
      <section class="stats-grid stats-grid--3">
        ${CV.statCard({ icon: "tree", label: "词族数量", value: CV.families.length, unit: " 组", hint: "共享 4–7 位前缀", tone: "tone-lime" })}
        ${CV.statCard({ icon: "book", label: "覆盖单词", value: covered.size, unit: " 词", hint: `占词库 ${Math.round((covered.size / CV.words.length) * 100)}%`, tone: "tone-cyan" })}
        ${CV.statCard({ icon: "spark", label: "最大词族", value: CV.families[0] ? CV.families[0].words.length : 0, unit: " 词", hint: CV.families[0] ? CV.families[0].label : "", tone: "tone-violet" })}
      </section>
      <section class="card card--pad">
        <div class="filter-row">
          <label class="search search--large">${icon("search")}<input id="family-q" type="search" placeholder="搜词族前缀或族内单词…" autocomplete="off"></label>
          <span class="filter-count" id="family-count"></span>
        </div>
        <div class="family-grid" id="family-grid"></div>
      </section>`;

    view().innerHTML = html;
    const grid = $("#family-grid");
    const count = $("#family-count");

    function render() {
      const query = q.trim().toLowerCase();
      const rows = CV.families.filter((f) => {
        if (!query) return true;
        return f.stem.includes(query) || f.words.some((w) => w.word.toLowerCase().includes(query) || w.definition.includes(query));
      });
      count.innerHTML = `共 <b>${rows.length}</b> 组`;
      grid.innerHTML = rows.length
        ? rows
            .map(
              (f) => `<article class="family-card">
                <div class="family-card__head">
                  <div><span class="family-card__stem">${esc(f.label)}</span><span class="muted">${f.words.length} 词</span></div>
                  <button class="btn btn--ghost btn--sm" data-family-study="${attr(f.words.map((w) => w.id).join(","))}">${icon("play")}学这一族</button>
                </div>
                <div class="family-card__words">${f.words.map((w) => wordChip(w)).join("")}</div>
              </article>`
            )
            .join("")
        : CV.emptyState("search", "没有匹配的词族", "换个前缀或单词试试。");
      grid._rows = rows;
    }

    $("#family-q").addEventListener(
      "input",
      CV.debounce((e) => {
        q = e.target.value;
        render();
      }, 160)
    );
    grid.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-family-study]");
      if (!btn) return;
      const ids = btn.dataset.familyStudy.split(",").filter(Boolean);
      openDeck(ids, `词族学习 · ${ids.length} 词`);
    });
    render();
  };

  // ---------------------------------------------------------------- 生词本

  CV.pages.starred = function () {
    let q = "";

    const html = `${pageHead(
      "WORD BOOK · 生词本",
      `你收藏的 <span class="hl" id="star-count">${store.starredList().length}</span> 个词`,
      "在词库、闪卡或详情页点星标即可加入；这里适合集中复习和导出。",
      `<button class="btn btn--primary" data-star-study>${icon("play")}复习生词本</button>
       <button class="btn btn--ghost" data-star-export>${icon("download")}导出 CSV</button>`
    )}
      <section class="card card--pad">
        <div class="filter-row">
          <label class="search search--large">${icon("search")}<input id="star-q" type="search" placeholder="在生词本里搜索…" autocomplete="off"></label>
          <button class="btn btn--ghost btn--sm" data-star-clear>${icon("trash")}清空生词本</button>
        </div>
        <div class="list-head"><span>单词 / 释义</span><span>词性</span><span>状态</span><span></span></div>
        <div id="star-list" class="word-list"></div>
      </section>`;
    view().innerHTML = html;

    const list = $("#star-list");

    function render() {
      let rows = store.starredList();
      if (q.trim()) {
        const query = q.trim().toLowerCase();
        rows = rows.filter((w) => `${w.word} ${w.definition} ${w.phonetic}`.toLowerCase().includes(query));
      }
      list.innerHTML = rows.length
        ? rows.map((w) => wordRow(w)).join("")
        : CV.emptyState(
            "star",
            "生词本还是空的",
            "在词库、闪卡或词条详情里点星标，就能把词收进来。",
            `<button class="btn btn--primary" data-go="#/library">${icon("layers")}去词库挑词</button>`
          );
      const c = $("#star-count");
      if (c) c.textContent = store.starredList().length;
    }

    $("#star-q").addEventListener(
      "input",
      CV.debounce((e) => {
        q = e.target.value;
        render();
      }, 160)
    );
    $("[data-star-study]").addEventListener("click", () => openDeck(store.starredList().map((w) => w.id), "生词本"));
    $("[data-star-export]").addEventListener("click", () => {
      const rows = store.starredList();
      const csv = ["单词,音标,词性,释义", ...rows.map((w) => [w.word, w.phonetic, w.pos, w.definition].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","))].join("\r\n");
      CV.download("JHELIX-生词本.csv", "\ufeff" + csv, "text/csv;charset=utf-8");
      CV.toast(`已导出 ${rows.length} 个生词`, "success");
    });
    $("[data-star-clear]").addEventListener("click", async () => {
      const rows = store.starredList();
      if (!rows.length) return CV.toast("生词本已经是空的");
      const ok = await CV.confirmBox({
        title: "清空生词本？",
        message: `会取消 ${rows.length} 个词的收藏，学习记录和统计不受影响。`,
        okText: "清空",
        danger: true,
      });
      if (!ok) return;
      rows.forEach((w) => store.setStar(w.id, false));
      render();
      CV.toast("生词本已清空", "success");
    });
    render();
  };

  // ---------------------------------------------------------------- 统计

  CV.pages.stats = function () {
    const s = store.computeStats();
    const days = store.dailySeries(84);
    const recent = store.dailySeries(14);
    const status = store.statusCounts();
    const maxDay = Math.max(1, ...recent.map((d) => d.learned));
    const total = CV.words.length;
    const pctNew = Math.round((status.new / total) * 100);
    const pctLearning = Math.round((status.learning / total) * 100);
    const pctFamiliar = Math.round((status.familiar / total) * 100);
    const pctMastered = Math.max(0, 100 - pctNew - pctLearning - pctFamiliar);
    const posCounts = {};
    CV.words.forEach((w) => {
      posCounts[w.posGroup] = (posCounts[w.posGroup] || 0) + 1;
    });
    const posRows = Object.entries(posCounts).sort((a, b) => b[1] - a[1]);
    const wrong = store.wrongList().slice(0, 6);

    const lead = days[0].date.getDay();
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(`<span class="heat-cell heat--empty"></span>`);
    days.forEach((d) => cells.push(`<span class="heat-cell ${heatClass(d.learned)}" title="${attr(d.key)} · 新学 ${d.learned} 词 · 作答 ${d.total} 次"></span>`));

    const html = `${pageHead(
      "INSIGHTS · 学习统计",
      "把每一次点击，变成看得见的进度",
      "数据只保存在本机。换电脑前可以在设置里导出 JSON。",
      `<button class="btn btn--ghost" data-go="#/achievements">${icon("trophy")}看成就</button>
       <button class="btn btn--soft" data-stats-export>${icon("download")}导出进度</button>`
    )}
      <section class="stats-grid">
        ${CV.statCard({ icon: "book", label: "已见过", value: s.learned, unit: ` / ${s.totalWords}`, hint: `${Math.round((s.learned / s.totalWords) * 100)}% 词库`, tone: "tone-lime" })}
        ${CV.statCard({ icon: "check", label: "已掌握", value: s.mastered, unit: " 词", hint: "状态为“掌握”", tone: "tone-cyan" })}
        ${CV.statCard({ icon: "flame", label: "连续学习", value: s.streak, unit: " 天", hint: `最长 ${s.bestStreak} 天`, tone: "tone-orange" })}
        ${CV.statCard({ icon: "target", label: "总正确率", value: s.accuracy, unit: "%", hint: `${s.correct}/${s.answers} 次`, tone: "tone-violet" })}
      </section>

      <section class="two-col two-col--wide-left">
        <article class="card card--pad">
          <div class="card-head">
            <div><div class="kicker">12 WEEKS</div><h3>学习热力图</h3><p>共 ${s.daysStudied} 天有学习记录，累计 ${s.learned} 词。</p></div>
            <div class="heat-legend"><span>少</span><i class="heat--1"></i><i class="heat--2"></i><i class="heat--3"></i><i class="heat--4"></i><span>多</span></div>
          </div>
          <div class="heatmap">${cells.join("")}</div>
          <div class="heatmap__months"><span>12 周前</span><span>今天</span></div>
        </article>
        <article class="card card--pad">
          <div class="kicker">LEVEL</div>
          <div class="level-hero">
            <div class="level-hero__badge">Lv.${s.level.index}</div>
            <div class="level-hero__copy">
              <h3>${esc(s.level.name)}</h3>
              <p>${s.xp} XP · ${s.level.nextAt ? `距下一级还差 ${s.level.toNext} XP` : "已满级"}</p>
              <div class="meter"><i style="width:${s.level.progress}%"></i></div>
            </div>
          </div>
          <div class="mini-stats mini-stats--grid">
            <span><b>${s.answers}</b>总作答</span>
            <span><b>${s.correct}</b>总答对</span>
            <span><b>${s.starred}</b>收藏词</span>
            <span><b>${s.daysStudied}</b>学习天数</span>
          </div>
        </article>
      </section>

      <section class="two-col">
        <article class="card card--pad">
          <div class="card-head"><div><div class="kicker">LAST 14 DAYS</div><h3>每日新学词数</h3></div></div>
          <div class="bar-chart">
            ${recent
              .map(
                (d) =>
                  `<div class="bar-col" title="${attr(d.key)} · ${d.learned} 词">
                    <span class="bar-val">${d.learned || ""}</span>
                    <i class="bar" style="height:${d.learned ? Math.max(2, (d.learned / maxDay) * 100) : 0}%"></i>
                    <span class="bar-label">${d.label}</span>
                  </div>`
              )
              .join("")}
            ${
              recent.some((d) => d.learned)
                ? ""
                : `<div class="chart-empty">最近 14 天还没有学习记录<span>完成一组闪卡或测验后，这里会亮起来。</span></div>`
            }
          </div>
        </article>
        <article class="card card--pad">
          <div class="card-head"><div><div class="kicker">MASTERY</div><h3>词库掌握分布</h3></div></div>
          <div class="donut-wrap">
            <div class="donut" style="background:conic-gradient(var(--lime) 0 ${pctMastered}%, var(--cyan) ${pctMastered}% ${pctMastered + pctFamiliar}%, var(--violet) ${pctMastered + pctFamiliar}% ${pctMastered + pctFamiliar + pctLearning}%, rgba(255,255,255,.10) ${pctMastered + pctFamiliar + pctLearning}% 100%)">
              <div class="donut__hole"><b>${s.learned}</b><span>已见过</span></div>
            </div>
            <div class="legend">
              <span><i style="background:var(--lime)"></i>掌握 <b>${status.mastered}</b></span>
              <span><i style="background:var(--cyan)"></i>熟悉 <b>${status.familiar}</b></span>
              <span><i style="background:var(--violet)"></i>学习中 <b>${status.learning}</b></span>
              <span><i style="background:rgba(255,255,255,.10)"></i>新词 <b>${status.new}</b></span>
            </div>
          </div>
        </article>
      </section>

      <section class="two-col">
        <article class="card card--pad">
          <div class="card-head"><div><div class="kicker">BY POS</div><h3>词性分布</h3></div></div>
          <div class="pos-bars">
            ${posRows
              .map(
                ([pos, n]) =>
                  `<div class="pos-bar"><span>${esc(pos)}</span><div class="meter"><i style="width:${(n / total) * 100}%"></i></div><b>${n}</b></div>`
              )
              .join("")}
          </div>
        </article>
        <article class="card card--pad">
          <div class="card-head">
            <div><div class="kicker">NEEDS REVIEW</div><h3>最需要复习</h3><p>按答错次数排序。</p></div>
            <button class="btn btn--ghost btn--sm" data-go="#/flashcards?deck=wrong">${icon("arrow-right")}全部</button>
          </div>
          <div class="word-list">
            ${wrong.length ? wrong.map((w) => wordRow(w, { compact: true })).join("") : CV.emptyState("check", "还没有错词", "继续做题，错词会自动汇总到这里。")}
          </div>
        </article>
      </section>`;

    view().innerHTML = html;
    $("[data-stats-export]").addEventListener("click", () => {
      CV.download(`JHELIX-学习进度-${CV.todayKey()}.json`, store.exportJSON(), "application/json;charset=utf-8");
      CV.toast("学习进度已导出", "success");
    });
  };

  // ---------------------------------------------------------------- 成就

  CV.pages.achievements = function () {
    const s = store.computeStats();
    const newly = store.evaluateAchievements();
    newly.forEach((a) => CV.toast(`解锁成就：${a.name}`, "success", 3000));
    if (newly.length) CV.confetti(60);
    const unlocked = Object.keys(store.rawState().achievements).length;

    const html = `${pageHead(
      "ACHIEVEMENTS · 成就徽章",
      `已解锁 <span class="hl">${unlocked}</span> / ${store.ACHIEVEMENTS.length} 枚徽章`,
      "成就会随着学习自动解锁，不需要手动领取；进度只存在本机。",
      `<button class="btn btn--ghost" data-go="#/stats">${icon("chart")}看统计</button>
       <button class="btn btn--soft" data-go="#/today">${icon("home")}回今日</button>`
    )}
      <section class="level-banner card card--pad">
        <div class="level-banner__ring">${CV.progressRing(s.level.progress, 132, 10)}<div class="ring-label"><b>Lv.${s.level.index}</b><span>${esc(s.level.name)}</span></div></div>
        <div class="level-banner__copy">
          <div class="kicker">CURRENT LEVEL</div>
          <h2>${esc(s.level.name)}</h2>
          <p>${s.xp} XP · ${s.level.nextAt ? `升级还需 ${s.level.toNext} XP` : "已达最高等级"} · 累计学习 ${s.learned} 词</p>
          <div class="meter"><i style="width:${s.level.progress}%"></i></div>
          <div class="level-banner__hint">XP = 学过的词 × 8 + 掌握的词 × 20 + 答对次数 × 2 + 学习天数 × 5</div>
        </div>
      </section>
      <section class="badge-grid">
        ${store.ACHIEVEMENTS.map((a) => {
          const at = store.rawState().achievements[a.key];
          const pr = a.progress(s);
          const pct = pr[1] ? Math.min(100, Math.round((pr[0] / pr[1]) * 100)) : 0;
          return `<article class="badge-card ${at ? "is-unlocked" : "is-locked"}">
            <div class="badge-card__ico">${icon(at ? a.icon : "lock")}</div>
            <div class="badge-card__body">
              <div class="badge-card__head"><h3>${esc(a.name)}</h3>${at ? `<span class="badge-tag">已解锁</span>` : `<span class="badge-tag badge-tag--lock">${pct}%</span>`}</div>
              <p>${esc(a.desc)}</p>
              <div class="meter meter--slim"><i style="width:${pct}%"></i></div>
              <div class="badge-card__foot">${at ? `解锁于 ${new Date(at).toLocaleDateString("zh-CN")}` : `进度 ${pr[0]} / ${pr[1]}`}</div>
            </div>
          </article>`;
        }).join("")}
      </section>`;
    view().innerHTML = html;
    if (newly.length) setTimeout(() => CV.confetti(80), 250);
  };

  // ---------------------------------------------------------------- 设置

  CV.pages.settings = function () {
    const settings = store.getSettings();
    const meta = CV.meta || {};
    const shortcuts = [
      ["Alt + 1…9", "切换前 9 个板块"],
      ["Alt + 0", "打开设置与帮助"],
      ["Ctrl + K", "聚焦顶部搜索"],
      ["空格", "闪卡翻面"],
      ["1 / 2 / 3", "闪卡：不认识 / 模糊 / 认识"],
      ["← / →", "闪卡上一张 / 下一张"],
      ["P / S", "闪卡朗读 / 收藏"],
      ["1–4", "测验 / 听音选答案"],
      ["Enter", "提交 / 下一题"],
      ["R", "听音重播"],
      ["Esc", "关闭弹窗"],
    ];

    const html = `${pageHead(
      "SETTINGS · 设置与帮助",
      "把学习节奏调成适合你的样子",
      "所有数据保存在本机浏览器存储中；不会上传，也不需要账号。",
      `<button class="btn btn--ghost" data-go="#/today">${icon("home")}回今日</button>
       ${CV.isDesktop ? `<button class="btn btn--danger-ghost" data-exit-app>${icon("power")}退出软件</button>` : ""}`
    )}
      <section class="two-col">
        <article class="card card--pad">
          <div class="card-head"><div><div class="kicker">STUDY HABIT</div><h3>学习节奏</h3></div></div>
          <div class="setting-row">
            <div><b>每日目标</b><p>今日词单和进度环按这个数量计算。</p></div>
            <div class="setting-control">
              <input id="set-goal" type="range" min="10" max="100" step="5" value="${settings.dailyGoal}">
              <span class="setting-value" id="set-goal-val">${settings.dailyGoal} 词</span>
            </div>
          </div>
          <div class="setting-row">
            <div><b>自动朗读</b><p>进入闪卡 / 听音页面时自动播放单词。</p></div>
            <button class="switch ${settings.autoSpeak ? "is-on" : ""}" id="set-autospeak" role="switch" aria-checked="${settings.autoSpeak ? "true" : "false"}"><i></i></button>
          </div>
          <div class="setting-row">
            <div><b>朗读速度</b><p>0.6× 更清楚，1.2× 更接近正常语速。</p></div>
            <div class="setting-control">
              <input id="set-rate" type="range" min="0.6" max="1.2" step="0.05" value="${settings.rate}">
              <span class="setting-value" id="set-rate-val">${Number(settings.rate).toFixed(2)}×</span>
            </div>
          </div>
          <div class="setting-row">
            <div><b>界面主题</b><p>深色适合晚上，浅色适合白天。</p></div>
            <div class="segmented" id="set-theme">
              <button class="segmented__btn ${settings.theme === "dark" ? "is-on" : ""}" data-theme-value="dark">${icon("moon")}深色</button>
              <button class="segmented__btn ${settings.theme === "light" ? "is-on" : ""}" data-theme-value="light">${icon("sun")}浅色</button>
            </div>
          </div>
        </article>

        <article class="card card--pad">
          <div class="card-head"><div><div class="kicker">DATA</div><h3>学习数据</h3><p>建议每周导出一次备份。</p></div></div>
          <div class="data-actions">
            <button class="btn btn--soft" data-settings-export>${icon("download")}导出 JSON 备份</button>
            <button class="btn btn--soft" data-settings-import>${icon("upload")}导入 JSON 备份</button>
            <input type="file" id="import-file" accept=".json,application/json" hidden>
            ${CV.isDesktop ? `<button class="btn btn--ghost" data-open-dir>${icon("folder")}打开程序目录</button>` : ""}
            <button class="btn btn--danger-ghost" data-reset-all>${icon("trash")}清空全部进度</button>
          </div>
          <div class="data-meta">
            <span>词库：<b>${CV.words.length}</b> 词</span>
            <span>来源：<b>${(meta.sources || []).length}</b> 份 docx</span>
            <span>构建：<b>${esc(meta.builtAt || "-")}</b></span>
            <span>版本：<b>v1.0.0</b></span>
          </div>
          <p class="muted data-note">导入会覆盖当前学习记录。若只想保留旧数据，请先导出一份备份。</p>
        </article>
      </section>

      <section class="card card--pad">
        <div class="card-head"><div><div class="kicker">KEYBOARD</div><h3>快捷键</h3></div><span class="muted">闪卡 / 测验页里生效</span></div>
        <div class="shortcut-grid">
          ${shortcuts.map(([key, desc]) => `<div class="shortcut"><kbd>${esc(key)}</kbd><span>${esc(desc)}</span></div>`).join("")}
        </div>
      </section>

      <section class="card card--pad about-card">
        <div class="kicker">ABOUT</div>
        <h3>JHELIX · 词旋</h3>
        <p>把两份《四级高频词汇》整理成可点击、可复习、可统计的桌面学习工具。纯本地运行，零外部依赖，不联网、不登录、不上传。</p>
        <div class="about-meta">
          <span>开发者：J. Helix</span>
          <span>今日：${CV.todayKey()}</span>
          <span>存储：本机浏览器 localStorage</span>
          <span>词库构建：${esc(meta.builtAt || "-")}</span>
        </div>
      </section>`;

    view().innerHTML = html;

    $("#set-goal").addEventListener("input", (e) => {
      const value = Number(e.target.value);
      $("#set-goal-val").textContent = `${value} 词`;
      store.setSetting("dailyGoal", value);
    });
    $("#set-autospeak").addEventListener("click", (e) => {
      const on = !store.getSettings().autoSpeak;
      store.setSetting("autoSpeak", on);
      e.currentTarget.classList.toggle("is-on", on);
      e.currentTarget.setAttribute("aria-checked", on ? "true" : "false");
      CV.toast(on ? "已开启自动朗读" : "已关闭自动朗读", "success");
    });
    $("#set-rate").addEventListener("input", (e) => {
      const value = Number(e.target.value);
      $("#set-rate-val").textContent = `${value.toFixed(2)}×`;
      store.setSetting("rate", value);
    });
    $("#set-theme").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-theme-value]");
      if (!btn) return;
      const value = btn.dataset.themeValue;
      store.setSetting("theme", value);
      document.documentElement.dataset.theme = value;
      $$("#set-theme .segmented__btn").forEach((b) => b.classList.toggle("is-on", b === btn));
    });
    $("[data-settings-export]").addEventListener("click", () => {
      CV.download(`JHELIX-学习进度-${CV.todayKey()}.json`, store.exportJSON(), "application/json;charset=utf-8");
      CV.toast("学习进度已导出", "success");
    });
    $("[data-settings-import]").addEventListener("click", () => $("#import-file").click());
    $("#import-file").addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const text = await CV.readTextFile(file);
        const obj = JSON.parse(text);
        const ok = await CV.confirmBox({
          title: "导入学习数据？",
          message: "当前学习记录会被覆盖。建议先导出一份备份。",
          okText: "导入",
          danger: true,
        });
        if (!ok) return;
        if (!store.importJSON(obj)) throw new Error("文件格式不正确");
        CV.toast("导入成功，正在刷新…", "success");
        setTimeout(() => location.reload(), 700);
      } catch (err) {
        CV.toast("导入失败：" + err.message, "error", 3500);
      } finally {
        e.target.value = "";
      }
    });
    const openDir = $("[data-open-dir]");
    if (openDir) openDir.addEventListener("click", async () => {
      try {
        const res = await fetch("/api/open-dir", { method: "POST" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        CV.toast("已打开程序目录", "success");
      } catch (err) {
        CV.toast("打开失败：" + err.message, "error");
      }
    });
    $("[data-reset-all]").addEventListener("click", async () => {
      const ok = await CV.confirmBox({
        title: "清空全部学习进度？",
        message: "会删除所有学习记录、收藏、统计和成就，且无法恢复。词库本身不会删除。",
        okText: "全部清空",
        danger: true,
      });
      if (!ok) return;
      store.resetAll();
      CV.toast("学习进度已清空", "success");
      setTimeout(() => location.reload(), 600);
    });
    const exitApp = $("[data-exit-app]");
    if (exitApp) exitApp.addEventListener("click", async () => {
      const ok = await CV.confirmBox({
        title: "退出 JHELIX？",
        message: "学习记录会自动保存。下次从桌面图标重新打开即可。",
        okText: "退出",
      });
      if (!ok) return;
      try {
        await fetch("/api/exit", { method: "POST" });
      } catch (err) {
        // 服务停止后请求可能中断，属于预期
      }
      setTimeout(() => {
        document.body.innerHTML = `<div class="bye"><div class="bye__mark">JH</div><h1>已退出</h1><p>可以直接关闭这个窗口。</p></div>`;
      }, 350);
    });
  };

  // ---------------------------------------------------------------- 词条详情

  CV.openWord = function (id) {
    const w = CV.byId[id];
    if (!w) return;
    const r = store.getReview(id);
    const st = CV.statusMeta(r ? r.status : 0);
    const fam = CV.wordFamily(id);
    const sim = CV.wordSimilar(id);
    const due = r && r.due ? new Date(r.due) : null;
    const dueText = due ? (due.getTime() <= Date.now() ? "现在" : due.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })) : "未安排";

    CV.modalOpen(
      `<div class="detail">
        <div class="detail__top">
          <span class="pos-pill">${esc(w.pos)}</span>
          <span class="chip chip--ghost">${esc(w.letter)}</span>
          <span class="badge ${st.cls}">${st.label}</span>
          <span class="detail__order">第 ${w.order} 词 · 来源 ${w.source === 1 ? "词汇 1" : "词汇 2"}</span>
        </div>
        <h2 class="detail__word">${esc(w.word)}</h2>
        <div class="detail__phonetic">/${esc(w.phonetic)}/
          <button class="btn btn--soft btn--sm" data-speak="${attr(w.word)}">${icon("volume")}朗读</button>
          ${starButton(w.id, "star-btn--lg")}
        </div>
        <div class="detail__def">${formatDef(w.definition)}</div>
        <div class="detail__actions">
          <button class="btn btn--danger-ghost" data-detail-judge="unsure">${icon("x")}不认识</button>
          <button class="btn btn--soft" data-detail-judge="fuzzy">${icon("refresh")}模糊</button>
          <button class="btn btn--primary" data-detail-judge="know">${icon("check")}认识</button>
        </div>
        <div class="detail__stats">
          <span>答对 <b>${r ? r.correct : 0}</b></span>
          <span>答错 <b>${r ? r.wrong : 0}</b></span>
          <span>连续答对 <b>${r ? r.streak : 0}</b></span>
          <span>下次复习 <b>${dueText}</b></span>
        </div>
        ${
          fam.length
            ? `<div class="detail__section"><div class="detail__section-head">${icon("tree")}同族词</div>
                <div class="detail__chips">${fam
                  .flatMap((f) => f.words)
                  .filter((x, i, arr) => x.id !== w.id && arr.findIndex((y) => y.id === x.id) === i)
                  .slice(0, 10)
                  .map((x) => wordChip(x))
                  .join("")}</div></div>`
            : ""
        }
        ${
          sim.length
            ? `<div class="detail__section"><div class="detail__section-head">${icon("shuffle")}形近词</div>
                <div class="detail__chips">${sim.map((x) => wordChip(x)).join("")}</div></div>`
            : ""
        }
        <div class="detail__foot">
          <button class="btn btn--ghost btn--sm" data-detail-random>${icon("shuffle")}随机下一词</button>
          <span class="muted">快捷键：Esc 关闭</span>
        </div>
      </div>`,
      (root) => {
        $$("[data-detail-judge]", root).forEach((btn) => {
          btn.addEventListener("click", () => {
            const newly = store.markWord(w.id, btn.dataset.detailJudge, "flash");
            newly.forEach((a) => {
              CV.toast(`解锁成就：${a.name}`, "success", 3000);
              CV.confetti(40);
            });
            CV.toast(`已记录：${btn.textContent.trim()}`, "success");
            CV.openWord(id);
          });
        });
        $("[data-detail-random]", root).addEventListener("click", () => {
          const next = CV.randomWord(id);
          if (next) CV.openWord(next.id);
        });
      }
    );
  };

  CV.openDeck = openDeck;
  CV.scopeWords = scopeWords;
})();
