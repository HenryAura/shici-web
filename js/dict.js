/* ============================================================
   识词 · 词典层：词库加载、搜索、变形还原、词族、例句、导入解析
   ============================================================ */

const FORMS = new Map();   // 变形（xf）：went -> go
const DERIV = new Map();   // 派生（fam）：abandonment -> abandon
const SENTS = new Map();   // 例句：word -> [[en, cn], ...]
let SEARCH_CACHE = null;   // 中文检索用： [{w, g}]
let dictLoaded = false;

/* ================= 加载 ================= */
async function loadData() {
  const [dictRes, sentRes] = await Promise.all([
    fetch('data/dict.json'),
    fetch('data/sents.json').catch(() => null)
  ]);
  if (!dictRes.ok) throw new Error('词库 HTTP ' + dictRes.status);
  const data = await dictRes.json();

  S.dict.clear();
  S.order = [];
  (data.words || []).forEach((e) => {
    if (e && e.w) {
      S.dict.set(e.w, e);
      S.order.push(e.w);
    }
  });

  if (sentRes && sentRes.ok) {
    try {
      const sents = await sentRes.json();
      for (const k in sents) {
        if (Array.isArray(sents[k]) && sents[k].length) SENTS.set(k, sents[k]);
      }
    } catch (e) {
      console.warn('例句加载失败', e);
    }
  }

  mergeUserWords();
  dictLoaded = true;
}

/** 自建词条并入词典并排到最前 */
function mergeUserWords() {
  const keys = Object.keys(S.user).filter((k) => S.user[k] && !S.dict.has(k));
  if (keys.length) {
    keys.forEach((k) => S.dict.set(k, S.user[k]));
    S.order = keys.concat(S.order);
  }
  S.pins = S.pins.filter((w, i) => S.dict.has(w) && S.pins.indexOf(w) === i);
  buildFormIndex();
  SEARCH_CACHE = null;
}

/** 用词库自带的 xf（变形表）与 fam（词族）建反查索引 */
function buildFormIndex() {
  FORMS.clear();
  DERIV.clear();
  for (const e of S.dict.values()) {
    if (e.xf) {
      for (const k in e.xf) {
        const v = String(e.xf[k] || '').toLowerCase().trim();
        if (v && !FORMS.has(v)) FORMS.set(v, e.w);
      }
    }
    if (e.fam) {
      for (const f of e.fam) {
        const v = String((f && f[0]) || '').toLowerCase().trim();
        if (v && !DERIV.has(v) && !FORMS.has(v)) DERIV.set(v, e.w);
      }
    }
  }
}

/* ================= 取词条信息 ================= */
function entryOf(w) {
  return S.dict.get(w) || null;
}

function senseRows(e) {
  if (!e || !e.m) return [];
  return e.m.map((row) => ({
    pos: Array.isArray(row) ? row[0] : (row.pos || ''),
    cn: Array.isArray(row) ? row[1] : (row.cn || '')
  }));
}

function glossOf(w, maxParts) {
  const rows = senseRows(entryOf(w));
  if (!rows.length) return '';
  return String(rows[0].cn || '')
    .split(/[、;；]/)
    .slice(0, maxParts || 2)
    .join('、');
}

function fullGloss(w) {
  const rows = senseRows(entryOf(w));
  return rows.map((r) => (r.pos ? r.pos + ' ' : '') + r.cn).join('；');
}

function shortDef(w) {
  const e = entryOf(w);
  if (!e) return '';
  const cn = glossOf(w, 3);
  return cn || (e.en && e.en[0] ? e.en[0] : '');
}

function lexLabel(e) {
  if (!e) return '';
  if (e.src === 'import') return '自建词条';
  if (e.src === 'fam') return '词族' + (e.from ? ' · 来自 ' + e.from : '');
  return (e.f === 1 || e.f === undefined ? '必背 · 高频' : '认知 · 中低频');
}

/** 词形变化：xf 里排除与词条本身相同的项，并按展示形式去重 */
function formsOf(w) {
  const e = entryOf(w);
  if (!e || !e.xf) return [];
  const out = [];
  const seen = new Set([w.toLowerCase()]);
  for (const k in e.xf) {
    const v = String(e.xf[k] || '').trim();
    const key = v.toLowerCase();
    if (!v || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

const DERIV_SUFFIX = ['ness', 'ment', 'less', 'ful', 'ish', 'hood', 'ship', 'able', 'ible',
  'ation', 'ition', 'tion', 'sion', 'ance', 'ence', 'ity', 'ous', 'ive', 'ism', 'ist',
  'ize', 'ise', 'ary', 'ory', 'ly', 'al', 'en', 'er', 'or', 'y', 'ed', 'ing'];

/** 只保留同根派生，过滤 goth 这类噪声 */
function familyOf(base) {
  const e = entryOf(base);
  if (!e || !e.fam || !e.fam.length) return [];
  const b = base.toLowerCase();
  const out = [];
  for (const f of e.fam) {
    const w = String((f && f[0]) || '').toLowerCase().trim();
    if (!w || w === b || !w.startsWith(b)) continue;
    const tail = w.slice(b.length);
    if (tail.length < 2 || tail.length > 10) continue;
    if (!DERIV_SUFFIX.some((s) => tail === s || tail.endsWith(s))) continue;
    if (FORMS.get(w) === base) continue; // 纯变形不列进词族
    const info = f[1];
    out.push({
      w,
      pos: Array.isArray(info) ? info[0] : ((info || {}).pos || ''),
      cn: Array.isArray(info) ? info[1] : ((info || {}).cn || '')
    });
    if (out.length >= 6) break;
  }
  return out;
}

/** 例句：衍生词回退到词根 */
function sentencesOf(w) {
  const direct = SENTS.get(w);
  if (direct && direct.length) return direct.slice(0, 4);
  const base = resolveToken(w).base;
  const rows = SENTS.get(base);
  return rows ? rows.slice(0, 4) : [];
}

/* ================= 搜索 ================= */
function buildSearchCache() {
  if (SEARCH_CACHE) return SEARCH_CACHE;
  SEARCH_CACHE = [];
  for (const e of S.dict.values()) {
    const g = senseRows(e).map((r) => r.cn).join(' ');
    SEARCH_CACHE.push({ w: e.w, g: g, lv: e.f });
  }
  return SEARCH_CACHE;
}

/** 英文前缀优先，其次变形还原，其次中文释义；中文按「首义命中 > 其他义命中」排序 */
function searchDict(q, limit) {
  const key = String(q || '').trim().toLowerCase();
  if (!key) return [];
  const cap = limit || 30;
  const out = [];
  const seen = new Set();
  const push = (e, rank, via) => {
    if (!e || seen.has(e.w)) return;
    seen.add(e.w);
    out.push({ w: e.w, gloss: shortDef(e.w), lv: e.f, rank: rank, via: via || '' });
  };

  // 1) 精确
  push(S.dict.get(key), 0);

  // 2) 变形还原：went -> go、abandoned -> abandon、better -> good
  //    （输入的是过去式/复数/比较级时，直接给出词典里的原形）
  const rt = resolveToken(key);
  if (rt.kind === 'form' && rt.base !== key) push(S.dict.get(rt.base), 1, key);

  // 3) 英文前缀
  if (/^[a-z]/.test(key)) {
    for (const e of S.dict.values()) {
      if (e.w.toLowerCase().startsWith(key)) push(e, 2);
      if (out.length > cap * 2) break;
    }
  }
  // 4) 中文释义 / 英文子串
  if (out.length < cap * 2) {
    const cache = buildSearchCache();
    const raw = q.trim();
    for (const row of cache) {
      if (out.length >= cap * 2) break;
      if (seen.has(row.w)) continue;
      const idx = row.g.indexOf(raw);
      if (idx >= 0) {
        seen.add(row.w);
        out.push({ w: row.w, gloss: shortDef(row.w), lv: row.lv, rank: idx === 0 ? 3 : 4, pos: idx, via: '' });
      } else if (/^[a-z]/.test(key) && row.w.toLowerCase().indexOf(key) >= 0) {
        seen.add(row.w);
        out.push({ w: row.w, gloss: shortDef(row.w), lv: row.lv, rank: 5, pos: 999, via: '' });
      }
    }
  }
  out.sort((a, b) =>
    a.rank - b.rank
    || (a.rank >= 3 ? (a.lv || 1) - (b.lv || 1) : 0)
    || (a.pos || 0) - (b.pos || 0)
    || a.w.length - b.w.length
    || a.w.localeCompare(b.w));
  return out.slice(0, cap);
}

/* ================= 变形还原 ================= */
function cleanToken(raw) {
  let t = String(raw || '');
  t = t.replace(/\/([^\/]{0,40})\//g, ' ');
  t = t.replace(/\[[^\]]{0,40}\]/g, ' ');
  t = t.replace(/[（(【][^）)】]{0,80}[）)】]/g, ' ');
  t = t.replace(/[\u3400-\u4dbf\u4e00-\u9fff\u3000-\u303f\uff01-\uff60]+/g, ' ');
  t = t.replace(/^\s*(?:[-*•·>]+|\d+\s*[.)、,，:：]|\(\d+\))\s*/, '');
  t = t.replace(/[^A-Za-z'\u2019\-\s]/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  t = t.replace(/^['\u2019\-.]+|['\u2019\-.]+$/g, '');
  return t.toLowerCase();
}

const POS_WORDS = new Set(['vt', 'vi', 'adj', 'adv', 'prep', 'pron', 'num', 'aux', 'abbr', 'phr', 'conj', 'interj', 'det']);

function tokenize(text) {
  const out = [];
  const seen = new Set();
  const push = (w) => {
    const k = w.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!k || k.length < 2 || !/[a-z]/.test(k) || seen.has(k)) return;
    seen.add(k);
    out.push(k);
  };

  const chunks = String(text || '').split(/[\n\r;；|,，、\t]+/);
  for (const raw of chunks) {
    const c = cleanToken(raw);
    if (!c) continue;
    const parts = c.split(' ').filter((p) => p && p !== 'n' && p !== 'v' && !POS_WORDS.has(p));
    if (!parts.length) continue;
    if (parts.length <= 3) push(parts.join(' '));
    else parts.forEach(push);
    if (out.length > 400) break;
  }
  return out;
}

/** 规则还原：处理词库 xf 没覆盖的规则变形 */
function lemmatize(w) {
  if (/\s/.test(w)) return null;
  const c = [];
  const add = (s) => { if (s && s.length > 1 && s !== w && c.indexOf(s) < 0) c.push(s); };

  if (w.endsWith('ies')) add(w.slice(0, -3) + 'y');
  if (w.endsWith('ves')) { add(w.slice(0, -3) + 'f'); add(w.slice(0, -3) + 'fe'); }
  if (w.endsWith('es')) add(w.slice(0, -2));
  if (w.endsWith('s') && !w.endsWith('ss')) add(w.slice(0, -1));
  if (w.endsWith('ied')) add(w.slice(0, -3) + 'y');
  if (w.endsWith('ed')) { add(w.slice(0, -2)); add(w.slice(0, -1)); }
  if (w.endsWith('ing')) { add(w.slice(0, -3)); add(w.slice(0, -3) + 'e'); }
  if (w.endsWith('est')) { add(w.slice(0, -3)); add(w.slice(0, -1)); }
  if (w.endsWith('er')) { add(w.slice(0, -2)); add(w.slice(0, -1)); }

  const m = w.match(/^(.+?)([bcdfgklmnprstvz])\2(ed|ing|er|est)$/);
  if (m) add(m[1] + m[2]);

  return c.find((x) => S.dict.has(x)) || null;
}

function resolveToken(tok) {
  if (S.dict.has(tok)) return { key: tok, base: tok, kind: 'dict' };
  const f = FORMS.get(tok) || DERIV.get(tok);
  if (f && S.dict.has(f)) return { key: tok, base: f, kind: 'form' };
  const l = lemmatize(tok);
  if (l) return { key: tok, base: l, kind: 'form' };
  return { key: tok, base: tok, kind: 'unknown' };
}

/* ================= 导入：构建审核清单 ================= */
function familyEntries(base) {
  const out = [];
  for (const f of familyOf(base)) {
    if (S.dict.has(f.w)) continue;
    out.push(f);
  }
  return out;
}

function buildReview(text) {
  const items = [];
  const used = new Set();
  const put = (it) => {
    const k = it.w.toLowerCase();
    if (used.has(k)) return false;
    used.add(k);
    items.push(it);
    return true;
  };

  for (const t of tokenize(text)) {
    const r = resolveToken(t);
    if (r.kind === 'unknown') {
      put({ kind: 'unknown', w: r.key, checked: true, note: '', from: '', pos: '', cn: '' });
      continue;
    }
    put({
      kind: r.kind, w: r.base, checked: true,
      from: r.kind === 'form' ? r.key : '', pos: '', cn: ''
    });
    for (const f of familyEntries(r.base)) {
      put({ kind: 'fam', w: f.w, checked: true, from: r.base, pos: f.pos, cn: f.cn, note: '' });
    }
  }
  return items;
}

/* ================= 新词候选 ================= */
function inScope(w) {
  const e = entryOf(w);
  if (!e) return false;
  const sc = S.settings.scope;
  if (sc === 'core') return e.f !== 2;
  if (sc === 'rare') return e.f === 2;
  return true;
}

/** 新词候选：置顶优先，其次按设置顺序 */
function freshList(limit) {
  const out = [];
  const seen = new Set();
  for (const w of S.pins) {
    if (S.progress[w] || seen.has(w) || !S.dict.has(w) || !inScope(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= limit) return out;
  }
  const pool = S.settings.order === 'random' ? randomPool() : S.order;
  for (const w of pool) {
    if (S.progress[w] || seen.has(w) || !inScope(w)) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * 随机顺序但当天稳定：以日期做种，同一天打开顺序一致，
 * 避免「刷新一次换一批」导致计划来回跳。
 */
let poolCache = { key: '', list: null };
function randomPool() {
  const k = dayKey() + '|' + S.settings.scope + '|' + S.order.length;
  if (poolCache.key === k && poolCache.list) return poolCache.list;
  let seed = 0;
  const dk = dayKey();
  for (let i = 0; i < dk.length; i++) seed = (seed * 31 + dk.charCodeAt(i)) >>> 0;
  const a = S.order.slice();
  for (let i = a.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const j = seed % (i + 1);
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  poolCache = { key: k, list: a };
  return a;
}

/** 单词池（题库）：用于生成干扰项 */
function distractorPool(w) {
  const e = entryOf(w);
  const same = [];
  const other = [];
  for (const x of S.dict.values()) {
    if (x.w === w) continue;
    const g = glossOf(x.w, 1);
    if (!g) continue;
    if (e && x.f === e.f) same.push(x.w);
    else other.push(x.w);
  }
  return { same, other };
}
