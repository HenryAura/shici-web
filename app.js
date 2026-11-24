(function () {
  'use strict';

  const DAY = 86400000;
  const NEW_PER_DAY = 20;
  const STORE_KEY = 'shici.v1';

  const S = {
    dict: new Map(),
    order: [],
    progress: {},
    days: {},
    user: {},
    pins: [],
    queue: [],
    idx: 0,
    revealed: false,
    locked: false,
    review: []
  };

  const $ = (id) => document.getElementById(id);

  /* ================= 存储 ================= */
  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        S.progress = d.progress || {};
        S.days = d.days || {};
        S.user = d.user || {};
        S.pins = Array.isArray(d.pins) ? d.pins : [];
      }
    } catch (e) {
      console.warn('读取本地进度失败', e);
    }
  }

  let saveTimer = null;
  function saveStore() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({
          v: 2, progress: S.progress, days: S.days, user: S.user, pins: S.pins
        }));
      } catch (e) {
        console.warn('保存失败', e);
      }
    }, 200);
  }

  /* ================= 日期 ================= */
  function dayKey(ts) {
    const d = new Date(ts || Date.now());
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function dateLine() {
    const d = new Date();
    const w = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 · ' + w;
  }

  /* ================= 记忆算法（SM-2，与鸿蒙端字段一致） ================= */
  function blankProgress() {
    return { seen: 0, full: 0, partial: 0, wrong: 0, lastAt: 0, ef: null, reps: 0, ivl: 0, dueAt: null };
  }

  function srsUpdate(p, grade) {
    if (p.ef === null || p.ef === undefined) {
      p.ef = 2.5;
      p.reps = 0;
      p.ivl = 0;
    }
    const q = grade === 'full' ? 5 : grade === 'partial' ? 3 : 1;
    p.ef = Math.min(2.8, Math.max(1.3, p.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))));

    if (grade === 'full') {
      p.reps = (p.reps || 0) + 1;
      p.ivl = p.reps === 1 ? 1 : p.reps === 2 ? 3 : Math.min(240, Math.round((p.ivl || 3) * p.ef));
    } else if (grade === 'partial') {
      p.ivl = Math.max(1, Math.round(Math.max(p.ivl || 1, 1) * 0.6));
    } else {
      p.reps = 0;
      p.ivl = 1;
    }
    p.dueAt = Date.now() + p.ivl * DAY;
  }

  function grade(p, g) {
    p.seen = (p.seen || 0) + 1;
    if (g === 'full') p.full = (p.full || 0) + 1;
    else if (g === 'partial') p.partial = (p.partial || 0) + 1;
    else p.wrong = (p.wrong || 0) + 1;
    srsUpdate(p, g);
    p.lastAt = Date.now();
  }

  /* ================= 今日计划 ================= */
  /** 新词候选：导入置顶词优先，其次词库顺序 */
  function freshList(limit) {
    const out = [];
    const seen = new Set();
    for (const w of S.pins) {
      if (S.progress[w] || seen.has(w) || !S.dict.has(w)) continue;
      seen.add(w);
      out.push(w);
      if (out.length >= limit) return out;
    }
    for (const w of S.order) {
      if (S.progress[w] || seen.has(w)) continue;
      seen.add(w);
      out.push(w);
      if (out.length >= limit) break;
    }
    return out;
  }

  function todayStat() {
    const today = dayKey();
    let done = 0;

    for (const w of S.order) {
      const p = S.progress[w];
      if (p && p.lastAt && dayKey(p.lastAt) === today) done++;
    }

    const studied = Object.keys(S.progress).length;
    const newLeft = freshList(NEW_PER_DAY).length;

    return { done, newLeft, studied };
  }

  function buildQueue() {
    const now = Date.now();
    const due = [];
    for (const w of S.order) {
      const p = S.progress[w];
      if (!p || !p.dueAt) continue;
      if (p.dueAt <= now) due.push({ w, p });
    }
    due.sort((a, b) => a.p.dueAt - b.p.dueAt);

    const fresh = freshList(NEW_PER_DAY);

    S.queue = due.map((x) => ({ w: x.w, mode: 'review' }))
      .concat(fresh.map((w) => ({ w, mode: 'new' })));
    S.idx = 0;
    return S.queue.length;
  }

  function streak() {
    let n = 0;
    const d = new Date();
    for (;;) {
      const k = dayKey(d.getTime());
      if (S.days[k] && S.days[k] > 0) {
        n++;
        d.setDate(d.getDate() - 1);
      } else if (n === 0 && k === dayKey()) {
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
      if (n > 400) break;
    }
    return n;
  }

  /* ================= 渲染 ================= */
  function view(name) {
    ['today', 'study', 'done', 'import'].forEach((v) => { $('view-' + v).hidden = v !== name; });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }

  function renderToday() {
    const { done, newLeft } = todayStat();
    const total = done + newLeft;
    const reviewed = S.queue.length;

    $('date-line').textContent = dateLine();
    $('hero-num').textContent = String(total);
    $('hero-sub').textContent = total === 0
      ? '今天没有待学的词，休息一下'
      : (newLeft > 0 ? '个新词等着你' : '这些是到期需要复习的词');

    $('stat-done').textContent = String(done);
    $('stat-new').textContent = String(newLeft);

    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    $('progress-text').textContent = done + ' / ' + total;
    $('progress-fill').style.width = pct + '%';
    $('streak').textContent = streak() + ' 天';

    const list = $('wordlist');
    list.innerHTML = '';
    const preview = buildPreview();
    $('word-count').textContent = String(preview.length);

    if (preview.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = '今天没有待学的词';
      list.appendChild(li);
    } else {
      preview.slice(0, 8).forEach((w) => {
        const li = document.createElement('li');
        const a = document.createElement('span');
        a.className = 'w';
        a.textContent = w;
        const b = document.createElement('span');
        b.className = 'g';
        b.textContent = glossOf(w);
        li.appendChild(a);
        li.appendChild(b);
        list.appendChild(li);
      });
    }

    const btn = $('btn-start');
    btn.disabled = total === 0;
    btn.textContent = total === 0 ? '今天已完成' : (done > 0 ? '继续学习' : '开始学习');

    view('today');
  }

  function buildPreview() {
    const now = Date.now();
    const due = [];
    for (const w of S.order) {
      const p = S.progress[w];
      if (p && p.dueAt && p.dueAt <= now) due.push(w);
    }
    return due.concat(freshList(NEW_PER_DAY));
  }

  function glossOf(w) {
    const e = S.dict.get(w);
    if (!e || !e.m || !e.m.length) return '';
    const first = e.m[0];
    const cn = Array.isArray(first) ? first[1] : first.cn;
    return (cn || '').split(/[、;；]/).slice(0, 2).join('、');
  }

  /* ---------- 学习卡 ---------- */
  function renderCard() {
    const item = S.queue[S.idx];
    if (!item) return finish();

    const e = S.dict.get(item.w) || { w: item.w };
    S.revealed = false;

    $('q-word').textContent = e.w || item.w;
    $('q-phonetic').textContent = e.ph ? '/' + e.ph + '/' : '';
    $('mode-pill').textContent = item.mode === 'review' ? '复习' : '新词';
    $('study-count').textContent = (S.idx + 1) + ' / ' + S.queue.length;
    $('study-fill').style.width = ((S.idx) / S.queue.length * 100) + '%';

    const ul = $('q-senses');
    ul.innerHTML = '';
    (e.m || []).forEach((row) => {
      const pos = Array.isArray(row) ? row[0] : row.pos;
      const cn = Array.isArray(row) ? row[1] : row.cn;
      const li = document.createElement('li');
      if (pos) {
        const sp = document.createElement('span');
        sp.className = 'pos';
        sp.textContent = pos;
        li.appendChild(sp);
      }
      li.appendChild(document.createTextNode(cn || ''));
      ul.appendChild(li);
    });
    if (!ul.children.length) {
      const li = document.createElement('li');
      li.className = 'none';
      li.textContent = '暂无释义，可在导入时补充';
      ul.appendChild(li);
    }

    const en = e.en && e.en.length ? e.en.slice(0, 2).join(' ') : '';
    $('q-endef').textContent = en;

    const fam = $('q-fam');
    fam.innerHTML = '';
    if (e.fam && e.fam.length) {
      const p = document.createElement('p');
      e.fam.slice(0, 3).forEach((f, i) => {
        if (i) p.appendChild(document.createElement('br'));
        const b = document.createElement('b');
        b.textContent = f[0];
        p.appendChild(b);
        p.appendChild(document.createTextNode(' ' + (Array.isArray(f[1]) ? f[1][1] : '')));
      });
      fam.appendChild(p);
    }

    $('reveal-hint').hidden = false;
    $('answer').hidden = true;
    $('grade-bar').hidden = true;
    renderMeta(e, item);
    S.locked = false;

    view('study');
  }

  function renderMeta(e, item) {
    const p = S.progress[item.w];
    const parts = [];
    if (e.src === 'import') {
      parts.push('自建词条');
    } else if (e.src === 'fam') {
      parts.push('词族' + (e.from ? ' · 来自 ' + e.from : ''));
    } else {
      parts.push('四级' + (e.f === 2 ? ' · 认知' : ' · 必背'));
    }
    if (p && p.reps > 0) parts.push('第 ' + (p.reps + 1) + ' 次复习');
    else parts.push('首次学习');
    if (p && p.ivl > 0) parts.push('下次 ' + p.ivl + ' 天后');
    $('q-meta').textContent = parts.join(' · ');
  }

  function reveal() {
    if (S.revealed) return;
    S.revealed = true;
    $('reveal-hint').hidden = true;
    $('answer').hidden = false;
    $('grade-bar').hidden = false;
    speak();
  }

  function onGrade(g) {
    if (!S.revealed || S.locked) return;
    S.locked = true;

    const item = S.queue[S.idx];
    const p = S.progress[item.w] || blankProgress();
    grade(p, g);
    S.progress[item.w] = p;

    const k = dayKey();
    S.days[k] = (S.days[k] || 0) + 1;
    saveStore();

    S.idx++;
    if (S.idx >= S.queue.length) {
      finish();
    } else {
      renderCard();
    }
  }

  function finish() {
    const today = S.days[dayKey()] || 0;
    $('done-detail').textContent = '今天共完成 ' + today + ' 个词';
    view('done');
  }

  /* ================= 发音 ================= */
  let voice = null;
  function pickVoice() {
    const vs = window.speechSynthesis ? speechSynthesis.getVoices() : [];
    voice = vs.find((v) => /en-US/i.test(v.lang) && /Samantha|Google|Microsoft/i.test(v.name))
      || vs.find((v) => /^en/i.test(v.lang))
      || null;
  }

  function speak() {
    if (!window.speechSynthesis) return;
    const w = $('q-word').textContent;
    if (!w) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(w);
    u.lang = 'en-US';
    u.rate = 0.9;
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  }

  /* ================= 导入：解析 / 审核 / 入库 ================= */
  const FORMS = new Map(); // 变形（xf）：went -> go
  const DERIV = new Map(); // 派生（fam）：abandonment -> abandon

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

  /** 自建词条并入词典并排到最前 */
  function mergeUserWords() {
    const keys = Object.keys(S.user).filter((k) => S.user[k] && !S.dict.has(k));
    if (keys.length) {
      keys.forEach((k) => S.dict.set(k, S.user[k]));
      S.order = keys.concat(S.order);
    }
    S.pins = S.pins.filter((w, i) => S.dict.has(w) && S.pins.indexOf(w) === i);
    buildFormIndex();
  }

  /** 去掉音标、词性、中文解释、序号 */
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
      // 去掉夹在词里的词性缩写（v / n / adj 等），保留 a、I 这类真词
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

  /** 只保留同根派生，过滤 goth 这类噪声 */
  const DERIV_SUFFIX = ['ness', 'ment', 'less', 'ful', 'ish', 'hood', 'ship', 'able', 'ible',
    'ation', 'ition', 'tion', 'sion', 'ance', 'ence', 'ity', 'ous', 'ive', 'ism', 'ist',
    'ize', 'ise', 'ary', 'ory', 'ly', 'al', 'en', 'er', 'or', 'y', 'ed', 'ing'];

  function familyOf(base) {
    const e = S.dict.get(base);
    if (!e || !e.fam || !e.fam.length) return [];
    const b = base.toLowerCase();
    const out = [];
    for (const f of e.fam) {
      const w = String((f && f[0]) || '').toLowerCase().trim();
      if (!w || w === b || !w.startsWith(b)) continue;
      const tail = w.slice(b.length);
      if (tail.length < 2 || tail.length > 10) continue;
      if (!DERIV_SUFFIX.some((s) => tail === s || tail.endsWith(s))) continue;
      // 纯变形（bigger / going / abandoned）不单独建词条，卡片里的词族已展示
      if (FORMS.get(w) === base) continue;
      const info = f[1];
      out.push({
        w,
        pos: Array.isArray(info) ? info[0] : ((info || {}).pos || ''),
        cn: Array.isArray(info) ? info[1] : ((info || {}).cn || '')
      });
      if (out.length >= 4) break;
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
      for (const f of familyOf(r.base)) {
        if (S.dict.has(f.w)) continue;
        put({ kind: 'fam', w: f.w, checked: true, from: r.base, pos: f.pos, cn: f.cn, note: '' });
      }
    }
    return items;
  }

  function glossOfItem(it) {
    if (it.kind === 'fam') return [it.pos, it.cn].filter(Boolean).join(' ');
    if (it.kind === 'unknown') return it.note || '';
    return glossOf(it.w);
  }

  const GROUPS = [
    { k: 'dict', t: '已在词库', cls: 'ok' },
    { k: 'form', t: '变形还原', cls: 'acc' },
    { k: 'fam', t: '词族扩展', cls: 'warn' },
    { k: 'unknown', t: '未收录', cls: 'bad' }
  ];

  function renderReview() {
    const box = $('import-groups');
    box.innerHTML = '';

    const stat = GROUPS.map((d) => ({ d, items: S.review.filter((i) => i.kind === d.k) }))
      .filter((x) => x.items.length);

    $('import-summary').textContent = '共 ' + S.review.length + ' 项';
    $('import-hint').textContent = stat.map((x) => x.d.t + ' ' + x.items.length).join(' · ')
      + '。过去式、复数、比较级会自动还原成原形，释义以本地词库为准。';

    for (const { d, items } of stat) {
      const g = document.createElement('div');
      g.className = 'imp-group';

      const head = document.createElement('div');
      head.className = 'imp-head';
      const dot = document.createElement('i');
      dot.className = 'dot ' + d.cls;
      const tt = document.createElement('span');
      tt.className = 't';
      tt.textContent = d.t;
      const nn = document.createElement('span');
      nn.className = 'n';
      nn.textContent = items.length + ' 个';
      const all = document.createElement('button');
      all.className = 'all';
      all.textContent = items.every((i) => i.checked) ? '全不选' : '全选';
      all.addEventListener('click', () => {
        const on = !items.every((i) => i.checked);
        items.forEach((i) => { i.checked = on; });
        g.querySelectorAll('.imp-row').forEach((row, idx) => {
          const cb = row.querySelector('input[type=checkbox]');
          if (cb) cb.checked = items[idx].checked;
          row.classList.toggle('off', !items[idx].checked);
        });
        all.textContent = on ? '全不选' : '全选';
        updateCommitState();
      });
      head.appendChild(dot);
      head.appendChild(tt);
      head.appendChild(nn);
      head.appendChild(all);
      g.appendChild(head);

      const list = document.createElement('div');
      list.className = 'imp-list';

      for (const it of items) {
        const row = document.createElement('div');
        row.className = 'imp-row' + (it.checked ? '' : ' off');

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = it.checked;
        cb.addEventListener('change', () => {
          it.checked = cb.checked;
          row.classList.toggle('off', !cb.checked);
          updateCommitState();
        });

        const body = document.createElement('div');
        body.className = 'imp-body';

        const w = document.createElement('div');
        w.className = 'imp-w';
        w.textContent = it.w;
        if (it.from) {
          const f = document.createElement('span');
          f.className = 'imp-from';
          f.textContent = '← ' + it.from;
          w.appendChild(f);
        }
        body.appendChild(w);

        const gl = glossOfItem(it);
        if (gl) {
          const gs = document.createElement('div');
          gs.className = 'imp-g';
          gs.textContent = gl;
          body.appendChild(gs);
        } else if (it.kind === 'unknown') {
          const note = document.createElement('input');
          note.className = 'imp-note';
          note.type = 'text';
          note.placeholder = '补充释义（选填）';
          note.value = it.note || '';
          note.addEventListener('input', () => { it.note = note.value.trim(); });
          body.appendChild(note);
        }

        row.appendChild(cb);
        row.appendChild(body);
        row.addEventListener('click', (e) => {
          if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event('change'));
        });

        list.appendChild(row);
      }

      g.appendChild(list);
      box.appendChild(g);
    }
  }

  function updateCommitState() {
    const n = S.review.filter((i) => i.checked).length;
    const btn = $('btn-commit');
    btn.textContent = '加入词库（' + n + '）';
    btn.disabled = n === 0;
  }

  function parseInput() {
    const text = $('import-input').value;
    if (!text.trim()) {
      toast('先粘贴几个单词');
      return;
    }
    S.review = buildReview(text);
    if (!S.review.length) {
      toast('没识别出英文单词');
      return;
    }
    $('import-result').hidden = false;
    $('import-cta').hidden = false;
    renderReview();
    updateCommitState();
    $('import-result').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function entryOf(it) {
    if (it.kind === 'fam') {
      const m = [];
      if (it.cn) m.push([it.pos || '', it.cn]);
      return { w: it.w, ph: '', m, fam: [], en: [], f: 0, lv: 0, src: 'fam', from: it.from || '' };
    }
    const m = [];
    if (it.note) m.push(['', it.note]);
    return { w: it.w, ph: '', m, fam: [], en: [], f: 0, lv: 0, src: 'import' };
  }

  function commitImport() {
    const picks = S.review.filter((i) => i.checked);
    if (!picks.length) {
      toast('没有选中任何词');
      return;
    }

    let added = 0;
    let pinned = 0;
    let skipped = 0;
    const fresh = [];
    const newPins = [];

    for (const it of picks) {
      if (S.user[it.w]) { skipped++; continue; }

      if (S.dict.has(it.w)) {
        if (S.progress[it.w]) { skipped++; continue; }
        if (S.pins.indexOf(it.w) < 0 && newPins.indexOf(it.w) < 0) {
          newPins.push(it.w);
          pinned++;
        }
        continue;
      }

      const e = entryOf(it);
      S.user[it.w] = e;
      S.dict.set(it.w, e);
      fresh.push(it.w);
      added++;
    }

    if (fresh.length) S.order = fresh.concat(S.order);
    if (newPins.length) S.pins = newPins.concat(S.pins);

    saveStore();
    resetImport();
    buildQueue();
    renderToday();

    const bits = [];
    if (added) bits.push('新增 ' + added);
    if (pinned) bits.push('置顶 ' + pinned);
    if (skipped) bits.push('跳过 ' + skipped);
    toast(bits.length ? '已入库 · ' + bits.join(' · ') : '没有需要新增的词');
  }

  function resetImport() {
    $('import-input').value = '';
    $('import-result').hidden = true;
    $('import-cta').hidden = true;
    $('import-groups').innerHTML = '';
    S.review = [];
  }

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
      setTimeout(() => el.remove(), 320);
    }, 1900);
  }

  /* ================= 主题 ================= */
  function initTheme() {
    const saved = localStorage.getItem('shici.theme');
    if (saved === 'dark') document.documentElement.style.colorScheme = 'dark';
    if (saved === 'light') document.documentElement.style.colorScheme = 'light';
  }

  function toggleTheme() {
    const cur = document.documentElement.style.colorScheme;
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.style.colorScheme = next;
    localStorage.setItem('shici.theme', next);
  }

  /* ================= 启动 ================= */
  async function boot() {
    initTheme();
    loadStore();
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    try {
      const res = await fetch('data/dict.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const words = data.words || [];
      words.forEach((e) => {
        if (e && e.w) {
          S.dict.set(e.w, e);
          S.order.push(e.w);
        }
      });
    } catch (err) {
      $('boot').innerHTML = '<p style="color:#be3030">词库加载失败：' + err.message + '</p>';
      return;
    }

    mergeUserWords();

    pickVoice();
    if (window.speechSynthesis) speechSynthesis.onvoiceschanged = pickVoice;

    $('boot').hidden = true;
    $('app').hidden = false;

    buildQueue();
    renderToday();
  }

  /* ================= 事件 ================= */
  $('btn-start').addEventListener('click', () => {
    buildQueue();
    if (S.queue.length === 0) return;
    renderCard();
  });

  $('btn-reveal').addEventListener('click', reveal);
  $('quiz-card').addEventListener('click', (e) => {
    if (e.target.closest('#btn-speak')) return;
    if (!S.revealed) reveal();
  });
  $('btn-speak').addEventListener('click', (e) => { e.stopPropagation(); speak(); });
  $('btn-quit').addEventListener('click', () => { buildQueue(); renderToday(); });
  $('btn-back').addEventListener('click', () => { buildQueue(); renderToday(); });
  $('btn-theme').addEventListener('click', toggleTheme);

  $('btn-import').addEventListener('click', () => {
    resetImport();
    view('import');
  });
  $('btn-import-back').addEventListener('click', () => { resetImport(); renderToday(); });
  $('btn-parse').addEventListener('click', parseInput);
  $('btn-clear').addEventListener('click', resetImport);
  $('btn-commit').addEventListener('click', commitImport);

  document.querySelectorAll('.grade').forEach((b) => {
    b.addEventListener('click', () => onGrade(b.dataset.grade));
  });

  document.addEventListener('keydown', (e) => {
    if ($('view-study').hidden) return;
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (!S.revealed) reveal();
    } else if (S.revealed && e.key === '1') onGrade('wrong');
    else if (S.revealed && e.key === '2') onGrade('partial');
    else if (S.revealed && e.key === '3') onGrade('full');
  });

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  boot();
})();
