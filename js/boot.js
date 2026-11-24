/* ============================================================
   识词 · 导航与事件绑定
   ============================================================ */

const TABS = ['today', 'dict', 'report', 'mine'];
const ALL_PAGES = ['today', 'dict', 'report', 'mine', 'detail', 'import', 'study', 'done', 'wd'];
let curPage = 'today';

function showPage(name) {
  ALL_PAGES.forEach((p) => {
    const el = $('page-' + p);
    if (el) el.hidden = p !== name;
  });
  const isTab = TABS.indexOf(name) >= 0;
  $('tabbar').hidden = !isTab;
  document.body.classList.toggle('fullscreen', !isTab);
  curPage = name;

  if (isTab) {
    S.lastPage = name;
    $$('#tabbar .tab').forEach((b) => b.classList.toggle('on', b.dataset.page === name));
  }

  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;

  if (name === 'today') renderToday();
  else if (name === 'dict') renderDict();
  else if (name === 'report') { checkAchievements(); renderReport(); }
  else if (name === 'mine') renderMine();
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
      const st = todayStat();
      const btn = $('btn-start');
      btn.disabled = st.total === 0;
      btn.textContent = st.total === 0 ? '今天已完成' : (st.done > 0 ? '继续练习' : '开始' + MODE_NAME[S.settings.mode]);
    });
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
  $('btn-reveal').addEventListener('click', revealFlash);
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

  $('btn-submit').addEventListener('click', submitSpell);
  $('btn-next').addEventListener('click', nextQuestion);

  $('qi-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if ($('btn-submit').hidden === false) submitSpell();
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
  bindToday();
  bindStudy();
  bindDict();
  bindReport();
  bindMine();
  bindWd();
  bindImport();
  bindKeyboard();

  $('boot').hidden = true;
  $('app').hidden = false;
  $('tabbar').hidden = false;

  renderAll();
  showPage('today');

  if (Object.keys(S.ach).length === 0) checkAchievements(true);
  maybeHomeTip();
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

boot();
