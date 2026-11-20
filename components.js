/* X-Wallet V14.0 module: components.js | Extracted from V13.40 app.js */

/* ---- Original app.js lines 193-430 ---- */
let _appDialogState = null;
function closeAppDialog(){
  const m = document.getElementById('appDialogModal');
  if(m) m.classList.remove('show');
  const actBar = document.getElementById('appDialogActionsBar');
  if(actBar) actBar.style.display = 'flex';
  _appDialogState = null;
}
function showAppConfirm(title, msg, onConfirm, isDanger){
  _appDialogState = { mode:'confirm', onConfirm };
  document.getElementById('appDialogTitle').textContent = title || 'تأكيد';
  const msgEl = document.getElementById('appDialogMsg');
  msgEl.textContent = msg || '';
  msgEl.style.display = 'block';
  document.getElementById('appDialogInputWrap').style.display = 'none';
  document.getElementById('appDialogCustomBody').style.display = 'none';
  document.getElementById('appDialogActionsBar').style.display = 'flex';
  const okBtn = document.getElementById('appDialogOkBtn');
  okBtn.textContent = 'تأكيد';
  okBtn.style.background = isDanger ? 'var(--red)' : 'var(--mint)';
  okBtn.style.color = isDanger ? '#fff' : '#06221e';
  document.getElementById('appDialogModal').classList.add('show');
}
function showAppPrompt(title, placeholder, initialValue, onSubmit, multiline, inputType){
  _appDialogState = { mode: multiline ? 'textarea' : 'prompt', onSubmit };
  document.getElementById('appDialogTitle').textContent = title || 'إدخال';
  document.getElementById('appDialogMsg').style.display = 'none';
  document.getElementById('appDialogCustomBody').style.display = 'none';
  document.getElementById('appDialogActionsBar').style.display = 'flex';
  const wrap = document.getElementById('appDialogInputWrap');
  wrap.style.display = 'block';
  const inp = document.getElementById('appDialogInput');
  const txt = document.getElementById('appDialogTextarea');
  if(multiline){
    inp.style.display = 'none';
    txt.style.display = 'block';
    txt.placeholder = placeholder || '';
    txt.value = initialValue || '';
    setTimeout(()=>txt.focus(), 60);
  } else {
    txt.style.display = 'none';
    inp.style.display = 'block';
    inp.type = inputType || 'text';
    inp.placeholder = placeholder || '';
    inp.value = initialValue || '';
    setTimeout(()=>inp.focus(), 60);
  }
  const okBtn = document.getElementById('appDialogOkBtn');
  okBtn.textContent = 'تأكيد';
  okBtn.style.background = 'var(--mint)';
  okBtn.style.color = '#06221e';
  document.getElementById('appDialogModal').classList.add('show');
}
function showAppCustomForm(title, bodyHtml, onSubmit, hideDefaultActions){
  _appDialogState = { mode:'custom', onSubmit };
  document.getElementById('appDialogTitle').textContent = title || 'تعديل';
  document.getElementById('appDialogMsg').style.display = 'none';
  document.getElementById('appDialogInputWrap').style.display = 'none';
  const cb = document.getElementById('appDialogCustomBody');
  cb.innerHTML = bodyHtml;
  cb.style.display = 'block';
  document.getElementById('appDialogActionsBar').style.display = hideDefaultActions ? 'none' : 'flex';
  const okBtn = document.getElementById('appDialogOkBtn');
  okBtn.textContent = 'حفظ';
  okBtn.style.background = 'var(--mint)';
  okBtn.style.color = '#06221e';
  document.getElementById('appDialogModal').classList.add('show');
  syncCustomSelectTriggers();
}
function submitAppDialog(){
  if(!_appDialogState) return;
  const st = _appDialogState;
  if(st.mode === 'confirm'){
    closeAppDialog();
    if(st.onConfirm) st.onConfirm();
  } else if(st.mode === 'prompt'){
    const v = document.getElementById('appDialogInput')?.value || '';
    closeAppDialog();
    if(st.onSubmit) st.onSubmit(v);
  } else if(st.mode === 'textarea'){
    const v = document.getElementById('appDialogTextarea')?.value || '';
    closeAppDialog();
    if(st.onSubmit) st.onSubmit(v);
  } else if(st.mode === 'custom'){
    if(st.onSubmit && st.onSubmit() !== false){
      closeAppDialog();
    }
  }
}

/* Back-Button Handling */
let _allowExit = false;
function armBackGuard(){
  try{
    history.replaceState({xwGuard:1}, '');
    history.pushState({xwGuard:2}, '');
  }catch(_){}
}
function cancelExitApp(){
  const m = document.getElementById('exitConfirmModal');
  if(m) m.classList.remove('show');
  try{ history.pushState({xwGuard:2}, ''); }catch(_){}
}
function confirmExitApp(){
  _allowExit = true;
  const m = document.getElementById('exitConfirmModal');
  if(m) m.classList.remove('show');
  try{ window.close(); }catch(_){}
  try{ history.go(-2); }catch(_){}
}
armBackGuard();
document.addEventListener('pointerdown', function _onceArm(){
  armBackGuard();
  document.removeEventListener('pointerdown', _onceArm);
}, {passive:true});
window.addEventListener('popstate', function(){
  if(_allowExit) return;
  const ym = document.getElementById('ymModal');
  if(ym && ym.classList.contains('show')){ ym.classList.remove('show'); try{history.pushState({xwGuard:2},'');}catch(_){} return; }
  const cs = document.getElementById('customSelectModal');
  if(cs && cs.classList.contains('show')){ closeCustomSelectModal(); try{history.pushState({xwGuard:2},'');}catch(_){} return; }
  const ad = document.getElementById('appDialogModal');
  if(ad && ad.classList.contains('show')){ closeAppDialog(); try{history.pushState({xwGuard:2},'');}catch(_){} return; }
  const am = document.getElementById('accountModal');
  if(am && am.classList.contains('show')){ closeAccountModal(); try{history.pushState({xwGuard:2},'');}catch(_){} return; }
  const qm = document.getElementById('quickModal');
  if(qm && qm.classList.contains('show')){ closeQuickModal(); try{history.pushState({xwGuard:2},'');}catch(_){} return; }
  const ab = document.getElementById('aboutAppModal');
  if(ab && ab.classList.contains('show')){ ab.classList.remove('show'); try{history.pushState({xwGuard:2},'');}catch(_){} return; }
  const ssm = document.getElementById('settingsSubModal');
  if(ssm && ssm.classList.contains('show')){ closeSettingsSubPage(); try{history.pushState({xwGuard:2},'');}catch(_){} return; }
  const tg = document.getElementById('themeGridModal');
  if(tg && tg.classList.contains('show')){ tg.classList.remove('show'); try{history.pushState({xwGuard:2},'');}catch(_){} return; }
  const salm = document.getElementById('salaryModal');
  if(salm && salm.classList.contains('show')){ closeSalaryModal(); try{history.pushState({xwGuard:2},'');}catch(_){} return; }
  const anm = document.getElementById('annualReportModal');
  if(anm && anm.classList.contains('show')){ closeAnnualReportModal(); try{history.pushState({xwGuard:2},'');}catch(_){} return; }
  const cm = document.getElementById('catsManagerModal');
  if(cm && cm.classList.contains('show')){ closeCategoriesManagerModal(); try{history.pushState({xwGuard:2},'');}catch(_){} return; }
  const sm = document.getElementById('statementFullModal');
  if(sm && sm.classList.contains('show')){ closeFullStatementModal(); try{history.pushState({xwGuard:2},'');}catch(_){} return; }
  if(activeCatDrillState){ closeCatDetailModal(); try{history.pushState({xwGuard:2},'');}catch(_){} return; }

  const speedWrap = document.getElementById('fabSpeedWrap');
  if(speedWrap && speedWrap.classList.contains('open')){
    speedWrap.classList.remove('open');
    try{history.pushState({xwGuard:2},'');}catch(_){}
    return;
  }
  const searchRow = document.getElementById('transSearchRow');
  const searchBox = document.getElementById('mmSearchBox');
  const searchInp = document.getElementById('actSearch');
  const comSearchWrap = document.getElementById('comSearchBarWrap');
  const comSearchInp = document.getElementById('comSearch');
  const isSearchRowOpen = !!(searchRow && searchRow.style.display !== 'none');
  const isFilterBoxOpen = !!(searchBox && searchBox.style.display !== 'none');
  const isComSearchOpen = !!(comSearchWrap && comSearchWrap.style.display !== 'none');
  if(_transSearchActive || isSearchRowOpen || isFilterBoxOpen || (searchInp && searchInp.value) || hasAnyTransAdvFilter()){
    _transSearchActive = false;
    if(searchRow) searchRow.style.display = 'none';
    if(searchBox) searchBox.style.display = 'none';
    if(searchInp) searchInp.blur();
    document.getElementById('btnToggleTransSearchHdr')?.classList.remove('active');
    document.getElementById('btnToggleFilterHdr')?.classList.remove('active');
    clearTransactionsSearch();
    updateFabVisibility();
    toast('تم إلغاء البحث');
    try{history.pushState({xwGuard:2},'');}catch(_){}
    return;
  }
  if(isComSearchOpen || (comSearchInp && comSearchInp.value)){
    if(comSearchWrap) comSearchWrap.style.display = 'none';
    if(comSearchInp){ comSearchInp.value = ''; comSearchInp.blur(); }
    document.getElementById('btnToggleComSearchHdr')?.classList.remove('active');
    if(typeof renderPlanScreen === 'function') renderPlanScreen();
    try{history.pushState({xwGuard:2},'');}catch(_){}
    return;
  }
  const anaRow = document.getElementById('anaSearchRow');
  const anaInp = document.getElementById('anaSearchInp');
  if((anaRow && anaRow.style.display !== 'none') || (anaInp && anaInp.value)){
    if(anaRow) anaRow.style.display = 'none';
    if(anaInp){ anaInp.value = ''; anaInp.blur(); }
    document.getElementById('btnToggleAnaSearchHdr')?.classList.remove('active');
    if(typeof renderReportsScreen === 'function') renderReportsScreen();
    try{history.pushState({xwGuard:2},'');}catch(_){}
    return;
  }

  const activePage = document.querySelector('.screen.active')?.id;
  if(activePage === 'trans' && activeTransSubTab === 'monthly'){
    homePeriodMode = 'monthly';
    switchTransSubTab('daily');
    renderTransactionsScreen();
    try{history.pushState({xwGuard:2},'');}catch(_){}
    return;
  }
  if(activePage && activePage !== 'trans'){
    go('trans', document.querySelector('.nav[data-page="trans"]'));
    try{history.pushState({xwGuard:2},'');}catch(_){}
    return;
  }
  const em = document.getElementById('exitConfirmModal');
  if(em){
    em.classList.add('show');
  }
  try{ history.pushState({xwGuard:2}, ''); }catch(_){}
});

/* Auto-Collapse Accordions */
document.addEventListener('toggle', function(e){
  const target = e.target;
  if(target && target.tagName === 'DETAILS' && target.classList.contains('fold') && target.open){
    const scope = target.closest('.screen') || document;
    scope.querySelectorAll('details.fold[open]').forEach(other=>{
      if(other !== target && !other.contains(target) && !target.contains(other)){
        other.removeAttribute('open');
      }
    });
  }
}, true);

/* Context-Aware Floating + Button (.fab) */
function handleFabClick(){
  const activePage = document.querySelector('.screen.active')?.id || 'trans';
  if(activePage === 'trans' || activePage === 'reports'){
    openQuickAddModal(activePage === 'reports' && activeReportTab === 'inc' ? 'income' : 'expense');
    return;
  }
  if(activePage === 'wallet'){
    const isCardTab = document.getElementById('tabBtnCard')?.classList.contains('active');
    const foldId = isCardTab ? 'addCardFold' : 'addAccountFold';
    const inputId = isCardTab ? 'cardName' : 'accName';
    const fold = document.getElementById(foldId);
    if(fold){
      fold.open = !fold.open;
      if(fold.open){
        fold.scrollIntoView({behavior:'smooth', block:'start'});
        setTimeout(()=>document.getElementById(inputId)?.focus(), 120);
      }
    }
    return;
  }
  if(activePage === 'plan'){
    const isYrTab = document.getElementById('tabBtnYr')?.classList.contains('active');
    const foldId = isYrTab ? 'addManualAnnualFold' : 'addCommitmentFold';
    const fold = document.getElementById(foldId);
    if(fold){
      fold.open = !fold.open;
      if(fold.open){
        fold.scrollIntoView({behavior:'smooth', block:'start'});
      }
    }
    return;
  }
  if(activePage === 'settings'){
    const catsFold = document.getElementById('settingsCatsFold');
    if(catsFold && catsFold.open){
      addMainCategoryInSettings();
      return;
    }
    openQuickAddModal('expense');
  }
}

/* 8.2 10 Theme Colors (5 Top + 5 Bottom) + 4 Background Modes */

/* ---- Original app.js lines 4357-4493 ---- */
/* Compact Month/Year Picker Dialog */
let ymPickerState = {year:activeYear, month:activeMonth, allowClear:false, onSelect:null};
function openHomePeriodPicker(){
  openCompactYMPicker(
    null,
    false,
    (chosenYM)=>{
      const [y,m] = chosenYM.split('-').map(Number);
      homePeriodMode = 'monthly';
      activeYear = y; activeMonth = m; forecastYear = y;
      renderAll();
    },
    (chosenYear)=>{
      homePeriodMode = 'yearly';
      activeYear = chosenYear; forecastYear = chosenYear;
      activeTransSubTab = 'monthly';
      renderAll();
    }
  );
}
function openCompactYMPicker(prefix, allowClear, customCb, onYearPick){
  let cur = prefix ? (val(prefix+'Val')||selected()) : selected();
  let [y,m] = cur.includes('-') ? cur.split('-').map(Number) : [activeYear, activeMonth];
  ymPickerState = {
    year: y, month: m, allowClear: !!allowClear,
    onYearPick: onYearPick || null,
    onSelect: (chosen)=>{
      if(prefix){
        setv(prefix+'Val', chosen);
        const lbl = document.getElementById(prefix+'Label');
        if(lbl) lbl.textContent = chosen ? formatYMArabic(chosen) : 'مفتوح';
      }
      if(customCb) customCb(chosen);
    }
  };
  renderCompactYMPicker();
}
function selectYMYearOnly(){
  document.getElementById('ymModal')?.classList.remove('show');
  if(ymPickerState.onYearPick){
    ymPickerState.onYearPick(ymPickerState.year);
  }
}
function renderCompactYMPicker(){
  let d = document.getElementById('ymModal');
  if(!d){
    d = document.createElement('div'); d.id='ymModal'; d.className='modal center-modal';
    d.onclick = e=>{ if(e.target===d) d.classList.remove('show'); };
    d.innerHTML = '<div class="sheet"><h3>اختر الشهر والسنة</h3><div id="ymModalBody"></div></div>';
    document.body.appendChild(d);
  }
  const grid = monthNamesAr.map((n,i)=>`<button type="button" class="ym-cell ${(i+1)===ymPickerState.month?'active':''}" onclick="selectYMCell(${i+1})">${n}</button>`).join('');
  const yearCenterHtml = ymPickerState.onYearPick
    ? `<button type="button" onclick="selectYMYearOnly()" style="width:auto;padding:0 16px;border-color:var(--mint);color:var(--mint);font-weight:700" title="اضغط لعرض السنة بالكامل">${ymPickerState.year}</button>`
    : `<b>${ymPickerState.year}</b>`;
  document.getElementById('ymModalBody').innerHTML = `
    <div class="ym-year-bar">
      <button type="button" onclick="ymPickerState.year--;renderCompactYMPicker()">‹</button>
      ${yearCenterHtml}
      <button type="button" onclick="ymPickerState.year++;renderCompactYMPicker()">›</button>
    </div>
    <div class="ym-grid">${grid}</div>
    ${ymPickerState.allowClear?'<button type="button" class="secondary" style="width:100%;margin-top:8px" onclick="clearYMCell()">مفتوح (بدون نهاية)</button>':''}
  `;
  d.classList.add('show');
}
function selectYMCell(m){
  document.getElementById('ymModal').classList.remove('show');
  const res = String(ymPickerState.year)+'-'+String(m).padStart(2,'0');
  if(ymPickerState.onSelect) ymPickerState.onSelect(res);
}
function clearYMCell(){
  document.getElementById('ymModal').classList.remove('show');
  if(ymPickerState.onSelect) ymPickerState.onSelect('');
}

/* Custom Centered Select Modal (Always opens on top of any open modal!) */
let _activeNativeSelect = null;
function closeCustomSelectModal(){
  const m = document.getElementById('customSelectModal');
  if(m) m.classList.remove('show');
  _activeNativeSelect = null;
}
function openCustomSelectFor(sel){
  if(!sel) return;
  _activeNativeSelect = sel;
  let rowLbl = sel.closest('.c-row')?.querySelector('label,.c-lbl')?.textContent?.replace(':','').trim();
  if(!rowLbl){
    if(sel.id === 'repPeriodMode') rowLbl = 'تحديد فترة التقرير';
    else if(sel.id === 'actAccountFilter') rowLbl = 'فلترة حسب الحساب';
    else rowLbl = 'اختر';
  }
  document.getElementById('csModalTitle').textContent = rowLbl;
  const opts = [...sel.options];
  document.getElementById('csModalOptions').innerHTML = opts.map((o, idx)=>`
    <button type="button" class="cs-opt-btn ${o.selected?'selected':''}" onclick="pickCustomSelectOption(${idx})">
      <span>${esc(o.textContent)}</span>
      <span>${o.selected?'●':'○'}</span>
    </button>
  `).join('');
  document.getElementById('customSelectModal').classList.add('show');
}
function pickCustomSelectOption(idx){
  if(_activeNativeSelect && _activeNativeSelect.options[idx]){
    _activeNativeSelect.selectedIndex = idx;
    _activeNativeSelect.dispatchEvent(new Event('change', {bubbles:true}));
    syncCustomSelectTriggers();
  }
  closeCustomSelectModal();
}
function syncCustomSelectTriggers(){
  document.querySelectorAll('select').forEach(sel=>{
    if(sel.getAttribute('data-no-custom')==='1') return;
    let trig = sel.nextElementSibling;
    if(!trig || !trig.classList.contains('custom-sel-trigger')){
      sel.style.display = 'none';
      trig = document.createElement('div');
      trig.className = 'custom-sel-trigger';
      if(sel.id === 'repPeriodMode' || sel.id === 'actAccountFilter'){
        trig.style.width = '100%';
        trig.style.maxWidth = '100%';
        trig.style.height = sel.id === 'actAccountFilter' ? '40px' : '34px';
      }
      trig.innerHTML = '<span class="cs-val"></span><span class="cs-arr">▼</span>';
      trig.onclick = () => openCustomSelectFor(sel);
      sel.parentNode.insertBefore(trig, sel.nextSibling);
    }
    const curOpt = sel.options[sel.selectedIndex];
    const optTxt = curOpt ? curOpt.textContent : '';
    if(sel.id === 'repPeriodMode'){
      trig.querySelector('.cs-val').innerHTML = `<span style="color:var(--mint);font-size:.82rem">📅</span><span>${esc(optTxt)}</span>`;
    } else {
      trig.querySelector('.cs-val').textContent = optTxt;
    }
  });
}


/* ---- Original app.js lines 4624-4748 ---- */
/* Bilingual Translation Engine */
const UI_TEXT_PAIRS = [
  ['المعاملات', 'Transactions'],
  ['تحليل المعاملات', 'Analytics'],
  ['الحسابات', 'Accounts'],
  ['البطاقات', 'Cards'],
  ['الالتزامات', 'Commitments'],
  ['المزيد', 'More'],
  ['المعاملات اليومية', 'Daily Transactions'],
  ['الملخص الشهري', 'Monthly Summary'],
  ['الدخل', 'Income'],
  ['المصروفات', 'Expenses'],
  ['الصافي', 'Net'],
  ['إجمالي أرصدة الحسابات', 'Total Accounts Balance'],
  ['إضافة حساب', 'Add Account'],
  ['الحسابات المسجلة', 'Registered Accounts'],
  ['إجمالي أرصدة البطاقات', 'Total Cards Balance'],
  ['إضافة بطاقة', 'Add Card'],
  ['البطاقات المسجلة', 'Registered Cards'],
  ['التقرير المالي السنوي', 'Yearly Financial Report'],
  ['إضافة معاملة', 'Add Transaction'],
  ['مدفوعات مستحقة', 'Due Payments'],
  ['التزامات شهرية', 'Monthly Commitments'],
  ['معاملات بالبطاقة', 'Card Operations'],
  ['مستحقات الشهر', 'Monthly Dues'],
  ['جميع المستحقات', 'All Commitments'],
  ['إعدادات عامة', 'General Settings'],
  ['الخصوصية والأمان', 'Privacy & Security'],
  ['حاسبة المرتب', 'Salary Calculator'],
  ['تخصيص الأقسام', 'Customize Categories'],
  ['النسخ الاحتياطي', 'Backup & Restore'],
  ['التحديثات', 'Updates'],
  ['مسح البيانات', 'Wipe Data'],
  ['تسجيل حركة جديدة', 'New Transaction'],
  ['مصروف', 'Expense'],
  ['دخل', 'Income'],
  ['تحويل', 'Transfer'],
  ['التاريخ', 'Date'],
  ['الحساب', 'Account'],
  ['من حساب', 'From Account'],
  ['إلى حساب', 'To Account'],
  ['القسم', 'Category'],
  ['المبلغ', 'Amount'],
  ['السجل', 'Records'],
  ['المعاملات', 'Transactions'],
  ['المحفظة', 'Wallet'],
  ['المزيد', 'More'],
  ['الحسابات', 'Accounts'],
  ['البطاقات', 'Cards'],
  ['الالتزامات', 'Commitments'],
  ['إضافة معاملة', 'Add Transaction'],
  ['تعديل معاملة', 'Edit Transaction'],
  ['إعدادات عامة', 'General Settings'],
  ['إعدادات المظهر', 'Appearance Settings'],
  ['الخصوصية والأمان', 'Privacy & Security'],
  ['زر الاختصارات العائم', 'Floating Shortcuts'],
  ['حاسبة المرتب', 'Salary Calculator'],
  ['مدخلات الشهر', 'Monthly Inputs'],
  ['إعدادات مرتب السنة', 'Annual Salary Settings'],
  ['التقرير السنوي', 'Annual Report'],
  ['تخصيص الأقسام', 'Categories Manager'],
  ['النسخ الاحتياطي والمزامنة', 'Backup & Sync'],
  ['التحديثات', 'Updates'],
  ['مسح البيانات', 'Wipe Data'],
  ['العملة الافتراضية', 'Default Currency'],
  ['بداية الشهر المالي', 'Month Start Day'],
  ['وضع الخلفية', 'Background Mode'],
  ['لون الثيم', 'Theme Color'],
  ['اختيار اللون', 'Choose Color'],
  ['نوع الخط', 'Font Family'],
  ['إخفاء الأرقام (العين)', 'Hide Numbers (Eye)'],
  ['الكسور العشرية', 'Decimals (.00)'],
  ['رمز المرور', 'Passcode (PIN)'],
  ['بصمة الجهاز', 'Biometric Lock'],
  ['قفل فتح التطبيق', 'Lock on Startup'],
  ['قفل إظهار الأرقام', 'Lock Unmasking'],
  ['تجميع الأزرار العائمة', 'Group Floating Buttons'],
  ['عرض أيقونات فقط', 'Icons Only'],
  ['النسخ الاحتياطي', 'Local Backup'],
  ['النسخ السحابي', 'Cloud Backup'],
  ['المزامنة', 'Cloud Sync'],
  ['المزامنة الآن', 'Sync Now'],
  ['إعداد الربط', 'Sync Setup'],
  ['النسخ التلقائي', 'Auto Backup'],
  ['نسخ تلقائية محلية', 'Local Snapshots'],
  ['عرض النسخ', 'View Snapshots'],
  ['تصدير', 'Export'],
  ['استيراد', 'Import'],
  ['حفظ الإعدادات', 'Save Settings'],
  ['حفظ المظهر', 'Save Appearance'],
  ['حفظ الأمان', 'Save Security'],
  ['تصفير المعاملات والأقسام', 'Clear Transactions & Categories'],
  ['حذف كل بيانات التطبيق', 'Reset All Data'],
  ['تصفير', 'Clear'],
  ['مسح الكل', 'Reset All'],
  ['تثبيت التطبيق', 'Install App'],
  ['📲 تثبيت التطبيق', '📲 Install App'],
  ['الإصدار الحالي', 'Current Version'],
  ['فحص التحديثات', 'Check Updates'],
  ['مديرك المالي الذكي', 'Your Smart Finance Manager'],
  ['رسوم', 'Fee'],
  ['ملاحظات', 'Notes'],
  ['الوصف', 'Description'],
  ['حفظ', 'Save'],
  ['إلغاء', 'Cancel'],
  ['إغلاق', 'Close']
];

function applyLanguageTranslations(lang){
  const isEn = (lang === 'en');
  updateTopTabTitle();
  const map = new Map(UI_TEXT_PAIRS.map(([ar, en]) => isEn ? [ar, en] : [en, ar]));
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
  let node;
  while((node = walker.nextNode())){
    const raw = node.nodeValue.trim();
    if(raw && map.has(raw)){
      node.nodeValue = node.nodeValue.replace(raw, map.get(raw));
    }
  }
  const searchInp = document.getElementById('actSearch');
  if(searchInp) searchInp.placeholder = isEn ? 'Search' : 'ابحث';
  syncCustomSelectTriggers();
}

