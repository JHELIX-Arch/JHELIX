/* JHELIX · 本机学习状态（localStorage，无网络、无账号） */
(function () {
  "use strict";

  const CV = window.CV;
  const KEY = "jhelix_cet4_state_v1";
  const LEGACY_KEY = "ciyue_cet4_state_v1";
  const INTERVALS = [0, 1, 3, 7, 15, 30, 60];

  function defaultState() {
    const now = new Date().toISOString();
    return {
      version: 1,
      createdAt: now,
      settings: {
        dailyGoal: 25,
        autoSpeak: true,
        rate: 0.9,
        theme: "dark",
      },
      reviews: {},
      history: {},
      totals: {
        answers: 0,
        correct: 0,
        modes: {
          flash: { total: 0, correct: 0 },
          quiz: { total: 0, correct: 0 },
          spelling: { total: 0, correct: 0 },
          listening: { total: 0, correct: 0 },
        },
      },
      achievements: {},
    };
  }

  function mergeState(raw) {
    const base = defaultState();
    if (!raw || typeof raw !== "object") return base;
    const state = Object.assign(base, raw);
    state.settings = Object.assign(base.settings, raw.settings || {});
    state.totals = Object.assign(base.totals, raw.totals || {});
    state.totals.modes = Object.assign(base.totals.modes, (raw.totals && raw.totals.modes) || {});
    state.reviews = raw.reviews && typeof raw.reviews === "object" ? raw.reviews : {};
    state.history = raw.history && typeof raw.history === "object" ? raw.history : {};
    state.achievements = raw.achievements && typeof raw.achievements === "object" ? raw.achievements : {};
    return state;
  }

  let state = defaultState();
  try {
    let saved = localStorage.getItem(KEY);
    if (!saved) {
      // 从旧版本迁移一次，避免改名后丢失已有进度。
      saved = localStorage.getItem(LEGACY_KEY);
      if (saved) localStorage.setItem(KEY, saved);
    }
    if (saved) state = mergeState(JSON.parse(saved));
  } catch (err) {
    console.warn("读取学习记录失败，使用空白状态", err);
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      console.warn("保存学习记录失败", err);
      CV.toast("本机存储写入失败，进度可能无法保存", "error", 3500);
    }
  }

  function ensureReview(id) {
    if (!state.reviews[id]) {
      state.reviews[id] = {
        seen: false,
        status: 0,
        starred: false,
        correct: 0,
        wrong: 0,
        streak: 0,
        first: 0,
        last: 0,
        due: 0,
      };
    }
    return state.reviews[id];
  }

  function ensureHistory(key) {
    if (!state.history[key]) {
      state.history[key] = { learned: [], reviewed: 0, correct: 0, total: 0, modes: {} };
    }
    const h = state.history[key];
    if (!Array.isArray(h.learned)) h.learned = [];
    if (!h.modes) h.modes = {};
    return h;
  }

  function touchHistory(id, correct, mode) {
    const h = ensureHistory(CV.todayKey());
    if (!h.learned.includes(id)) h.learned.push(id);
    h.total += 1;
    if (correct) h.correct += 1;
    if (!h.modes[mode]) h.modes[mode] = { total: 0, correct: 0 };
    h.modes[mode].total += 1;
    if (correct) h.modes[mode].correct += 1;
    return h;
  }

  function touchTotals(correct, mode) {
    state.totals.answers += 1;
    if (correct) state.totals.correct += 1;
    if (!state.totals.modes[mode]) state.totals.modes[mode] = { total: 0, correct: 0 };
    state.totals.modes[mode].total += 1;
    if (correct) state.totals.modes[mode].correct += 1;
  }

  function markWord(id, quality, mode) {
    const now = Date.now();
    const r = ensureReview(id);
    const wasSeen = !!r.seen;
    const h = ensureHistory(CV.todayKey());
    if (wasSeen) h.reviewed += 1;
    r.seen = true;
    if (!r.first) r.first = now;
    r.last = now;

    if (quality === "know") {
      r.streak = Math.min(6, (r.streak || 0) + 1);
      r.status = Math.min(3, Math.max(1, Math.ceil(r.streak / 2)));
      r.correct += 1;
      r.due = now + INTERVALS[r.streak] * CV.DAY;
    } else if (quality === "fuzzy") {
      r.streak = Math.max(1, (r.streak || 0) - 1);
      r.status = Math.max(1, Math.min(3, Math.ceil(r.streak / 2)));
      r.correct += 1;
      r.due = now + 1 * CV.DAY;
    } else {
      r.streak = 0;
      r.status = 1;
      r.wrong += 1;
      r.due = now + 10 * CV.MIN;
    }
    touchHistory(id, quality !== "unsure", mode || "flash");
    touchTotals(quality !== "unsure", mode || "flash");
    save();
    return evaluateAchievements();
  }

  function recordAttempt(id, correct, mode) {
    const now = Date.now();
    const r = ensureReview(id);
    const wasSeen = !!r.seen;
    const h = ensureHistory(CV.todayKey());
    if (wasSeen) h.reviewed += 1;
    r.seen = true;
    if (!r.first) r.first = now;
    r.last = now;
    if (correct) {
      r.correct += 1;
    } else {
      r.wrong += 1;
      r.streak = 0;
      r.status = Math.max(1, r.status);
      r.due = now + 10 * CV.MIN;
    }
    touchHistory(id, correct, mode);
    touchTotals(correct, mode);
    save();
    return evaluateAchievements();
  }

  function toggleStar(id) {
    const r = ensureReview(id);
    r.starred = !r.starred;
    save();
    return r.starred;
  }

  function setStar(id, value) {
    const r = ensureReview(id);
    r.starred = !!value;
    save();
  }

  function getReview(id) {
    return state.reviews[id] || null;
  }

  function isSeen(id) {
    return !!(state.reviews[id] && state.reviews[id].seen);
  }

  function dueList() {
    const now = Date.now();
    return (CV.words || [])
      .filter((w) => {
        const r = state.reviews[w.id];
        return r && r.seen && r.due && r.due <= now;
      })
      .sort((a, b) => (state.reviews[a.id].due || 0) - (state.reviews[b.id].due || 0));
  }

  function newList() {
    return (CV.words || []).filter((w) => !isSeen(w.id));
  }

  function starredList() {
    return (CV.words || []).filter((w) => state.reviews[w.id] && state.reviews[w.id].starred);
  }

  function wrongList() {
    return (CV.words || [])
      .filter((w) => state.reviews[w.id] && state.reviews[w.id].wrong > 0)
      .sort((a, b) => state.reviews[b.id].wrong - state.reviews[a.id].wrong);
  }

  function todayDeck() {
    const goal = Number(state.settings.dailyGoal) || 25;
    const h = state.history[CV.todayKey()] || { learned: [] };
    const remain = Math.max(1, goal - (h.learned ? h.learned.length : 0));
    const due = dueList();
    const fresh = newList();
    const seen = new Set();
    const deck = [];
    const push = (w) => {
      if (!seen.has(w.id)) {
        seen.add(w.id);
        deck.push(w);
      }
    };
    due.forEach(push);
    fresh.forEach(push);
    return deck.slice(0, Math.max(remain, Math.min(10, deck.length)));
  }

  function todayPlan(limit) {
    const goal = Number(state.settings.dailyGoal) || 25;
    const h = state.history[CV.todayKey()] || { learned: [] };
    const done = h.learned ? h.learned.length : 0;
    const remain = Math.max(0, goal - done);
    const due = dueList();
    const fresh = newList();
    const seen = new Set();
    const plan = [];
    const push = (w) => {
      if (!seen.has(w.id) && plan.length < (limit || goal)) {
        seen.add(w.id);
        plan.push(w);
      }
    };
    due.forEach(push);
    fresh.forEach(push);
    return { plan, dueCount: due.length, newCount: fresh.length, done, goal, remain };
  }

  function computeStreak() {
    let day = new Date();
    let key = CV.dateKey(day);
    const active = (k) => state.history[k] && state.history[k].total > 0;
    if (!active(key)) {
      day = CV.addDays(day, -1);
      key = CV.dateKey(day);
    }
    let streak = 0;
    while (active(key) && streak < 4000) {
      streak += 1;
      day = CV.addDays(day, -1);
      key = CV.dateKey(day);
    }
    return streak;
  }

  function bestStreak() {
    const keys = Object.keys(state.history)
      .filter((k) => state.history[k] && state.history[k].total > 0)
      .sort();
    let best = 0;
    let run = 0;
    let prev = null;
    keys.forEach((key) => {
      const d = new Date(`${key}T00:00:00`);
      if (prev && CV.daysBetween(d, prev) === 1) run += 1;
      else run = 1;
      best = Math.max(best, run);
      prev = d;
    });
    return best;
  }

  function computeStats() {
    const reviews = Object.values(state.reviews);
    const seen = reviews.filter((r) => r.seen);
    const mastered = seen.filter((r) => r.status >= 3).length;
    const familiar = seen.filter((r) => r.status >= 2).length;
    const starred = reviews.filter((r) => r.starred).length;
    const answers = state.totals.answers || 0;
    const correct = state.totals.correct || 0;
    const today = state.history[CV.todayKey()] || { learned: [], total: 0, correct: 0 };
    const todayLearned = today.learned ? today.learned.length : 0;
    const daysStudied = Object.keys(state.history).filter((k) => state.history[k].total > 0).length;
    const xp = seen.length * 8 + mastered * 20 + correct * 2 + daysStudied * 5;
    return {
      totalWords: (CV.words || []).length,
      learned: seen.length,
      mastered,
      familiar,
      starred,
      answers,
      correct,
      accuracy: answers ? Math.round((correct / answers) * 100) : 0,
      todayLearned,
      todayTotal: today.total || 0,
      todayCorrect: today.correct || 0,
      dueCount: dueList().length,
      newCount: newList().length,
      streak: computeStreak(),
      bestStreak: bestStreak(),
      daysStudied,
      xp,
      level: levelInfo(xp),
    };
  }

  const LEVELS = [
    { at: 0, name: "词海萌新" },
    { at: 200, name: "入门学徒" },
    { at: 500, name: "记忆练习生" },
    { at: 900, name: "词汇猎手" },
    { at: 1400, name: "短语工匠" },
    { at: 2000, name: "词根侦探" },
    { at: 2800, name: "语境行者" },
    { at: 3800, name: "记忆大师" },
    { at: 5000, name: "词汇领航员" },
    { at: 6500, name: "四级词王" },
    { at: 8200, name: "语言学徒" },
    { at: 10000, name: "词旋宗师" },
  ];

  function levelInfo(xp) {
    let idx = 0;
    for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i].at) idx = i;
    const current = LEVELS[idx];
    const next = LEVELS[idx + 1] || null;
    const floor = current.at;
    const ceiling = next ? next.at : Math.max(current.at + 1, xp);
    return {
      index: idx + 1,
      name: current.name,
      xp,
      nextName: next ? next.name : "满级",
      nextAt: next ? next.at : null,
      progress: next ? Math.round(((xp - floor) / (ceiling - floor)) * 100) : 100,
      toNext: next ? Math.max(0, next.at - xp) : 0,
    };
  }

  function dailySeries(days) {
    const out = [];
    const today = CV.startOfDay(new Date());
    for (let i = days - 1; i >= 0; i--) {
      const d = CV.addDays(today, -i);
      const key = CV.dateKey(d);
      const h = state.history[key] || { learned: [], total: 0, correct: 0 };
      out.push({
        key,
        date: d,
        label: CV.shortDate(key),
        weekday: CV.weekdayCN(d),
        learned: h.learned ? h.learned.length : 0,
        total: h.total || 0,
        correct: h.correct || 0,
      });
    }
    return out;
  }

  function statusCounts() {
    const counts = { new: 0, learning: 0, familiar: 0, mastered: 0 };
    (CV.words || []).forEach((w) => {
      const r = state.reviews[w.id];
      if (!r || !r.seen) counts.new += 1;
      else if (r.status >= 3) counts.mastered += 1;
      else if (r.status >= 2) counts.familiar += 1;
      else counts.learning += 1;
    });
    return counts;
  }

  const ACHIEVEMENTS = [
    { key: "first", name: "初来乍到", desc: "学会第 1 个词", icon: "spark", check: (s) => s.learned >= 1, progress: (s) => [Math.min(s.learned, 1), 1] },
    { key: "ten", name: "小试牛刀", desc: "累计学习 10 个词", icon: "bolt", check: (s) => s.learned >= 10, progress: (s) => [Math.min(s.learned, 10), 10] },
    { key: "fifty", name: "词汇新星", desc: "累计学习 50 个词", icon: "star", check: (s) => s.learned >= 50, progress: (s) => [Math.min(s.learned, 50), 50] },
    { key: "hundred", name: "百词斩", desc: "累计学习 100 个词", icon: "layers", check: (s) => s.learned >= 100, progress: (s) => [Math.min(s.learned, 100), 100] },
    { key: "half", name: "半程英雄", desc: "学完词库的一半", icon: "target", check: (s) => s.learned >= Math.ceil(s.totalWords * 0.5), progress: (s) => [s.learned, Math.ceil(s.totalWords * 0.5)] },
    { key: "all", name: "词库通关", desc: "词库中的单词全部见过", icon: "crown", check: (s) => s.learned >= s.totalWords, progress: (s) => [s.learned, s.totalWords] },
    { key: "streak3", name: "三日不辍", desc: "连续学习 3 天", icon: "flame", check: (s) => s.bestStreak >= 3, progress: (s) => [Math.min(s.bestStreak, 3), 3] },
    { key: "streak7", name: "七日成习", desc: "连续学习 7 天", icon: "flame", check: (s) => s.bestStreak >= 7, progress: (s) => [Math.min(s.bestStreak, 7), 7] },
    { key: "streak30", name: "月度行者", desc: "连续学习 30 天", icon: "medal", check: (s) => s.bestStreak >= 30, progress: (s) => [Math.min(s.bestStreak, 30), 30] },
    { key: "sniper", name: "神射手", desc: "答题 50 次且正确率 ≥ 90%", icon: "target", check: (s) => s.answers >= 50 && s.accuracy >= 90, progress: (s) => [Math.min(s.answers, 50), 50] },
    { key: "collector", name: "收藏家", desc: "生词本收藏 20 个词", icon: "star", check: (s) => s.starred >= 20, progress: (s) => [Math.min(s.starred, 20), 20] },
    { key: "spell20", name: "拼写达人", desc: "拼写挑战答对 20 次", icon: "edit", check: () => modeCorrect("spelling") >= 20, progress: () => [Math.min(modeCorrect("spelling"), 20), 20] },
    { key: "listen20", name: "听音达人", desc: "听音辨词答对 20 次", icon: "headphones", check: () => modeCorrect("listening") >= 20, progress: () => [Math.min(modeCorrect("listening"), 20), 20] },
    { key: "master50", name: "稳固记忆", desc: "掌握 50 个词", icon: "check", check: (s) => s.mastered >= 50, progress: (s) => [Math.min(s.mastered, 50), 50] },
  ];

  function modeCorrect(mode) {
    const m = state.totals.modes[mode];
    return m ? m.correct : 0;
  }

  function evaluateAchievements() {
    const s = computeStats();
    const newly = [];
    ACHIEVEMENTS.forEach((a) => {
      if (!state.achievements[a.key] && a.check(s)) {
        state.achievements[a.key] = new Date().toISOString();
        newly.push(a);
      }
    });
    if (newly.length) save();
    return newly;
  }

  function setSetting(key, value) {
    state.settings[key] = value;
    save();
  }

  function getSettings() {
    return state.settings;
  }

  function exportJSON() {
    return JSON.stringify(
      {
        app: "JHELIX",
        exportedAt: new Date().toISOString(),
        state,
      },
      null,
      2
    );
  }

  function importJSON(obj) {
    const incoming = obj && obj.state ? obj.state : obj;
    if (!incoming || typeof incoming !== "object" || !incoming.reviews) return false;
    state = mergeState(incoming);
    save();
    return true;
  }

  function resetAll() {
    state = defaultState();
    save();
  }

  function rawState() {
    return state;
  }

  CV.store = {
    KEY,
    ACHIEVEMENTS,
    markWord,
    recordAttempt,
    toggleStar,
    setStar,
    getReview,
    isSeen,
    dueList,
    newList,
    starredList,
    wrongList,
    todayDeck,
    todayPlan,
    computeStats,
    dailySeries,
    statusCounts,
    evaluateAchievements,
    levelInfo,
    setSetting,
    getSettings,
    exportJSON,
    importJSON,
    resetAll,
    rawState,
    save,
  };
})();
