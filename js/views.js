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
  const fresh = freshList(effectiveNewPerDay());
  return { done: done, due: due.length, newLeft: fresh.length, total: done + due.length + fresh.length, dueList: due, freshList: fresh };
}

function renderToday() {
  const st = todayStat();

  $('today-date').textContent = dateLine() + ' · ' + greeting();
  $('hero-num').textContent = String(st.total);
  $('hero-sub').textContent = st.total === 0
    ? '今天没有待学的词，休息一下'
    : (st.due > 0 && st.newLeft > 0 ? '复习 ' + st.due + ' · 新词 ' + st.newLeft
      : st.due > 0 ? '到期复习 ' + st.due + ' 个词' : '新词 ' + st.newLeft + ' 个');

  $('st-done').textContent = String(st.done);
  $('st-new').textContent = String(st.newLeft);
  $('st-streak').textContent = String(streak());

  renderExam();

  const pct = st.total > 0 ? Math.round((st.done / st.total) * 100) : 0;
  $('progress-text').textContent = st.done + ' / ' + st.total;
  $('progress-fill').style.width = pct + '%';

  renderHeat();

  const wbN = Object.keys(S.wb).length;
  $('btn-wb').hidden = wbN === 0;
  $('wb-count').textContent = String(wbN);

  const list = $('wordlist');
  list.innerHTML = '';
  const preview = st.dueList.concat(st.freshList);
  $('word-count').textContent = preview.length ? String(preview.length) : '0';

  if (!preview.length) {
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
  btn.disabled = st.total === 0;
  btn.textContent = st.total === 0 ? '今天已完成'
    : (st.done > 0 ? '继续练习' : '开始' + MODE_NAME[S.settings.mode]);

  renderModeSeg();
}

/** 考试倒计时卡：距考试天数 + 必背词覆盖率 + 倒排建议 */
function renderExam() {
  const card = $('exam-card');
  if (!card) return;
  const p = examPlan();
  if (!p) { card.hidden = true; return; }
  card.hidden = false;

  const dt = new Date(S.settings.examDate + 'T00:00:00');
  const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  $('exam-days').textContent = p.days === 0 ? '今天' : p.days + ' 天';
  $('exam-date-label').textContent = (dt.getMonth() + 1) + '月' + dt.getDate() + '日 · ' + wd[dt.getDay()];
  $('exam-pct').textContent = p.pct + '%';

  const C = 2 * Math.PI * 20;
  const arc = $('exam-arc');
  arc.setAttribute('stroke-dasharray', C.toFixed(1));
  arc.setAttribute('stroke-dashoffset', (C * (1 - p.pct / 100)).toFixed(1));

  let txt;
  const eff = effectiveNewPerDay();
  const boosted = S.settings.examAuto && eff > S.settings.newPerDay;
  $('exam-kicker').textContent = boosted ? '距考试 · 今日新词 ' + eff : '距考试 · 必背词覆盖';

  if (p.days === 0) {
    txt = '今天考试 · 全力以赴';
  } else if (p.remain === 0) {
    txt = '必背词已全部掌握 · 保持手感';
  } else {
    txt = '剩余 ' + p.remain + ' 词 · 建议每天 ' + p.suggest + ' 词';
    if (!S.settings.examAuto) txt += ' · 未自动加量';
  }
  $('exam-plan').textContent = txt;
}

function renderModeSeg() {
  $$('#mode-seg button').forEach((b) => {
    b.classList.toggle('on', b.dataset.mode === S.settings.mode);
  });
  $('mode-note').textContent = MODE_NOTE[S.settings.mode] || '';
}

function renderHeat() {
  const box = $('heat');
  box.innerHTML = '';
  const wd = ['日', '一', '二', '三', '四', '五', '六'];
  const today = dayKey();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = dayKey(d.getTime());
    const n = (S.hist[k] && S.hist[k].asked) || 0;
    const el = document.createElement('div');
    if (n > 0) el.className = 'on';
    if (k === today) el.className += ' today';
    el.textContent = wd[d.getDay()];
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
    const lv = document.createElement('span');
    lv.className = 'r-lv';
    if (isExtra) {
      lv.textContent = r.tag || '扩展';
      lv.classList.add('ext');
    } else {
      lv.textContent = r.lv === 2 ? '认知' : '必背';
    }
    b.appendChild(w);
    if (r.via) {
      const via = document.createElement('i');
      via.className = 'r-via';
      via.textContent = r.via + ' 的原形';
      b.appendChild(via);
    }
    b.appendChild(g);
    b.appendChild(lv);
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
  const e = ex.kind === 'phrase'
    ? { w: w, ph: '', m: [['', ex.cn]], fam: [], en: [], f: 0, lv: 0, src: 'phrase' }
    : { w: w, ph: ex.ph || '', m: (ex.m && ex.m.length ? ex.m : [['', ex.cn]]), fam: [], en: [], f: 0, lv: 0, src: 'ext' };
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

  $('d-lex').textContent = lexLabel(e);
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
  $('rep-asked').textContent = String(agg.asked);
  $('rep-acc').textContent = agg.asked ? Math.round((totalFull() / agg.asked) * 100) + '%' : '—';
  $('rep-mastered').textContent = String(agg.mastered);
  $('rep-wbc').textContent = String(agg.wb);

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

/* ================= 结算 ================= */
function renderDone(session, newly) {
  const s = session.stats;
  const acc = s.asked ? Math.round((s.full / s.asked) * 100) : 0;

  $('done-title').textContent = session.kind === 'wb'
    ? (Object.keys(S.wb).length === 0 ? '错词全部消灭' : '错词过了一轮')
    : (acc >= 90 ? '这轮很稳' : acc >= 70 ? '基本掌握了' : '这轮有点吃力');
  $('done-detail').textContent = '共 ' + s.asked + ' 题 · 正确率 ' + acc + '%'
    + (newly && newly.length ? ' · 新成就 ' + newly.length : '');

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
  $('set-new-val').title = eff > base ? '按考试倒排已自动加量' : '';
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
  } else {
    eh.textContent = '距考试 ' + ep.days + ' 天 · 必背 ' + ep.done + '/' + ep.total +
      (ep.days > 0 ? ' · 每天 ' + ep.suggest + ' 词' : '') +
      (s.examAuto ? '（自动）' : '（未自动）');
  }
  $('set-rate').value = String(s.rate);
  $('set-rate-val').textContent = Number(s.rate).toFixed(2);

  setSeg('seg-mode', s.mode);
  setSeg('seg-order', s.order);
  setSeg('seg-scope', s.scope);
  setSeg('seg-theme', s.theme);
  setSeg('seg-size', String(s.wordSize));

  $('sw-motion').setAttribute('aria-checked', s.reduceMotion ? 'true' : 'false');
  $('sw-awake').setAttribute('aria-checked', s.keepAwake ? 'true' : 'false');

  const cfg = wdCfg();
  $('wd-state').innerHTML = (cfg && cfg.url ? '已配置' : '未配置') + ' <span class="chev">›</span>';
}

function setSeg(id, v) {
  $$('#' + id + ' button').forEach((b) => {
    b.classList.toggle('on', b.dataset.v === v);
  });
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
    S.settings = Object.assign({}, DEFAULT_SETTINGS, S.settings, web.settings);
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
    } catch (e) {
      toast('导入失败：' + e.message);
    }
  };
  reader.readAsText(file);
}

async function wdTest(btn) {
  const cfg = readWdForm();
  if (!cfg.url) { wdSetStatus('先填服务器地址', 'bad'); return; }
  btn.disabled = true;
  wdSetStatus('正在连接…');
  try {
    await wdRequest(cfg, 'GET', WD_FILE);
    wdSetStatus('连接成功，云端已有备份', 'ok');
  } catch (e) {
    if (/HTTP 404/.test(e.message)) {
      wdSetStatus('连接成功，云端还没有备份', 'ok');
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
  const cfg = readWdForm();
  if (!cfg.url) { wdSetStatus('先填服务器地址', 'bad'); return; }
  btn.disabled = true;
  wdSetStatus('正在上传…');
  try {
    await wdRequest(cfg, 'PUT', WD_FILE, JSON.stringify(buildBackup()));
    saveWdCfg(cfg);
    wdSetStatus('已上传 · ' + new Date().toLocaleTimeString(), 'ok');
    toast('备份已上传');
  } catch (e) {
    wdSetStatus('上传失败：' + e.message, 'bad');
  } finally {
    btn.disabled = false;
  }
}

async function wdRestore(btn) {
  const cfg = readWdForm();
  if (!cfg.url) { wdSetStatus('先填服务器地址', 'bad'); return; }
  if (!confirm('从云端恢复会合并进本机进度，本机设置保留。继续？')) return;
  btn.disabled = true;
  wdSetStatus('正在下载…');
  try {
    const res = await wdRequest(cfg, 'GET', WD_FILE);
    const data = await res.json();
    const r = mergeBackup(data);
    saveWdCfg(cfg);
    wdSetStatus('恢复完成 · 进度 ' + r.p + ' · 错词 ' + r.w, 'ok');
    toast('已合并云端备份');
  } catch (e) {
    wdSetStatus('恢复失败：' + e.message, 'bad');
  } finally {
    btn.disabled = false;
  }
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
  if (it.kind === 'fam') {
    const m = [];
    if (it.cn) m.push([it.pos || '', it.cn]);
    return { w: it.w, ph: '', m: m, fam: [], en: [], f: 0, lv: 0, src: 'fam', from: it.from || '' };
  }
  if (it.kind === 'phrase') {
    return { w: it.w, ph: '', m: [['', it.cn || '']], fam: [], en: [], f: 0, lv: 0, src: 'phrase' };
  }
  if (it.kind === 'ext') {
    const m = (it.m && it.m.length) ? it.m : (it.cn ? [['', it.cn]] : []);
    return { w: it.w, ph: it.ph || '', m: m, fam: [], en: [], f: 0, lv: 0, src: 'ext' };
  }
  const m = [];
  if (it.note) m.push(['', it.note]);
  return { w: it.w, ph: '', m: m, fam: [], en: [], f: 0, lv: 0, src: 'import' };
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
}
