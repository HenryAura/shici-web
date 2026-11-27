/* ============================================================
   识词 · 页面渲染：今日 / 词典 / 报告 / 我的 / 导入 / 结算 / WebDAV
   ============================================================ */

/* ================= 今日 ================= */
function dueWords() {
  const now = Date.now();
  const out = [];
  for (const w of S.order) {
    const p = S.progress[w];
    if (p && p.dueAt && p.dueAt <= now && S.dict.has(w)) out.push(w);
  }
  out.sort((a, b) => S.progress[a].dueAt - S.progress[b].dueAt);
  return out;
}

function todayStat() {
  const h = S.hist[dayKey()];
  const done = h ? h.asked : 0;
  const due = dueWords();
  const fresh = freshList(newQuotaLeft());
  return { done: done, due: due.length, newLeft: fresh.length, total: done + due.length + fresh.length, dueList: due, freshList: fresh };
}

let wlOpen = false;

function renderToday() {
  const st = todayStat();
  const left = st.due + st.newLeft;

  $('today-date').textContent = dateLine() + ' · ' + greeting();
  const num = $('hero-num');
  num.textContent = String(left);
  num.classList.toggle('done', left === 0 && st.total > 0);
  $('hero-sub').textContent = st.total === 0
    ? '今天没有待学的词，休息一下'
    : left === 0 ? '今天的词都过完了'
      : (st.due > 0 && st.newLeft > 0 ? '复习 ' + st.due + ' · 新词 ' + st.newLeft
        : st.due > 0 ? '到期的复习' : '今天的新词');
  $('st-streak').textContent = '连续 ' + streak() + ' 天';

  renderExam();

  const pct = st.total > 0 ? Math.round((st.done / st.total) * 100) : 0;
  $('progress-fill').style.width = pct + '%';
  $('tc-pct').textContent = pct + '%';
  const C = 2 * Math.PI * 18;
  const arc = $('tc-arc');
  arc.setAttribute('stroke-dasharray', C.toFixed(1));
  arc.setAttribute('stroke-dashoffset', (C * (1 - pct / 100)).toFixed(1));
  $('progress-text').textContent = st.done + ' / ' + st.total + ' 已答';

  renderHeat();

  const wbN = Object.keys(S.wb).length;
  $('btn-wb').hidden = wbN === 0;
  $('wb-count').textContent = String(wbN);

  const list = $('wordlist');
  const oldRow = list.querySelector('li .w') ? list.querySelector('li') : null;
  const rowH = oldRow ? oldRow.getBoundingClientRect().height : 42;
  list.innerHTML = '';
  const preview = st.dueList.concat(st.freshList);
  $('word-count').textContent = String(preview.length);

  /* 先算按钮和估时：操作条的高度随提示行有无而变化，
     下面要按它的上沿决定词表能摆几行 */
  refreshStartBtn();

  const paint = (capRows) => {
    const moreNow = preview.length > capRows;
    $('wl-chev').hidden = !moreNow;
    $('wl-toggle').classList.toggle('open', wlOpen && !moreNow);
    list.innerHTML = '';
    if (!preview.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = '今天没有待学的词';
      list.appendChild(li);
      return moreNow;
    }
    preview.slice(0, capRows).forEach((w) => {
      const li = document.createElement('li');
      const a = document.createElement('span');
      a.className = 'w';
      a.textContent = w;
      const b = document.createElement('span');
      b.className = 'g';
      b.textContent = glossOf(w);
      li.appendChild(a);
      li.appendChild(b);
      const fq = freqTagEl(w);
      if (fq) {
        fq.classList.add('wl-fq');
        li.appendChild(fq);
      }
      list.appendChild(li);
    });
    if (wlOpen && preview.length > capRows) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = '还有 ' + (preview.length - capRows) + ' 个 · 练习时会依次出现';
      list.appendChild(li);
    }
    return moreNow;
  };

  let cap = wlOpen ? 30 : wordsFit(rowH);
  let more = paint(cap);

  /* 把行高撑起来填满一屏（实测驱动）：
     - 最后一行压到操作条下面 → 减行；
     - 底部有富余 → 把零头均摊进各行（词摆不下时也一样，否则折叠词表底下永远空一条）；
     展开态底部有「还有 X 个」提示行，不撑 */
  const page = $('page-today');
  const fillRows = () => {
    page.style.removeProperty('--wl-row-h');     /* 先还原，量到的才是自然行高 */
    if (!preview.length || wlOpen) return;
    const group = $('wl-group');
    const rowsNow = list.querySelectorAll('li:not(.empty)').length;
    if (!group || !rowsNow) return;
    const bar2 = document.querySelector('#page-today .cta-wrap');
    const pr = page.getBoundingClientRect();
    if (pr.height < 300) return;
    /* 操作条上沿（留 10px 安全距），统一换算成视口坐标 */
    const limit = getComputedStyle(bar2).position === 'fixed'
      ? bar2.getBoundingClientRect().top - 10
      : pr.bottom - (parseFloat(getComputedStyle(page).paddingBottom) || 0) - 14;
    let capNow = rowsNow;
    let over = group.getBoundingClientRect().bottom - limit;
    let guard = 0;
    while (over > 2 && capNow > 4 && guard++ < 6) {          /* 别把整行切在按钮下面 */
      capNow--;
      paint(capNow);
      over = group.getBoundingClientRect().bottom - limit;
    }
    if (over > 2) return;                                    /* 仍压线就保守收场，别再撑 */
    const slack = limit - group.getBoundingClientRect().bottom;
    const natRow = list.querySelector('li:not(.empty)');
    if (!natRow || slack < 4) return;
    const natH = natRow.getBoundingClientRect().height;
    /* 留 6px 保护：floor 摊剩下的零头不能把最后一行顶进提示行 */
    const rh = natH + Math.max(0, Math.floor((slack - 6) / capNow));
    if (rh > natH) page.style.setProperty('--wl-row-h', Math.min(58, rh) + 'px');
  };

  /* 首帧动画 / 字体没就绪时 wordsFit 会量偏（实测能差出 7 行）：
     布局稳定后用真实行高校准一遍行数，再按实测空隙减行或撑高 */
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (curPage !== 'today') return;
    const natRow = list.querySelector('li:not(.empty)');
    const natH = natRow ? natRow.getBoundingClientRect().height : rowH;
    const cap2 = wlOpen ? 30 : wordsFit(natH);
    if (cap2 !== cap) { cap = cap2; more = paint(cap); }
    fillRows();
  }));

  refreshStartBtn();
  renderModeSeg();
}

/** 折叠时按屏幕剩余高度定行数：词表正好顶到操作条上沿，
   多出来的高度都给词，不在底部留一条白，也不把整行切在按钮下面 */
function wordsFit(rowH) {
  const page = $('page-today');
  const group = $('wl-group');
  const head = $('wl-toggle');
  const bar = document.querySelector('#page-today .cta-wrap');
  if (!page || !group || !head || !bar) return 6;
  const pr = page.getBoundingClientRect();
  if (pr.height < 300) return 6;                 /* 页面还没显示出来，按默认来 */
  const top = group.getBoundingClientRect().top - pr.top + page.scrollTop;
  /* 平板上操作条在内容里（static），不能拿它当「屏幕底部」用，
     否则词表只排到左栏按钮那一行就停了 */
  const barTop = getComputedStyle(bar).position === 'fixed'
    ? bar.getBoundingClientRect().top - pr.top + page.scrollTop
    : page.clientHeight - (parseFloat(getComputedStyle(page).paddingBottom) || 0) - 4;
  const headH = head.getBoundingClientRect().height || 50;
  const rows = Math.floor((barTop - top - 10 - headH) / (rowH || 42));
  return Math.max(4, Math.min(30, rows));        /* 塞不下就少摆两行，别把整行压在按钮下面 */
}

/** 开始按钮与下面的估时：以「还剩多少词」为准，学满当天就置灰 */
function refreshStartBtn() {
  const st = todayStat();
  const left = st.due + st.newLeft;
  const btn = $('btn-start');
  btn.disabled = left === 0;
  btn.textContent = left === 0 ? '今天的词都过完了'
    : (st.done > 0 ? '继续练习' : '开始' + MODE_NAME[S.settings.mode]);
  const note = $('cta-note');
  if (note) {
    note.textContent = left > 0
      ? left + ' 个词 · 约 ' + Math.max(1, Math.round(left * 0.25)) + ' 分钟'
      : '';
  }
  /* 今日目标完成但词库里还有没学的词：给一个「继续学」的加练入口 */
  const more = $('btn-more');
  if (more) {
    const canMore = left === 0 && freshList(100000).length > 0;
    more.hidden = !canMore;
  }
}

/** 考试倒计时：压缩成两行细条，只保留天数 / 覆盖率 / 今日安排 */
function renderExam() {
  const card = $('exam-card');
  if (!card) return;
  const p = examPlan();
  if (!p) { card.hidden = true; return; }
  card.hidden = false;

  const dt = new Date(S.settings.examDate + 'T00:00:00');
  const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  $('exam-days').textContent = p.days === 0 ? '今天' : p.days + ' 天';
  $('exam-date-label').textContent =
    (dt.getMonth() + 1) + '月' + dt.getDate() + '日 · 覆盖 ' + p.pct + '%';

  const eff = effectiveNewPerDay();
  const boosted = S.settings.examAuto && eff > S.settings.newPerDay;
  let txt;
  if (p.days === 0) {
    txt = '今天考试 · 全力以赴';
  } else if (p.remain === 0) {
    txt = '必背词已全部掌握 · 保持手感';
  } else if (!p.reachable) {
    // 真实所需已超过每日上限：如实说明，不把建议值悄悄压到上限装作能追上
    txt = '剩余 ' + p.remain + ' 词 · 需每天 ' + p.suggest + ' 词，已按上限 ' + NEW_MAX + ' 推进';
  } else if (boosted) {
    txt = '今日新词 ' + eff + ' · 剩余 ' + p.remain + ' 词';
  } else {
    txt = '剩余 ' + p.remain + ' 词 · 建议每天 ' + p.suggest + ' 词';
  }
  $('exam-plan').textContent = txt;
}

function renderModeSeg() {
  $$('#mode-seg button').forEach((b) => {
    b.classList.toggle('on', b.dataset.mode === S.settings.mode);
  });
  const note = $('mode-note');
  const txt = MODE_NOTE[S.settings.mode] || '';
  if (note.textContent !== txt) {
    note.textContent = txt;
    note.classList.remove('swap');
    void note.offsetWidth;
    note.classList.add('swap');
  }
  syncSeg($('mode-seg'), true);
}

function renderHeat() {
  const box = $('heat');
  if (!box) return;
  box.innerHTML = '';
  const today = dayKey();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = dayKey(d.getTime());
    const n = (S.hist[k] && S.hist[k].asked) || 0;
    const el = document.createElement('span');
    el.className = 'd' + (n > 0 ? ' on' : '') + (k === today ? ' today' : '');
    el.title = k + ' · ' + n + ' 题';
    box.appendChild(el);
  }
}

/* ================= 词典 ================= */
let dictQuery = '';
let searchTimer = null;

function dictHistory() {
  try {
    const a = JSON.parse(localStorage.getItem('shici.dictHist') || '[]');
    return Array.isArray(a) ? a : [];
  } catch (e) { return []; }
}
function pushDictHistory(q) {
  const k = String(q || '').trim();
  if (!k) return;
  let a = dictHistory().filter((x) => x !== k);
  a.unshift(k);
  a = a.slice(0, 8);
  try { localStorage.setItem('shici.dictHist', JSON.stringify(a)); } catch (e) {}
}
function clearDictHistory() {
  try { localStorage.removeItem('shici.dictHist'); } catch (e) {}
  renderDict();
}

function renderDict() {
  $('dict-count').textContent = 'ECDICT · ' + S.dict.size + ' 词'
    + (extraReady() ? ' · 词组 ' + PHRASES.size : '');

  const hist = dictHistory();
  const wrap = $('dict-hist-wrap');
  wrap.hidden = hist.length === 0 || !!dictQuery;
  const box = $('dict-hist');
  box.innerHTML = '';
  hist.forEach((q) => {
    const b = document.createElement('button');
    b.className = 'c';
    b.textContent = q;
    b.addEventListener('click', () => {
      $('dict-q').value = q;
      dictQuery = q;
      $('dict-clear').hidden = false;
      doSearch(true);
    });
    box.appendChild(b);
  });

  if (!dictQuery) {
    $('dict-suggests').hidden = true;
    $('dict-results').innerHTML = '';
    return;
  }

  const res = searchDict(dictQuery, 40);
  const extra = searchExtra(dictQuery, 6).filter((x) => !S.dict.has(x.w));
  const out = $('dict-results');
  out.innerHTML = '';
  $('dict-suggests').hidden = true;

  if (!res.length && !extra.length) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.style.padding = '12px 2px';
    p.textContent = extraReady() ? '没有匹配的结果，换个关键词试试' : '正在加载扩展词库…';
    out.appendChild(p);
    if (!extraReady()) ensureExtra().then(() => { if (dictQuery) renderDict(); });
    return;
  }

  const row = (r, isExtra) => {
    const b = document.createElement('button');
    b.className = 'result-item';
    const w = document.createElement('span');
    w.className = 'r-w';
    w.textContent = r.w;
    const g = document.createElement('span');
    g.className = 'r-g';
    g.textContent = r.gloss;
    const ft = freqTagEl(r.w);
    if (ft) {
      ft.classList.add('r-fq');
      if (r.tag) ft.title += ' · ' + r.tag;   /* 考试标签留在 title，不占位置 */
    }
    b.appendChild(w);
    if (r.via) {
      const via = document.createElement('i');
      via.className = 'r-via';
      via.textContent = r.via + ' 的原形';
      b.appendChild(via);
    }
    b.appendChild(g);
    if (ft) {
      b.appendChild(ft);
    } else if (isExtra) {
      const lv = document.createElement('span');
      lv.className = 'r-lv ext';
      lv.textContent = r.tag || '扩展';
      b.appendChild(lv);
    }
    b.addEventListener('click', () => {
      if (isExtra) {
        addFromExtra(r.w, r.tag);
        if (S.dict.has(r.w)) openDetail(r.w);
      } else {
        openDetail(r.w);
      }
    });
    out.appendChild(b);
  };

  res.forEach((r) => row(r, false));
  extra.forEach((r) => row(r, true));
}

function doSearch(commit) {
  const q = $('dict-q').value.trim();
  dictQuery = q;
  $('dict-clear').hidden = !q;
  if (commit) pushDictHistory(q);
  renderDict();
  // 第一次搜不到时顺手把扩展词库拉下来，再补一次结果
  if (!extraReady()) ensureExtra().then(() => { if (dictQuery) renderDict(); });
}

function onDictInput() {
  clearTimeout(searchTimer);
  dictQuery = $('dict-q').value.trim();
  $('dict-clear').hidden = !dictQuery;
  searchTimer = setTimeout(() => {
    renderDict();
  }, 110);
}

/* ================= 词条详情 ================= */
let detailWord = '';
let detailFrom = 'dict';

/** 把扩展词库/词组里的词收进本地词库，之后离线可查、可参与复习 */
function addFromExtra(w, tag) {
  const ex = lookupExtra(w);
  if (!ex) { toast('没找到这个词'); return false; }
  if (S.dict.has(w)) { openDetail(w); return false; }
  const fr = freqOf(w) || 0;
  const e = ex.kind === 'phrase'
    ? { w: w, ph: '', m: [['', ex.cn]], fam: [], en: [], f: 0, lv: 0, fr: 0, src: 'phrase' }
    : { w: w, ph: ex.ph || '', m: (ex.m && ex.m.length ? ex.m : [['', ex.cn]]), fam: [], en: [], f: 0, lv: 0, fr: fr, src: 'ext' };
  S.user[w] = e;
  S.dict.set(w, e);
  S.order = [w].concat(S.order);
  SEARCH_CACHE = null;
  saveStore();
  toast('已加入词库');
  if (curPage === 'dict') renderDict();
  return true;
}

function openDetail(w) {
  const e = entryOf(w);
  if (!e) { toast('词库里没有这个词'); return; }
  if (curPage !== 'detail') detailFrom = curPage;
  detailWord = w;
  pushDictHistory(w);

  const lex = $('d-lex');
  lex.textContent = lexLabel(e);
  const ftag = freqTagEl(w);
  if (ftag) lex.appendChild(ftag);
  $('d-word').textContent = e.w || w;
  $('d-ph').textContent = e.ph ? '/' + e.ph + '/' : '';

  const p = S.progress[w];
  const stat = [];
  if (p && p.seen) {
    stat.push('练习 ' + p.seen + ' 次');
    if (p.ivl > 0) stat.push(p.ivl + ' 天后复习');
    else stat.push('待复习');
  } else {
    stat.push('还没学过');
  }
  $('d-stat').textContent = stat.join(' · ');

  const ul = $('d-senses');
  ul.innerHTML = '';
  const rows = senseRows(e);
  rows.forEach((r) => {
    const li = document.createElement('li');
    if (r.pos) {
      const sp = document.createElement('span');
      sp.className = 'pos';
      sp.textContent = r.pos;
      li.appendChild(sp);
    }
    li.appendChild(document.createTextNode(r.cn || ''));
    ul.appendChild(li);
  });
  if (!rows.length) {
    const li = document.createElement('li');
    li.className = 'none';
    li.textContent = '暂无释义';
    ul.appendChild(li);
  }
  $('d-en').textContent = e.en && e.en.length ? e.en.slice(0, 3).join('  ') : '';

  // 词形变化
  const forms = formsOf(w);
  $('d-forms-wrap').hidden = forms.length === 0;
  const fb = $('d-forms');
  fb.innerHTML = '';
  forms.forEach((f) => {
    const b = document.createElement('button');
    b.className = 'c';
    b.textContent = f;
    if (S.dict.has(f)) b.classList.add('acc');
    b.addEventListener('click', () => {
      if (S.dict.has(f)) openDetail(f);
      else toast(f + ' 不在词库中');
    });
    fb.appendChild(b);
  });

  // 词族
  const fam = familyOf(w);
  $('d-fam-wrap').hidden = fam.length === 0;
  const fl = $('d-fam');
  fl.innerHTML = '';
  fam.forEach((f) => {
    const b = document.createElement('button');
    b.className = 'fam-row';
    const nb = document.createElement('b');
    nb.textContent = f.w;
    const sp = document.createElement('span');
    sp.textContent = (f.pos ? f.pos + ' ' : '') + f.cn;
    b.appendChild(nb);
    b.appendChild(sp);
    b.addEventListener('click', () => {
      if (S.dict.has(f.w)) openDetail(f.w);
    });
    fl.appendChild(b);
  });

  // 例句
  const sents = sentencesOf(w);
  $('d-sent-wrap').hidden = sents.length === 0;
  const sl = $('d-sent');
  sl.innerHTML = '';
  sents.forEach((row) => {
    const d = document.createElement('div');
    d.className = 'sent';
    const en = document.createElement('p');
    en.className = 'en';
    en.textContent = row[0] || '';
    const cn = document.createElement('p');
    cn.className = 'cn';
    cn.textContent = row[1] || '';
    d.appendChild(en);
    d.appendChild(cn);
    sl.appendChild(d);
  });

  updateDetailWb();
  showPage('detail');
}

function updateDetailWb() {
  const b = $('btn-detail-wb');
  const inWb = !!S.wb[detailWord];
  b.textContent = inWb ? '移出错词本' : '加入错词本';
  b.classList.toggle('on', inWb);
}

function toggleDetailWb() {
  if (!detailWord) return;
  if (S.wb[detailWord]) {
    delete S.wb[detailWord];
    saveStore();
    toast('已移出错词本');
  } else {
    addWrong(detailWord, resolveToken(detailWord).base);
    toast('已加入错词本');
  }
  updateDetailWb();
  $('d-stat').textContent = $('d-stat').textContent;
}

/* ================= 报告 ================= */
function renderReport() {
  const agg = achAgg();
  const learned = Object.keys(S.progress).filter((w) => S.dict.has(w)).length;
  $('rep-asked').textContent = String(agg.asked);
  $('rep-acc').textContent = agg.asked ? Math.round((totalFull() / agg.asked) * 100) + '%' : '—';
  $('rep-mastered').textContent = String(agg.mastered);
  $('rep-learned').textContent = String(learned);

  // 近 7 天
  const box = $('chart7');
  box.innerHTML = '';
  const days = [];
  let max = 1;
  let sum = 0;
  for (let i = 6; i >= 0; i--) {
    const k = shiftDay(-i);
    const n = (S.hist[k] && S.hist[k].asked) || 0;
    days.push({ k: k, n: n });
    if (n > max) max = n;
    sum += n;
  }
  $('rep-7sum').textContent = sum + ' 题';
  const wd = ['日', '一', '二', '三', '四', '五', '六'];
  days.forEach((d, i) => {
    const col = document.createElement('div');
    col.className = 'col' + (d.n > 0 ? ' has' : '') + (i === 6 ? ' today' : '');
    const cnt = document.createElement('span');
    cnt.className = 'cnt';
    cnt.textContent = d.n ? String(d.n) : '';
    const bar = document.createElement('div');
    bar.className = 'bar-v';
    bar.style.height = d.n ? Math.max(6, Math.round((d.n / max) * 74)) + 'px' : '3px';
    const lbl = document.createElement('span');
    lbl.className = 'lbl';
    lbl.textContent = wd[new Date(d.k.replace(/-/g, '/')).getDay()];
    col.appendChild(cnt);
    col.appendChild(bar);
    col.appendChild(lbl);
    box.appendChild(col);
  });

  // 成就
  const grid = $('ach-grid');
  grid.innerHTML = '';
  let got = 0;
  ACH_DEFS.forEach((d) => {
    const el = document.createElement('div');
    el.className = 'ach' + (S.ach[d.id] ? ' on' : '');
    if (S.ach[d.id]) got++;
    const ic = document.createElement('div');
    ic.className = 'ic';
    ic.textContent = d.ic;
    const tt = document.createElement('div');
    tt.className = 'tt';
    tt.textContent = d.tt;
    const dd = document.createElement('div');
    dd.className = 'dd';
    dd.textContent = d.dd;
    el.appendChild(ic);
    el.appendChild(tt);
    el.appendChild(dd);
    grid.appendChild(el);
  });
  $('ach-count').textContent = got + ' / ' + ACH_DEFS.length;

  $('rep-wb-n').textContent = agg.wb + ' 个';
  $('rep-wb-sub').textContent = agg.wb
    ? '答错过的词都在这里，先过一遍再练'
    : '还没有错词，练错了会自动收进来';

  // 薄弱词：错误权重高于模糊，正确次数抵扣
  const weak = [];
  for (const w in S.progress) {
    if (!S.dict.has(w)) continue;
    const p = S.progress[w];
    const score = (p.wrong || 0) * 2 + (p.partial || 0) - (p.full || 0);
    if (score > 0) weak.push({ w: w, score: score, wrong: p.wrong || 0, partial: p.partial || 0 });
  }
  weak.sort((a, b) => b.score - a.score);
  const wl = $('rep-weak');
  wl.innerHTML = '';
  if (!weak.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = agg.asked ? '暂无薄弱词，保持住' : '做过几轮练习后，这里会列出该多看的词';
    wl.appendChild(p);
  } else {
    weak.slice(0, 10).forEach((x) => {
      const b = document.createElement('button');
      b.className = 'wk';
      const nb = document.createElement('b');
      nb.textContent = x.w;
      const tag = document.createElement('i');
      tag.textContent = '错 ' + (x.wrong || x.partial);
      b.appendChild(nb);
      b.appendChild(tag);
      b.addEventListener('click', () => openDetail(x.w));
      wl.appendChild(b);
    });
  }

  // 最近练习
  const recs = [];
  for (const k in S.hist) {
    (S.hist[k].sessions || []).forEach((r) => recs.push(r));
  }
  recs.sort((a, b) => b.at - a.at);
  $('rep-recent-n').textContent = recs.length ? recs.length + ' 轮' : '';
  const rl = $('rep-recent');
  rl.innerHTML = '';
  if (!recs.length) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = '还没有练习记录，完成一轮后这里会出现';
    rl.appendChild(p);
  } else {
    recs.slice(0, 6).forEach((r) => {
      const row = document.createElement('div');
      row.className = 'rec';
      const l = document.createElement('span');
      l.className = 'when';
      l.textContent = fmtWhen(r.at) + ' · ' + (MODE_NAME[r.mode] || '练习');
      const rr = document.createElement('span');
      rr.className = 'sc';
      rr.textContent = r.asked + ' 题 · 对 ' + r.full + (r.wrong ? ' · 错 ' + r.wrong : '');
      row.appendChild(l);
      row.appendChild(rr);
      rl.appendChild(row);
    });
  }
}

function totalFull() {
  let n = 0;
  for (const k in S.hist) n += S.hist[k].full || 0;
  return n;
}

/* ================= 错词本：先看，再练 ================= */
let wbSort = 'wrong';

function renderWb() {
  const list = $('wb-list');
  if (!list) return;

  const rows = Object.keys(S.wb)
    .filter((w) => S.dict.has(w))
    .map((w) => ({ w: w, it: S.wb[w] || {}, p: S.progress[w] || {} }));

  rows.sort((a, b) => {
    if (wbSort === 'az') return a.w.localeCompare(b.w);
    if (wbSort === 'recent') return (b.it.at || 0) - (a.it.at || 0);
    const wa = a.p.wrong || 0;
    const wbk = b.p.wrong || 0;
    if (wbk !== wa) return wbk - wa;
    return (b.it.at || 0) - (a.it.at || 0);
  });

  $$('#seg-wb-sort button').forEach((x) => x.classList.toggle('on', x.dataset.v === wbSort));
  syncSeg($('seg-wb-sort'), true);

  $('wb-total').textContent = rows.length + ' 个';
  $('wb-sub').textContent = rows.length
    ? '答错过的词 · 连对 ' + WB_KEEP + ' 次移出'
    : '答错过的词会自动收进来';

  list.innerHTML = '';
  if (!rows.length) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.style.padding = '10px 2px';
    p.textContent = '错词本是空的。练习时答错的词会自动进来，连对 ' + WB_KEEP + ' 次才移出。';
    list.appendChild(p);
    $('btn-wb-practice').disabled = true;
    $('btn-wb-practice').textContent = '还没有错词';
    return;
  }
  $('btn-wb-practice').disabled = false;
  $('btn-wb-practice').textContent = '开始练习 · ' + rows.length + ' 个词';

  rows.forEach((r) => {
    const b = document.createElement('button');
    b.className = 'result-item wb-item';

    const w = document.createElement('span');
    w.className = 'r-w';
    w.textContent = r.w;

    const g = document.createElement('span');
    g.className = 'r-g';
    g.textContent = glossOf(r.w, 2) || '（暂无释义）';

    const side = document.createElement('span');
    side.className = 'wb-side';
    const bad = document.createElement('b');
    const nWrong = r.p.wrong || 0;
    bad.textContent = '错 ' + nWrong;
    if (nWrong >= 3) bad.className = 'hot';
    const st = document.createElement('i');
    st.textContent = '连对 ' + (r.it.streak || 0) + '/' + WB_KEEP;
    side.appendChild(bad);
    side.appendChild(st);

    b.appendChild(w);
    b.appendChild(g);
    b.appendChild(side);
    b.addEventListener('click', () => openDetail(r.w));
    list.appendChild(b);
  });
}

/* ================= 结算 ================= */
function renderDone(session, newly) {
  const s = session.stats;
  const acc = s.asked ? Math.round((s.full / s.asked) * 100) : 0;

  $('done-title').textContent = session.kind === 'wb'
    ? (Object.keys(S.wb).length === 0 ? '错词全部消灭' : '错词过了一轮')
    : (acc >= 90 ? '这轮很稳' : acc >= 70 ? '基本掌握了' : '这轮有点吃力');
  $('done-detail').textContent = '共 ' + s.asked + ' 题 · 正确率 ' + acc + '%'
    + (newly && newly.length ? ' · 新成就 ' + newly.length : '');
  $('btn-back').textContent = session.kind === 'wb' ? '回到错词本' : '回到今天';

  const box = $('done-stats');
  box.innerHTML = '';
  [['认识', s.full], ['模糊', s.partial], ['不认识', s.wrong]].forEach((pair) => {
    const d = document.createElement('div');
    const b = document.createElement('b');
    b.textContent = String(pair[1]);
    const sp = document.createElement('span');
    sp.textContent = pair[0];
    d.appendChild(b);
    d.appendChild(sp);
    box.appendChild(d);
  });

  const wrongWrap = $('done-wrong-wrap');
  const chips = $('done-wrong');
  chips.innerHTML = '';
  const uniq = Array.from(new Set(session.wrong));
  wrongWrap.hidden = uniq.length === 0;
  uniq.slice(0, 12).forEach((w) => {
    const c = document.createElement('button');
    c.className = 'c';
    c.textContent = w;
    c.addEventListener('click', () => openDetail(w));
    chips.appendChild(c);
  });
  if (uniq.length > 12) {
    const more = document.createElement('span');
    more.className = 'c';
    more.textContent = '+' + (uniq.length - 12);
    chips.appendChild(more);
  }
}

/* ================= 我的 ================= */
/** 每日新词数值：自动加量时显示「设定值 → 实际值」 */
function renderNewVal() {
  const base = S.settings.newPerDay;
  const eff = effectiveNewPerDay();
  $('set-new-val').textContent = eff > base ? base + '→' + eff : String(base);
  if (eff > base) {
    $('set-new-val').title = eff >= NEW_MAX
      ? '已加到每日上限 ' + NEW_MAX
      : '按考试倒排已自动加量';
  } else {
    $('set-new-val').title = '';
  }
}

function renderMine() {
  const s = S.settings;
  $('nick').value = S.nick;
  $('avatar').textContent = (S.nick || '识').slice(0, 1);

  $('set-new').value = String(s.newPerDay);
  renderNewVal();
  $('set-exam').value = s.examDate || '';
  $('btn-exam-clear').hidden = !s.examDate;
  $('sw-exam-auto').setAttribute('aria-checked', s.examAuto ? 'true' : 'false');

  const ep = examPlan();
  const eh = $('exam-hint');
  if (!s.examDate) {
    eh.textContent = '设置考试日期后，每天的新词量会按剩余天数自动倒排。';
  } else if (!ep) {
    eh.textContent = '这个日期已经过去了，换一个日期或点 × 清除。';
  } else if (!ep.reachable) {
    eh.textContent = '距考试 ' + ep.days + ' 天 · 每天需 ' + ep.suggest + ' 词才学得完，已超过上限 ' +
      NEW_MAX + '，建议缩小词量范围或提前开始。';
  } else {
    eh.textContent = '距考试 ' + ep.days + ' 天 · ' + (s.scope === 'rare' ? '认知' : '必背') +
      (s.freqScope === 'hf' ? '高频' : s.freqScope === 'low' ? '低频' : s.freqScope === 'hfm' ? '(高频+常用)' : '') +
      ' ' + ep.done + '/' + ep.total +
      (ep.days > 0 ? ' · 每天 ' + ep.suggest + ' 词' : '') +
      (s.examAuto ? '（自动）' : '（未自动）');
  }
  $('set-rate').value = String(s.rate);
  $('set-rate-val').textContent = Number(s.rate).toFixed(2);

  setSeg('seg-mode', s.mode);
  setSeg('seg-order', s.order);
  setSeg('seg-scope', s.scope);
  setSeg('seg-freq', s.freqScope);
  setSeg('seg-theme', s.theme);
  setSeg('seg-size', String(s.wordSize));

  /* 词频范围提示：实时统计各档在当前词库中的数量 */
  const fc = { 1: 0, 2: 0, 3: 0 };
  for (const w of S.order) { const lv = freqOf(w); if (lv >= 1 && lv <= 3) fc[lv]++; }
  $('freq-hint').textContent = '高频 ' + fc[1] + ' · 常用 ' + fc[2] + ' · 低频 ' + fc[3] +
    '，按徽章过滤每日新词；已学过的词不受影响。';

  $('sw-motion').setAttribute('aria-checked', s.reduceMotion ? 'true' : 'false');
  $('sw-awake').setAttribute('aria-checked', s.keepAwake ? 'true' : 'false');

  refreshWdState();
}

function setSeg(id, v) {
  $$('#' + id + ' button').forEach((b) => {
    b.classList.toggle('on', b.dataset.v === v);
  });
  syncSeg($(id), true);
}

function fillVoiceSelect() {
  const sel = $('sel-voice');
  if (!sel) return;
  const cur = S.settings.voice;
  sel.innerHTML = '';
  const auto = document.createElement('option');
  auto.value = '';
  auto.textContent = '自动选择';
  sel.appendChild(auto);
  voices.forEach((v) => {
    const o = document.createElement('option');
    o.value = v.name;
    o.textContent = v.name + (v.localService === false ? '（在线）' : '');
    sel.appendChild(o);
  });
  sel.value = cur || '';
}

/* ================= WebDAV ================= */
const WD_KEY = 'shici.wd';
const WD_FILE = 'shiy-backup.json';

function wdCfg() {
  try { return JSON.parse(localStorage.getItem(WD_KEY) || 'null'); } catch (e) { return null; }
}
function saveWdCfg(cfg) {
  if (cfg) localStorage.setItem(WD_KEY, JSON.stringify(cfg));
  else localStorage.removeItem(WD_KEY);
}
function b64utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function wdAuth(cfg) {
  return 'Basic ' + b64utf8((cfg.user || '') + ':' + (cfg.pass || ''));
}
function wdUrl(cfg, file) {
  let base = String(cfg.url || '').trim();
  if (!/^https?:\/\//i.test(base)) throw new Error('地址要以 http(s):// 开头');
  if (!base.endsWith('/')) base += '/';
  return base + (file || '');
}

async function wdRequest(cfg, method, file, body) {
  const res = await fetch(wdUrl(cfg, file), {
    method: method,
    headers: {
      Authorization: wdAuth(cfg),
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: body
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + (res.status === 401 ? '（账号或密码不对）' : ''));
  return res;
}

function wdSetStatus(text, cls) {
  const el = $('wd-status');
  el.textContent = text;
  el.style.color = cls === 'bad' ? 'var(--bad)' : cls === 'ok' ? 'var(--ok)' : '';
}

/* ================= GitHub Gist 后端 =================
   备份存进用户自己的私密 Gist：一次粘贴只含 gist 权限的令牌，
   之后与 WebDAV 走同一套「拉取合并 → 推送」流程。 */
const GH_KEY = 'shici.gh';
const GH_BASE = 'https://api.github.com/gists';   /* 注意：POST 不能带尾斜杠，/gists/ 会被 GitHub 拒掉 */

function ghCfg() {
  try { return JSON.parse(localStorage.getItem(GH_KEY) || 'null'); } catch (e) { return null; }
}
function saveGhCfg(cfg) {
  if (cfg && (cfg.token || cfg.gist)) localStorage.setItem(GH_KEY, JSON.stringify(cfg));
  else localStorage.removeItem(GH_KEY);
}
function readGhForm() {
  return { token: $('gh-token').value.trim() };
}
function fillGhForm() {
  const cfg = ghCfg();
  if (cfg) $('gh-token').value = cfg.token || '';
}

async function ghRequest(token, gist, method, content) {
  const body = content === undefined ? undefined : JSON.stringify({
    description: '识词学习备份',
    public: false,
    files: { 'shiy-backup.json': { content: content } }
  });
  const res = await fetch(gist ? GH_BASE + '/' + gist : GH_BASE, {
    method: method,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: body
  });
  if (!res.ok) {
    throw new Error('GitHub HTTP ' + res.status +
      (res.status === 401 ? '（令牌无效或过期）' :
       res.status === 403 ? '（可能超出 GitHub 速率限制，稍后再试）' :
       res.status === 404 ? '（Gist 不存在）' : ''));
  }
  return res.json();
}

async function ghFetchGistData(token, id) {
  const j = await ghRequest(token, id, 'GET');
  const f = j && j.files && j.files[WD_FILE];
  if (!f) return null;
  let content = f.content;
  if (f.truncated && f.raw_url) {                      /* 超 1MB 时 API 只给摘要 */
    const r = await fetch(f.raw_url);
    content = await r.text();
  }
  try { return JSON.parse(content); } catch (e) { throw new Error('云端备份内容异常'); }
}

async function ghRead(token, gist) {
  if (!gist) return null;                              /* 还没建过备份 */
  return ghFetchGistData(token, gist);
}

/** 用令牌在名下所有 Gist 里找识词备份（最多翻 3 页 300 个）。
 *  Gist ID 只存在创建它的那台设备本地，换设备时靠令牌自动对齐。
 *  名下可能出现多个备份（比如每台设备各建了一个空壳），
 *  返回全部候选并按数据量排序，恢复时全部合并、日常同步挑最大的那份。 */
async function ghListBackups(token) {
  const found = [];
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(GH_BASE + '?per_page=100&page=' + page, {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }
    });
    if (!res.ok) {
      throw new Error('GitHub HTTP ' + res.status +
        (res.status === 401 ? '（令牌无效或过期）' :
         res.status === 403 ? '（可能超出 GitHub 速率限制，稍后再试）' : ''));
    }
    const arr = await res.json();
    if (!Array.isArray(arr) || !arr.length) break;
    for (const g of arr) {
      const f = g.files && g.files[WD_FILE];
      if (f) found.push({ id: g.id, size: f.size || 0, updated: g.updated_at || '' });
    }
    if (arr.length < 100) break;
  }
  found.sort((a, b) => b.size - a.size || (b.updated > a.updated ? 1 : -1));
  return found;
}

async function ghPickBest(token) {
  const list = await ghListBackups(token);
  return list.length ? list[0].id : null;
}

async function ghWrite(token, gist, text) {
  const j = await ghRequest(token, gist, gist ? 'PATCH' : 'POST', text);
  return j.id;
}

/* ================= 同步后端抽象 =================
   两个都配置时优先 GitHub；自动同步开关、合并模型两端共用。 */
function syncBackend() {
  const gh = ghCfg();
  if (gh && gh.token) return { kind: 'gh' };
  const cfg = wdCfg();
  if (cfg && cfg.url) return { kind: 'wd' };
  return null;
}
function syncConfigured() {
  return !!syncBackend();
}
function syncSourceName() {
  const b = syncBackend();
  return b ? (b.kind === 'gh' ? 'GitHub' : 'WebDAV') : '';
}

async function syncRead() {
  const b = syncBackend();
  if (b.kind === 'gh') {
    const cfg = ghCfg();
    let gist = cfg.gist;
    if (!gist) {
      gist = await ghPickBest(cfg.token);
      if (gist) saveGhCfg(Object.assign({}, cfg, { gist }));
    }
    try {
      return await ghRead(cfg.token, gist);
    } catch (e) {
      if (/HTTP 404/.test(e.message)) {                /* 本地存的 Gist 被删了 → 重新发现 */
        const id = await ghPickBest(cfg.token);
        if (id && id !== gist) saveGhCfg(Object.assign({}, cfg, { gist: id }));
        return id ? ghRead(cfg.token, id) : null;
      }
      throw e;
    }
  }
  try {
    const res = await wdRequest(wdCfg(), 'GET', WD_FILE);
    return await res.json();
  } catch (e) {
    if (/HTTP 404/.test(e.message)) return null;       /* 云端还没有备份 */
    throw e;
  }
}

async function syncWrite(text) {
  const b = syncBackend();
  if (b.kind === 'gh') {
    const cfg = ghCfg();
    let gist = cfg.gist;
    if (!gist) {                                       /* 别急着新建：先找名下已有的备份 */
      gist = await ghPickBest(cfg.token);
      if (gist) saveGhCfg(Object.assign({}, cfg, { gist }));
    }
    const id = await ghWrite(cfg.token, gist, text);
    if (id && id !== cfg.gist) saveGhCfg(Object.assign({}, cfg, { gist: id }));
    return;
  }
  await wdRequest(wdCfg(), 'PUT', WD_FILE, text);
}

/** 构造与鸿蒙端兼容的备份对象
 *  kv 只放成就快照：设置项结构两端不同，写错字段会污染鸿蒙端的设置，
 *  而鸿蒙恢复时本来就「保留本机设置」，所以设置放 web.settings 里自成一路。
 */
function buildBackup() {
  return {
    app: 'shiy',
    v: 1,
    exportedAt: Date.now(),
    kv: { achSnapshot: S.ach },
    progress: S.progress,
    wrongbook: S.wb,
    history: S.hist,
    modes: S.modes,
    // 网页端自有：自建词条、置顶、昵称、设置
    web: { user: S.user, pins: S.pins, nick: S.nick, settings: S.settings }
  };
}

/** 合并备份：进度取更优、错词取并集、历史取较大值，本机设置保留 */
function mergeBackup(data) {
  if (!data || data.app !== 'shiy') throw new Error('不是识词的备份文件');

  let addP = 0;
  const P = data.progress || {};
  for (const w in P) {
    if (!S.dict.has(w)) continue;
    const inc = P[w] || {};
    const cur = S.progress[w];
    if (!cur) { S.progress[w] = inc; addP++; continue; }
    if ((inc.seen || 0) > (cur.seen || 0) || ((inc.seen || 0) === (cur.seen || 0) && (inc.full || 0) > (cur.full || 0))) {
      S.progress[w] = inc;
      addP++;
    }
  }

  let addW = 0;
  const W = data.wrongbook || {};
  for (const w in W) {
    if (!S.dict.has(w)) continue;
    if (!S.wb[w]) { S.wb[w] = W[w]; addW++; }
    else S.wb[w].streak = Math.max(S.wb[w].streak || 0, W[w].streak || 0);
  }

  const H = data.history || {};
  for (const k in H) {
    const inc = H[k] || {};
    if (!S.hist[k]) S.hist[k] = inc;
    else {
      const cur = S.hist[k];
      cur.asked = Math.max(cur.asked || 0, inc.asked || 0);
      cur.full = Math.max(cur.full || 0, inc.full || 0);
      cur.partial = Math.max(cur.partial || 0, inc.partial || 0);
      cur.wrong = Math.max(cur.wrong || 0, inc.wrong || 0);
      cur.newLearned = Math.max(cur.newLearned || 0, inc.newLearned || 0);
      if (inc.sessions && inc.sessions.length) {
        const seen = new Set((cur.sessions || []).map((x) => x.at));
        inc.sessions.forEach((x) => { if (!seen.has(x.at)) cur.sessions.push(x); });
        cur.sessions.sort((a, b) => a.at - b.at);
        if (cur.sessions.length > 40) cur.sessions = cur.sessions.slice(-40);
      }
    }
  }

  const M = data.modes || {};
  for (const m in M) {
    if (!S.modes[m]) S.modes[m] = M[m];
    else {
      const cur = S.modes[m], inc = M[m];
      cur.asked = Math.max(cur.asked || 0, inc.asked || 0);
      cur.full = Math.max(cur.full || 0, inc.full || 0);
      cur.partial = Math.max(cur.partial || 0, inc.partial || 0);
      cur.wrong = Math.max(cur.wrong || 0, inc.wrong || 0);
    }
  }

  const A = (data.kv && data.kv.achSnapshot) || data.ach || {};
  for (const k in A) if (!S.ach[k]) S.ach[k] = A[k];

  const web = data.web || {};
  let addU = 0;
  if (web.user) {
    for (const k in web.user) {
      if (!S.dict.has(k) && !S.user[k]) { S.user[k] = web.user[k]; addU++; }
    }
  }
  if (Array.isArray(web.pins)) {
    const merged = web.pins.concat(S.pins).filter((w, i, a) => S.dict.has(w) && a.indexOf(w) === i);
    S.pins = merged;
  }
  if (web.settings && typeof web.settings === 'object') {
    /* 设置跟随云端，但「设备级设置」除外。两台设备共用一份备份时，谁最后推送谁的设置
       就被带过来，表现就是「选了高频过一会儿弹回全部」「每日词量调完又自己变回去」。
       设备级 = 本机自己的学习口径与显示偏好：默认练习方式、新词范围、词频范围、
       每日新词量、字号。只有本机是全新安装（还没有任何存档）时，才整份采纳云端设置，
       这样换设备/重装靠备份恢复时，学习计划仍然能带过来。 */
    const cloud = Object.assign({}, web.settings);
    if (!S.fresh) {
      delete cloud.mode;
      delete cloud.scope;
      delete cloud.freqScope;
      delete cloud.newPerDay;
      delete cloud.wordSize;
    }
    S.fresh = false;
    S.settings = Object.assign({}, DEFAULT_SETTINGS, S.settings, cloud);
    normalizeSettings();
    applySettings();
  }
  if (web.nick && !S.nick) S.nick = web.nick;

  mergeUserWords();
  saveStore();
  renderAll();
  return { p: addP, w: addW, u: addU };
}

function exportBackup() {
  const data = JSON.stringify(buildBackup());
  const name = '识词备份-' + dayKey() + '.json';
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 600);
  toast('已导出，可在文件 App 中查看');
}

function importBackupFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      const r = mergeBackup(data);
      toast('已合并 · 进度 ' + r.p + ' · 错词 ' + r.w);
      wdSyncDebounced(2500);
    } catch (e) {
      toast('导入失败：' + e.message);
    }
  };
  reader.readAsText(file);
}

async function wdTest(btn) {
  const gh = readGhForm(), wd = readWdForm();
  if (!gh.token && !wd.url) { wdSetStatus('先填 GitHub 令牌或 WebDAV 地址', 'bad'); return; }
  btn.disabled = true;
  wdSetStatus('正在连接…');
  try {
    if (gh.token) {
      const prev = ghCfg() || {};
      let gist = prev.gist, note = '';
      if (gist) {
        try { await ghRequest(gh.token, gist, 'GET'); }
        catch (e) { if (/HTTP 404/.test(e.message)) gist = null; else throw e; }
      }
      if (!gist) {                            /* 本机没有 Gist ID：先找令牌名下已有的备份，
                                                 换设备时同一令牌会自动对齐到同一份，而不是各建一个空壳 */
        gist = await ghPickBest(gh.token);
        if (gist) note = '，已找到云端备份';
      }
      if (!gist) {                            /* 确实没有才创建 */
        const j = await ghRequest(gh.token, '', 'POST', JSON.stringify(buildBackup()));
        gist = j.id; note = '，已创建私密备份';
      }
      saveGhCfg({ token: gh.token, gist: gist });
      wdSetStatus('GitHub 连接成功' + note, 'ok');
    } else {
      await wdRequest(wd, 'GET', WD_FILE);
      wdSetStatus('WebDAV 连接成功，云端已有备份', 'ok');
    }
  } catch (e) {
    if (!gh.token && /HTTP 404/.test(e.message)) {
      wdSetStatus('WebDAV 连接成功，云端还没有备份', 'ok');
    } else {
      wdSetStatus('连接失败：' + e.message + (String(e.message).indexOf('Failed to fetch') >= 0 ? '（可能是网盘未允许跨域）' : ''), 'bad');
    }
  } finally {
    btn.disabled = false;
  }
}

function readWdForm() {
  return {
    url: $('wd-url').value.trim(),
    user: $('wd-user').value.trim(),
    pass: $('wd-pass').value
  };
}

function fillWdForm() {
  const cfg = wdCfg();
  if (!cfg) return;
  $('wd-url').value = cfg.url || '';
  $('wd-user').value = cfg.user || '';
  $('wd-pass').value = cfg.pass || '';
}

async function wdBackup(btn) {
  const gh = readGhForm(), wd = readWdForm();
  if (!gh.token && !wd.url) { wdSetStatus('先填 GitHub 令牌或 WebDAV 地址', 'bad'); return; }
  if (gh.token) saveGhCfg(Object.assign({}, ghCfg() || {}, { token: gh.token }));
  if (wd.url) saveWdCfg(Object.assign({}, wdCfg() || {}, wd));
  btn.disabled = true;
  wdSetStatus('正在上传…');
  try {
    await syncWrite(JSON.stringify(buildBackup()));
    wdSetStatus('已上传 · ' + new Date().toLocaleTimeString(), 'ok');
    toast('备份已上传');
  } catch (e) {
    wdSetStatus('上传失败：' + e.message, 'bad');
  } finally {
    btn.disabled = false;
  }
}

async function wdRestore(btn) {
  const gh = readGhForm(), wd = readWdForm();
  if (!gh.token && !wd.url) { wdSetStatus('先填 GitHub 令牌或 WebDAV 地址', 'bad'); return; }
  if (!confirm('从云端恢复会合并进本机进度，本机设置保留。继续？')) return;
  if (gh.token) saveGhCfg(Object.assign({}, ghCfg() || {}, { token: gh.token }));
  if (wd.url) saveWdCfg(Object.assign({}, wdCfg() || {}, wd));
  btn.disabled = true;
  wdSetStatus('正在下载…');
  try {
    let total = { p: 0, w: 0 };
    if (syncBackend().kind === 'gh') {
      /* GitHub：本机存的 Gist + 令牌名下发现的所有备份，逐个合并。
         这样即使某台设备建过自己的空壳 Gist（恢复显示 0 的根源），
         也能把真正有数据的备份找回来；合并后同步会写回最大那份。 */
      const cfg = ghCfg();
      const list = await ghListBackups(cfg.token);
      const ids = list.map((x) => x.id);
      if (cfg.gist && ids.indexOf(cfg.gist) < 0) ids.unshift(cfg.gist);
      if (!ids.length) throw new Error('令牌名下没有识词备份，先在手机上同步一次');
      for (const id of ids) {
        try {
          const data = await ghFetchGistData(cfg.token, id);
          if (!data || data.app !== 'shiy') continue;
          const r = mergeBackup(data);
          total.p += r.p; total.w += r.w;
        } catch (e) { /* 单个损坏不影响其它 */ }
      }
      saveGhCfg(Object.assign({}, cfg, { gist: list.length ? list[0].id : cfg.gist }));
    } else {
      const data = await syncRead();
      if (!data) throw new Error('云端还没有备份');
      const r = mergeBackup(data);
      total = r;
    }
    wdSetStatus('恢复完成 · 进度 ' + total.p + ' · 错词 ' + total.w, 'ok');
    toast('已合并云端备份');
    wdSyncDebounced(2500);          /* 恢复完顺手把合并结果推上去 */
  } catch (e) {
    wdSetStatus('恢复失败：' + e.message, 'bad');
  } finally {
    btn.disabled = false;
  }
}

/* ================= 自动同步 =================
   数据模型是「只增不减」：进度取更优、历史按天取大、错词取并集——
   所以可以放心「拉下来合并 → 推上去」，不需要真正的冲突解决 */
const SYNC_AT_KEY = 'shici.syncAt';
const SYNC_AUTO_KEY = 'shici.sync.auto';
let __wdSyncing = false;
let __wdTimer = 0;

function lastSyncAt() {
  const v = parseInt(localStorage.getItem(SYNC_AT_KEY) || '0', 10);
  return v || 0;
}

function syncAutoOn() {
  return localStorage.getItem(SYNC_AUTO_KEY) === '1';
}
function setSyncAuto(on) {
  if (on) localStorage.setItem(SYNC_AUTO_KEY, '1');
  else localStorage.removeItem(SYNC_AUTO_KEY);
}

/* 老版本把自动同步开关存在 WebDAV 配置里，迁一次到独立 key */
(function migrateSyncAuto() {
  if (localStorage.getItem(SYNC_AUTO_KEY) === null) {
    const cfg = wdCfg();
    if (cfg && cfg.auto) setSyncAuto(true);
  }
})();

async function wdSyncNow(reason) {
  if (!syncConfigured() || !syncAutoOn() || __wdSyncing) return false;
  __wdSyncing = true;
  try {
    const remote = await syncRead();
    if (remote && remote.app === 'shiy') mergeBackup(remote);
    await syncWrite(JSON.stringify(buildBackup()));
    localStorage.setItem(SYNC_AT_KEY, String(Date.now()));
    if (curPage === 'wd') wdSetStatus('已自动同步 · ' + new Date().toLocaleTimeString('zh-CN', { hour12: false }), 'ok');
    return true;
  } catch (e) {
    /* 静默失败：网络抖一下别打断用户，进了同步页再显示原因 */
    console.warn('[sync]', reason, e);
    if (curPage === 'wd') wdSetStatus('自动同步失败：' + e.message, 'bad');
    return false;
  } finally {
    __wdSyncing = false;
  }
}

function wdSyncDebounced(ms) {
  clearTimeout(__wdTimer);
  __wdTimer = setTimeout(() => { wdSyncNow('event'); }, ms || 1500);
}

function refreshWdState() {
  const b = syncBackend();
  let txt = '未配置';
  if (b) {
    const at = lastSyncAt();
    txt = syncAutoOn()
      ? (at ? '已同步 ' + new Date(at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '自动同步已开')
      : '已配置（' + syncSourceName() + '）';
  }
  $('wd-state').innerHTML = txt + ' <span class="chev">›</span>';
}

/* ================= 导入 ================= */
function cnOfM(m) {
  return (m || []).map((r) => ((r[0] ? r[0] + ' ' : '') + (r[1] || ''))).join('；');
}

function glossOfItem(it) {
  if (it.kind === 'fam') return [it.pos, it.cn].filter(Boolean).join(' ');
  if (it.kind === 'phrase' || it.kind === 'ext') return it.cn || '';
  if (it.kind === 'unknown') return it.note || '';
  return glossOf(it.w);
}

const GROUPS = [
  { k: 'dict', t: '已在词库', cls: 'ok' },
  { k: 'form', t: '变形还原', cls: 'acc' },
  { k: 'fam', t: '词族扩展', cls: 'warn' },
  { k: 'phrase', t: '词组收录', cls: 'ok' },
  { k: 'ext', t: '扩展词库', cls: 'acc' },
  { k: 'unknown', t: '未收录', cls: 'bad' }
];

function renderReview() {
  const box = $('import-groups');
  box.innerHTML = '';

  const stat = GROUPS.map((d) => ({ d: d, items: S.review.filter((i) => i.kind === d.k) }))
    .filter((x) => x.items.length);

  $('import-summary').textContent = '共 ' + S.review.length + ' 项';
  $('import-hint').textContent = stat.map((x) => x.d.t + ' ' + x.items.length).join(' · ')
    + '。过去式、复数、比较级会自动还原成原形；词组与核心词库外的词会自动补上释义。';

  for (const g of stat) {
    const d = g.d;
    const items = g.items;
    const wrap = document.createElement('div');
    wrap.className = 'imp-group';

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
      $$('.imp-row', wrap).forEach((row, idx) => {
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
    wrap.appendChild(head);

    const list = document.createElement('div');
    items.forEach((it) => {
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
      const fq = freqTagEl(it.w);
      if (fq) w.appendChild(fq);
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
    });

    wrap.appendChild(list);
    box.appendChild(wrap);
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
  // 词组表与扩展词库是按需加载的，第一次解析前先等它到位
  if (!extraReady()) {
    $('import-summary').textContent = '正在加载词组与扩展词库…';
    $('import-result').hidden = false;
    ensureExtra().then(doParse);
    return;
  }
  doParse();
}

function doParse() {
  const text = $('import-input').value;
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

function makeEntry(it) {
  const fr = it.fr || freqOf(it.w) || 0;
  if (it.kind === 'fam') {
    const m = [];
    if (it.cn) m.push([it.pos || '', it.cn]);
    return { w: it.w, ph: '', m: m, fam: [], en: [], f: 0, lv: 0, fr: fr, src: 'fam', from: it.from || '' };
  }
  if (it.kind === 'phrase') {
    return { w: it.w, ph: '', m: [['', it.cn || '']], fam: [], en: [], f: 0, lv: 0, fr: fr, src: 'phrase' };
  }
  if (it.kind === 'ext') {
    const m = (it.m && it.m.length) ? it.m : (it.cn ? [['', it.cn]] : []);
    return { w: it.w, ph: it.ph || '', m: m, fam: [], en: [], f: 0, lv: 0, fr: fr, src: 'ext' };
  }
  const m = [];
  if (it.note) m.push(['', it.note]);
  return { w: it.w, ph: '', m: m, fam: [], en: [], f: 0, lv: 0, fr: fr, src: 'import' };
}

function commitImport() {
  const picks = S.review.filter((i) => i.checked);
  if (!picks.length) {
    toast('没有选中任何词');
    return;
  }

  let added = 0, pinned = 0, skipped = 0;
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
    const e = makeEntry(it);
    S.user[it.w] = e;
    S.dict.set(it.w, e);
    fresh.push(it.w);
    added++;
  }

  if (fresh.length) S.order = fresh.concat(S.order);
  if (newPins.length) S.pins = newPins.concat(S.pins);
  if (fresh.length) SEARCH_CACHE = null;

  flushStore();
  resetImport();
  renderToday();

  const bits = [];
  if (added) bits.push('新增 ' + added);
  if (pinned) bits.push('置顶 ' + pinned);
  if (skipped) bits.push('跳过 ' + skipped);
  toast(bits.length ? '已入库 · ' + bits.join(' · ') : '没有需要新增的词');
  if (added || pinned) wdSyncDebounced(2500);
}

function resetImport() {
  $('import-input').value = '';
  $('import-result').hidden = true;
  $('import-cta').hidden = true;
  $('import-groups').innerHTML = '';
  S.review = [];
}

/* ================= 汇总刷新 ================= */
function renderAll() {
  renderToday();
  renderDict();
  renderReport();
  renderMine();
  if (curPage === 'wb') renderWb();
}
