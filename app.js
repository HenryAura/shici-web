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
    queue: [],
    idx: 0,
    revealed: false,
    locked: false
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
        localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, progress: S.progress, days: S.days }));
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
  function todayStat() {
    const today = dayKey();
    let done = 0;
    let newLeft = 0;

    for (const w of S.order) {
      const p = S.progress[w];
      if (p && p.lastAt && dayKey(p.lastAt) === today) done++;
    }

    const studied = Object.keys(S.progress).length;
    newLeft = Math.max(0, Math.min(NEW_PER_DAY, S.order.length - studied));
    newLeft = Math.min(newLeft, S.order.filter((w) => !S.progress[w]).length);

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

    const fresh = [];
    for (const w of S.order) {
      if (!S.progress[w]) fresh.push(w);
      if (fresh.length >= NEW_PER_DAY) break;
    }

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
    ['today', 'study', 'done'].forEach((v) => { $('view-' + v).hidden = v !== name; });
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
    const fresh = [];
    for (const w of S.order) {
      if (!S.progress[w]) fresh.push(w);
      if (fresh.length >= NEW_PER_DAY) break;
    }
    return due.concat(fresh);
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
    const lexName = { cet4: '四级', cet6: '六级', kaoyan: '考研' }[e.lex || 'cet4'] || '四级';
    const parts = [lexName + (e.f === 1 ? ' · 必背' : ' · 认知')];
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
