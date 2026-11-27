/* ============================================================
   识词 · 核心层：状态、存储、记忆算法、设置、发音、成就
   ============================================================ */

const DAY = 86400000;
const STORE = 'shici.v1';
const WB_KEEP = 3; // 错词本连续答对 3 次移出
const NEW_MIN = 5;    // 每日新词下限
const NEW_MAX = 200;  // 每日新词上限（手动可设，倒排加量同样封顶）
const APP_VER = 'v3.5.6';

const DEFAULT_SETTINGS = {
  theme: 'auto',        // auto | light | dark
  wordSize: 34,         // 34 | 38 | 42
  newPerDay: 20,
  order: 'random',      // random | seq
  scope: 'all',         // all | core | rare
  freqScope: 'all',     // all | hf | hfm | low（按词频徽章过滤新词）
  mode: 'flash',        // flash | choice | spell | listen
  voice: '',
  rate: 0.9,
  reduceMotion: false,
  keepAwake: true,
  examDate: '',         // 考试日期 YYYY-MM-DD，空串=未设置
  examAuto: true        // 按考试倒排自动加量
};

const S = {
  dict: new Map(),      // 词条
  order: [],            // 词库顺序
  progress: {},
  days: {},             // 兼容：每天答题数
  hist: {},             // 每天详细
  wb: {},               // 错词本
  modes: {},            // 各模式计数
  user: {},             // 自建词条
  pins: [],             // 置顶词
  ach: {},              // 已解锁成就
  settings: Object.assign({}, DEFAULT_SETTINGS),
  nick: '',
  session: null,        // 当前练习会话
  lastPage: 'today',
  fresh: false          // 本机没有存档（新装/清过数据）：首次同步可整份接受云端设置
};

const $ = (id) => document.getElementById(id);
const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ================= 存储 ================= */
function blankStore() {
  return { v: 3, progress: {}, days: {}, hist: {}, wb: {}, modes: {}, user: {}, pins: [], ach: {}, settings: {}, nick: '' };
}

function loadStore() {
  let d = null;
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) d = JSON.parse(raw);
  } catch (e) {
    console.warn('读取进度失败', e);
  }
  if (!d || typeof d !== 'object') {
    S.fresh = true;                 // 全新本机：同步到云端备份时可以整份采纳
    S.settings = Object.assign({}, DEFAULT_SETTINGS);
    return;
  }
  S.fresh = false;
  S.progress = d.progress || {};
  S.days = d.days || {};
  S.hist = d.hist || {};
  S.wb = d.wb || {};
  S.modes = d.modes || {};
  S.user = d.user || {};
  S.pins = Array.isArray(d.pins) ? d.pins : [];
  S.ach = d.ach || {};
  S.nick = d.nick || '';
  S.settings = Object.assign({}, DEFAULT_SETTINGS, d.settings || {});

  // 旧版只有 days（数字），补成 hist
  if (!d.hist) {
    for (const k in S.days) {
      const n = S.days[k] || 0;
      S.hist[k] = { newLearned: 0, asked: n, full: 0, partial: 0, wrong: 0, sessions: [] };
    }
  }
  normalizeSettings();
}

let saveTimer = null;
function saveStore() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushStore, 180);
}
function flushStore() {
  clearTimeout(saveTimer);
  normalizeSettings(); // 落盘前夹一次，避免越界值写进存档
  try {
    localStorage.setItem(STORE, JSON.stringify({
      v: 3,
      progress: S.progress,
      days: S.days,
      hist: S.hist,
      wb: S.wb,
      modes: S.modes,
      user: S.user,
      pins: S.pins,
      ach: S.ach,
      settings: S.settings,
      nick: S.nick
    }));
  } catch (e) {
    console.warn('保存失败', e);
    toast('保存失败，存储空间可能不足');
  }
}

function normalizeSettings() {
  const s = S.settings;
  if ([34, 38, 42].indexOf(Number(s.wordSize)) < 0) s.wordSize = 34;
  s.wordSize = Number(s.wordSize);
  s.newPerDay = clamp(Number(s.newPerDay) || 20, NEW_MIN, NEW_MAX);
  s.rate = clamp(Number(s.rate) || 0.9, 0.5, 1.3);
  if (['auto', 'light', 'dark'].indexOf(s.theme) < 0) s.theme = 'auto';
  if (['random', 'seq'].indexOf(s.order) < 0) s.order = 'random';
  if (['all', 'core', 'rare'].indexOf(s.scope) < 0) s.scope = 'all';
  if (['all', 'hf', 'hfm', 'low'].indexOf(s.freqScope) < 0) s.freqScope = 'all';
  if (['flash', 'choice', 'write', 'spell', 'listen'].indexOf(s.mode) < 0) s.mode = 'flash';
  if (typeof s.examDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.examDate)) s.examDate = '';
  s.examAuto = s.examAuto !== false;
}

/* ================= 日期 ================= */
function dayKey(ts) {
  const d = new Date(ts || Date.now());
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function shiftDay(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return dayKey(d.getTime());
}
function dateLine() {
  const d = new Date();
  const w = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 · ' + w;
}
function greeting() {
  const h = new Date().getHours();
  if (h < 5) return '夜深了';
  if (h < 11) return '早上好';
  if (h < 13) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}
function histOf(k) {
  const key = k || dayKey();
  if (!S.hist[key]) S.hist[key] = { newLearned: 0, asked: 0, full: 0, partial: 0, wrong: 0, sessions: [] };
  return S.hist[key];
}
function modeRec(m) {
  if (!S.modes[m]) S.modes[m] = { asked: 0, full: 0, partial: 0, wrong: 0 };
  return S.modes[m];
}

/* ================= 记忆算法（SM-2，字段与鸿蒙端一致） ================= */
function blankProgress() {
  return { seen: 0, full: 0, partial: 0, wrong: 0, lastAt: 0, ef: null, reps: 0, ivl: 0, dueAt: null };
}

function srsUpdate(p, g) {
  if (p.ef === null || p.ef === undefined) {
    p.ef = 2.5;
    p.reps = 0;
    p.ivl = 0;
  }
  const q = g === 'full' ? 5 : g === 'partial' ? 3 : 1;
  p.ef = Math.min(2.8, Math.max(1.3, p.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))));

  if (g === 'full') {
    p.reps = (p.reps || 0) + 1;
    p.ivl = p.reps === 1 ? 1 : p.reps === 2 ? 3 : Math.min(240, Math.round((p.ivl || 3) * p.ef));
  } else if (g === 'partial') {
    p.ivl = Math.max(1, Math.round(Math.max(p.ivl || 1, 1) * 0.6));
  } else {
    p.reps = 0;
    p.ivl = 1;
  }
  p.dueAt = Date.now() + p.ivl * DAY;
}

/** 一次作答：写进度 + 当日历史 + 模式计数；返回 {isNew, becameMastered} */
function recordAnswer(w, g, mode) {
  const p = S.progress[w] || blankProgress();
  const isNew = !p.seen;
  p.seen = (p.seen || 0) + 1;
  p[g] = (p[g] || 0) + 1;
  srsUpdate(p, g);
  p.lastAt = Date.now();
  S.progress[w] = p;

  const k = dayKey();
  S.days[k] = (S.days[k] || 0) + 1;
  const h = histOf(k);
  h.asked++;
  h[g]++;
  if (isNew) h.newTried = (h.newTried || 0) + 1;   // 今天接触过的新词，答错也算占了一个名额
  if (isNew && g !== 'wrong') h.newLearned++;
  if (mode) {
    const m = modeRec(mode);
    m.asked++;
    m[g]++;
  }
  saveStore();

  return { isNew, mastered: isMastered(w) };
}

function isMastered(w) {
  const p = S.progress[w];
  return !!(p && p.full >= 2 && !S.wb[w]);
}

/* ================= 错词本 ================= */
function addWrong(w, core) {
  const old = S.wb[w];
  if (old) {
    old.streak = 0;
    old.log.push({ t: Date.now(), ok: 0 });
    if (old.log.length > 30) old.log.shift();
  } else {
    S.wb[w] = { core: core || w, addedAt: Date.now(), streak: 0, log: [{ t: Date.now(), ok: 0 }] };
  }
  saveStore();
}

/** 错词本里答对：连对 3 次移出，返回是否已移出 */
function hitWrongBook(w, ok) {
  const it = S.wb[w];
  if (!it) return false;
  it.log.push({ t: Date.now(), ok: ok ? 1 : 0 });
  if (it.log.length > 30) it.log.shift();
  it.streak = ok ? (it.streak || 0) + 1 : 0;
  if (it.streak >= WB_KEEP) {
    delete S.wb[w];
    saveStore();
    return true;
  }
  saveStore();
  return false;
}

/* ================= 连续打卡 ================= */
function streak() {
  let n = 0;
  let i = 0;
  if (!(S.days[dayKey()] > 0)) i = 1; // 今天还没学，从昨天开始数
  for (; i < 400; i++) {
    if (S.days[shiftDay(-i)] > 0) n++;
    else break;
  }
  return n;
}

/* ================= 考试倒排 ================= */
/** 距考试天数（自然日；考试当天 = 0；未设置或已过期返回 null） */
function daysToExam() {
  const d = S.settings.examDate;
  if (!d) return null;
  const end = new Date(d + 'T00:00:00').getTime();
  if (isNaN(end)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const n = Math.floor((end - today.getTime()) / DAY);
  return n < 0 ? null : n;
}

/** 考试倒排的词量口径：跟随「新词范围」（必背/认知）与「词频范围」，
    让主页的「剩余 X 词 · 建议每天 Y 词」与实际练习池一致 */
function coreStat() {
  let total = 0;
  let done = 0;
  const rare = S.settings.scope === 'rare';
  for (const w of S.order) {
    const e = S.dict.get(w);
    if (!e) continue;
    if (rare ? e.f !== 2 : e.f === 2) continue; // 必背/认知口径与新词范围一致
    if (!freqMatch(w)) continue;                // 词频范围生效
    total++;
    const p = S.progress[w];
    if (p && (p.full || 0) >= 2 && !S.wb[w]) done++;
  }
  return { total: total, done: done, remain: Math.max(0, total - done) };
}

/** 考试倒排方案；未设日期返回 null */
function examPlan() {
  const days = daysToExam();
  if (days === null) return null;
  const cs = coreStat();
  // 建议值是「考前学完真实需要多少」，不封顶；能不能做到由 NEW_MAX 决定
  const perDay = days > 0 ? Math.ceil(cs.remain / days) : 0;
  return {
    days: days,
    total: cs.total,
    done: cs.done,
    remain: cs.remain,
    suggest: perDay,
    reachable: perDay <= NEW_MAX,
    pct: cs.total ? Math.round((cs.done / cs.total) * 100) : 0
  };
}

/** 今日实际新词量：设了考试日期且开启自动，就按倒排建议加量（只加不减，封顶 NEW_MAX） */
function effectiveNewPerDay() {
  const base = clamp(Number(S.settings.newPerDay) || 20, NEW_MIN, NEW_MAX);
  if (!S.settings.examAuto) return base;
  const p = examPlan();
  if (!p || p.days <= 0 || p.suggest <= 0) return base;
  return Math.max(base, Math.min(NEW_MAX, p.suggest));
}

/** 今天还能学多少个新词：每日额度减去今天已经学过的新词，学满就只做复习 */
function newQuotaLeft() {
  const h = S.hist[dayKey()] || {};
  // newTried 是「今天接触过的新词数」，老数据没有这个字段就退回到 newLearned
  const used = h.newTried != null ? h.newTried : (h.newLearned || 0);
  return Math.max(0, effectiveNewPerDay() - used);
}

/* ================= 设置应用 ================= */
function systemDark() {
  try { return matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; }
}

function isDarkNow() {
  const t = S.settings.theme;
  return t === 'dark' || (t === 'auto' && systemDark());
}

function applySettings() {
  const s = S.settings;
  const root = document.documentElement;

  // auto 时也写入属性，方便调试；CSS 里没有 [data-theme='auto'] 规则，
  // 因此会自然回落到 :root 的 prefers-color-scheme 媒体查询
  root.setAttribute('data-theme', s.theme);
  // color-scheme 影响表单控件、滚动条和 iOS 的默认 UA 配色
  root.style.colorScheme = s.theme === 'auto' ? 'light dark' : s.theme;

  root.style.setProperty('--word-size', s.wordSize + 'px');
  document.body.classList.toggle('reduce-motion', !!s.reduceMotion);

  const dark = isDarkNow();

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0b0b0d' : '#ffffff');

  // iOS 主屏运行时状态栏配色：深色黑底、浅色白底
  const bar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (bar) bar.setAttribute('content', dark ? 'black' : 'default');
}

function initTheme() {
  applySettings();
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => { if (S.settings.theme === 'auto') applySettings(); };
  if (mq.addEventListener) mq.addEventListener('change', onChange);
  else if (mq.addListener) mq.addListener(onChange);
}

/* ================= 发音（iOS 优势：系统级离线音色） ================= */
let voices = [];
let voicesReady = false;

function loadVoices() {
  if (!window.speechSynthesis) return;
  const all = speechSynthesis.getVoices() || [];
  voices = all.filter((v) => /^en([-_]|$)/i.test(v.lang));
  if (!voices.length) voices = all;
  voicesReady = voices.length > 0;
  fillVoiceSelect();
}

function voiceById(id) {
  return voices.find((v) => v.name === id) || null;
}

/** 自动挑选质量最好的英文音色（iOS 上 Samantha / Ava / Allison 优先） */
function autoVoice() {
  if (!voices.length) return null;
  const want = [/^Samantha$/i, /^Ava/i, /^Allison/i, /^Serena/i, /^Daniel/i, /en[-_]US/i, /^en/i];
  for (const re of want) {
    const hit = voices.find((v) => re.test(v.name) || re.test(v.lang));
    if (hit) return hit;
  }
  return voices[0];
}

function currentVoice() {
  const pick = S.settings.voice ? voiceById(S.settings.voice) : null;
  return pick || autoVoice();
}

function speak(text, opts) {
  if (!window.speechSynthesis || !text) return;
  const o = opts || {};
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = o.rate || S.settings.rate;
  u.pitch = 1;
  const v = currentVoice();
  if (v) { u.voice = v; u.lang = v.lang || 'en-US'; }
  speechSynthesis.speak(u);
}

/* ================= 屏幕常亮（iOS 16.4+ Wake Lock） ================= */
let wakeSentinel = null;

async function acquireWake() {
  if (!S.settings.keepAwake || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    wakeSentinel = await navigator.wakeLock.request('screen');
    wakeSentinel.addEventListener('release', () => { wakeSentinel = null; });
  } catch (e) {
    /* 低电量模式等会拒绝，静默忽略 */
  }
}
function releaseWake() {
  if (wakeSentinel) {
    try { wakeSentinel.release(); } catch (e) {}
    wakeSentinel = null;
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.session) acquireWake();
});

/* ================= Toast ================= */
let toastTimer = null;
function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.remove('out');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  }, 1900);
}

/* ================= 成就（与鸿蒙端同一套 9 条） ================= */
const ACH_DEFS = [
  { id: 'first50', ic: '✏️', tt: '初试身手', dd: '答题 50 次', test: (a) => a.asked >= 50 },
  { id: 'asked500', ic: '📚', tt: '百词练习', dd: '答题 500 次', test: (a) => a.asked >= 500 },
  { id: 'streak3', ic: '🔥', tt: '三日相伴', dd: '连续 3 天', test: (a) => a.streak >= 3 },
  { id: 'streak7', ic: '📅', tt: '一周不断', dd: '连续 7 天', test: (a) => a.streak >= 7 },
  { id: 'streak15', ic: '🏔️', tt: '半月之约', dd: '连续 15 天', test: (a) => a.streak >= 15 },
  { id: 'master50', ic: '🌱', tt: '小有所成', dd: '掌握 50 词', test: (a) => a.mastered >= 50 },
  { id: 'master200', ic: '🌳', tt: '词汇园丁', dd: '掌握 200 词', test: (a) => a.mastered >= 200 },
  { id: 'cleanslate', ic: '🧹', tt: '洗心革面', dd: '错词清零', test: (a) => a.wb === 0 && a.asked >= 100 },
  { id: 'listen100', ic: '👂', tt: '顺风耳', dd: '听写 100 题', test: (a) => a.listen >= 100 }
];

function achAgg() {
  let asked = 0;
  for (const k in S.hist) asked += S.hist[k].asked || 0;
  let mastered = 0;
  for (const w in S.progress) if (isMastered(w)) mastered++;
  return {
    asked,
    streak: streak(),
    mastered,
    wb: Object.keys(S.wb).length,
    listen: (S.modes.listen && S.modes.listen.asked) || 0
  };
}

/** 检查并解锁，返回新解锁条目 */
function checkAchievements(silent) {
  const agg = achAgg();
  const newly = [];
  for (const d of ACH_DEFS) {
    if (!S.ach[d.id] && d.test(agg)) {
      S.ach[d.id] = Date.now();
      newly.push(d);
    }
  }
  if (newly.length) {
    saveStore();
    if (!silent) newly.forEach((d, i) => setTimeout(() => toast(d.ic + ' 解锁成就 · ' + d.tt), 400 + i * 1600));
  }
  return newly;
}

/* ================= 小工具 ================= */
function fmtWhen(ts) {
  const d = new Date(ts);
  const today = dayKey();
  const k = dayKey(ts);
  const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  if (k === today) return '今天 ' + hm;
  if (k === dayKey(Date.now() - DAY)) return '昨天 ' + hm;
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
