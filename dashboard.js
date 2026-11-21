
function syncUnifiedHeaderForPage(pageId){
  const curId = pageId || document.querySelector('.screen.active')?.id || 'trans';
  const hTrans = document.getElementById('hdrTransControls');
  const hAna = document.getElementById('hdrAnaControls');
  const hWal = document.getElementById('hdrWalletControls');
  const hCom = document.getElementById('hdrComControls');
  if(hTrans) hTrans.style.display = (curId === 'trans') ? 'inline-flex' : 'none';
  if(hAna) hAna.style.display = (curId === 'analytics') ? 'inline-flex' : 'none';
  if(hWal) hWal.style.display = (curId === 'wallet') ? 'inline-flex' : 'none';
  if(hCom) hCom.style.display = (curId === 'commitments') ? 'inline-flex' : 'none';
}

function cycleCurrentTopSubTab(){
  const curId = document.querySelector('.screen.active')?.id || 'trans';
  if(curId === 'trans'){
    const next = (activeTransSubTab === 'monthly') ? 'daily' : 'monthly';
    switchTransSubTab(next);
    return;
  }
  if(curId === 'analytics'){
    if(typeof activeCatDrillState !== 'undefined' && activeCatDrillState){
      closeCatDetailModal();
      return;
    }
    const order = ['exp', 'inc'];
    const idx = order.indexOf(activeReportTab || 'exp');
    switchReportTab(order[(idx + 1) % order.length]);
    return;
  }
}


function toggleTransSearchBarOnly(){
  const row = document.getElementById('transSearchRow');
  const btn = document.getElementById('btnToggleTransSearchHdr');
  const inp = document.getElementById('actSearch');
  if(!row) return;
  const opening = row.style.display === 'none';
  row.style.display = opening ? 'flex' : 'none';
  _transSearchActive = opening;
  btn?.classList.toggle('active', opening);
  if(opening){
    try{ history.pushState({xwGuard:2, xwSearch:1}, ''); }catch(_){}
    setTimeout(()=>inp?.focus(), 40);
  } else {
    if(inp){ inp.value = ''; inp.blur(); }
    onTransactionsSearchInput();
  }
  updateFabVisibility();
}


function toggleComSearchBar(){
  const wrap = document.getElementById('comSearchBarWrap');
  const btn = document.getElementById('btnToggleComSearchHdr');
  const inp = document.getElementById('comSearch');
  if(!wrap) return;
  const opening = wrap.style.display === 'none';
  wrap.style.display = opening ? 'block' : 'none';
  btn?.classList.toggle('active', opening);
  if(opening){
    try{ history.pushState({xwGuard:2, xwComSearch:1}, ''); }catch(_){}
    setTimeout(()=>inp?.focus(), 40);
  } else {
    if(inp){ inp.value = ''; inp.blur(); }
    if(typeof renderPlanScreen === 'function') renderPlanScreen();
  }
}


/* X-Wallet V14.0 module: dashboard.js | Extracted from V13.40 app.js */

/* ---- Original app.js lines 836-1099 ---- */
/* Navigation & Page Title Card */
const TAB_TITLES = {
  ar: { trans:'المعاملات', analytics:'التحليل', wallet:'المحفظة', commitments:'الالتزامات', settings:'المزيد' },
  en: { trans:'Transactions', analytics:'Analytics', wallet:'Wallet', commitments:'Commitments', forecast:'Planning', settings:'More' }
};

function updateTopTabTitle(pageId){
  const el = document.getElementById('topActiveTabTitle');
  if(!el) return;
  const curId = pageId || document.querySelector('.screen.active')?.id || 'trans';
  const lang = state.prefs?.lang || 'ar';
  syncUnifiedHeaderForPage(curId);
  if(curId === 'trans'){
    if(activeTransSubTab === 'monthly') el.textContent = lang==='en' ? 'Summary' : 'الملخص';
    else el.textContent = lang==='en' ? 'Records' : 'السجل';
    return;
  }
  if(curId === 'analytics'){
    if(typeof activeCatDrillState !== 'undefined' && activeCatDrillState && activeCatDrillState.catName){
      el.textContent = '← ' + activeCatDrillState.catName;
      return;
    }
    if(activeReportTab === 'inc') el.textContent = lang==='en' ? 'Income' : 'الدخل';
    else el.textContent = lang==='en' ? 'Expenses' : 'المصروفات';
    return;
  }
  if(curId === 'wallet'){
    el.textContent = lang==='en' ? 'Wallet' : 'المحفظة';
    return;
  }
  if(curId === 'commitments'){
    el.textContent = lang==='en' ? 'Commitments' : 'الالتزامات';
    return;
  }
  if(curId === 'forecast'){
    const isYr = document.getElementById('fcTabYr')?.classList.contains('active');
    el.textContent = isYr ? (lang==='en' ? 'Yearly Report' : 'التقرير السنوي') : (lang==='en' ? 'Monthly Summary' : 'الملخص الشهري');
    return;
  }
  el.textContent = (TAB_TITLES[lang] || TAB_TITLES.ar)[curId] || '';
}

let _transSearchActive = false;
const FAB_FILTER_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>';
const FAB_SHORTCUT_DEFS = [
  { id:'chart', label:'◔ الرسم البياني' },
  { id:'search', label:'🔍 بحث' },
  { id:'filter', label:'🎛 فلتر' },
  { id:'commitments', label:'🗓 الالتزامات' },
  { id:'monthly', label:'📅 ملخص السنة' },
  { id:'yearly', label:'📊 التقرير السنوي' },
  { id:'salary', label:'💵 حاسبة الراتب' },
  { id:'backup', label:'💾 نسخة سريعة' },
  { id:'swipe', label:'⇄ تاب/شهر' }
];
function getFabShortcutsList(){
  const arr = state.prefs?.fabShortcuts;
  if(Array.isArray(arr) && arr.length){
    if(!state.prefs.fabCommitmentsSeeded && !arr.includes('commitments')){
      arr.splice(2, 0, 'commitments');
      state.prefs.fabCommitmentsSeeded = true;
    }
    return !state.prefs.fabChartConfigured&&!arr.includes('chart')?[...arr,'chart']:arr;
  }
  return ['search','filter','commitments','swipe','monthly','yearly','salary','backup','chart'];
}
function isFabSpeedDialEnabled(){
  return state.prefs?.fabSpeedDial !== false;
}
function isFabIconsOnly(){
  return !!state.prefs?.fabIconsOnly;
}
function syncFabSettingsUI(){
  const chk = document.getElementById('prefFabSpeedDialChk');
  if(chk) chk.checked = isFabSpeedDialEnabled();
  const ichk = document.getElementById('prefFabIconsOnlyChk');
  if(ichk) ichk.checked = isFabIconsOnly();
  const enabled = new Set(getFabShortcutsList());
  document.querySelectorAll('#fabShortcutsCfgGrid input[type="checkbox"]').forEach(c=>{
    c.checked = enabled.has(c.value);
  });
}
function onFabSettingsChanged(){
  state.prefs = state.prefs || {};
  const chk = document.getElementById('prefFabSpeedDialChk');
  if(chk) state.prefs.fabSpeedDial = !!chk.checked;
  const ichk = document.getElementById('prefFabIconsOnlyChk');
  if(ichk) state.prefs.fabIconsOnly = !!ichk.checked;
  const chks = [...document.querySelectorAll('#fabShortcutsCfgGrid input[type="checkbox"]:checked')].map(c=>c.value);
  state.prefs.fabShortcuts = chks.length ? chks : ['search'];
  state.prefs.fabChartConfigured=true;
  persist();
  updateFabVisibility();
}
function goHomeToRecords(){
  go('trans', document.querySelector('.nav[data-page="trans"]'));
  switchTransSubTab('daily');
}
function toggleFabSpeedMenu(ev){
  if(ev) ev.stopPropagation();
  const wrap = document.getElementById('fabSpeedWrap');
  if(!wrap) return;
  const opening = !wrap.classList.contains('open');
  if(opening) renderFabSpeedMenuItems();
  wrap.classList.toggle('open', opening);
}
function renderFabSpeedMenuItems(){
  const menu = document.getElementById('fabSpeedMenu');
  if(!menu) return;
  const enabled = getFabShortcutsList();
  const hasQ = _transSearchActive || !!(document.getElementById('actSearch')?.value || '').trim();
  const isFilterOpen = document.getElementById('mmSearchBox')?.style.display !== 'none';
  const hasAdv = (typeof hasAnyTransAdvFilter === 'function' && hasAnyTransAdvFilter());
  const isMonthly = (activeTransSubTab === 'monthly');
  const inAnalysis=document.querySelector('.screen.active')?.id==='analytics';
  const list = FAB_SHORTCUT_DEFS.filter(d=>enabled.includes(d.id)&&(inAnalysis?['search','chart'].includes(d.id):d.id!=='chart'));
  menu.innerHTML = list.map((d, idx)=>{
    let act = false;
    if(d.id==='chart') act=typeof activeCatDrillState!=='undefined'&&activeCatDrillState?catDrillChartOpen:mainRepChartOpen;
    else if(d.id === 'search') act = hasQ;
    else if(d.id === 'filter') act = isFilterOpen || hasAdv;
    else if(d.id === 'monthly') act = isMonthly;
    else if(d.id === 'swipe') act = (state.prefs?.swipeMode === 'months');
    const ico = d.label.split(' ')[0]; const iconsOnly = isFabIconsOnly();
    const distIdx = list.length - idx;
    const dispHtml = (d.id === 'filter') ? (iconsOnly ? FAB_FILTER_SVG : `${FAB_FILTER_SVG} <span>فلتر</span>`) : (iconsOnly ? ico : d.label);
    return `<button type="button" style="--sd-idx:${distIdx}" class="fab-speed-item ${act?'active':''} ${iconsOnly?'icons-only':''}" onclick="runFabShortcut('${d.id}')" title="${d.label}">${dispHtml}</button>`;
  }).join('');
}
function runFabShortcut(id){
  document.getElementById('fabSpeedWrap')?.classList.remove('open');
  if(id === 'chart'){toggleAnaChartFromHeader();updateFabVisibility();}
  else if(id === 'search') document.querySelector('.screen.active')?.id==='analytics'?toggleAnaSearchBar():toggleSearchFromFab();
  else if(id === 'filter') toggleFilterFromFab();
  else if(id === 'commitments'){ go('commitments', document.querySelector('.nav[data-page="commitments"]')); }
  else if(id === 'monthly') toggleMonthlySummaryView();
  else if(id === 'yearly'){ openAnnualReportModal(); }
  else if(id === 'salary'){ openSalaryModal(); }
  else if(id === 'swipe'){
    state.prefs = state.prefs || {};
    state.prefs.swipeMode = (state.prefs.swipeMode === 'months') ? 'tabs' : 'months';
    setv('prefSwipeMode', state.prefs.swipeMode);
    persist();
    toast(state.prefs.swipeMode === 'months' ? 'التمرير الآن: تبديل الشهور 📅' : 'التمرير الآن: تبديل القوائم ⇄');
  }
  else if(id === 'backup'){
    if(typeof backup === 'function') backup();
  }
}
function toggleMonthlySummaryView(){
  if(activeTransSubTab === 'monthly'){
    homePeriodMode = 'monthly';
    switchTransSubTab('daily');
  } else {
    switchTransSubTab('monthly');
  }
  renderTransactionsScreen();
  updateFabVisibility();
}

function updateFabVisibility(){
  const fab = document.querySelector('.fab');
  const fabHome = document.getElementById('fabHomeBtn');
  const fabS = document.getElementById('fabSearchBtn');
  const fabF = document.getElementById('fabFilterBtn');
  const speedWrap = document.getElementById('fabSpeedWrap');
  const activePage = document.querySelector('.screen.active')?.id || 'trans';
  const isTransDaily = (activePage === 'trans' && (activeTransSubTab === 'daily' || activeTransSubTab === 'monthly'));
  const isTransCommitments = activePage === 'trans' && activeTransSubTab === 'commitments';
  const showHome = !(activePage === 'trans' && activeTransSubTab === 'daily');
  if(fabHome) fabHome.style.display = showHome ? 'grid' : 'none';
  const grouped = isFabSpeedDialEnabled();

  document.getElementById('btnToggleMonthlyTop')?.classList.toggle('active', activeTransSubTab === 'monthly');

  if(fab) fab.style.display = isTransDaily ? 'grid' : 'none';
  const isAnalysis=activePage==='analytics';
  const analysisShortcuts=getFabShortcutsList().some(id=>['chart','search'].includes(id));
  const showSpeed=grouped&&(isTransDaily||(isAnalysis&&analysisShortcuts));
  if(speedWrap){
    speedWrap.style.display=showSpeed?'flex':'none';
    if(!showSpeed)speedWrap.classList.remove('open');
    else if(!speedWrap.classList.contains('open'))renderFabSpeedMenuItems();
  }
  const chartButton=document.getElementById('fabChartBtn');
  if(chartButton){
    const chartOn=typeof activeCatDrillState!=='undefined'&&activeCatDrillState?catDrillChartOpen:mainRepChartOpen;
    chartButton.style.display=isAnalysis&&!grouped&&getFabShortcutsList().includes('chart')?'grid':'none';
    chartButton.classList.toggle('active',chartOn);chartButton.setAttribute('aria-pressed',String(chartOn));
  }
  const hasQ = _transSearchActive || !!(document.getElementById('actSearch')?.value || '').trim();
  if(fabS){
    fabS.style.display = (isTransDaily && !grouped) ? 'grid' : 'none';
    fabS.classList.toggle('active', hasQ);
    fabS.textContent = hasQ ? '✕' : '🔍';
  }
  if(fabF){
    fabF.style.display = (isTransDaily && !grouped) ? 'grid' : 'none';
    const isFilterOpen = document.getElementById('mmSearchBox')?.style.display !== 'none';
    const hasAdv = (typeof hasAnyTransAdvFilter === 'function' && hasAnyTransAdvFilter());
    fabF.classList.toggle('active', isFilterOpen || hasAdv);
  }
}

function toggleFilterFromFab(){
  const box = document.getElementById('mmSearchBox');
  const isFilterOpen = box && box.style.display !== 'none';
  if(isFilterOpen){
    if(hasAnyTransAdvFilter()){
      closeAndClearSearchFilter();
    } else {
      box.style.display = 'none';
      document.getElementById('btnToggleFilterHdr')?.classList.remove('active');
      updateTransFilterGridUI();
    }
  } else {
    toggleSearchFilterGrid();
  }
  updateFabVisibility();
}

function toggleSearchFromFab(){
  toggleTransSearchBarOnly();
}

function closeAllOpenModalsForce(forceAll){
  if(!forceAll && state?.prefs?.modalMode === 'multi') return;
  ['quickModal','salaryModal','annualReportModal','financialToolsModal','catsManagerModal','statementFullModal',
   'accountModal','themeGridModal','settingsSubModal','aboutAppModal','appDialogModal',
   'customSelectModal','ymModal','updateAvailableModal','exitConfirmModal'].forEach(mid=>{
    document.getElementById(mid)?.classList.remove('show');
  });
  if(typeof activeCatDrillState !== 'undefined' && activeCatDrillState) closeCatDetailModal();
  if(typeof closeQmMonthsMenu === 'function') closeQmMonthsMenu();
  if(typeof closeWalletToolsMenu === 'function') closeWalletToolsMenu();
}
function toggleAnalyticsStatTab(mode){
  const curId = document.querySelector('.screen.active')?.id;
  if(curId === 'analytics' && activeReportTab === mode){
    go('trans', document.querySelector('.nav[data-page="trans"]'));
    return;
  }
  switchReportTab(mode);
}
function onSearchInputBlurAutoClose(which){
  setTimeout(()=>{
    if(which === 'trans'){
      const inp = document.getElementById('actSearch');
      const row = document.getElementById('transSearchRow');
      if(inp && !inp.value.trim() && row && row.style.display !== 'none'){
        row.style.display = 'none';
        _transSearchActive = false;
        document.getElementById('btnToggleTransSearchHdr')?.classList.remove('active');
        updateFabVisibility();
      }
    } else if(which === 'ana'){
      const inp = document.getElementById('anaSearchInp');
      const row = document.getElementById('anaSearchRow');
      if(inp && !inp.value.trim() && row && row.style.display !== 'none'){
        row.style.display = 'none';
        document.getElementById('btnToggleAnaSearchHdr')?.classList.remove('active');
      }
    }
  }, 140);
}
function toggleAnaSearchBar(){
  const row = document.getElementById('anaSearchRow');
  const btn = document.getElementById('btnToggleAnaSearchHdr');
  const inp = document.getElementById('anaSearchInp');
  if(!row) return;
  const opening = row.style.display === 'none';
  row.style.display = opening ? 'flex' : 'none';
  btn?.classList.toggle('active', opening);
  if(opening){
    try{ history.pushState({xwGuard:2, xwAnaSearch:1}, ''); }catch(_){}
    setTimeout(()=>inp?.focus(), 40);
  } else {
    if(inp){ inp.value = ''; inp.blur(); }
    if(typeof renderReportsScreen === 'function') renderReportsScreen();
  }
}
function clearAnaSearch(){
  const inp = document.getElementById('anaSearchInp');
  if(inp) inp.value = '';
  const clr = document.getElementById('btnClearAnaSearch');
  if(clr) clr.style.display = 'none';
  if(typeof renderReportsScreen === 'function') renderReportsScreen();
}
function toggleAnaChartFromHeader(){
  if(typeof activeCatDrillState !== 'undefined' && activeCatDrillState){
    catDrillChartOpen = !catDrillChartOpen;
    const p = document.getElementById('catDrillChartPanel');
    if(p) p.style.display = catDrillChartOpen ? 'block' : 'none';
    document.getElementById('btnToggleAnaChartHdr')?.classList.toggle('active', catDrillChartOpen);
  } else {
    mainRepChartOpen = !mainRepChartOpen;
    const p = document.getElementById('repChartPanel');
    if(p) p.style.display = mainRepChartOpen ? 'flex' : 'none';
    document.getElementById('btnToggleAnaChartHdr')?.classList.toggle('active', mainRepChartOpen);
  }
}
function go(id, btn){
  closeAllOpenModalsForce(true);
  if(id === 'trans'){
    homePeriodMode = 'monthly';
    activeTransSubTab = 'daily';
    document.getElementById('transTabDaily')?.classList.add('active');
    document.getElementById('transTabInc')?.classList.remove('active');
    document.getElementById('transTabExp')?.classList.remove('active');
    const dw = document.getElementById('transDailyMainWrap');
    if(dw) dw.style.display = 'block';
    const cw=document.getElementById('transCommitmentsWrap');if(cw)cw.style.display='none';
    document.getElementById('transTabCommit')?.classList.remove('active');
  }
  document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));
  const t = document.getElementById(id);
  if(t) t.classList.add('active');
  document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active', x.dataset.page===id));
  if(btn) btn.classList.add('active');
  if(id === 'analytics'){
    const aw = document.getElementById('transAnalyticsWrap');
    if(aw) aw.style.display = 'block';
  }
  if(id === 'settings'){
    document.querySelectorAll('#settings details.fold[open]').forEach(f=>f.removeAttribute('open'));
    syncFabSettingsUI();
  }
  updateTopTabTitle(id);
  updateFabVisibility();
  renderActiveScreenOnly();
  window.scrollTo(0,0);
}
function switchWalletTab(which){
  const accView = document.getElementById('walletViewAcc');
  const cardView = document.getElementById('walletViewCard');
  if(accView) accView.style.display = 'block';
  if(cardView) cardView.style.display = 'block';
  updateTopTabTitle('wallet');
  renderAccountsAndCards();
}
function switchSalarySubView(which){
  document.getElementById('salSubViewMonth').style.display = which==='month' ? 'block' : 'none';
  document.getElementById('salSubViewYear').style.display = which==='year' ? 'block' : 'none';
  document.getElementById('salSubTabMonth').classList.toggle('active', which==='month');
  document.getElementById('salSubTabYear').classList.toggle('active', which==='year');
}
function shiftActiveMonth(delta){
  if(homePeriodMode === 'yearly'){
    activeYear += delta;
    forecastYear = activeYear;
    renderAll();
    return;
  }
  let m = activeMonth + delta, y = activeYear;
  if(m < 1){ m = 12; y -= 1; }
  else if(m > 12){ m = 1; y += 1; }
  activeMonth = m; activeYear = y;
  forecastYear = y;
  renderAll();
}
function shiftForecastYear(delta){
  forecastYear += delta;
  renderYearlyExcelReport();
}


/* ---- Original app.js lines 4494-4623 ---- */
function renderActiveScreenOnly(){
  syncCustomSelectTriggers();
  updateFabVisibility();
  const activePage = document.querySelector('.screen.active')?.id || 'trans';
  if(activePage === 'trans'){ if(activeTransSubTab==='inc'||activeTransSubTab==='exp') renderReportsScreen(); else if(activeTransSubTab==='commitments') renderPlanScreen(); else renderTransactionsScreen(); }
  else if(activePage === 'forecast'){ if(document.getElementById('fcTabYr')?.classList.contains('active')) renderYearlyExcelReport(); else renderForecastMonthlyView(); }
  else if(activePage === 'analytics' || activePage === 'reports'){
    renderReportsScreen();
    if(activeCatDrillState) renderCategoryDrillDownContent();
  }
  else if(activePage === 'wallet') renderAccountsAndCards();
  else if(activePage === 'commitments' || activePage === 'plan') renderPlanScreen();
  else if(activePage === 'settings'){
    renderSettingsCategories();
    renderAutoSnapshotsList();
  }
  refreshSecondaryFeeds();
}

function renderAll(){
  syncCustomSelectTriggers();
  updateFabVisibility();
  renderTransactionsScreen();
  renderReportsScreen();
  renderForecastMonthlyView();
  if(activeCatDrillState) renderCategoryDrillDownContent();
  renderAccountsAndCards();
  renderPlanScreen();
  renderSettingsCategories();
  renderAutoSnapshotsList();
}

/* Horizontal Swipe Navigation */
function applyPageVisibilityPrefs(){
  const hidden = (state.prefs && state.prefs.hiddenPages) || {};
  ['trans', 'analytics', 'wallet', 'commitments'].forEach(pid => {
    const isHidden = !!hidden[pid];
    const nav = document.querySelector(`.nav[data-page="${pid}"]`);
    if(nav) nav.style.display = isHidden ? 'none' : '';
    const cb = document.getElementById('prefShowPage_' + pid);
    if(cb) cb.checked = !isHidden;
  });
}

function onPageVisibilityChanged(){
  state.prefs = state.prefs || {};
  state.prefs.hiddenPages = state.prefs.hiddenPages || {};
  ['trans', 'analytics', 'wallet', 'commitments'].forEach(pid => {
    const cb = document.getElementById('prefShowPage_' + pid);
    if(cb) state.prefs.hiddenPages[pid] = !cb.checked;
  });
  applyPageVisibilityPrefs();
  persist();
}

(function initSwipeNavigation(){
  const ALL_MAIN_PAGES = ['trans', 'analytics', 'wallet', 'commitments', 'settings'];
  const getVisibleMainPages = () => {
    const hidden = (state.prefs && state.prefs.hiddenPages) || {};
    return ALL_MAIN_PAGES.filter(p => p === 'settings' || !hidden[p]);
  };
  const SUB_TABS = {
    analytics: {
      list: ['inc', 'exp'],
      getActive: () => activeReportTab || 'exp',
      setActive: (val) => switchReportTab(val)
    },
    wallet: {
      list: ['acc'],
      getActive: () => document.getElementById('tabBtnCard')?.classList.contains('active') ? 'card' : 'acc',
      setActive: (val) => switchWalletTab(val)
    },
    forecast: {
      list: ['monthly', 'yr'],
      getActive: () => document.getElementById('fcTabYr')?.classList.contains('active') ? 'yr' : 'monthly',
      setActive: (val) => switchForecastTab(val)
    }
  };

  let startX = 0, startY = 0, startTime = 0, ignoreTouch = false;

  document.addEventListener('touchstart', function(e){
    if(e.touches.length !== 1) { ignoreTouch = true; return; }
    const openSalTs = document.getElementById('salaryModal')?.classList.contains('show');
    const openCatTs = document.getElementById('catsManagerModal')?.classList.contains('show');
    if(document.querySelector('.modal.show') && !openSalTs && !openCatTs) { ignoreTouch = true; return; }
    const tgt = e.target;
    if(tgt && tgt.closest('input, textarea, select, .cat-drag-handle, .excel-table-wrap, .com-table-wrap, .com-all-table, .yr-table-wrap, [contenteditable="true"]')) {
      ignoreTouch = true;
      return;
    }
    ignoreTouch = false;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startTime = Date.now();
  }, {passive: true});

  document.addEventListener('touchend', function(e){
    if(ignoreTouch || !e.changedTouches.length) return;
    const openSalModal = document.getElementById('salaryModal')?.classList.contains('show');
    const openCatModal = document.getElementById('catsManagerModal')?.classList.contains('show');
    if(document.querySelector('.modal.show') && !openSalModal && !openCatModal) return;
    const dt = Date.now() - startTime;
    if(dt > 650) return;

    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if(Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.4) return;

    if(openSalModal){
      const isYr = document.getElementById('salSubTabYear')?.classList.contains('active');
      if(dx < 0 && !isYr) switchSalarySubView('year');
      else if(dx > 0 && isYr) switchSalarySubView('month');
      return;
    }
    if(openCatModal){
      const isExp = document.getElementById('setCatTabExp')?.classList.contains('active');
      if(dx < 0 && !isExp) setSettingsCatTab('expense');
      else if(dx > 0 && isExp) setSettingsCatTab('income');
      return;
    }
    const MAIN_PAGES = getVisibleMainPages();
    const curPage = document.querySelector('.screen.active')?.id || 'trans';
    const pageIdx = MAIN_PAGES.indexOf(curPage);
    if(pageIdx === -1) return;

    const step = (dx < 0) ? 1 : -1;

    if(state.prefs?.swipeMode === 'months'){
      if(curPage === 'trans'){
        shiftTransPeriod(step);
        return;
      }
      if(curPage === 'analytics'){
        shiftReportPeriod(step);
        return;
      }
      if(curPage === 'commitments'){
        shiftActiveMonth(step);
        return;
      }
    }

    const subCfg = SUB_TABS[curPage];
    if(subCfg){
      const curSub = subCfg.getActive();
      const subIdx = subCfg.list.indexOf(curSub);
      const nextSubIdx = subIdx + step;
      if(nextSubIdx >= 0 && nextSubIdx < subCfg.list.length){
        subCfg.setActive(subCfg.list[nextSubIdx]);
        return;
      }
    }

    const nextPageIdx = pageIdx + step;
    if(nextPageIdx >= 0 && nextPageIdx < MAIN_PAGES.length){
      const nextPage = MAIN_PAGES[nextPageIdx];
      const navBtn = document.querySelector(`.nav[data-page="${nextPage}"]`);
      go(nextPage, navBtn);
      const nextSubCfg = SUB_TABS[nextPage];
      if(nextSubCfg){
        const targetSub = step > 0 ? nextSubCfg.list[0] : nextSubCfg.list[nextSubCfg.list.length - 1];
        nextSubCfg.setActive(targetSub);
      }
    }
  }, {passive: true});
})();


function onMainLogoTap(){
  const curId = document.querySelector('.screen.active')?.id || 'trans';
  if(curId === 'trans'){
    go('commitments', document.querySelector('.nav[data-page="commitments"]'));
  } else if(curId === 'commitments'){
    go('trans', document.querySelector('.nav[data-page="trans"]'));
  }
}
