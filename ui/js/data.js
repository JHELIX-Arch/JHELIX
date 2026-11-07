/* JHELIX · 词库加载与派生索引 */
(function () {
  "use strict";

  const CV = window.CV;

  CV.words = [];
  CV.byId = Object.create(null);
  CV.meta = null;
  CV.letters = [];
  CV.letterCounts = {};
  CV.posGroups = [];
  CV.families = [];
  CV.familyById = Object.create(null);
  CV.similarById = Object.create(null);

  function boundedDistance(a, b, max) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const la = a.length;
    const lb = b.length;
    let prev = new Array(lb + 1);
    let cur = new Array(lb + 1);
    for (let j = 0; j <= lb; j++) prev[j] = j;
    for (let i = 1; i <= la; i++) {
      cur[0] = i;
      let rowMin = cur[0];
      const ca = a.charCodeAt(i - 1);
      for (let j = 1; j <= lb; j++) {
        const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
        const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        cur[j] = v;
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      const tmp = prev;
      prev = cur;
      cur = tmp;
    }
    return prev[lb];
  }

  function buildFamilies(words) {
    const prefix = new Map();
    words.forEach((w) => {
      const lower = w.word.toLowerCase().replace(/[^a-z]/g, "");
      const maxLen = Math.min(7, lower.length - 1);
      for (let len = 4; len <= maxLen; len++) {
        const key = lower.slice(0, len);
        if (!prefix.has(key)) prefix.set(key, []);
        prefix.get(key).push(w);
      }
    });

    const chosen = new Map();
    words.forEach((w) => {
      const lower = w.word.toLowerCase().replace(/[^a-z]/g, "");
      for (let len = Math.min(7, lower.length - 1); len >= 4; len--) {
        const key = lower.slice(0, len);
        const pool = prefix.get(key) || [];
        if (pool.length >= 2 && pool.length <= 9) {
          if (!chosen.has(key)) chosen.set(key, pool.slice());
          break;
        }
      }
    });

    const groups = [];
    const seenSignatures = new Set();
    chosen.forEach((pool, stem) => {
      const unique = [];
      const ids = new Set();
      pool.forEach((w) => {
        if (!ids.has(w.id)) {
          ids.add(w.id);
          unique.push(w);
        }
      });
      if (unique.length < 2) return;
      const sig = unique.map((w) => w.id).sort().join(",");
      if (seenSignatures.has(sig)) return;
      seenSignatures.add(sig);
      groups.push({ stem, label: stem + "-", words: unique });
    });

    groups.sort((a, b) => b.words.length - a.words.length || a.stem.localeCompare(b.stem));
    return groups;
  }

  function buildSimilar(words) {
    const map = Object.create(null);
    for (let i = 0; i < words.length; i++) {
      const a = words[i];
      const la = a.word.toLowerCase();
      const candidates = [];
      for (let j = 0; j < words.length; j++) {
        if (i === j) continue;
        const b = words[j];
        if (a.letter !== b.letter) continue;
        const lb = b.word.toLowerCase();
        if (Math.abs(la.length - lb.length) > 2) continue;
        const dist = boundedDistance(la, lb, 2);
        if (dist <= 2) candidates.push({ word: b, dist });
      }
      candidates.sort((x, y) => x.dist - y.dist || x.word.word.localeCompare(y.word.word));
      map[a.id] = candidates.slice(0, 6).map((x) => x.word);
    }
    return map;
  }

  CV.loadData = async function () {
    const res = await fetch("data/words.json", { cache: "no-store" });
    if (!res.ok) throw new Error("词库加载失败：HTTP " + res.status);
    const meta = await res.json();
    CV.meta = meta;
    CV.words = meta.words || [];
    CV.byId = Object.create(null);
    CV.letterCounts = {};
    CV.posGroups = [];

    CV.words.forEach((w) => {
      CV.byId[w.id] = w;
      CV.letterCounts[w.letter] = (CV.letterCounts[w.letter] || 0) + 1;
      if (!CV.posGroups.includes(w.posGroup)) CV.posGroups.push(w.posGroup);
    });
    CV.letters = Object.keys(CV.letterCounts).sort();
    CV.posGroups.sort((a, b) => a.localeCompare(b, "zh"));

    CV.families = buildFamilies(CV.words);
    CV.familyById = Object.create(null);
    CV.families.forEach((f, idx) => {
      f.id = "f" + (idx + 1);
      f.words.forEach((w) => {
        if (!CV.familyById[w.id]) CV.familyById[w.id] = [];
        CV.familyById[w.id].push(f);
      });
    });
    CV.similarById = buildSimilar(CV.words);
    return meta;
  };

  CV.searchWords = function (query, limit) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return [];
    const scored = [];
    CV.words.forEach((w) => {
      const word = w.word.toLowerCase();
      const def = w.definition.toLowerCase();
      const ph = w.phonetic.toLowerCase();
      let score = -1;
      if (word === q) score = 0;
      else if (word.startsWith(q)) score = 1;
      else if (word.includes(q)) score = 2;
      else if (def.includes(q)) score = 3;
      else if (ph.includes(q)) score = 4;
      if (score >= 0) scored.push({ w, score });
    });
    scored.sort((a, b) => a.score - b.score || a.w.word.localeCompare(b.w.word));
    return scored.slice(0, limit || 20).map((x) => x.w);
  };

  CV.randomWord = function (excludeId) {
    const pool = CV.words.filter((w) => w.id !== excludeId);
    return CV.pick(pool.length ? pool : CV.words);
  };

  CV.wordFamily = function (id) {
    return CV.familyById[id] || [];
  };

  CV.wordSimilar = function (id) {
    return CV.similarById[id] || [];
  };
})();
