/* ============================================================
   识词 · 词典层：词库加载、搜索、变形还原、词族、例句、导入解析
   ============================================================ */

const FORMS = new Map();   // 变形（xf）：went -> go
const DERIV = new Map();   // 派生（fam）：abandonment -> abandon
const SENTS = new Map();   // 例句：word -> [[en, cn], ...]
const EXT = new Map();     // 扩展词库：核心 5063 词之外的常用词（unfruitful 之类）
const PHRASES = new Map(); // 高频词组：trace back to / put up with
let SEARCH_CACHE = null;   // 中文检索用： [{w, g}]
let EXTRA_INDEX = null;    // 扩展词库的中文检索缓存
let dictLoaded = false;
let extraLoaded = false;
let extraLoading = null;

/** 核心词库缺的功能词。考研大纲不收 a / of / is 这类词，但导入和组句都要用到 */
const FUNC_WORDS = {
  a: [['art.', '一、一个（辅音前）']], an: [['art.', '一、一个（元音前）']],
  of: [['prep.', '的、属于、关于']],
  these: [['pron.', '这些']], those: [['pron.', '那些']],
  i: [['pron.', '我']], they: [['pron.', '他们、她们、它们']],
  us: [['pron.', '我们（宾格）']], your: [['pron.', '你的、你们的']],
  his: [['pron.', '他的']], its: [['pron.', '它的']], our: [['pron.', '我们的']],
  their: [['pron.', '他们的、她们的、它们的']],
  is: [['v.', '是（be 第三人称单数）']], am: [['v.', '是（be 第一人称单数）']],
  are: [['v.', '是（be 复数）']], was: [['v.', '是（be 过去式单数）']],
  were: [['v.', '是（be 过去式复数）']], been: [['v.', 'be 的过去分词']],
  being: [['v.', 'be 的现在分词']],
  does: [['v.', '做（do 第三人称单数）']], did: [['v.', '做（do 过去式）']],
  has: [['v.', '有（have 第三人称单数）']], had: [['v.', '有（have 过去式）']],
  could: [['v.', '能、可以（can 过去式）']], may: [['v.', '可以、可能']],
  must: [['v.', '必须']]
};


/* ================= 加载 ================= */
async function loadData() {
  const [dictRes, sentRes] = await Promise.all([
    fetch('data/dict.json'),
    fetch('data/sents.json').catch(() => null),
    loadFreq()          // 词频表很小（约 80KB），和词库一起拉，首屏就有标注
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

  // 功能词只进词典（能查、能答），不进新词池，免得把 a / of 排进学习计划
  for (const w in FUNC_WORDS) {
    if (!S.dict.has(w)) {
      S.dict.set(w, { w: w, ph: '', m: FUNC_WORDS[w], fam: [], en: [], f: 1, lv: 0, src: 'func' });
    }
  }

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

/* ================= 扩展词库：用到时才加载 ================= */
/**
 * 核心词库只有 5063 词，导入的 CET 词表里总有漏网的（unfruitful、词组……）。
 * 这两份数据体积不小，首屏不加载：进「导入」页、或在词典里搜不到时才拉。
 */
function ensureExtra() {
  if (extraLoaded) return Promise.resolve(true);
  if (extraLoading) return extraLoading;
  extraLoading = Promise.all([
    fetch('data/phrases.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch('data/ext.json').then((r) => (r.ok ? r.json() : null)).catch(() => null)
  ]).then(([p, x]) => {
    if (p && p.rows) {
      p.rows.forEach((row) => PHRASES.set(row[0], { w: row[0], cn: row[1] || '' }));
    }
    if (x && x.rows) {
      x.rows.forEach((row) => EXT.set(row[0], { w: row[0], ph: row[1] || '', m: row[2] || [], tag: row[3] || '' }));
    }
    extraLoaded = true;
    EXTRA_INDEX = null;
    return true;
  }).catch(() => {
    extraLoading = null;
    return false;
  });
  return extraLoading;
}

function extraReady() {
  return extraLoaded;
}

/** 词组优先于扩展词 */
function lookupExtra(tok) {
  const key = String(tok || '').toLowerCase().trim();
  if (!key) return null;
  if (PHRASES.has(key)) return { kind: 'phrase', w: key, cn: PHRASES.get(key).cn };
  const e = EXT.get(key);
  if (e) return { kind: 'ext', w: key, cn: glossOfM(e.m), ph: e.ph, m: e.m, tag: e.tag };
  return null;
}

function glossOfM(m) {
  return (m || []).map((r) => ((r[0] ? r[0] + ' ' : '') + (r[1] || ''))).join('；');
}

/** 扩展词库里的搜索：英文前缀优先，其次中文释义 */
function searchExtra(q, limit) {
  if (!extraLoaded) return [];
  const key = String(q || '').trim().toLowerCase();
  if (!key) return [];
  const cap = limit || 8;
  const out = [];
  const cjk = /[\u4e00-\u9fff]/.test(key);

  if (PHRASES.has(key)) out.push({ w: key, gloss: PHRASES.get(key).cn, tag: '词组', rank: 0 });
  if (EXT.has(key)) out.push({ w: key, gloss: glossOfM(EXT.get(key).m), tag: '扩展', rank: 0, ph: EXT.get(key).ph });

  if (!cjk && /^[a-z]/.test(key)) {
    for (const e of EXT.values()) {
      if (out.length >= cap) break;
      if (e.w.startsWith(key) && e.w !== key) out.push({ w: e.w, gloss: glossOfM(e.m), tag: '扩展', rank: 2 });
    }
    for (const p of PHRASES.values()) {
      if (out.length >= cap) break;
      if (p.w.indexOf(key) >= 0 && p.w !== key) out.push({ w: p.w, gloss: p.cn, tag: '词组', rank: 3 });
    }
  } else if (cjk) {
    if (!EXTRA_INDEX) {
      EXTRA_INDEX = [];
      for (const e of EXT.values()) EXTRA_INDEX.push({ w: e.w, g: glossOfM(e.m) });
      for (const p of PHRASES.values()) EXTRA_INDEX.push({ w: p.w, g: p.cn });
    }
    for (const row of EXTRA_INDEX) {
      if (out.length >= cap) break;
      const idx = row.g.indexOf(key);
      if (idx >= 0) out.push({ w: row.w, gloss: row.g, tag: '扩展', rank: idx === 0 ? 1 : 4 });
    }
  }
  return out;
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
  if (e.src === 'phrase') return '高频词组';
  if (e.src === 'ext') return '扩展词库';
  if (e.src === 'func') return '功能词';
  /* 频率交给独立的频段徽章，这里只说来源，免得两处口径打架 */
  return e.f === 1 || e.f === undefined ? '必背词' : '认知词';
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
    const joined = parts.join(' ');
    // 3 词以内整体作为一个词条；更长的只有词组库确实收了才整体保留，否则拆词
    if (parts.length <= 3 || PHRASES.has(joined) || EXT.has(joined)) push(joined);
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

/** 从一行里抠出中文释义：粘贴时常用「单词 + 释义」的格式，别把它丢掉 */
function chineseOf(raw) {
  const body = String(raw || '')
    .replace(/\/([^\/]{0,40})\//g, ' ')
    .replace(/[（(【\[][^）)】\]]{0,80}[）)】\]]/g, ' ');
  const runs = body.match(/[\u4e00-\u9fff]+/g) || [];
  const cn = runs.join('、').replace(/^[、，,]+|[、，,]+$/g, '');
  return cn.length >= 2 && cn.length <= 40 ? cn : '';
}

function buildReview(text) {
  const items = [];
  const used = new Set();
  const put = (it) => {
    const k = it.w.toLowerCase();
    if (used.has(k)) return false;
    used.add(k);
    /* 频段在导入时就定下来写进词条，之后离线打开也还带着标注 */
    if (it.fr == null) it.fr = freqOf(it.w);
    items.push(it);
    return true;
  };

  // 逐行解析，同一行的中文释义留给这一行的词（词库和扩展库都没收录时兜底）
  const lines = String(text || '').split(/[\n\r]+/);
  for (const line of lines) {
    const tokens = tokenize(line);
    if (!tokens.length) continue;
    const ownCn = chineseOf(line);
    for (const t of tokens) {
      const r = resolveToken(t);
      if (r.kind === 'unknown') {
        // 核心词库没命中：再看词组表与扩展词库，拿到现成释义就不必手填
        const ex = lookupExtra(t);
        if (ex) {
          put({
            kind: ex.kind, w: ex.w, checked: true, from: '', note: '',
            pos: '', cn: ex.cn, ph: ex.ph || '', m: ex.m || null
          });
        } else {
          put({
            kind: 'unknown', w: r.key, checked: true, note: ownCn, from: '', pos: '', cn: ''
          });
        }
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
  /* 词频范围：高频=书内核心词(1)，高频+常用含考试主力(1/2)，低频=低优先级(3) */
  const fs = S.settings.freqScope;
  if (fs && fs !== 'all') {
    const lv = freqOf(w);
    if (fs === 'hf') return lv === 1;
    if (fs === 'hfm') return lv <= 2;
    if (fs === 'low') return lv === 3;
  }
  return true;
}

/** 新词候选：置顶优先，其次按设置顺序 */
function freshList(limit) {
  const out = [];
  if (!(limit > 0)) return out;
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
  const k = dayKey() + '|' + S.settings.scope + '|' + S.settings.freqScope + '|' + S.order.length;
  if (poolCache.key === k && poolCache.list) return poolCache.list;
  let seed = 0;
  const dk = dayKey();
  for (let i = 0; i < dk.length; i++) seed = (seed * 31 + dk.charCodeAt(i)) >>> 0;
  /* mulberry32：老 LCG 的低位周期只有 2~4，seed % (i+1) 洗出来的顺序带结构感，
     按词频排的词表里派生词天然相邻，弱洗牌后照样成串（词族扎堆的根源） */
  const rand = () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const a = S.order.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  /* 词族跨天散开：前 5 个字母相同的词（conventionalism / conventionally 这类）
     按词频排序天然相邻，光洗牌还是会一起落进同一天的批次。
     把同族成员强制铺到全池相距 250+ 的位置上，一天最多见着一个 */
  const MIN_GAP = 250;
  const posOf = new Map();
  a.forEach((w, i) => posOf.set(w, i));
  const fams = new Map();
  for (const w of a) {
    const p = w.slice(0, 5);
    if (!fams.has(p)) fams.set(p, []);
    fams.get(p).push(w);
  }
  for (const ws of fams.values()) {
    if (ws.length < 2) continue;
    const placed = [posOf.get(ws[0])];
    for (let m = 1; m < ws.length; m++) {
      const w = ws[m], cur = posOf.get(w);
      let best = cur, bestDist = -1;
      for (let tries = 0; tries < 12; tries++) {
        const j = Math.floor(rand() * a.length);
        let dist = Infinity;
        for (const q of placed) dist = Math.min(dist, Math.abs(j - q));
        if (dist >= MIN_GAP) { best = j; break; }
        if (dist > bestDist) { bestDist = dist; best = j; }
      }
      if (best === cur) { placed.push(cur); continue; }
      const other = a[best];
      a[best] = w; a[cur] = other;
      posOf.set(w, best); posOf.set(other, cur);
      placed.push(best);
    }
  }
  poolCache = { key: k, list: a };
  return a;
}

/* ================= 词频档位 ================= */
/**
 * 三档：1 高频 / 2 常用 / 3 低频。
 * 数据来自 data/freq.json（字幕 50k + Google 10k 语料排名，大纲与考试标签兜底），
 * 只存高频与常用两组，查不到的就是低频 —— 所以导入的生词也能立刻有标注。
 */
const FREQ_TEXT = ['', '高频', '常用', '低频'];
const FREQ = { h: new Set(), m: new Set(), ready: false };

async function loadFreq() {
  try {
    /* 带上版本号：发版后 URL 变化，SW 的缓存优先策略不会一直喂旧词频 */
    const r = await fetch('data/freq.json?v=' + encodeURIComponent(typeof APP_VER === 'string' ? APP_VER : '1'));
    if (!r.ok) return false;
    const d = await r.json();
    String(d.h || '').split(' ').forEach((w) => { if (w) FREQ.h.add(w); });
    String(d.m || '').split(' ').forEach((w) => { if (w) FREQ.m.add(w); });
    FREQ.ready = true;
    return true;
  } catch (e) {
    return false;   // 只是标注，拿不到就不标
  }
}

/** 词组不判档（搭配的语料频率不可靠，按组成词取最差会误伤） */
function freqOf(w) {
  const key = String(w || '').toLowerCase().trim();
  if (!key || key.indexOf(' ') >= 0) return 0;
  let lv;
  const e = entryOf(key);
  if (FREQ.h.has(key)) lv = 1;
  else if (FREQ.m.has(key)) lv = 2;
  else if (e && e.fr) lv = e.fr;
  else if (FREQ.ready) {
    const base = resolveToken(key).base;
    if (base !== key) lv = FREQ.h.has(base) ? 1 : (FREQ.m.has(base) ? 2 : 3);
    else lv = 3;
  } else {
    /* 词频表还没到位（首屏首次渲染）：先按大纲档位顶着，加载完会重绘 */
    lv = e && e.f === 1 ? 1 : (e && e.f === 2 ? 2 : 0);
  }
  /* 大纲必背词（核心词、非认知词）最低标到「常用」：考纲词不存在真正意义上的低频 */
  if (lv === 3 && e && !e.src && e.f !== 2) lv = 2;
  return lv;
}

/** 频段小徽章；词组与未知词返回 null，界面就不占位 */
function freqTagEl(w) {
  const b = freqOf(w);
  if (!b) return null;
  const s = document.createElement('span');
  s.className = 'fq fq' + b;
  s.textContent = FREQ_TEXT[b];
  s.title = '词频：' + FREQ_TEXT[b];
  return s;
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
