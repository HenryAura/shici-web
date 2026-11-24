/* ============================================================
   识词 · 练习引擎：闪卡 / 选择 / 拼写 / 听写
   ============================================================ */

const MODE_NAME = { flash: '闪卡', choice: '选择', spell: '拼写', listen: '听写' };
const MODE_NOTE = {
  flash: '看词回忆，翻面自评',
  choice: '四选一，认出正确释义',
  spell: '看中文释义，拼出英文单词',
  listen: '听发音，拼出单词（iOS 离线语音）'
};

let advanceTimer = null;

/* ================= 组卷 ================= */
function buildSession(kind, mode) {
  const items = [];
  if (kind === 'wb') {
    const words = Object.keys(S.wb).filter((w) => S.dict.has(w));
    words.slice(0, 50).forEach((w) => items.push({ w: w, tag: 'wb' }));
  } else {
    const now = Date.now();
    const due = [];
    for (const w of S.order) {
      const p = S.progress[w];
      if (p && p.dueAt && p.dueAt <= now && S.dict.has(w)) due.push(w);
    }
    due.sort((a, b) => S.progress[a].dueAt - S.progress[b].dueAt);
    due.forEach((w) => items.push({ w: w, tag: 'review' }));
    freshList(effectiveNewPerDay()).forEach((w) => items.push({ w: w, tag: 'new' }));
  }

  S.session = {
    kind: kind,
    mode: mode || S.settings.mode,
    items: items,
    idx: 0,
    stats: { asked: 0, full: 0, partial: 0, wrong: 0 },
    wrong: [],
    answered: false,
    q: null,
    startedAt: Date.now()
  };
  return S.session;
}

function sessionEmpty() {
  return !S.session || !S.session.items.length;
}

function startSession(kind, mode) {
  const s = buildSession(kind, mode);
  if (!s.items.length) {
    toast(kind === 'wb' ? '错词本是空的' : '今天没有要练的词');
    return false;
  }
  showPage('study');
  acquireWake();
  renderQuestion();
  return true;
}

/* ================= 渲染分发 ================= */
function renderQuestion() {
  clearTimeout(advanceTimer);
  /* 上一题的音念到一半就切题时立刻掐掉，避免旧词读音串到新题里 */
  if (window.speechSynthesis) speechSynthesis.cancel();
  const s = S.session;
  if (!s) return;
  if (s.idx >= s.items.length) { endSession(); return; }

  s.answered = false;
  const item = s.items[s.idx];
  const progress = s.idx / s.items.length;

  $('study-fill').style.width = Math.round(progress * 100) + '%';
  $('study-count').textContent = (s.idx + 1) + ' / ' + s.items.length;

  $('flash').hidden = true;
  $('quiz-choice').hidden = true;
  $('quiz-input').hidden = true;
  $('grade-bar').hidden = true;
  $('btn-submit').hidden = true;
  $('btn-next').hidden = true;
  $('study-cta').hidden = false;

  if (s.mode === 'flash') renderFlash(item);
  else if (s.mode === 'choice') renderChoice(item);
  else renderSpell(item);
}

function tagLine(item) {
  const bits = [];
  if (item.tag === 'new') bits.push('新词');
  else if (item.tag === 'wb') bits.push('错词本');
  else bits.push('复习');

  const p = S.progress[item.w];
  if (item.tag === 'wb') {
    const it = S.wb[item.w];
    bits.push('连对 ' + ((it && it.streak) || 0) + ' / ' + WB_KEEP);
  } else if (p && p.reps > 0) {
    bits.push('第 ' + (p.reps + 1) + ' 次');
  } else {
    bits.push('首次学习');
  }
  if (p && p.ivl > 0 && item.tag !== 'wb') bits.push('间隔 ' + p.ivl + ' 天');
  return bits.join(' · ');
}

/* ================= 闪卡 ================= */

/** 英文释义兜底：只取第一条，按词边界收在 110 字符内 */
function enGloss(list) {
  if (!list || !list.length) return '';
  let s = String(list[0] || '').replace(/\s+/g, ' ').trim();
  if (s.length > 110) {
    s = s.slice(0, 110);
    const sp = s.lastIndexOf(' ');
    if (sp > 60) s = s.slice(0, sp);
    s += '…';
  }
  return s;
}

function renderFlash(item) {
  const e = entryOf(item.w) || { w: item.w };
  $('flash').hidden = false;
  $('q-word').textContent = e.w || item.w;
  $('q-phonetic').textContent = e.ph ? '/' + e.ph + '/' : '';
  $('study-cta').hidden = true;

  const ul = $('q-senses');
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
    li.textContent = '暂无释义，可在导入时补充';
    ul.appendChild(li);
  }

  // 英文释义只作兜底：中文够用时留白，避免把 ECDICT 的长定义整段堆上来
  $('q-endef').textContent = rows.length <= 1 ? enGloss(e.en) : '';

  const fam = $('q-fam');
  fam.innerHTML = '';
  const famRows = familyOf(item.w).slice(0, 3);
  if (famRows.length) {
    const p = document.createElement('p');
    famRows.forEach((f, i) => {
      if (i) p.appendChild(document.createElement('br'));
      const b = document.createElement('b');
      b.textContent = f.w;
      p.appendChild(b);
      p.appendChild(document.createTextNode(' ' + f.cn));
    });
    fam.appendChild(p);
  }

  $('reveal-hint').hidden = false;
  $('answer').hidden = true;
  // 评分条常驻：看到词就能直接评，不必先翻面
  $('grade-bar').hidden = false;
  $('q-meta').textContent = tagLine(item);
  S.session.revealed = false;

  if (item.tag === 'new') {
    /* 新词默认念一遍，帮助建立音形联系（闪卡页会显示单词，不涉及泄题） */
    setTimeout(() => speak(item.w), 120);
  }
}

function revealFlash() {
  const s = S.session;
  if (!s || s.revealed) return;
  s.revealed = true;
  $('reveal-hint').hidden = true;
  $('answer').hidden = false;
  $('grade-bar').hidden = false;
  speak($('q-word').textContent);
}

/**
 * 闪卡评分：不必先翻面，看到词就可以直接评。
 * 只有「判自己不会、又还没看过释义」时才把答案亮出来停一下，
 * 保证至少有一次正确的输入，然后再翻到下一张。
 */
function gradeFlash(g) {
  const s = S.session;
  if (!s || s.answered) return;
  s.answered = true;
  const item = s.items[s.idx];
  const blind = !s.revealed;
  commitResult(item, g, 'flash', null);

  if (blind && g !== 'full') {
    // 判自己「不会」却没看释义：先把正确答案亮出来停一下，再翻下一张
    s.revealed = true;
    $('reveal-hint').hidden = true;
    $('answer').hidden = false;
    advanceTimer = setTimeout(nextQuestion, 1100);
  } else {
    nextQuestion();
  }
}

/* ================= 选择题 ================= */
function pickDistractors(word, answerText, isGloss, n) {
  const pool = distractorPool(word);
  const src = shuffle(pool.same.length >= n * 2 ? pool.same : pool.same.concat(pool.other));
  const out = [];
  const used = new Set([answerText]);
  for (const w of src) {
    const t = isGloss ? glossOf(w, 1) : w;
    if (!t || used.has(t)) continue;
    used.add(t);
    out.push({ w: w, text: t });
    if (out.length >= n) break;
  }
  return out;
}

function renderChoice(item) {
  const e = entryOf(item.w) || { w: item.w };
  const gloss = glossOf(item.w, 1);
  const dir = gloss && Math.random() < 0.72 ? 'en2cn' : 'cn2en';

  $('quiz-choice').hidden = false;
  const qcWord = $('qc-word');
  const qcPh = $('qc-ph');
  const ask = $('qc-ask');

  let answerText;
  let opts;

  if (dir === 'cn2en') {
    const cn = fullGloss(item.w) || gloss;
    ask.textContent = '选出对应的英文单词';
    qcWord.textContent = cn;
    qcWord.style.fontSize = '';
    qcPh.textContent = '';
    answerText = item.w;
    const ds = pickDistractors(item.w, item.w, false, 3);
    opts = shuffle([{ w: item.w, text: item.w }].concat(ds));
  } else {
    ask.textContent = '选出正确释义';
    qcWord.textContent = e.w || item.w;
    qcWord.style.fontSize = '';
    qcPh.textContent = e.ph ? '/' + e.ph + '/' : '';
    answerText = gloss;
    const ds = pickDistractors(item.w, gloss, true, 3);
    opts = shuffle([{ w: item.w, text: gloss }].concat(ds));
  }

  const box = $('qc-options');
  box.innerHTML = '';
  const key = ['A', 'B', 'C', 'D'];
  const answerIdx = opts.findIndex((o) => o.text === answerText);

  opts.forEach((o, i) => {
    const b = document.createElement('button');
    b.className = 'opt';
    b.dataset.i = String(i);

    const idx = document.createElement('span');
    idx.className = 'idx';
    idx.textContent = key[i] || String(i + 1);

    const tx = document.createElement('span');
    tx.className = 'tx';
    tx.textContent = o.text;

    b.appendChild(idx);
    b.appendChild(tx);
    b.addEventListener('click', () => answerChoice(i, answerIdx, opts, item));
    box.appendChild(b);
  });

  $('qc-meta').textContent = tagLine(item);
  $('study-cta').hidden = true;

  S.session.q = { type: 'choice', dir: dir, answer: answerText, answerIdx: answerIdx, opts: opts };
}

function answerChoice(i, answerIdx, opts, item) {
  const s = S.session;
  if (!s || s.answered) return;
  s.answered = true;

  const correct = i === answerIdx;
  const nodes = $$('#qc-options .opt');
  nodes.forEach((b, k) => {
    b.disabled = true;
    if (k === answerIdx) b.classList.add('right');
    else if (k === i) b.classList.add('wrong');
    else b.classList.add('dim');
  });

  const g = correct ? 'full' : 'wrong';
  commitResult(item, g, 'choice', correct ? null : $('qc-word').textContent);
  showNextButton();
  /* 答完再念：让音形对上一次，但绝不提前报答案 */
  speak(item.w);
}

/* ================= 拼写 / 听写 ================= */
function renderSpell(item) {
  const s = S.session;
  const isListen = s.mode === 'listen';
  const e = entryOf(item.w) || { w: item.w };
  const w = item.w;
  const hasSpace = /\s/.test(w);

  $('quiz-input').hidden = false;
  $('qi-ask').textContent = isListen ? '听发音，拼出这个单词' : '看释义，拼出这个单词';
  $('qi-gloss').textContent = isListen ? '' : (fullGloss(w) || '（暂无释义）');

  const masked = w.split('').map((c) => (c === ' ' ? ' ' : '·')).join('');
  $('qi-hint').textContent = hasSpace ? masked : w.length + ' 个字母 · ' + masked;

  const input = $('qi-input');
  input.value = '';
  input.className = 'spell-input';
  input.placeholder = '在这里输入';
  $('qi-verdict').textContent = '';
  $('qi-verdict').className = 'quiz-verdict';
  $('qi-play').hidden = !isListen;
  if (isListen) setTimeout(() => speak(w), 260);

  $('study-cta').hidden = false;
  $('btn-submit').hidden = false;
  $('btn-next').hidden = true;
  S.session.q = { type: 'spell', answer: w, isListen: isListen };
}

function normalizeSpell(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z' ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 编辑距离，超过 cap 提前返回 */
function lev(a, b, cap) {
  if (a === b) return 0;
  const n = a.length, m = b.length;
  if (Math.abs(n - m) > cap) return cap + 1;
  let prev = new Array(m + 1);
  let cur = new Array(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    let best = cur[0];
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < best) best = cur[j];
    }
    if (best > cap) return cap + 1;
    const t = prev; prev = cur; cur = t;
  }
  return prev[m];
}

function submitSpell() {
  const s = S.session;
  if (!s || s.answered) return;
  const q = s.q;
  const item = s.items[s.idx];
  const val = normalizeSpell($('qi-input').value);
  if (!val) {
    toast('先写点什么');
    return;
  }
  s.answered = true;

  const answer = q.answer.toLowerCase();
  const dist = lev(val, answer, 2);
  const limit = answer.length >= 8 ? 2 : 1;
  let g;
  let verdict;
  let cls;

  if (dist === 0) {
    g = 'full';
    verdict = '拼写正确';
    cls = 'ok';
  } else if (dist <= limit) {
    g = 'partial';
    verdict = '差一点，正确拼写是 ' + answer;
    cls = 'warn';
  } else {
    g = 'wrong';
    verdict = '正确拼写是 ' + answer;
    cls = 'bad';
  }

  $('qi-input').className = 'spell-input ' + (g === 'wrong' ? 'bad' : 'ok');
  $('qi-verdict').textContent = verdict;
  $('qi-verdict').className = 'quiz-verdict ' + cls;

  commitResult(item, g, s.mode, null);
  speak(answer);
  showNextButton();
}

/* ================= 结果与推进 ================= */
function commitResult(item, g, mode, extra) {
  const s = S.session;
  s.stats.asked++;
  s.stats[g]++;
  if (g !== 'full') s.wrong.push(item.w);

  recordAnswer(item.w, g, mode);

  if (g === 'wrong') {
    addWrong(item.w, resolveToken(item.w).base);
  } else if (item.tag === 'wb') {
    const cleared = hitWrongBook(item.w, g !== 'wrong');
    if (cleared) extra = cleared;
  }

  if (g === 'wrong' && mode === 'choice') {
    /* 选择题答错时把正确释义留在屏幕上，不额外遮挡 */
  }
  if (g === 'wrong' && (mode === 'spell' || mode === 'listen')) {
    $('qi-gloss').textContent = (fullGloss(item.w) || '') + (entryOf(item.w) && entryOf(item.w).ph ? '  /' + entryOf(item.w).ph + '/' : '');
  }
}

function showNextButton() {
  $('study-cta').hidden = false;
  $('btn-submit').hidden = true;
  $('btn-next').hidden = false;
  $('btn-next').textContent = (S.session.idx + 1 >= S.session.items.length) ? '看结果' : '下一题';
}

function nextQuestion() {
  const s = S.session;
  if (!s) return;
  s.idx++;
  renderQuestion();
}

/* ================= 结算 ================= */
function recordSession(s) {
  if (!s || !s.stats.asked) return;
  const h = histOf();
  h.sessions.push({
    at: s.startedAt || Date.now(),
    mode: s.mode,
    asked: s.stats.asked,
    full: s.stats.full,
    partial: s.stats.partial,
    wrong: s.stats.wrong
  });
  if (h.sessions.length > 40) h.sessions.shift();
  saveStore();
}

function endSession() {
  const s = S.session;
  if (!s) return;
  releaseWake();

  recordSession(s);

  const newly = checkAchievements();
  renderDone(s, newly);
  S.session = null;
  showPage('done');
}

function quitSession() {
  clearTimeout(advanceTimer);
  releaseWake();
  recordSession(S.session);
  S.session = null;
  renderToday();
  showPage('today');
}
