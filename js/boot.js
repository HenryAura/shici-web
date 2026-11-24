/* ============================================================
   识词 · 导航与事件绑定
   ============================================================ */

const TABS = ['today', 'dict', 'report', 'mine'];
const PUSHED = ['detail', 'import', 'study', 'done', 'wd'];
const ALL_PAGES = TABS.concat(PUSHED);
let curPage = 'today';
let tabIdx = 0;

/** 把 pager 挪到第 i 页；animate=false 用于手指跟随（此时关掉过渡） */
function setTabIndex(i, animate) {
  tabIdx = Math.max(0, Math.min(TABS.length - 1, i));
  const pager = $('pager');
  if (!pager) return;
  pager.classList.toggle('dragging', !animate);
  pager.style.transform = 'translateX(' + (-tabIdx * 100) + '%)';
  const glow = document.querySelector('.tab-glow');
  if (glow) glow.style.transform = 'translateX(' + tabIdx * 100 + '%)';
}

function showPage(name) {
  const isTab = TABS.indexOf(name) >= 0;

  if (isTab) {
    /* 四个 tab 页始终留在 pager 里可见，靠位移切页；
       这样内容才能滑着从底栏下方穿过，玻璃才有东西可模糊 */
    PUSHED.forEach((p) => { const el = $('page-' + p); if (el) el.hidden = true; });
    TABS.forEach((p) => { const el = $('page-' + p); if (el) el.hidden = false; });
    $('tabbar').hidden = false;
    document.body.classList.remove('fullscreen');
    setTabIndex(TABS.indexOf(name), true);
    S.lastPage = name;
    $$('#tabbar .tab').forEach((b) => b.classList.toggle('on', b.dataset.page === name));
  } else {
    PUSHED.forEach((p) => { const el = $('page-' + p); if (el) el.hidden = p !== name; });
    $('tabbar').hidden = true;
    document.body.classList.add('fullscreen');
    /* 推入页各自滚动，进入时回到顶部；tab 页的滚动位置保留，切回来还在原处 */
    const el = $('page-' + name);
    if (el) el.scrollTop = 0;
  }

  curPage = name;

  if (name === 'today') renderToday();
  else if (name === 'dict') renderDict();
  else if (name === 'report') { checkAchievements(); renderReport(); }
  else if (name === 'mine') renderMine();
}

/* ---------------- 左右滑动切 tab ---------------- */
function bindPagerSwipe() {
  const pager = $('pager');
  if (!pager) return;
  let sx = 0, sy = 0, dx = 0, lock = null, live = false, t0 = 0;

  const widthOf = () => pager.clientWidth || window.innerWidth;
  const glow = () => document.querySelector('.tab-glow');

  pager.addEventListener('touchstart', (e) => {
    live = false;
    if (curPage !== TABS[tabIdx]) return;   /* 推入页不接管手势 */
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    sx = t.clientX; sy = t.clientY; dx = 0; lock = null; live = true; t0 = Date.now();
  }, { passive: true });

  pager.addEventListener('touchmove', (e) => {
    if (!live || e.touches.length !== 1) return;
    const t = e.touches[0];
    const mx = t.clientX - sx;
    const my = t.clientY - sy;

    if (!lock) {
      /* 先定方向：横向意图够明确才接管，否则放手让页面纵向滚 */
      if (Math.abs(mx) > 12 && Math.abs(mx) > Math.abs(my) * 1.4) lock = 'x';
      else if (Math.abs(my) > 8 && Math.abs(my) >= Math.abs(mx)) { live = false; return; }
      else return;
      pager.classList.add('dragging');
    }

    e.preventDefault();
    dx = mx;
    let d = dx;
    if ((tabIdx === 0 && d > 0) || (tabIdx === TABS.length - 1 && d < 0)) d *= 0.3;
    pager.style.transform = 'translateX(calc(' + (-tabIdx * 100) + '% + ' + d + 'px))';

    /* 高亮块按滑动进度在两格之间插值：手指左滑（d<0）就是去右边那一格，
       所以进度取 -d，别写成 +d，否则高亮会跟手指反着走 */
    const g = glow();
    if (g) {
      let prog = -d / widthOf();
      prog = Math.max(-tabIdx, Math.min(TABS.length - 1 - tabIdx, prog));
      g.style.transition = 'none';
      g.style.transform =
        'translateX(calc(' + (tabIdx * 100) + '% + ' + (prog * 100).toFixed(2) + '%))';
    }
  }, { passive: false });

  const finish = () => {
    if (lock !== 'x') { live = false; return; }
    live = false; lock = null;
    pager.classList.remove('dragging');
    const g = glow();
    if (g) g.style.transition = '';

    const w = widthOf();
    const v = dx / Math.max(1, Date.now() - t0);
    let next = tabIdx;
    if (dx < -w * 0.26 || (v < -0.45 && dx < -36)) next = Math.min(TABS.length - 1, tabIdx + 1);
    else if (dx > w * 0.26 || (v > 0.45 && dx > 36)) next = Math.max(0, tabIdx - 1);

    if (next !== tabIdx) goTab(TABS[next]);
    else setTabIndex(tabIdx, true);
  };

  pager.addEventListener('touchend', finish);
  pager.addEventListener('touchcancel', finish);
}

/* ---------------- 顶栏玻璃：滚起来才浮出 ---------------- */
function bindStickyHeads() {
  ALL_PAGES.forEach((p) => {
    const el = $('page-' + p);
    if (!el) return;
    const head = el.querySelector('.page-head');
    if (!head) return;
    el.addEventListener('scroll', () => {
      head.classList.toggle('stuck', el.scrollTop > 3);
    }, { passive: true });
  });

  /* 练习页的顶栏也要吸顶：键盘或长答案把页面撑高后，滚动时进度条不跟着走 */
  const sp = $('page-study');
  const sh = sp && sp.querySelector('.study-head');
  if (sh) {
    sp.addEventListener('scroll', () => {
      sh.classList.toggle('stuck', sp.scrollTop > 3);
    }, { passive: true });
  }
}

function goTab(page) {
  if (curPage === 'study') {
    if (!confirm('正在练习中，退出后本轮进度会保留已答部分。确定退出？')) return;
    quitSession();
  }
  showPage(page);
}

/* ================= 绑定 ================= */
function bindTabs() {
  $$('#tabbar .tab').forEach((b) => {
    b.addEventListener('click', () => goTab(b.dataset.page));
  });
}

function bindToday() {
  $('btn-start').addEventListener('click', () => {
    startSession('today', S.settings.mode);
  });

  $$('#mode-seg button').forEach((b) => {
    b.addEventListener('click', () => {
      S.settings.mode = b.dataset.mode;
      saveStore();
      renderModeSeg();
      refreshStartBtn();
    });
  });

  $('wl-toggle').addEventListener('click', () => {
    if ($('wl-chev').hidden) return;
    wlOpen = !wlOpen;
    renderToday();
  });

  $('btn-wb').addEventListener('click', () => {
    const m = S.settings.mode === 'flash' ? 'choice' : S.settings.mode;
    startSession('wb', m);
  });

  $('btn-import').addEventListener('click', () => {
    resetImport();
    showPage('import');
    // 进页面就把词组表与扩展词库拉下来，粘贴完立刻能解析
    ensureExtra();
  });

  const examCard = $('exam-card');
  if (examCard) {
    examCard.addEventListener('click', () => {
      showPage('mine');
      setTimeout(() => {
        const row = $('set-exam') && $('set-exam').closest('.row');
        if (row) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 60);
    });
  }
}

function bindStudy() {
  $('flash').addEventListener('click', (e) => {
    if (e.target.closest('#btn-speak')) return;
    if (S.session && S.session.mode === 'flash' && !S.session.revealed) revealFlash();
  });
  $('btn-speak').addEventListener('click', (e) => {
    e.stopPropagation();
    speak($('q-word').textContent);
  });

  $$('.grade').forEach((b) => {
    b.addEventListener('click', () => gradeFlash(b.dataset.grade));
  });

  $('btn-submit').addEventListener('click', submitAnswer);
  $('btn-override').addEventListener('click', overrideWrite);
  $('btn-next').addEventListener('click', nextQuestion);

  $('qi-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if ($('btn-submit').hidden === false) submitAnswer();
      else if ($('btn-next').hidden === false) nextQuestion();
    }
  });
  $('qi-input').addEventListener('focus', () => {
    setTimeout(() => {
      const el = $('qi-input');
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 220);
  });
  $('qi-play').addEventListener('click', () => {
    if (S.session && S.session.q) speak(S.session.q.answer);
  });

  $('btn-quit').addEventListener('click', () => {
    if (S.session && S.session.idx > 0) {
      if (!confirm('退出本轮练习？已答的题已记入进度。')) return;
    }
    quitSession();
  });

  $('btn-back').addEventListener('click', () => {
    renderToday();
    showPage('today');
  });
}

function bindDict() {
  $('dict-q').addEventListener('input', onDictInput);
  $('dict-q').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      $('dict-q').blur();
      doSearch(true);
    }
  });
  $('dict-clear').addEventListener('click', () => {
    $('dict-q').value = '';
    dictQuery = '';
    $('dict-clear').hidden = true;
    renderDict();
    $('dict-q').focus();
  });
  $('btn-clear-hist').addEventListener('click', clearDictHistory);

  $('btn-random').addEventListener('click', () => {
    const pool = S.order.filter((w) => inScope(w));
    if (!pool.length) return;
    const w = pool[Math.floor(Math.random() * pool.length)];
    openDetail(w);
  });

  $('btn-detail-back').addEventListener('click', () => showPage(detailFrom || 'dict'));
  $('btn-detail-speak').addEventListener('click', () => speak(detailWord));
  $('btn-detail-wb').addEventListener('click', toggleDetailWb);
}

function bindReport() {
  $('rep-wb-entry').addEventListener('click', () => {
    const m = S.settings.mode === 'flash' ? 'choice' : S.settings.mode;
    startSession('wb', m);
  });
}

function bindMine() {
  $('nick').addEventListener('input', () => {
    S.nick = $('nick').value.trim().slice(0, 12);
    $('avatar').textContent = (S.nick || '识').slice(0, 1);
    saveStore();
  });

  $('set-new').addEventListener('input', () => {
    S.settings.newPerDay = clamp(Number($('set-new').value), NEW_MIN, NEW_MAX);
    renderNewVal();
    saveStore();
    renderExam();
  });

  $('set-exam').addEventListener('change', () => {
    const v = $('set-exam').value;
    S.settings.examDate = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
    saveStore();
    renderMine();
    renderToday();
    toast(S.settings.examDate ? '已按考试日期倒排每日词量' : '已清除考试日期');
  });

  $('btn-exam-clear').addEventListener('click', () => {
    S.settings.examDate = '';
    $('set-exam').value = '';
    saveStore();
    renderMine();
    renderToday();
    toast('已清除考试日期');
  });

  $('sw-exam-auto').addEventListener('click', () => {
    S.settings.examAuto = !S.settings.examAuto;
    $('sw-exam-auto').setAttribute('aria-checked', S.settings.examAuto ? 'true' : 'false');
    saveStore();
    renderMine();
    renderToday();
  });

  $('set-rate').addEventListener('input', () => {
    S.settings.rate = Number($('set-rate').value);
    $('set-rate-val').textContent = S.settings.rate.toFixed(2);
    saveStore();
  });
  $('set-rate').addEventListener('change', () => speak('Hello, let\'s learn a word'));

  bindSeg('seg-mode', (v) => { S.settings.mode = v; });
  bindSeg('seg-order', (v) => { S.settings.order = v; poolCache = { key: '', list: null }; });
  bindSeg('seg-scope', (v) => { S.settings.scope = v; poolCache = { key: '', list: null }; });
  bindSeg('seg-theme', (v) => { S.settings.theme = v; applySettings(); });
  bindSeg('seg-size', (v) => { S.settings.wordSize = Number(v); applySettings(); });

  $('sw-motion').addEventListener('click', () => {
    S.settings.reduceMotion = !S.settings.reduceMotion;
    $('sw-motion').setAttribute('aria-checked', S.settings.reduceMotion ? 'true' : 'false');
    applySettings();
    saveStore();
  });
  $('sw-awake').addEventListener('click', () => {
    S.settings.keepAwake = !S.settings.keepAwake;
    $('sw-awake').setAttribute('aria-checked', S.settings.keepAwake ? 'true' : 'false');
    if (!S.settings.keepAwake) releaseWake();
    saveStore();
  });

  $('sel-voice').addEventListener('change', () => {
    S.settings.voice = $('sel-voice').value;
    saveStore();
    speak('Hello, let\'s learn a word');
  });

  $('btn-test-voice').addEventListener('click', () => speak("Hello, let's learn a word"));

  $('btn-export').addEventListener('click', exportBackup);
  $('btn-import-file').addEventListener('click', () => $('file-import').click());

  $('btn-wd').addEventListener('click', () => {
    fillWdForm();
    wdSetStatus('未连接');
    showPage('wd');
  });

  $('btn-reset').addEventListener('click', () => {
    if (!confirm('清空全部学习记录、错词本与设置？此操作不可撤销。')) return;
    if (!confirm('再确认一次：所有进度都会消失。确实要清空？')) return;
    localStorage.removeItem(STORE);
    localStorage.removeItem('shici.dictHist');
    location.reload();
  });

  $('btn-about').addEventListener('click', () => {
    alert('识词 · 网页版 ' + APP_VER + '\n\n词库 ECDICT（MIT License）：核心 ' + (S.order.length) + ' 词，' +
      '扩展 ' + EXT.size + ' 词，词组 ' + PHRASES.size + ' 条\n' +
      '例句 Tatoeba（CC-BY 2.0 FR）\n\n' +
      '进度只保存在本机浏览器，不上传任何服务器。\n' +
      '通过 WebDAV 备份时可与鸿蒙端共用同一份 shiy-backup.json。');
  });

  const verEl = $('app-ver');
  if (verEl) verEl.textContent = APP_VER;

  $('btn-update').addEventListener('click', async () => {
    const st = $('upd-state');
    st.textContent = '正在更新…';
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.update().catch(() => {})));
      }
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k).catch(() => {})));
      }
    } catch (e) { /* 忽略，直接重载 */ }
    setTimeout(() => location.reload(), 300);
  });
}

function bindSeg(id, onChange) {
  $$('#' + id + ' button').forEach((b) => {
    b.addEventListener('click', () => {
      $$('#' + id + ' button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      onChange(b.dataset.v);
      saveStore();
      if (id === 'seg-mode') renderModeSeg();
    });
  });
}

function bindWd() {
  $('btn-wd-back').addEventListener('click', () => showPage('mine'));
  $('wd-save').addEventListener('click', () => {
    saveWdCfg(readWdForm());
    toast('配置已保存到本机');
    renderMine();
  });
  $('wd-test').addEventListener('click', (e) => wdTest(e.currentTarget));
  $('wd-backup').addEventListener('click', (e) => wdBackup(e.currentTarget));
  $('wd-restore').addEventListener('click', (e) => wdRestore(e.currentTarget));
}

function bindImport() {
  $('btn-import-back').addEventListener('click', () => {
    resetImport();
    showPage('today');
  });
  $('btn-parse').addEventListener('click', parseInput);
  $('btn-clear').addEventListener('click', resetImport);
  $('btn-commit').addEventListener('click', commitImport);

  $('file-import').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importBackupFile(f);
    e.target.value = '';
  });
}

function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (curPage === 'study') {
      const s = S.session;
      if (!s) return;
      if (s.mode === 'flash') {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          if (!s.revealed) revealFlash();
        } else if (s.revealed && e.key === '1') gradeFlash('wrong');
        else if (s.revealed && e.key === '2') gradeFlash('partial');
        else if (s.revealed && e.key === '3') gradeFlash('full');
      } else if (s.mode === 'choice' && !s.answered) {
        const i = '1234'.indexOf(e.key);
        if (i >= 0) {
          const btn = $$('#qc-options .opt')[i];
          if (btn) btn.click();
        }
      }
    }
    if (e.key === 'Escape') {
      if (curPage === 'detail') showPage(detailFrom || 'dict');
      else if (curPage === 'import' || curPage === 'wd') showPage(S.lastPage || 'today');
    }
  });
}

/* ================= 软键盘 ================= */
/* 键盘弹起时 layout viewport 不变、visual viewport 变矮，差值就是键盘高度。
   把它写进 --kb-h，底部操作条和页面留白才能一起让位 */
function bindSoftKeyboard() {
  const vv = window.visualViewport;
  const root = document.documentElement;
  let last = -1;
  let timer = 0;

  function measure() {
    if (!vv) return 0;
    /* 80px 以内多半是地址栏伸缩，不当键盘处理 */
    const h = Math.round(window.innerHeight - vv.height - vv.offsetTop);
    return h > 80 ? h : 0;
  }

  function sync() {
    const px = measure();
    if (px === last) return;
    const opening = last <= 0 && px > 0;
    last = px;
    root.style.setProperty('--kb-h', px + 'px');
    document.body.classList.toggle('kb-open', px > 0);
    /* 键盘还在做弹出动画时浏览器会自己滚一次，
       隔几拍各纠一次，最后停在输入框刚好露出的位置 */
    if (opening) [80, 200, 360, 540].forEach((d) => setTimeout(keepFocusVisible, d));
  }

  function queue() {
    clearTimeout(timer);
    timer = setTimeout(sync, 50);
  }

  if (vv) {
    vv.addEventListener('resize', queue);
    vv.addEventListener('scroll', queue);
  }
  window.addEventListener('resize', queue);
  window.addEventListener('orientationchange', () => setTimeout(sync, 320));
  document.addEventListener('focusin', queue);
  document.addEventListener('focusout', queue);
  sync();
}

/* 输入框要停在操作条上面。键盘+底栏占掉的高度从可视高度里扣掉，
   算出「刚好露出来」需要的滚动量再对齐——多滚的那一下就是整页往上跳的来源 */
function keepFocusVisible() {
  const el = document.activeElement;
  if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return;

  /* iOS 有时会把整个视觉视口往上抬一截（顶栏被推到状态栏下面），
     文档本身不能滚，直接归位 */
  const vv = window.visualViewport;
  if (vv && vv.offsetTop > 4) window.scrollTo(0, 0);

  let box = el.parentElement;
  while (box && box !== document.body) {
    const oy = getComputedStyle(box).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && box.scrollHeight > box.clientHeight + 1) break;
    box = box.parentElement;
  }
  if (!box || box === document.body) return;

  const cta = $('study-cta');
  const bar = cta && cta.offsetHeight ? cta.offsetHeight : 0;   /* 隐藏的页 offsetHeight 是 0 */
  const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const boxTop = box.getBoundingClientRect().top;
  const bottomLimit = vh - bar - 14 - boxTop;
  const contentY = box.scrollTop + el.getBoundingClientRect().bottom - boxTop;
  const want = Math.max(0, contentY - bottomLimit);
  if (Math.abs(want - box.scrollTop) > 1) box.scrollTop = want;
}

/* ================= 首次使用提示 ================= */
function maybeHomeTip() {
  const standalone = window.navigator.standalone === true
    || (matchMedia('(display-mode: standalone)').matches);
  if (standalone) return;
  if (!/iPhone|iPad|iPod/.test(navigator.userAgent)) return;
  try {
    if (localStorage.getItem('shici.homeTip')) return;
    localStorage.setItem('shici.homeTip', '1');
  } catch (e) { return; }
  setTimeout(() => {
    toast('想全屏用？Safari 分享 → 添加到主屏幕');
  }, 3200);
}

/* ================= 启动 ================= */
async function boot() {
  const t0 = Date.now();
  loadStore();
  initTheme();

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  try {
    await loadData();
  } catch (err) {
    $('boot').innerHTML = '<p style="color:#be3030">词库加载失败：' + err.message + '</p>';
    return;
  }

  if (window.speechSynthesis) {
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }

  bindTabs();
  bindPagerSwipe();
  bindStickyHeads();
  bindToday();
  bindStudy();
  bindDict();
  bindReport();
  bindMine();
  bindWd();
  bindImport();
  bindKeyboard();
  bindSoftKeyboard();

  $('app').hidden = false;
  $('tabbar').hidden = false;

  renderAll();
  showPage('today');

  if (Object.keys(S.ach).length === 0) checkAchievements(true);
  maybeHomeTip();

  /* 开屏至少留一会儿，别让动画还没展开就消失；数据早就绪也要走完这一下 */
  const wait = Math.max(0, 860 - (Date.now() - t0));
  setTimeout(() => {
    const b = $('boot');
    b.classList.add('out');
    setTimeout(() => { b.hidden = true; }, 360);
  }, wait);
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot();
