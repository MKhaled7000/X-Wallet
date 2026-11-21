/* X-Wallet V14.0 module: transactions.js | Extracted from V13.40 app.js */

/* ---- Original app.js lines 1100-1458 ---- */
let activeReportCategoryFilter = null;
let transAdvFilter = { dateFrom:'', dateTo:'', accountId:'', accountLabel:'', mainCat:'', subCat:'', amountFrom:'', amountTo:'', type:'' };

function hasAnyTransAdvFilter(){
  return !!(transAdvFilter.dateFrom || transAdvFilter.dateTo || transAdvFilter.accountId || transAdvFilter.mainCat || transAdvFilter.subCat || transAdvFilter.amountFrom || transAdvFilter.amountTo || transAdvFilter.type);
}

function updateTransFilterGridUI(){
  const dCard = document.getElementById('fCardDate');
  const amCard = document.getElementById('fCardAmt');
  const aCard = document.getElementById('fCardAcc');
  const cCard = document.getElementById('fCardCat');
  const tCard = document.getElementById('fCardType');
  const box = document.getElementById('mmSearchBox');
  const isFilterOpen = box && box.style.display !== 'none';
  const hasAny = hasAnyTransAdvFilter() || !!(document.getElementById('actSearch')?.value || '').trim();
  document.getElementById('btnToggleFilterHdr')?.classList.toggle('active', isFilterOpen || hasAnyTransAdvFilter());

  // 2.3 Replace month stepper with Cancel Filter button when filter is open or active
  const stepper = document.getElementById('transNavStepper');
  const cancelBtn = document.getElementById('btnCancelFilterTop');
  if(stepper && cancelBtn){
    const showCancel = isFilterOpen || hasAny;
    stepper.style.display = showCancel ? 'none' : 'inline-flex';
    cancelBtn.style.display = showCancel ? 'inline-flex' : 'none';
  }

  // 2.4 & 2.10 No "الكل" in default state; show value + ✕ when active
  if(dCard){
    const hasD = !!(transAdvFilter.dateFrom || transAdvFilter.dateTo);
    dCard.classList.toggle('active', hasD);
    const el = document.getElementById('fValDate'); if(el) el.textContent = '';
  }
  if(amCard){
    const hasA = !!(transAdvFilter.amountFrom || transAdvFilter.amountTo);
    amCard.classList.toggle('active', hasA);
    const el = document.getElementById('fValAmt'); if(el) el.textContent = '';
  }
  if(aCard){
    const hasAcc = !!transAdvFilter.accountId;
    aCard.classList.toggle('active', hasAcc);
    const el = document.getElementById('fValAcc'); if(el) el.textContent = '';
  }
  if(cCard){
    const hasCat = !!(transAdvFilter.mainCat || transAdvFilter.subCat);
    cCard.classList.toggle('active', hasCat);
    const el = document.getElementById('fValCat'); if(el) el.textContent = '';
  }
  if(tCard){
    const hasT = !!transAdvFilter.type;
    tCard.classList.toggle('active', hasT);
    const el = document.getElementById('fValType'); if(el) el.textContent = '';
  }
  updateFabVisibility();
}

function handleFilterCardTap(kind, ev){
  // 2.10 If this filter is already active, tapping it clears ONLY this filter!
  if(kind === 'date' && (transAdvFilter.dateFrom || transAdvFilter.dateTo)){
    transAdvFilter.dateFrom = '';
    transAdvFilter.dateTo = '';
    updateTransFilterGridUI();
    renderTransactionsScreen();
    return;
  }
  if(kind === 'amount' && (transAdvFilter.amountFrom || transAdvFilter.amountTo)){
    transAdvFilter.amountFrom = '';
    transAdvFilter.amountTo = '';
    updateTransFilterGridUI();
    renderTransactionsScreen();
    return;
  }
  if(kind === 'account' && transAdvFilter.accountId){
    transAdvFilter.accountId = '';
    transAdvFilter.accountLabel = '';
    updateTransFilterGridUI();
    renderTransactionsScreen();
    return;
  }
  if(kind === 'cat' && (transAdvFilter.mainCat || transAdvFilter.subCat)){
    transAdvFilter.mainCat = '';
    transAdvFilter.subCat = '';
    updateTransFilterGridUI();
    renderTransactionsScreen();
    return;
  }
  if(kind === 'type' && transAdvFilter.type){
    transAdvFilter.type = '';
    updateTransFilterGridUI();
    renderTransactionsScreen();
    return;
  }
  openTransFilterPrompt(kind);
}

function closeAndClearSearchFilter(){
  const box = document.getElementById('mmSearchBox');
  if(box) box.style.display = 'none';
  const row = document.getElementById('transSearchRow');
  if(row) row.style.display = 'none';
  _transSearchActive = false;
  document.getElementById('btnToggleSearch')?.classList.remove('active');
  document.getElementById('btnToggleFilterHdr')?.classList.remove('active');
  document.getElementById('btnToggleTransSearchHdr')?.classList.remove('active');
  clearTransactionsSearch();
  if(typeof updateFabVisibility === 'function') updateFabVisibility();
}

function toggleSearchFilterGrid(){
  const box = document.getElementById('mmSearchBox');
  const btn = document.getElementById('btnToggleFilterHdr') || document.getElementById('btnToggleSearch');
  if(!box) return;
  const open = box.style.display === 'none';
  box.style.display = open ? 'block' : 'none';
  btn?.classList.toggle('active', open || hasAnyTransAdvFilter());
  if(open){
    try{ history.pushState({xwGuard:2, xwFilter:1}, ''); }catch(_){}
    if(activeTransSubTab === 'monthly') switchTransSubTab('daily');
  }
  updateTransFilterGridUI();
}

// 2.9 Helper: Get transactions matching current Date & Amount filters for dynamic Category/Account filtering
function getTransactionsMatchingDateAndAmount(){
  const hasD = !!(transAdvFilter.dateFrom || transAdvFilter.dateTo);
  const pool = hasD ? (state.transactions || []) : monthTx(selected());
  return pool.filter(it => {
    const dSlice = String(it.date||'').slice(0,10);
    if(transAdvFilter.dateFrom && dSlice < transAdvFilter.dateFrom) return false;
    if(transAdvFilter.dateTo && dSlice > transAdvFilter.dateTo) return false;
    if(transAdvFilter.amountFrom || transAdvFilter.amountTo){
      const itemAmt = Math.abs(Number(it.amount)||0);
      const hasF = transAdvFilter.amountFrom !== '' && Number.isFinite(Number(transAdvFilter.amountFrom));
      const hasT = transAdvFilter.amountTo !== '' && Number.isFinite(Number(transAdvFilter.amountTo));
      if(hasF && !hasT){
        if(Math.abs(itemAmt - Number(transAdvFilter.amountFrom)) > 0.009) return false;
      } else if(!hasF && hasT){
        if(Math.abs(itemAmt - Number(transAdvFilter.amountTo)) > 0.009) return false;
      } else if(hasF && hasT){
        const minA = Math.min(Number(transAdvFilter.amountFrom), Number(transAdvFilter.amountTo));
        const maxA = Math.max(Number(transAdvFilter.amountFrom), Number(transAdvFilter.amountTo));
        if(itemAmt < minA - 0.009 || itemAmt > maxA + 0.009) return false;
      }
    }
    return true;
  });
}

let _tempFilterMainCat = '';
function renderFilterCatColumnsModal(){
  syncCategoryTrees();
  const hasDateOrAmt = !!(transAdvFilter.dateFrom || transAdvFilter.dateTo || transAdvFilter.amountFrom || transAdvFilter.amountTo);
  const matchingTxs = hasDateOrAmt ? getTransactionsMatchingDateAndAmount() : null;

  let mainCats = [];
  let subMap = {};

  if(matchingTxs){
    // 2.9 Show ONLY categories & subcategories that match the active Date / Amount filter!
    for(const t of matchingTxs){
      const mc = String(t.category||'').trim();
      const sc = String(t.subCategory||'').trim();
      if(!mc) continue;
      if(!mainCats.includes(mc)) mainCats.push(mc);
      if(!subMap[mc]) subMap[mc] = [];
      if(sc && !subMap[mc].includes(sc)) subMap[mc].push(sc);
    }
  } else {
    const expT = state.categoryTree.expense || {};
    const incT = state.categoryTree.income || {};
    mainCats = [...new Set([...Object.keys(expT), ...Object.keys(incT)])];
    mainCats.forEach(mc => {
      subMap[mc] = [...new Set([...(expT[mc]||[]), ...(incT[mc]||[])])];
    });
  }

  if(!_tempFilterMainCat || !mainCats.includes(_tempFilterMainCat)){
    _tempFilterMainCat = transAdvFilter.mainCat && mainCats.includes(transAdvFilter.mainCat) ? transAdvFilter.mainCat : (mainCats[0] || '');
  }

  const mainColEl = document.getElementById('fltMainCatCol');
  const subColEl = document.getElementById('fltSubCatCol');
  if(!mainColEl || !subColEl) return;

  if(!mainCats.length){
    mainColEl.innerHTML = '<div class="empty" style="padding:14px 6px">لا توجد أقسام مطابقة</div>';
    subColEl.innerHTML = '<div class="empty" style="padding:14px 6px">—</div>';
    return;
  }

  mainColEl.innerHTML = mainCats.map(mc => `
    <button type="button" class="mm-cat-item ${mc===_tempFilterMainCat?'active':''}" onclick="pickFilterMainCatCol('${escJs(mc)}')">
      <span>${esc(mc)}</span>
      <small style="opacity:.7">›</small>
    </button>
  `).join('');

  const subs = subMap[_tempFilterMainCat] || [];
  subColEl.innerHTML = `
    <button type="button" class="mm-cat-item ${!transAdvFilter.subCat && transAdvFilter.mainCat===_tempFilterMainCat?'active':''}" onclick="applyMergedCatFilter('${escJs(_tempFilterMainCat)}','')">
      <span>كل «${esc(_tempFilterMainCat)}»</span>
    </button>
  ` + subs.map(sc => `
    <button type="button" class="mm-cat-item ${transAdvFilter.subCat===sc?'active':''}" onclick="applyMergedCatFilter('${escJs(_tempFilterMainCat)}','${escJs(sc)}')">
      <span>${esc(sc)}</span>
    </button>
  `).join('');
}

function pickFilterMainCatCol(mc){
  _tempFilterMainCat = mc;
  renderFilterCatColumnsModal();
}

function applyMergedCatFilter(mc, sc){
  transAdvFilter.mainCat = mc || '';
  transAdvFilter.subCat = sc || '';
  closeAppDialog();
  updateTransFilterGridUI();
  renderTransactionsScreen();
}

function openTransFilterPrompt(kind){
  if(activeTransSubTab === 'monthly') switchTransSubTab('daily');
  if(kind === 'date'){
    const defStart = transAdvFilter.dateFrom || (selected() + '-01');
    const defEnd = transAdvFilter.dateTo || today();
    // 2.7 Formatted DD-MM-YYYY date triggers inside Date Filter modal
    const html = `
      <div class="c-list">
        <div class="c-row" onclick="openNativeInputPicker('fltDateFromInp')">
          <label>من تاريخ</label>
          <div class="picker-trigger" style="position:relative">
            <b id="fltFromDisp" dir="ltr">${formatDateDMY(defStart)}</b>
            <input id="fltDateFromInp" type="hidden" value="${esc(defStart)}" onchange="document.getElementById('fltFromDisp').textContent=formatDateDMY(this.value)">
          </div>
        </div>
        <div class="c-row" onclick="openNativeInputPicker('fltDateToInp')">
          <label>إلى تاريخ</label>
          <div class="picker-trigger" style="position:relative">
            <b id="fltToDisp" dir="ltr">${formatDateDMY(defEnd)}</b>
            <input id="fltDateToInp" type="hidden" value="${esc(defEnd)}" onchange="document.getElementById('fltToDisp').textContent=formatDateDMY(this.value)">
          </div>
        </div>
      </div>
    `;
    showAppCustomForm('فلترة بالتاريخ (من : إلى)', html, ()=>{
      transAdvFilter.dateFrom = val('fltDateFromInp') || '';
      transAdvFilter.dateTo = val('fltDateToInp') || '';
      updateTransFilterGridUI();
      renderTransactionsScreen();
      return true;
    });
    return;
  }
  if(kind === 'amount'){
    // 2.8 Removed the hint text below From/To Amount
    const html = `
      <div class="c-list">
        <div class="c-row"><label>من مبلغ</label><input id="fltAmtFromInp" type="number" step="0.01" placeholder="0" value="${esc(transAdvFilter.amountFrom||'')}"></div>
        <div class="c-row"><label>إلى مبلغ</label><input id="fltAmtToInp" type="number" step="0.01" placeholder="اختياري" value="${esc(transAdvFilter.amountTo||'')}"></div>
      </div>
    `;
    showAppCustomForm('فلترة بالمبلغ (من : إلى)', html, ()=>{
      transAdvFilter.amountFrom = String(val('fltAmtFromInp')||'').trim();
      transAdvFilter.amountTo = String(val('fltAmtToInp')||'').trim();
      updateTransFilterGridUI();
      renderTransactionsScreen();
      return true;
    });
    return;
  }
  if(kind === 'account'){
    const opts = [];
    state.accounts.forEach(a=>opts.push({id:a.id, name:a.name}));
    state.cards.forEach(c=>opts.push({id:'card:'+c.id, name:'💳 '+c.name}));
    const listHtml = `<div class="cs-opt-list">` + opts.map(o=>`
      <button type="button" class="cs-opt-btn ${transAdvFilter.accountId===o.id?'selected':''}" onclick="selectTransFilterAccount('${escJs(o.id)}','${escJs(o.name)}')">
        <span>${esc(o.name)}</span><span>${transAdvFilter.accountId===o.id?'●':'○'}</span>
      </button>
    `).join('') + `</div>`;
    showAppCustomForm('فلترة بالحساب', listHtml, null, true);
    return;
  }
  if(kind === 'cat'){
    // 2.2 Merged Main & Sub Category vertical 2-column picker
    _tempFilterMainCat = transAdvFilter.mainCat || '';
    const html = `
      <div class="mm-cat-split" style="height:260px;border:1px solid var(--line2);border-radius:12px;overflow:hidden">
        <div class="mm-cat-col" id="fltMainCatCol" style="background:var(--panel);padding:4px"></div>
        <div class="mm-cat-col" id="fltSubCatCol" style="background:var(--surface);padding:4px"></div>
      </div>
    `;
    showAppCustomForm('فلترة بالقسم الرئيسي والفرعي', html, null, true);
    renderFilterCatColumnsModal();
    return;
  }
  if(kind === 'type'){
    const opts = [
      { id:'income', name:'دخل' },
      { id:'expense', name:'مصروفات' },
      { id:'transfer', name:'تحويلات' }
    ];
    const listHtml = `<div class="cs-opt-list">` + opts.map(o=>`
      <button type="button" class="cs-opt-btn ${transAdvFilter.type===o.id?'selected':''}" onclick="selectTransFilterType('${o.id}')">
        <span>${o.name}</span><span>${transAdvFilter.type===o.id?'●':'○'}</span>
      </button>
    `).join('') + `</div>`;
    showAppCustomForm('فلترة بالنوع', listHtml, null, true);
  }
}

function selectTransFilterType(tp){
  transAdvFilter.type = tp || '';
  closeAppDialog();
  updateTransFilterGridUI();
  renderTransactionsScreen();
}

function selectTransFilterAccount(id, name){
  transAdvFilter.accountId = id;
  transAdvFilter.accountLabel = id ? name : '';
  setv('actAccountFilter', id);
  closeAppDialog();
  updateTransFilterGridUI();
  renderTransactionsScreen();
}

function onTransactionsSearchInput(){
  const inp = document.getElementById('actSearch');
  const qVal = (inp?.value || '').trim();
  if(qVal && activeTransSubTab === 'monthly'){
    activeTransSubTab = 'daily';
  }
  if(activeReportCategoryFilter && qVal !== activeReportCategoryFilter.category){
    activeReportCategoryFilter = null;
  }
  state.prefs = state.prefs || {};
  state.prefs.savedSearch = qVal;
  persistStorageOnly().catch(err=>console.error('X-Wallet search preference save failed:',err));
  const clrBtn = document.getElementById('btnClearSearch');
  if(clrBtn) clrBtn.style.display = (qVal || hasAnyTransAdvFilter()) ? 'block' : 'none';
  renderTransactionsScreen();
}
function clearTransactionsSearch(){
  activeReportCategoryFilter = null;
  transAdvFilter = { dateFrom:'', dateTo:'', accountId:'', accountLabel:'', mainCat:'', subCat:'', amountFrom:'', amountTo:'', type:'' };
  setv('actAccountFilter', '');
  const inp = document.getElementById('actSearch');
  if(inp) inp.value = '';
  state.prefs = state.prefs || {};
  state.prefs.savedSearch = '';
  persistStorageOnly().catch(err=>console.error('X-Wallet search preference save failed:',err));
  const clrBtn = document.getElementById('btnClearSearch');
  if(clrBtn) clrBtn.style.display = 'none';
  updateTransFilterGridUI();
  renderTransactionsScreen();
}

function toggleItemActions(el, ev){
  if(ev && ev.target.closest('button')) return;
  const was = el.classList.contains('expanded');
  document.querySelectorAll('.tx-wrap.expanded, .listitem.expanded').forEach(x=>x.classList.remove('expanded'));
  if(!was) el.classList.add('expanded');
}


/* ---- Original app.js lines 1577-2194 ---- */
/* =========================================================
   #2.2 DIRECT-TAP DAILY TRANSACTIONS BUILDER
   (Tapping any transaction opens it directly in Edit Mode, where Copy & Delete live inside!)
   ========================================================= */
let activeTransSubTab = 'daily';

function switchTransSubTab(mode){
  if(mode === 'inc' || mode === 'exp'){
    activeReportTab = mode;
    go('analytics', document.querySelector('.nav[data-page="analytics"]'));
    switchReportTab(mode);
    return;
  }
  if(mode === 'commitments'){
    go('commitments', document.querySelector('.nav[data-page="commitments"]'));
    return;
  }
  activeTransSubTab = (mode === 'monthly') ? 'monthly' : 'daily';
  document.getElementById('transTabDaily')?.classList.toggle('active', activeTransSubTab === 'daily' || activeTransSubTab === 'monthly');
  document.getElementById('transTabCommit')?.classList.toggle('active', activeTransSubTab === 'commitments');

  const dailyWrap = document.getElementById('transDailyMainWrap');
  const commitmentsWrap = document.getElementById('transCommitmentsWrap');
  const isCommit = activeTransSubTab === 'commitments';
  if(dailyWrap) dailyWrap.style.display = isCommit ? 'none' : 'block';
  if(commitmentsWrap) commitmentsWrap.style.display = isCommit ? 'block' : 'none';

  if(isCommit){
    renderPlanScreen();
  } else {
    renderTransactionsScreen();
  }
  updateFabVisibility();
  updateTopTabTitle('trans');
}


function switchForecastTab(which){
  const isYr = (which === 'yr');
  document.getElementById('fcTabMonthly')?.classList.toggle('active', !isYr);
  document.getElementById('fcTabYr')?.classList.toggle('active', isYr);
  document.getElementById('fcViewMonthly').style.display = isYr ? 'none' : 'block';
  document.getElementById('planViewYr').style.display = isYr ? 'block' : 'none';
  updateTopTabTitle('forecast');
  if(isYr) renderYearlyExcelReport();
  else renderForecastMonthlyView();
}


function renderForecastMonthlyView(){
  const lang = state.prefs?.lang || 'ar';
  const isEn = (lang === 'en');
  const lbl = document.getElementById('fcMonthlyYearLabel');
  if(lbl) lbl.textContent = String(activeYear);
  let yrInc = 0, yrExp = 0;
  const monthRows = [];
  for(let mn = 12; mn >= 1; mn--){
    const ym = String(activeYear) + '-' + String(mn).padStart(2, '0');
    const mt = totals(ym);
    yrInc = round2(yrInc + mt.inc);
    yrExp = round2(yrExp + mt.exp);
    const mLabel = isEn ? monthNamesEn[mn-1] : monthNamesAr[mn-1];
    monthRows.push({ mn, ym, mLabel, inc: mt.inc, exp: mt.exp, net: mt.net });
  }
  const yrNet = round2(yrInc - yrExp);
  const incEl = document.getElementById('fcMonthIncHero');
  const expEl = document.getElementById('fcMonthExpHero');
  const netEl = document.getElementById('fcMonthNetHero');
  if(incEl) incEl.textContent = maskable(fmtNum(yrInc));
  if(expEl) expEl.textContent = maskable(fmtNum(yrExp));
  if(netEl){
    netEl.textContent = maskable(fmtNum(yrNet));
    netEl.className = yrNet >= 0 ? 'mint' : 'red';
  }
  const headHtml = `
    <div class="mm-monthly-head">
      <div>${isEn ? 'Month' : 'الشهر'}</div>
      <div class="num">${isEn ? 'Income' : 'الدخل'}</div>
      <div class="num">${isEn ? 'Expenses' : 'المصروفات'}</div>
      <div class="num">${isEn ? 'Net' : 'الصافي'}</div>
    </div>
  `;
  const feed = document.getElementById('fcMonthlyFeed');
  if(feed){
    feed.innerHTML = `<div class="day-group">` + headHtml + monthRows.map(r => `
      <div class="mm-month-row ${r.mn === activeMonth ? 'cur-month' : ''}" onclick="selectMonthFromForecastTab(${activeYear}, ${r.mn})">
        <div><b>${esc(r.mLabel)}</b></div>
        <div class="num blue">${maskable(fmtNum(r.inc))}</div>
        <div class="num red">${maskable(fmtNum(r.exp))}</div>
        <div class="num ${r.net >= 0 ? 'mint' : 'red'}">${maskable(fmtNum(r.net))}</div>
      </div>
    `).join('') + `</div>`;
  }
}

function selectMonthFromForecastTab(yr, mn){
  activeYear = yr;
  activeMonth = mn;
  forecastYear = yr;
  homePeriodMode = 'monthly';
  go('trans', document.querySelector('.nav[data-page="trans"]'));
  switchTransSubTab('daily');
}

function shiftTransPeriod(delta){
  if(activeTransSubTab === 'monthly'){
    activeYear += delta;
    forecastYear = activeYear;
    renderAll();
  } else {
    shiftActiveMonth(delta);
  }
}

function openTransPeriodPicker(){
  openHomePeriodPicker();
}

function selectMonthFromMonthlyTab(yr, mn){
  activeYear = yr;
  activeMonth = mn;
  forecastYear = yr;
  homePeriodMode = 'monthly';
  switchTransSubTab('daily');
  renderAll();
}

function getItemTimestampOrder(it, idx){
  if(it.createdAt) return Number(it.createdAt)||0;
  const m = String(it.id||'').match(/(\d{10,15})/);
  if(m) return Number(m[1]);
  return idx;
}

function txMatchesAccount(it, targetAccId){
  if(!targetAccId) return true;
  if(targetAccId.startsWith('card:')){
    const cid = targetAccId.replace('card:','');
    const opId = String(it.source||'').replace('card-purchase:','');
    const op = (state.cardOps||[]).find(o=>String(o.id)===opId);
    if(op && String(op.cardId) === cid) return true;
    const card = (state.cards||[]).find(c=>String(c.id)===cid);
    if(card){
      const cLbl = String(card.name||'').trim().toLowerCase();
      if(cLbl && String(it.accountLabel||'').trim().toLowerCase() === cLbl) return true;
    }
    return false;
  }
  const sid = String(targetAccId);
  if(String(it.accountId||'') === sid || String(it.toAccountId||'') === sid) return true;

  const targetAcc = (state.accounts||[]).find(a=>String(a.id) === sid);
  if(targetAcc){
    const lbl = String(it.accountLabel||'').trim().toLowerCase();
    if(lbl && lbl === String(targetAcc.name||'').trim().toLowerCase()) return true;

    // If this is a Cash account, include legacy/imported transactions that resolve to Cash!
    const isCashTarget = targetAcc.type === 'cash' || String(targetAcc.name||'').trim().toLowerCase() === 'cash' || String(targetAcc.name||'').trim() === 'كاش';
    if(isCashTarget && !isCardPurchaseTx(it)){
      const rawId = String(it.accountId||'').trim();
      const hasValidOtherAcc = rawId && state.accounts.some(a=>a.id === rawId);
      if(!rawId || rawId.toLowerCase().includes('cash') || !hasValidOtherAcc){
        return true;
      }
    }
  }
  return false;
}

function resolveAccountDisplayLabel(it, isEn){
  if(it._kind === 'ledger'){
    return it.accountLabel || '';
  }
  const accObj = state.accounts.find(a=>a.id === it.accountId);
  if(accObj && accObj.name) return accObj.name;
  if(it.accountLabel) return it.accountLabel;
  if(isCardPurchaseTx(it)){
    const opId = String(it.source||'').replace('card-purchase:','');
    const op = state.cardOps.find(o=>o.id===opId);
    const card = op ? state.cards.find(c=>c.id===op.cardId) : null;
    return card ? card.name : (isEn ? 'Credit Card' : 'بطاقة ائتمان');
  }
  if(it.accountId && String(it.accountId).toLowerCase().includes('cash')){
    return isEn ? 'Cash' : 'كاش';
  }
  const cashAcc = state.accounts.find(a=>a.type==='cash');
  if(cashAcc) return cashAcc.name;
  return isEn ? 'Cash' : 'كاش';
}

function buildDailyGroupedFeedHtml(itemsList, emptyMsg){
  itemsList = (Array.isArray(itemsList) ? itemsList : []).filter(item => item && !item.deletedAt);
  const isEn = (state.prefs?.lang === 'en');
  if(!itemsList || !itemsList.length){
    return `<div class="panel"><div class="empty">${emptyMsg || (isEn ? 'No transactions found.' : 'لا توجد معاملات مسجلة.')}</div></div>`;
  }
  const byDay = {};
  for(const it of itemsList){
    const dStr = String(it.date||'').slice(0,10);
    if(!byDay[dStr]) byDay[dStr] = [];
    byDay[dStr].push(it);
  }
  let html = '';
  for(const [dStr, items] of Object.entries(byDay)){
    const dtObj = new Date(dStr + 'T12:00:00');
    const dayNum = dStr.slice(8,10);
    const monNum = dStr.slice(5,7);
    const yrNum = dStr.slice(0,4);
    const dayName = !isNaN(dtObj) ? (isEn ? dayNamesEn[dtObj.getDay()] : dayNamesAr[dtObj.getDay()]) : '';
    const formattedDayHeader = `${dayNum}-${monNum}-${yrNum} &nbsp;|&nbsp; ${dayName}`;

    let dayInc = 0, dayExp = 0;
    for(const it of items){
      const baseValue=typeof transactionBaseAmount==='function'?transactionBaseAmount(it):(Number(it.amount)||0);
      if(it.type === 'income') dayInc += baseValue;
      else if(isActualExpenseTx(it) || isCardPurchaseTx(it)) dayExp += baseValue;
    }

    const rowsHtml = items.map(it=>{
      const accName = resolveAccountDisplayLabel(it, isEn);
      let amtClass = it.type==='income' ? 'blue' : (it.type==='transfer' ? 'mint' : (isCardPurchaseTx(it) ? 'orange' : 'red'));
      let amtPrefix = it.type==='income' ? '+' : (it.type==='transfer' ? '⇄ ' : '−');

      let rawTitle = String(it.title || it.note || '').trim();
      rawTitle = rawTitle.replace(/^شراء بالبطاقة\s*-\s*/,'');
      const catClean = String(it.category||'').trim();
      const subClean = String(it.subCategory||'').trim();
      const isDupTitle = !rawTitle ||
                         rawTitle.toLowerCase() === catClean.toLowerCase() ||
                         rawTitle.toLowerCase() === subClean.toLowerCase() ||
                         rawTitle.toLowerCase() === accName.toLowerCase();
      let instBadge = '';
      if(it.repeatIndex && it.repeatTotal && Number(it.repeatTotal) > 1){
        instBadge = `(${it.repeatIndex}/${it.repeatTotal})`;
      } else if(it.installmentIndex && it.installmentTotal && Number(it.installmentTotal) > 1){
        instBadge = `(${it.installmentIndex}/${it.installmentTotal})`;
      } else {
        const ratioM = String(it.title||it.note||it.description||'').match(/\((\d{1,2}\/\d{1,2})\)/);
        if(ratioM){
          instBadge = `(${ratioM[1]})`;
        } else if(it.source && String(it.source).startsWith('card-purchase:')){
          const opId = String(it.source).replace('card-purchase:','');
          const op = (state.cardOps||[]).find(o=>String(o.id)===opId);
          if(op && Number(op.months) > 1){
            const startYM = String(op.firstMonth || op.date || '').slice(0,7);
            const curYM = String(it.date || '').slice(0,7);
            let idxM = 1;
            if(startYM.length === 7 && curYM.length === 7){
              const [sy, sm] = startYM.split('-').map(Number);
              const [cy, cm] = curYM.split('-').map(Number);
              idxM = Math.max(1, Math.min(Number(op.months), (cy - sy)*12 + (cm - sm) + 1));
            }
            instBadge = `(${idxM}/${op.months})`;
          }
        }
      }
      let cleanMemo = instBadge ? rawTitle.replace(instBadge, '').trim() : rawTitle;
      if((it.source === 'card-payment' || it.type === 'credit_payment') && cleanMemo){
        const pm = cleanMemo.match(/سداد(?:\s+قسط)?\s+بطاقة\s*\(([^)]+)\)/);
        if(pm && pm[1]) cleanMemo = pm[1].trim();
      }
      const memoLine = isDupTitle ? '' : cleanMemo;
      const itemKind = it._kind || 'tx';
      const itemCurrency=String(it.currency||state.accounts.find(a=>String(a.id)===String(it.accountId))?.currency||'EGP').toUpperCase();

      // 2.2 Direct tap on row opens openEditAnyItem directly!
      return `
        <div class="tx-wrap" onclick="openEditAnyItem('${esc(it.id)}','${itemKind}')">
          <div class="tx-row">
            <div class="tx-cat-col">
              <b>${esc(it.category||'أخرى')}</b>
              ${it.subCategory ? `<small>${esc(it.subCategory)}</small>` : ''}
            </div>
            <div class="tx-acc-col">
              ${instBadge ? `<span class="tx-inst-badge" dir="ltr">${esc(instBadge)}</span>` : ''}
              ${memoLine ? `<span>${esc(memoLine)}</span>` : ''}
              <small>${esc(accName)}</small>
            </div>
            <div class="tx-amt-col ${amtClass}">${maskable(amtPrefix + fmt(Math.abs(Number(it.amount)||0)))} ${esc(itemCurrency)}</div>
          </div>
        </div>
      `;
    }).join('');

    html += `
      <div class="day-group">
        <div class="day-head">
          <div class="day-head-right">
            <span dir="ltr" style="font-size:.8rem;color:var(--text)">${formattedDayHeader}</span>
          </div>
          <div class="day-totals">
            <span class="blue">${maskable(fmt(dayInc))} EGP</span>
            <span class="red">${maskable(fmt(dayExp))} EGP</span>
          </div>
        </div>
        ${rowsHtml}
      </div>
    `;
  }
  return html;
}

function renderTransactionsScreen(){
  const lang = state.prefs?.lang || 'ar';
  const isEn = lang === 'en';
  const m = selected();

  document.getElementById('transTabDaily')?.classList.toggle('active', activeTransSubTab === 'daily');
  document.getElementById('transTabMonthly')?.classList.toggle('active', activeTransSubTab === 'monthly');

  const af = document.getElementById('actAccountFilter');
  if(af){
    const cur = af.value;
    af.innerHTML = `<option value="">${isEn ? 'All Accounts' : 'كل الحسابات'}</option>` + state.accounts.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('');
    if([...af.options].some(o=>o.value===cur)) af.value = cur;
    syncCustomSelectTriggers();
  }

  const searchInputEl = document.getElementById('actSearch');
  if(searchInputEl && !searchInputEl.value && state.prefs?.savedSearch){
    searchInputEl.value = state.prefs.savedSearch;
    const box = document.getElementById('mmSearchBox');
    const btn = document.getElementById('btnToggleSearch');
    if(box) box.style.display = 'block';
    if(btn) btn.classList.add('active');
  }
  const rawQ = (searchInputEl?.value||'').trim();
  const q = rawQ.toLowerCase();
  const hasAdv = hasAnyTransAdvFilter();
  const clrBtn = document.getElementById('btnClearSearch');
  if(clrBtn) clrBtn.style.display = (rawQ || hasAdv) ? 'block' : 'none';
  updateTransFilterGridUI();
  const accFilter = transAdvFilter.accountId || af?.value || '';

  const feed = document.getElementById('dailyTransactionsFeed');

  // === MONTHLY SUMMARY TAB ===
  if(activeTransSubTab === 'monthly'){
    document.getElementById('homePeriodLabel').textContent = String(activeYear);
    let yrInc = 0, yrExp = 0;
    const monthRows = [];
    for(let mn = 12; mn >= 1; mn--){
      const ym = String(activeYear) + '-' + String(mn).padStart(2, '0');
      const mt = totals(ym);
      yrInc = round2(yrInc + mt.inc);
      yrExp = round2(yrExp + mt.exp);
      const mLabel = isEn ? monthNamesEn[mn-1] : monthNamesAr[mn-1];
      monthRows.push({ mn, ym, mLabel, inc: mt.inc, exp: mt.exp, net: mt.net });
    }
    const yrNet = round2(yrInc - yrExp);
    document.getElementById('incomeHero').textContent = maskable(fmtNum(yrInc));
    document.getElementById('expenseHero').textContent = maskable(fmtNum(yrExp));
    const remEl = document.getElementById('remaining');
    remEl.textContent = maskable(fmtNum(yrNet));
    remEl.className = yrNet >= 0 ? 'mint' : 'red';

    const headHtml = `
      <div class="mm-monthly-head">
        <div>${isEn ? 'Month' : 'الشهر'}</div>
        <div class="num">${isEn ? 'Income' : 'الدخل'}</div>
        <div class="num">${isEn ? 'Expenses' : 'المصروفات'}</div>
        <div class="num">${isEn ? 'Net' : 'الصافي'}</div>
      </div>
    `;

    feed.innerHTML = `<div class="day-group">` + headHtml + monthRows.map(r => `
      <div class="mm-month-row ${r.mn === activeMonth ? 'cur-month' : ''}" onclick="selectMonthFromMonthlyTab(${activeYear}, ${r.mn})">
        <div><b>${esc(r.mLabel)}</b></div>
        <div class="num blue">${maskable(fmtNum(r.inc))}</div>
        <div class="num red">${maskable(fmtNum(r.exp))}</div>
        <div class="num ${r.net >= 0 ? 'mint' : 'red'}">${maskable(fmtNum(r.net))}</div>
      </div>
    `).join('') + `</div>`;
    return;
  }

  // === DAILY TRANSACTIONS TAB ===
  const isHomeYearly = (homePeriodMode === 'yearly');
  const yStrHome = String(activeYear);
  const t = isHomeYearly ? totalsForYear(activeYear) : totals(m);
  document.getElementById('homePeriodLabel').textContent = isHomeYearly
    ? (yStrHome)
    : (isEn ? `${monthNamesEn[activeMonth-1]} ${activeYear}` : formatYMArabic(m));

  const useGlobalDateRange = !!(transAdvFilter.dateFrom || transAdvFilter.dateTo);
  const rawTxSource = useGlobalDateRange
    ? (state.transactions||[])
    : (isHomeYearly ? (state.transactions||[]).filter(tx=>String(tx.date||'').startsWith(yStrHome)) : monthTx(m));
  const rawLedSource = useGlobalDateRange
    ? (state.ledger||[])
    : (isHomeYearly ? (state.ledger||[]).filter(l=>String(l.date||'').startsWith(yStrHome)) : (state.ledger||[]).filter(l=>monthKey(l.date)===m));
  const txList = rawTxSource.map((x, idx)=>({...x, _kind:'tx', _order: getItemTimestampOrder(x, idx)}));
  const ledList = rawLedSource.map((l, idx)=>{
    const fromA = state.accounts.find(a=>a.id===l.from)?.name || (isEn?'Cash':'كاش');
    const toA = state.accounts.find(a=>a.id===l.to)?.name || (isEn?'Cash':'كاش');
    const feeTxt = (Number(l.fee)||0) > 0 ? ` (${isEn?'Fee':'رسوم'}: ${fmt(l.fee)})` : '';
    return {
      id: l.id,
      type: l.type,
      category: l.type==='transfer' ? (isEn?'Transfer':'تحويل') : (isEn?'Adjustment':'تسوية'),
      subCategory: '',
      title: (l.note && l.note !== 'تحويل بين الحسابات') ? l.note : '',
      note: l.note || '',
      description: l.description || '',
      accountLabel: (l.type==='transfer' ? `${fromA} → ${toA}` : fromA) + feeTxt,
      accountId: l.from,
      toAccountId: l.to,
      amount: l.type==='transfer' ? Number(l.amount)||0 : Number(l.delta??l.amount)||0,
      fee: Number(l.fee)||0,
      date: l.date,
      _kind: 'ledger',
      _order: getItemTimestampOrder(l, 100000 + idx)
    };
  });

  let combined = [...txList, ...ledList].filter(it=>{
    if(accFilter && !txMatchesAccount(it, accFilter)) return false;
    const dSlice = String(it.date||'').slice(0,10);
    if(transAdvFilter.dateFrom && dSlice < transAdvFilter.dateFrom) return false;
    if(transAdvFilter.dateTo && dSlice > transAdvFilter.dateTo) return false;
    if(transAdvFilter.mainCat && String(it.category||'').trim() !== transAdvFilter.mainCat) return false;
    if(transAdvFilter.subCat && String(it.subCategory||'').trim() !== transAdvFilter.subCat) return false;
    if(transAdvFilter.type){
      if(transAdvFilter.type === 'income' && it.type !== 'income') return false;
      if(transAdvFilter.type === 'expense' && !isActualExpenseTx(it)) return false;
      if(transAdvFilter.type === 'transfer' && it.type !== 'transfer') return false;
    }
    if(transAdvFilter.amountFrom || transAdvFilter.amountTo){
      const itemAmt = Math.abs(Number(it.amount)||0);
      const hasF = transAdvFilter.amountFrom !== '' && Number.isFinite(Number(transAdvFilter.amountFrom));
      const hasT = transAdvFilter.amountTo !== '' && Number.isFinite(Number(transAdvFilter.amountTo));
      if(hasF && !hasT){
        // Exact match when only "من مبلغ" is entered (450 matches 450 ONLY, never 4500!)
        if(Math.abs(itemAmt - Number(transAdvFilter.amountFrom)) > 0.009) return false;
      } else if(!hasF && hasT){
        if(Math.abs(itemAmt - Number(transAdvFilter.amountTo)) > 0.009) return false;
      } else if(hasF && hasT){
        const minA = Math.min(Number(transAdvFilter.amountFrom), Number(transAdvFilter.amountTo));
        const maxA = Math.max(Number(transAdvFilter.amountFrom), Number(transAdvFilter.amountTo));
        if(itemAmt < minA - 0.009 || itemAmt > maxA + 0.009) return false;
      }
    }
    if(q){
      const isPureNum = /^\d+(\.\d+)?$/.test(q);
      const itemAmt = Math.abs(Number(it.amount)||0);
      const exactNumMatch = isPureNum && Math.abs(itemAmt - Number(q)) < 0.009;
      const accDisp = resolveAccountDisplayLabel(it, isEn).toLowerCase();
      const hay = [
        it.title,
        it.note,
        it.description,
        it.category,
        it.subCategory,
        accDisp
      ].map(s=>String(s||'').toLowerCase()).join(' ');
      if(!exactNumMatch && !hay.includes(q)) return false;
    }
    return true;
  }).sort((a,b)=>{
    const dc = String(b.date||'').localeCompare(String(a.date||''));
    if(dc !== 0) return dc;
    return (b._order || 0) - (a._order || 0);
  });

  // Update summary boxes dynamically when search/filter is active
  if(q || accFilter || hasAdv){
    const fInc = round2(combined.filter(x=>x.type==='income').reduce((s,x)=>s+(typeof transactionBaseAmount==='function'?transactionBaseAmount(x):(Number(x.amount)||0)),0));
    const fExp = round2(combined.filter(x=>isActualExpenseTx(x)).reduce((s,x)=>s+(typeof transactionBaseAmount==='function'?transactionBaseAmount(x):(Number(x.amount)||0)),0));
    const fNet = round2(fInc - fExp);
    document.getElementById('incomeHero').textContent = maskable(fmtNum(fInc));
    document.getElementById('expenseHero').textContent = maskable(fmtNum(fExp));
    const remEl = document.getElementById('remaining');
    remEl.textContent = maskable(fmtNum(fNet));
    remEl.className = fNet >= 0 ? 'mint' : 'red';
  } else {
    document.getElementById('incomeHero').textContent = maskable(fmtNum(t.inc));
    document.getElementById('expenseHero').textContent = maskable(fmtNum(t.exp));
    const remEl = document.getElementById('remaining');
    remEl.textContent = maskable(fmtNum(t.net));
    remEl.className = t.net >= 0 ? 'mint' : 'red';
  }

  const emptyMsg = isEn ? 'No transactions in this period.<br>Tap <b>＋</b> to add one.' : `لا توجد معاملات مطابقة في ${formatYMArabic(m)}.`;
  feed.innerHTML = buildDailyGroupedFeedHtml(combined, emptyMsg);
  alignTransactionAmountColumns(feed);
}

/* 2.2 Copy & Delete Actions Directly Inside Quick Edit Modal */
function copyCurrentQuickModalItem(){
  if(!qmState.editId) return;
  duplicateItemToday(qmState.editId, qmState.editKind || 'tx');
  closeQuickModal();
}
function deleteCurrentQuickModalItem(){
  if(!qmState.editId) return;
  const id = qmState.editId;
  const kind = qmState.editKind || 'tx';
  closeQuickModal();
  deleteAnyItem(id, kind);
}

function duplicateItemToday(id, kind){
  const nowTs = Date.now();
  if(kind === 'ledger'){
    const origL = state.ledger.find(x=>String(x.id)===String(id));
    if(!origL) return;
    const copyDate=today();
    const fromCurrency=String(origL.fromCurrency||origL.currency||accountCurrency(origL.from)||'EGP').toUpperCase();
    const toCurrency=String(origL.toCurrency||accountCurrency(origL.to)||origL.currency||'EGP').toUpperCase();
    const fromAmount=Number(origL.fromAmount??origL.amount)||0;
    const fromRate=getCurrencyRateToBase(fromCurrency,copyDate);
    const toRate=getCurrencyRateToBase(toCurrency,copyDate);
    const toAmount=convertCurrencyAmount(fromAmount,fromCurrency,toCurrency,copyDate,fromRate,toRate);
    const copiedLedger={
      ...origL,
      id:uid('ledger'),
      date:copyDate,
      amount:fromAmount,fromAmount,toAmount,fromCurrency,toCurrency,
      currency:fromCurrency,fromExchangeRateAtCreation:fromRate,toExchangeRateAtCreation:toRate,
      exchangeRateAtCreation:fromRate,
      fee:origL.fee||0,
      feeTransactionId:null,
      createdAt:nowTs
    };
    const originalFeeTx=(state.transactions||[]).find(t=>!t.deletedAt&&(String(t.id)===String(origL.feeTransactionId||'')||String(t.linkedTransferLedgerId||'')===String(origL.id)));
    // A linked fee is already a separate expense. Do not also copy a legacy ledger fee.
    if(originalFeeTx)copiedLedger.fee=0;
    state.ledger.push(copiedLedger);
    if(originalFeeTx){
      const feeCurrency=String(originalFeeTx.currency||fromCurrency).toUpperCase();
      const feeSnapshot=typeof transactionCurrencySnapshot==='function'?transactionCurrencySnapshot(Number(originalFeeTx.amount)||0,feeCurrency,copyDate):{};
      const copiedFeeTx={...originalFeeTx,...feeSnapshot,id:uid('tx-fee'),date:copyDate,accountId:origL.from,linkedTransferLedgerId:String(copiedLedger.id),createdAt:nowTs+1};
      state.transactions.push(copiedFeeTx);
      copiedLedger.feeTransactionId=copiedFeeTx.id;
    }
    persist();
    refreshSecondaryFeeds();
    toast('تم نسخ التحويل بتاريخ اليوم ✓');
    return;
  }
  const orig = state.transactions.find(x=>String(x.id)===String(id));
  if(!orig) return;
  if(orig.linkedCardOpId||orig.linkedCommitmentPaymentId||orig.linkedCardPaymentRecordId||orig.source==='card-payment'||orig.source==='commitment-payment'){
    toast('لا تنسخ حركة سداد مرتبطة من سجل المعاملات؛ استخدم شاشة البطاقة أو الالتزام لتسجيل سداد جديد.');
    return;
  }

  if(isCardPurchaseTx(orig)){
    const oldOpId = String(orig.source||'').replace('card-purchase:','');
    const origOp = state.cardOps.find(o=>o.id===oldOpId);
    const newOpId = uid('op');
    const dToday = today();
    const copiedCurrency=String(orig.currency||state.cards.find(c=>c.id===origOp?.cardId)?.currency||'EGP').toUpperCase();
    const copiedFx=typeof transactionCurrencySnapshot==='function'?transactionCurrencySnapshot(Number(orig.amount)||0,copiedCurrency,dToday):{};
    if(origOp){
      const card = state.cards.find(c=>c.id===origOp.cardId);
      const newOp = JSON.parse(JSON.stringify(origOp));
      newOp.id = newOpId;
      newOp.date = dToday;
      Object.assign(newOp,copiedFx);
      newOp.paid = 0;
      newOp.dueDate = card ? dueDateFor(card, dToday) : dToday;
      if(newOp.type === 'installment'){
        const pYM = dToday.slice(0,7);
        const months = Number(newOp.months)||12;
        const built = buildInstallmentSchedulesForCard(card, pYM, months, newOp.installment, newOp.feeDue||0, (Number(newOp.amount)||0)+(Number(newOp.interest)||0));
        newOp.purchaseMonth = pYM;
        newOp.feeMonth = built.feeYM;
        newOp.feePaid = 0;
        newOp.schedules = built.schedules;
      }
      state.cardOps.push(newOp);
      if(newOp.type === 'installment') syncCardInstallmentsToCommitments();
    } else if(state.cards.length){
      const fallbackCard = state.cards[0];
      state.cardOps.push({
        id: newOpId,
        cardId: fallbackCard.id,
        type: 'swipe',
        title: String(orig.title||'').replace(/^شراء بالبطاقة\s*-\s*/,'') || orig.category || 'شراء بالبطاقة',
        amount: Number(orig.amount)||0,
        ...copiedFx,
        date: dToday,
        paid: 0,
        dueDate: dueDateFor(fallbackCard, dToday)
      });
    }
    state.transactions.push({
      ...orig,
      ...copiedFx,
      id: 'card-purchase-' + newOpId,
      date: dToday,
      source: 'card-purchase:' + newOpId,
      createdAt: nowTs
    });
    persist();
    refreshSecondaryFeeds();
    toast('تم نسخ عملية البطاقة بتاريخ اليوم ✓');
    return;
  }

  const copyDate=today();
  const copyCurrency=String(orig.currency||state.accounts.find(a=>String(a.id)===String(orig.accountId))?.currency||'EGP').toUpperCase();
  const copiedFx=typeof transactionCurrencySnapshot==='function'?transactionCurrencySnapshot(Number(orig.amount)||0,copyCurrency,copyDate):{};
  state.transactions.push({
    ...orig,
    ...copiedFx,
    id: uid('tx'),
    date: copyDate,
    createdAt: nowTs
  });
  persist();
  refreshSecondaryFeeds();
  toast('تم نسخ الحركة بتاريخ اليوم ✓');
}

function openEditAnyItem(id, kind){
  if(kind === 'ledger'){
    const l = state.ledger.find(x=>String(x.id)===String(id));
    if(!l) return;
    openEditLedgerModal(l);
    return;
  }
  const t = state.transactions.find(x=>String(x.id)===String(id));
  if(!t) return;
  openEditQuickTx(t.id);
}

function findLinkedCommitmentPaymentForTransaction(txObj){
  if(!txObj)return null;
  const payments=state.commitmentPayments||[];
  if(txObj.linkedCommitmentPaymentId){
    return payments.find(p=>String(p.id)===String(txObj.linkedCommitmentPaymentId))||null;
  }
  if(txObj.source!=='commitment-payment')return null;
  const txDate=String(txObj.date||'');
  const txAccount=String(txObj.accountId||'');
  const txAccountCurrency=String(txObj.currency||'EGP').toUpperCase();
  const settledAmount=Number(txObj.settledAmount);
  const hasSettled=Number.isFinite(settledAmount)&&txObj.settledAmount!==null&&txObj.settledAmount!=='';
  const txAmount=Number(txObj.amount)||0;
  const candidates=payments.filter(p=>{
    if(String(p.date||'')!==txDate)return false;
    if(txAccount&&p.accountId&&String(p.accountId)!==txAccount)return false;
    if(hasSettled){
      if(Math.abs((Number(p.amount)||0)-settledAmount)>=0.01)return false;
      if(txObj.settledCurrency&&String(p.currency||'EGP').toUpperCase()!==String(txObj.settledCurrency).toUpperCase())return false;
      if(p.accountAmount!==undefined&&Math.abs((Number(p.accountAmount)||0)-txAmount)>=0.01)return false;
      if(p.accountCurrency&&String(p.accountCurrency).toUpperCase()!==txAccountCurrency)return false;
    }else if(p.accountAmount!==undefined){
      if(Math.abs((Number(p.accountAmount)||0)-txAmount)>=0.01)return false;
      if(p.accountCurrency&&String(p.accountCurrency).toUpperCase()!==txAccountCurrency)return false;
    }else if(Math.abs((Number(p.amount)||0)-txAmount)>=0.01){
      return false;
    }
    return true;
  });
  // Old records may lack a stable link ID. Only remove a payment when the match is unique.
  return candidates.length===1?candidates[0]:null;
}

function revertLinkedPaymentOnTxDelete(txObj){
  if(!txObj) return;
  const commitmentPayment=findLinkedCommitmentPaymentForTransaction(txObj);
  if(commitmentPayment){
    state.commitmentPayments=(state.commitmentPayments||[]).filter(p=>String(p.id)!==String(commitmentPayment.id));
  }
  if(txObj.linkedCardOpId){
    const op = (state.cardOps||[]).find(o=>String(o.id)===String(txObj.linkedCardOpId));
    const amt = Number(txObj.settledAmount??txObj.amount)||0;
    if(op && amt > 0){
      if(txObj.linkedCardPayKind === 'card_swipe'){
        op.paid = round2(Math.max(0, (Number(op.paid)||0) - amt));
      } else if(txObj.linkedCardPayKind === 'card_fee'){
        op.feePaid = round2(Math.max(0, (Number(op.feePaid)||0) - amt));
      } else if(txObj.linkedCardPayKind === 'card_inst'){
        const sc = (op.schedules||[]).find(s=>String(s.month) === String(txObj.linkedCardPayMonth));
        if(sc) sc.paid = round2(Math.max(0, (Number(sc.paid)||0) - amt));
      }
    }
    if(txObj.linkedCardPaymentRecordId){
      state.cardPayments = (state.cardPayments||[]).filter(p=>p.id !== txObj.linkedCardPaymentRecordId);
    }
  }
}

function archiveCardPurchaseDeletion(txObj, opObj){
  state.cancelledTransactions=Array.isArray(state.cancelledTransactions)?state.cancelledTransactions:[];
  const clone=value=>value?JSON.parse(JSON.stringify(value)):null;
  const tx=clone(txObj);
  if(!tx)return false;
  if(state.cancelledTransactions.some(x=>String(x.transaction?.id||x.id)===String(tx.id)))return false;
  state.cancelledTransactions.unshift({transaction:tx,related:{cardPurchaseOp:clone(opObj)},cancelledAt:new Date().toISOString(),archiveType:'card_purchase'});
  state.cancelledTransactions=state.cancelledTransactions.slice(0,500);
  if(typeof auditRecord==='function')auditRecord('حذف','معاملة',tx.id,tx,null);
  return true;
}

function deleteAnyItem(id, kind){
  if(kind === 'ledger'){
    const ledger=state.ledger.find(x=>String(x.id)===String(id));
    if(!ledger)return;
    showAppConfirm('حذف التحويل', 'سيتم حذف التحويل ورسومه المرتبطة مع الاحتفاظ بإمكانية استعادتهما. هل تريد المتابعة؟', ()=>{
      const feeTx=(state.transactions||[]).find(t=>String(t.id)===String(ledger.feeTransactionId||'')||String(t.linkedTransferLedgerId||'')===String(ledger.id));
      if(feeTx&&!feeTx.deletedAt){
        state.cancelledTransactions=Array.isArray(state.cancelledTransactions)?state.cancelledTransactions:[];
        state.cancelledTransactions.unshift({transaction:JSON.parse(JSON.stringify(feeTx)),related:{transferLedgerId:String(ledger.id)},cancelledAt:new Date().toISOString(),archiveType:'transfer_fee'});
        state.cancelledTransactions=state.cancelledTransactions.slice(0,500);
        state.transactions=state.transactions.filter(t=>String(t.id)!==String(feeTx.id));
        if(typeof auditRecord==='function')auditRecord('حذف','معاملة',feeTx.id,feeTx,null);
      }
      state.ledger=state.ledger.filter(x=>String(x.id)!==String(id));
      if(typeof auditRecord==='function')auditRecord('حذف','حركة حساب',ledger.id,ledger,null);
      persist(); refreshSecondaryFeeds(); toast('تم حذف التحويل ورسومه مع حفظ إمكانية الاستعادة ✓');
    }, true);
    return;
  }
  const t = state.transactions.find(x=>String(x.id)===String(id));
  if(t && isCardPurchaseTx(t)){
    const opId = String(t.source||'').replace('card-purchase:','');
    showAppConfirm('حذف عملية البطاقة', 'سيتم حذف العملية وأقساطها المرتبطة مع الاحتفاظ بنسخة قابلة للاستعادة. هل تريد المتابعة؟', ()=>{
      const op=(state.cardOps||[]).find(o=>String(o.id)===opId);
      const linkedPayments=(state.transactions||[]).filter(x=>!x.deletedAt&&String(x.linkedCardOpId||'')===opId&&Number(x.settledAmount??x.amount)>0);
      if(linkedPayments.length){toast('لا يمكن حذف عملية البطاقة قبل إلغاء سجلات السداد المرتبطة بها. ألغِ السداد أولاً حتى لا تبقى دفعات بلا عملية أصلية.');return;}
      archiveCardPurchaseDeletion(t,op);
      state.transactions = state.transactions.filter(x=>String(x.id)!==String(id));
      if(opId) state.cardOps = state.cardOps.filter(o=>String(o.id)!==opId);
      syncCardInstallmentsToCommitments();
      persist(); refreshSecondaryFeeds(); toast('تم الحذف والاحتفاظ بنسخة للاستعادة ✓');
    }, true);
    return;
  }
  deleteTransaction(id);
}

function deleteTransaction(id){
  showAppConfirm('إلغاء الحركة', 'سيتم إلغاء تأثير الحركة على الأرصدة مع الاحتفاظ بها في سجل المحذوفات لإمكانية استعادتها. هل تريد المتابعة؟', async()=>{
    const txObj = state.transactions.find(x=>String(x.id)===String(id));
    if(!txObj)return;
    if(txObj.source==='card-payment'||txObj.source==='commitment-payment'||txObj.linkedCardPaymentRecordId||txObj.linkedCommitmentPaymentId){await cancelAndDeleteLinkedPaymentTx(txObj.id);refreshSecondaryFeeds();return;}
    state.cancelledTransactions=Array.isArray(state.cancelledTransactions)?state.cancelledTransactions:[];
    const clone=value=>value?JSON.parse(JSON.stringify(value)):null;
    const related={
      commitmentPayment:clone(findLinkedCommitmentPaymentForTransaction(txObj)),
      cardPayment:clone((state.cardPayments||[]).find(x=>String(x.id)===String(txObj.linkedCardPaymentRecordId))),
      cardOp:(()=>{const op=(state.cardOps||[]).find(x=>String(x.id)===String(txObj.linkedCardOpId));return op?{id:op.id}:null;})()
    };
    revertLinkedPaymentOnTxDelete(txObj);
    state.transactions=state.transactions.filter(x=>String(x.id)!==String(id));
    state.cancelledTransactions.unshift({transaction:clone(txObj),related,cancelledAt:new Date().toISOString()});
    state.cancelledTransactions=state.cancelledTransactions.slice(0,500);
    persist();
    refreshSecondaryFeeds();
    toast('تم إلغاء الحركة والاحتفاظ بها في سجل المحذوفات ✓');
  }, true);
}

function refreshSecondaryFeeds(){
  if(activeStatementState && document.getElementById('statementFullModal')?.classList.contains('show')){
    renderFullStatementModalContent();
  }
  if(activeCatDrillState){
    renderCategoryDrillDownContent();
  }
}




// Share one measured amount column across visible daily rows, including explicit separators.
function alignTransactionAmountColumns(feed){
  if(!feed)return;
  const amounts=[...feed.querySelectorAll('.tx-amt-col')];
  if(!amounts.length||!feed.getBoundingClientRect().width)return;
  let width=98;
  for(const el of amounts){
    const range=document.createRange();range.selectNodeContents(el);
    const cs=getComputedStyle(el);
    width=Math.max(width,Math.ceil(range.getBoundingClientRect().width)+Math.max(8,parseFloat(cs.paddingLeft)||0)+Math.max(1,parseFloat(cs.borderLeftWidth)||0));
  }
  const value=width+'px';if(feed.style.getPropertyValue('--tx-amount-width')!==value)feed.style.setProperty('--tx-amount-width',value);
  if(!feed._amountColumnObserver&&typeof ResizeObserver!=='undefined'){
    feed._amountColumnObserver=new ResizeObserver(()=>alignTransactionAmountColumns(feed));
    feed._amountColumnObserver.observe(feed);
  }
}
