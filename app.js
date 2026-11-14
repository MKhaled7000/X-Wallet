/* Core constants loaded from core.js */

let state;
try{state=JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){state=null}
if(!state||!Array.isArray(state.transactions))state={transactions:[],paid:0,savings:0,debtTotal:0};
state.salaryConfig=state.salaryConfig||{};
state.salaryMonths=state.salaryMonths||{};
state.cards=state.cards||[];
state.cardOps=state.cardOps||[];
state.cardPayments=state.cardPayments||[];
state.commitments=state.commitments||[];
state.commitmentPayments=state.commitmentPayments||[];
state.accounts=state.accounts||[];
state.ledger=state.ledger||[];
state.importBatches=state.importBatches||[];
state.reportDefaults=state.reportDefaults||{};
state.annualPlanItems=Array.isArray(state.annualPlanItems)?state.annualPlanItems:[];
state.categories=Array.isArray(state.categories)?state.categories:[];
state.incomeCategories=Array.isArray(state.incomeCategories)?state.incomeCategories:[];
state.categoryTree=state.categoryTree||{expense:{}, income:{}};
state.prefs=state.prefs||{
  lang:'ar',fontFamily:'system',fontSize:'1',theme:'mint',bgMode:'dark',userName:'',defaultAccount:'',
  privacy:false,homeDecimals:false,secPin:'',bioEnabled:false,bioCredentialId:'',
  appLockOnStart:true,bioOnPrivacy:true,autoDriveFreq:'off',lastDriveBackup:'',
  driveEmail:'',driveWebhookUrl:'',driveClientId:'',driveAccessToken:''
};

function syncCategoryTrees(){
  state.categoryTree = state.categoryTree || {expense:{}, income:{}};
  state.categoryTree.expense = state.categoryTree.expense || {};
  state.categoryTree.income = state.categoryTree.income || {};
  const expSubsSet = new Set(Object.values(state.categoryTree.expense).flat());
  const incSubsSet = new Set(Object.values(state.categoryTree.income).flat());
  for(const c of (state.categories||[])){
    if(c && !state.categoryTree.expense[c] && !expSubsSet.has(c)){
      state.categoryTree.expense[c] = [];
    }
  }
  for(const c of (state.incomeCategories||[])){
    if(c && !state.categoryTree.income[c] && !incSubsSet.has(c)){
      state.categoryTree.income[c] = [];
    }
  }
  for(const tx of (state.transactions||[])){
    if(tx.type !== 'expense' && tx.type !== 'income') continue;
    const tree = tx.type === 'income' ? state.categoryTree.income : state.categoryTree.expense;
    const catList = tx.type === 'income' ? state.incomeCategories : state.categories;
    const mc = String(tx.category||'').trim();
    const sc = String(tx.subCategory||'').trim();
    if(mc){
      if(!tree[mc]) tree[mc] = [];
      if(!catList.includes(mc)) catList.push(mc);
      if(sc && !tree[mc].includes(sc)) tree[mc].push(sc);
    }
  }
}
// Migrate legacy autoSnapshots out of state so backup files stay tiny & fast
let _autoSnapshotsMemory = [];
try{
  const rawSnaps = localStorage.getItem(SNAP_KEY);
  if(rawSnaps) _autoSnapshotsMemory = JSON.parse(rawSnaps) || [];
}catch(_){}
if(Array.isArray(state.autoSnapshots) && state.autoSnapshots.length){
  if(!_autoSnapshotsMemory.length) _autoSnapshotsMemory = state.autoSnapshots.slice(0, 5);
  delete state.autoSnapshots;
  try{ localStorage.setItem(SNAP_KEY, JSON.stringify(_autoSnapshotsMemory)); }catch(_){}
}
// Migrate plain-text PIN to hashed PIN automatically
if(state.prefs && state.prefs.secPin && !state.prefs.secPinHash){
  state.prefs.secPinHash = fallbackHashPin(state.prefs.secPin);
  delete state.prefs.secPin;
}
syncCategoryTrees();

let activeYear = new Date().getFullYear();
let activeMonth = new Date().getMonth() + 1;
let homePeriodMode = 'monthly';
let forecastYear = activeYear;
let activeCatDrillState = null; // { catName, txType, subFilter }
let activeStatementState = null; // { kind: 'account'|'card', id, year, month, allMonths }

const fmt=n=>(Math.round((Number(n)||0)*100)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtInt=n=>Math.round(Number(n)||0).toLocaleString('en-US');
const fmtNum=n=>(state.prefs?.homeDecimals ? fmt(n) : fmtInt(n));
const egp=n=>fmt(n)+' EGP';
const egpSmart=n=>fmtNum(n)+' EGP';
const maskable=str=>state.prefs?.privacy ? '••••' : str;
const monthKey=d=>String(d||'').slice(0,7);
const selected=()=>String(activeYear)+'-'+String(activeMonth).padStart(2,'0');
const num=id=>Number(document.getElementById(id)?.value)||0;
const val=id=>document.getElementById(id)?.value||'';
const setv=(id,v)=>{let e=document.getElementById(id);if(e)e.value=v??''};
const round2=x=>Math.round((Number(x)||0)*100)/100;
const ceilTo=(x,step)=>Math.ceil(x/step)*step;

let _toastTimer = null;
function toast(s){
  let x = document.getElementById('toast');
  if(!x) return;
  x.textContent = s;
  x.style.display = 'block';
  if(_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(()=>{ x.style.display = 'none'; }, 2900);
}

function formatYMArabic(ym){
  if(!ym || !ym.includes('-')) return '—';
  const [y,m]=ym.split('-');
  const isEn = state.prefs?.lang === 'en';
  return `${(isEn ? monthNamesEn : monthNamesAr)[Number(m)-1]||m} ${y}`;
}
function addMonthsYM(ym, add){
  if(!ym || !ym.includes('-')) return selected();
  let [y, m] = ym.split('-').map(Number);
  const dt = new Date(y, (m - 1) + add, 1);
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
}

/* IndexedDB Dual-Storage Engine */
const IDB_NAME = 'XWalletSafeDB';
const IDB_STORE = 'state_store';

function openSafeIDB(){
  return new Promise((resolve, reject)=>{
    if(!('indexedDB' in window)) return reject(new Error('No IDB'));
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if(!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(req.error);
  });
}

function saveToIndexedDB(dataObj){
  openSafeIDB().then(db=>{
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(JSON.parse(JSON.stringify(dataObj)), KEY);
  }).catch(()=>{});
}

function recoverFromIndexedDBIfNeeded(){
  openSafeIDB().then(db=>{
    const tx = db.transaction(IDB_STORE, 'readonly');
    const getReq = tx.objectStore(IDB_STORE).get(KEY);
    getReq.onsuccess = () => {
      const idbState = getReq.result;
      const localEmpty = (!state.transactions || !state.transactions.length) && (!state.accounts || !state.accounts.length);
      if(idbState && Array.isArray(idbState.transactions) && localEmpty && (idbState.transactions.length || (idbState.accounts||[]).length)){
        state = idbState;
        syncCategoryTrees();
        applyPreferences();
        try{localStorage.setItem(KEY, JSON.stringify(state));}catch(_){}
        renderAll();
        toast('تمت استعادة بياناتك تلقائياً من الخزنة الآمنة IndexedDB ✓');
      } else {
        saveToIndexedDB(state);
      }
    };
  }).catch(()=>{});
  if(navigator.storage && navigator.storage.persist){
    navigator.storage.persist().catch(()=>{});
  }
}

function updateBackupStatusUI(){
  const lbl = document.getElementById('lastBackupLabel');
  if(lbl){
    const last = state.prefs?.lastBackupDate;
    lbl.textContent = last ? ('آخر نسخة: ' + last) : 'لم يتم التصدير بعد';
  }
  const drvEmail = document.getElementById('prefDriveEmail');
  if(drvEmail && document.activeElement !== drvEmail){
    drvEmail.value = state.prefs?.driveEmail || '';
  }
}

let _idbSaveTimer = null;
function persist(onlyActiveScreen){
  if(state && state.autoSnapshots) delete state.autoSnapshots;
  try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){}
  if(_idbSaveTimer) clearTimeout(_idbSaveTimer);
  _idbSaveTimer = setTimeout(()=>{
    saveToIndexedDB(state);
    triggerSilentAutoCloudSyncIfEnabled();
  }, 60);
  updateBackupStatusUI();
  renderActiveScreenOnly(onlyActiveScreen);
}

/* Custom Unified Dialog System */
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
  const cm = document.getElementById('catsManagerModal');
  if(cm && cm.classList.contains('show')){ closeCategoriesManagerModal(); try{history.pushState({xwGuard:2},'');}catch(_){} return; }
  const sm = document.getElementById('statementFullModal');
  if(sm && sm.classList.contains('show')){ closeFullStatementModal(); try{history.pushState({xwGuard:2},'');}catch(_){} return; }
  if(activeCatDrillState){ closeCatDetailModal(); try{history.pushState({xwGuard:2},'');}catch(_){} return; }

  const searchBox = document.getElementById('mmSearchBox');
  const searchInp = document.getElementById('actSearch');
  if((searchBox && searchBox.style.display !== 'none') || (searchInp && searchInp.value)){
    if(searchBox) searchBox.style.display = 'none';
    document.getElementById('btnToggleSearch')?.classList.remove('active');
    clearTransactionsSearch();
    toast('تم إلغاء البحث');
    try{history.pushState({xwGuard:2},'');}catch(_){}
    return;
  }

  const activePage = document.querySelector('.screen.active')?.id;
  if(activePage && activePage !== 'trans'){
    go('trans', document.querySelector('.nav[data-page="trans"]'));
    try{history.pushState({xwGuard:2},'');}catch(_){}
    return;
  }
  const em = document.getElementById('exitConfirmModal');
  if(em && !em.classList.contains('show')){
    em.classList.add('show');
  }
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
const THEMES = {
  mint:    {mint:'#43d6b2', mint2:'#1a9c94', h1:'#1b8f83', h2:'#145e68', h3:'#174b63'},
  blue:    {mint:'#569aff', mint2:'#2d68c4', h1:'#2563eb', h2:'#1e40af', h3:'#1e3a8a'},
  gold:    {mint:'#f5b041', mint2:'#b9770e', h1:'#b7791f', h2:'#744210', h3:'#5f370e'},
  purple:  {mint:'#a582ff', mint2:'#6b46c1', h1:'#6b46c1', h2:'#44337a', h3:'#322659'},
  rose:    {mint:'#fb7185', mint2:'#be123c', h1:'#e11d48', h2:'#9f1239', h3:'#881337'},
  cyan:    {mint:'#22d3ee', mint2:'#0891b2', h1:'#06b6d4', h2:'#0e7490', h3:'#155e75'},
  orange:  {mint:'#fb923c', mint2:'#c2410c', h1:'#ea580c', h2:'#9a3412', h3:'#7c2d12'},
  lime:    {mint:'#a3e635', mint2:'#4d7c0f', h1:'#65a30d', h2:'#3f6212', h3:'#365314'},
  indigo:  {mint:'#6366f1', mint2:'#4338ca', h1:'#4f46e5', h2:'#3730a3', h3:'#312e81'},
  emerald: {mint:'#10b981', mint2:'#047857', h1:'#059669', h2:'#065f46', h3:'#064e3b'}
};

let _pendingTheme = null;
let _pendingBgMode = null;

let _pendingFontFamily = null;
const FONT_STACKS = {
  'system': "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, 'Tahoma', sans-serif",
  'Noto Sans Arabic': "'Noto Sans Arabic', system-ui, sans-serif",
  'Roboto': "'Roboto', 'Noto Sans Arabic', system-ui, sans-serif",
  'Cairo': "'Cairo', system-ui, sans-serif",
  'Tajawal': "'Tajawal', system-ui, sans-serif",
  'Almarai': "'Almarai', system-ui, sans-serif",
  'Readex Pro': "'Readex Pro', system-ui, sans-serif"
};
function previewFontFamily(fontKey){
  _pendingFontFamily = fontKey || 'system';
  requestAnimationFrame(()=>{
    document.documentElement.style.setProperty('--app-font', FONT_STACKS[_pendingFontFamily] || FONT_STACKS.system);
  });
}
function previewBgMode(mode){
  _pendingBgMode = mode;
  document.documentElement.setAttribute('data-bg', mode || 'dark');
}
function selectTempTheme(thName){
  _pendingTheme = thName;
  document.querySelectorAll('.theme-dot').forEach(btn=>btn.classList.toggle('active', btn.dataset.theme===thName));
  const th = THEMES[thName] || THEMES.mint;
  document.documentElement.style.setProperty('--mint', th.mint);
  document.documentElement.style.setProperty('--mint2', th.mint2);
  document.documentElement.style.setProperty('--hero1', th.h1);
  document.documentElement.style.setProperty('--hero2', th.h2);
  document.documentElement.style.setProperty('--hero3', th.h3);
}
function applyPreferences(){
  const p = state.prefs || {};
  document.documentElement.style.setProperty('--scale', p.fontSize || '1');
  const fKey = p.fontFamily || 'system';
  document.documentElement.style.setProperty('--app-font', FONT_STACKS[fKey] || FONT_STACKS.system);
  setv('prefFontFamily', fKey);
  const bg = p.bgMode || 'dark';
  document.documentElement.setAttribute('data-bg', bg);
  setv('prefBgMode', bg);

  const th = THEMES[p.theme] || THEMES.mint;
  document.documentElement.style.setProperty('--mint', th.mint);
  document.documentElement.style.setProperty('--mint2', th.mint2);
  document.documentElement.style.setProperty('--hero1', th.h1);
  document.documentElement.style.setProperty('--hero2', th.h2);
  document.documentElement.style.setProperty('--hero3', th.h3);
  document.querySelectorAll('.theme-dot').forEach(btn=>btn.classList.toggle('active', btn.dataset.theme===(p.theme||'mint')));

  const lang = p.lang || 'ar';
  setv('prefLang', lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = 'ltr';
  setv('prefFontSize', p.fontSize || '1');
  setv('prefAutoDriveFreq', p.autoDriveFreq || 'off');
  if(typeof updateLocalAutoFreqBtnText === 'function') updateLocalAutoFreqBtnText();
  setv('prefDriveEmail', p.driveEmail || '');
  setv('secPinInput', (p.secPinHash || p.secPin) ? '••••' : '');
  setv('secAppLockOnStart', p.appLockOnStart === false ? '0' : '1');
  setv('secBioOnPrivacy', p.bioOnPrivacy === false ? '0' : '1');

  const bioBadge = document.getElementById('bioStatusBadge');
  if(bioBadge){
    bioBadge.textContent = p.bioEnabled ? 'البصمة مفعلة ✓' : 'اضغط لتسجيل البصمة';
    bioBadge.style.color = p.bioEnabled ? 'var(--mint)' : 'var(--text)';
  }

  document.querySelectorAll('.dec-toggle-btn').forEach(b=>{
    b.classList.toggle('active', !!p.homeDecimals);
    if(b.classList.contains('mm-tool-btn')) b.textContent = '.00';
    else b.textContent = lang === 'en' ? '.00 Decimals' : '.00 الكسور';
  });
  document.querySelectorAll('.privacy-toggle-btn').forEach(b=>{
    b.classList.toggle('active', !!p.privacy);
    if(b.classList.contains('mm-tool-btn')) b.textContent = p.privacy ? '🙈' : '👁';
    else b.textContent = p.privacy ? (lang === 'en' ? '🙈 Hidden' : '🙈 مخفي') : (lang === 'en' ? '👁 Privacy' : '👁 الإخفاء');
  });
  applyLanguageTranslations(lang);

  const defAccSel = document.getElementById('prefDefaultAcc');
  if(defAccSel){
    defAccSel.innerHTML = `<option value="">${lang==='en'?'None':'بدون افتراضي'}</option>` + state.accounts.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('');
    defAccSel.value = p.defaultAccount || '';
  }
}
function saveGeneralSettings(){
  state.prefs = state.prefs || {};
  state.prefs.lang = document.getElementById('prefLang')?.value || 'ar';
  state.prefs.fontFamily = _pendingFontFamily || document.getElementById('prefFontFamily')?.value || 'system';
  state.prefs.fontSize = document.getElementById('prefFontSize')?.value || '1';
  state.prefs.defaultAccount = document.getElementById('prefDefaultAcc')?.value || '';
  state.prefs.bgMode = _pendingBgMode || document.getElementById('prefBgMode')?.value || 'dark';
  if(_pendingTheme) state.prefs.theme = _pendingTheme;
  _pendingTheme = null;
  _pendingBgMode = null;
  _pendingFontFamily = null;
  applyPreferences();
  syncCustomSelectTriggers();
  persist();
  toast('تم حفظ الإعدادات ✓');
}
function toggleDecimalsMode(){
  state.prefs.homeDecimals = !state.prefs?.homeDecimals;
  applyPreferences();
  persist();
}

/* =========================================================
   8.4 APP LOCK ON STARTUP WITH BIOMETRICS & PIN + PRIVACY LOCK
   ========================================================= */
let _appUnlockedThisSession = false;

async function saveSecuritySettings(){
  state.prefs = state.prefs || {};
  const rawPin = val('secPinInput').trim();
  if(rawPin && rawPin !== '••••'){
    const devSalt = getOrCreateDeviceSalt();
    state.prefs.secPinSalt = devSalt;
    state.prefs.secPinHash = await hashPinPBKDF2(rawPin, devSalt);
  } else if(!rawPin){
    state.prefs.secPinHash = '';
    state.prefs.secPinSalt = '';
  }
  delete state.prefs.secPin;
  state.prefs.appLockOnStart = val('secAppLockOnStart') !== '0';
  state.prefs.bioOnPrivacy = val('secBioOnPrivacy') !== '0';
  applyPreferences();
  persist();
  toast('تم تشفير وحفظ إعدادات الخصوصية والأمان 🔒✓');
}

async function registerBiometricLock(){
  try{
    if(!window.PublicKeyCredential || !navigator.credentials){
      toast('المتصفح الحالي لا يدعم البصمة المباشرة؛ يمكنك استخدام رمز المرور PIN');
      return;
    }
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    const userId = new Uint8Array(16);
    crypto.getRandomValues(userId);
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'X-Wallet' },
        user: { id: userId, name: 'xwallet-user', displayName: 'X-Wallet User' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
        timeout: 60000
      }
    });
    if(cred && cred.rawId){
      const b64 = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
      state.prefs.bioEnabled = true;
      state.prefs.bioCredentialId = b64;
      state.prefs.appLockOnStart = true;
      _appUnlockedThisSession = true;
      applyPreferences();
      persist();
      toast('تم تفعيل البصمة لفتح التطبيق والأرقام 🫆✓');
    }
  }catch(err){
    toast('تعذر تسجيل البصمة أو تم الإلغاء');
  }
}

function checkAppLockOnBoot(){
  const p = state.prefs || {};
  const hasPin = !!(p.secPinHash || p.secPin);
  const shouldLock = p.appLockOnStart !== false && (p.bioEnabled || hasPin);
  const lockScreen = document.getElementById('appLockScreen');
  if(!shouldLock || _appUnlockedThisSession || !lockScreen) return;

  lockScreen.classList.add('show');
  const pinWrap = document.getElementById('lockPinWrap');
  if(pinWrap) pinWrap.style.display = hasPin ? 'flex' : 'none';

  if(p.bioEnabled){
    setTimeout(()=>unlockAppWithBiometrics(), 250);
  }
}

async function unlockAppWithBiometrics(){
  const p = state.prefs || {};
  if(p.bioEnabled && window.PublicKeyCredential && navigator.credentials){
    try{
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);
      const opts = {
        publicKey: {
          challenge,
          userVerification: 'required',
          timeout: 60000
        }
      };
      if(p.bioCredentialId){
        const bin = atob(p.bioCredentialId);
        const raw = new Uint8Array(bin.length);
        for(let i=0;i<bin.length;i++) raw[i] = bin.charCodeAt(i);
        opts.publicKey.allowCredentials = [{ type: 'public-key', id: raw }];
      }
      const assertion = await navigator.credentials.get(opts);
      if(assertion){
        _appUnlockedThisSession = true;
        document.getElementById('appLockScreen')?.classList.remove('show');
        
        return;
      }
    }catch(_){
      toast('اضغط فتح بالبصمة مرة أخرى أو أدخل الرمز');
    }
  } else if(p.secPinHash || p.secPin){
    document.getElementById('lockPinWrap').style.display = 'flex';
    document.getElementById('lockPinInput')?.focus();
  } else {
    _appUnlockedThisSession = true;
    document.getElementById('appLockScreen')?.classList.remove('show');
  }
}

async function unlockAppWithPin(){
  const p = state.prefs || {};
  const entered = val('lockPinInput').trim();
  const ok = await verifyEnteredPin(entered, p);
  if(ok){
    _appUnlockedThisSession = true;
    setv('lockPinInput', '');
    document.getElementById('appLockScreen')?.classList.remove('show');
    
  }
}

async function verifyBiometricOrPin(onSuccess){
  const p = state.prefs || {};
  const hasPin = !!(p.secPinHash || p.secPin);
  const needLock = p.bioOnPrivacy !== false && (p.bioEnabled || hasPin);
  if(!needLock){
    onSuccess();
    return;
  }
  if(p.bioEnabled && window.PublicKeyCredential && navigator.credentials){
    try{
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);
      const opts = {
        publicKey: {
          challenge,
          userVerification: 'required',
          timeout: 60000
        }
      };
      if(p.bioCredentialId){
        const bin = atob(p.bioCredentialId);
        const raw = new Uint8Array(bin.length);
        for(let i=0;i<bin.length;i++) raw[i] = bin.charCodeAt(i);
        opts.publicKey.allowCredentials = [{ type: 'public-key', id: raw }];
      }
      const assertion = await navigator.credentials.get(opts);
      if(assertion){
        onSuccess();
        return;
      }
    }catch(_){
      if(!hasPin){
        toast('لم يتم التحقق من البصمة');
        return;
      }
    }
  }
  if(hasPin){
    showAppPrompt('أدخل رمز المرور لإظهار الأرقام', 'رمز المرور (PIN)...', '', async (entered)=>{
      const ok = await verifyEnteredPin(entered, p);
      if(ok) onSuccess();
    }, false, 'password');
    return;
  }
  onSuccess();
}

function togglePrivacyMode(){
  if(state.prefs?.privacy){
    verifyBiometricOrPin(()=>{
      state.prefs.privacy = false;
      applyPreferences();
      persist();
      toast('تم إظهار الأرقام ✓');
    });
  } else {
    state.prefs.privacy = true;
    applyPreferences();
    persist();
    toast('تم إخفاء الأرقام 🙈');
  }
}

/* Navigation & Page Title Card */
const TAB_TITLES = {
  ar: { trans:'المعاملات', reports:'تحليل المعاملات', wallet:'المحفظة والالتزامات', plan:'التقرير السنوي', settings:'المزيد' },
  en: { trans:'Transactions', reports:'Analytics', wallet:'Wallet & Dues', plan:'Yearly Report', settings:'More' }
};

function updateTopTabTitle(pageId){
  const el = document.getElementById('topActiveTabTitle');
  if(!el) return;
  const curId = pageId || document.querySelector('.screen.active')?.id || 'trans';
  const lang = state.prefs?.lang || 'ar';
  if(curId === 'trans'){
    if(activeTransSubTab === 'yr') el.textContent = lang==='en' ? 'Yearly Report' : 'التقرير السنوي';
    else if(activeTransSubTab === 'monthly') el.textContent = lang==='en' ? 'Monthly Summary' : 'الملخص الشهري';
    else el.textContent = lang==='en' ? 'Transactions' : 'المعاملات';
    return;
  }
  if(curId === 'wallet'){
    const isCard = document.getElementById('tabBtnCard')?.classList.contains('active');
    const isCom = document.getElementById('tabBtnCom')?.classList.contains('active');
    if(isCom) el.textContent = lang==='en' ? 'Commitments' : 'الالتزامات';
    else if(isCard) el.textContent = lang==='en' ? 'Cards' : 'البطاقات';
    else el.textContent = lang==='en' ? 'Accounts' : 'الحسابات';
    return;
  }
  el.textContent = (TAB_TITLES[lang] || TAB_TITLES.ar)[curId] || '';
}

function updateFabVisibility(){
  const fab = document.querySelector('.fab');
  const fabS = document.getElementById('fabSearchBtn');
  const fabF = document.getElementById('fabFilterBtn');
  const fabM = document.getElementById('fabMonthlyBtn');
  const activePage = document.querySelector('.screen.active')?.id || 'trans';
  const isTransDaily = (activePage === 'trans' && activeTransSubTab === 'daily');
  const isTransMonthly = (activePage === 'trans' && activeTransSubTab === 'monthly');
  if(fab) fab.style.display = isTransDaily ? 'grid' : 'none';
  if(fabS){
    fabS.style.display = isTransDaily ? 'grid' : 'none';
    const hasQ = !!(document.getElementById('actSearch')?.value || '').trim();
    fabS.classList.toggle('active', hasQ);
    fabS.textContent = hasQ ? '✕' : '🔍';
  }
  if(fabF){
    fabF.style.display = isTransDaily ? 'grid' : 'none';
    const isFilterOpen = document.getElementById('mmSearchBox')?.style.display !== 'none';
    const hasAdv = (typeof hasAnyTransAdvFilter === 'function' && hasAnyTransAdvFilter());
    fabF.classList.toggle('active', isFilterOpen || hasAdv);
  }
  if(fabM){
    fabM.style.display = (isTransDaily || isTransMonthly) ? 'grid' : 'none';
    fabM.classList.toggle('active', isTransMonthly);
    fabM.textContent = isTransMonthly ? '✕' : '📅';
  }
}

function toggleFilterFromFab(){
  const box = document.getElementById('mmSearchBox');
  const isFilterOpen = box && box.style.display !== 'none';
  if(isFilterOpen || hasAnyTransAdvFilter()){
    closeAndClearSearchFilter();
  } else {
    toggleSearchFilterGrid();
  }
  updateFabVisibility();
}

function toggleSearchFromFab(){
  const inp = document.getElementById('actSearch');
  const hasQ = !!(inp?.value || '').trim();
  if(hasQ){
    if(inp) inp.value = '';
    onTransactionsSearchInput();
  } else {
    inp?.focus();
    inp?.scrollIntoView({behavior:'smooth', block:'center'});
  }
  updateFabVisibility();
}

function go(id, btn){
  if(document.getElementById('statementFullModal')?.classList.contains('show')) closeFullStatementModal();
  if(document.getElementById('catsManagerModal')?.classList.contains('show')) closeCategoriesManagerModal();
  document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));
  const t = document.getElementById(id);
  if(t) t.classList.add('active');
  document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active', x.dataset.page===id));
  if(btn) btn.classList.add('active');
  if(id === 'settings'){
    document.querySelectorAll('#settings details.fold[open]').forEach(f=>f.removeAttribute('open'));
  }
  updateTopTabTitle(id);
  updateFabVisibility();
  renderActiveScreenOnly();
  window.scrollTo(0,0);
}
function switchWalletTab(which){
  const w = (which === 'card' || which === 'com') ? which : 'acc';
  document.getElementById('walletViewAcc').style.display = w==='acc' ? 'block' : 'none';
  document.getElementById('walletViewCard').style.display = w==='card' ? 'block' : 'none';
  document.getElementById('walletViewCom').style.display = w==='com' ? 'block' : 'none';
  document.getElementById('tabBtnAcc')?.classList.toggle('active', w==='acc');
  document.getElementById('tabBtnCard')?.classList.toggle('active', w==='card');
  document.getElementById('tabBtnCom')?.classList.toggle('active', w==='com');
  updateTopTabTitle('wallet');
  if(w === 'com') renderPlanScreen();
  else renderAccountsAndCards();
}
function switchPlanTab(which){
  updateTopTabTitle('plan');
  renderYearlyExcelReport();
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

let activeReportCategoryFilter = null;
let transAdvFilter = { dateFrom:'', dateTo:'', accountId:'', accountLabel:'', mainCat:'', subCat:'', amountFrom:'', amountTo:'' };

function hasAnyTransAdvFilter(){
  return !!(transAdvFilter.dateFrom || transAdvFilter.dateTo || transAdvFilter.accountId || transAdvFilter.mainCat || transAdvFilter.subCat || transAdvFilter.amountFrom || transAdvFilter.amountTo);
}

function updateTransFilterGridUI(){
  const dCard = document.getElementById('fCardDate');
  const amCard = document.getElementById('fCardAmt');
  const aCard = document.getElementById('fCardAcc');
  const cCard = document.getElementById('fCardCat');
  const box = document.getElementById('mmSearchBox');
  const isFilterOpen = box && box.style.display !== 'none';
  const hasAny = hasAnyTransAdvFilter() || !!(document.getElementById('actSearch')?.value || '').trim();

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
    let dTxt = '';
    if(transAdvFilter.dateFrom && transAdvFilter.dateTo && transAdvFilter.dateFrom !== transAdvFilter.dateTo){
      dTxt = `${formatDateDMY(transAdvFilter.dateFrom).slice(0,5)}←${formatDateDMY(transAdvFilter.dateTo).slice(0,5)} ✕`;
    } else if(transAdvFilter.dateFrom || transAdvFilter.dateTo){
      dTxt = `${formatDateDMY(transAdvFilter.dateFrom || transAdvFilter.dateTo)} ✕`;
    }
    document.getElementById('fValDate').textContent = dTxt;
  }
  if(amCard){
    const hasA = !!(transAdvFilter.amountFrom || transAdvFilter.amountTo);
    amCard.classList.toggle('active', hasA);
    let aTxt = '';
    if(transAdvFilter.amountFrom && transAdvFilter.amountTo && transAdvFilter.amountFrom !== transAdvFilter.amountTo){
      aTxt = `${transAdvFilter.amountFrom}–${transAdvFilter.amountTo} ✕`;
    } else if(transAdvFilter.amountFrom || transAdvFilter.amountTo){
      aTxt = `${transAdvFilter.amountFrom || transAdvFilter.amountTo} ✕`;
    }
    document.getElementById('fValAmt').textContent = aTxt;
  }
  if(aCard){
    const hasAcc = !!transAdvFilter.accountId;
    aCard.classList.toggle('active', hasAcc);
    document.getElementById('fValAcc').textContent = hasAcc ? `${transAdvFilter.accountLabel} ✕` : '';
  }
  if(cCard){
    const hasCat = !!(transAdvFilter.mainCat || transAdvFilter.subCat);
    cCard.classList.toggle('active', hasCat);
    let cTxt = '';
    if(transAdvFilter.mainCat && transAdvFilter.subCat) cTxt = `${transAdvFilter.mainCat}/${transAdvFilter.subCat} ✕`;
    else if(transAdvFilter.mainCat || transAdvFilter.subCat) cTxt = `${transAdvFilter.mainCat || transAdvFilter.subCat} ✕`;
    document.getElementById('fValCat').textContent = cTxt;
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
  openTransFilterPrompt(kind);
}

function closeAndClearSearchFilter(){
  const box = document.getElementById('mmSearchBox');
  if(box) box.style.display = 'none';
  document.getElementById('btnToggleSearch')?.classList.remove('active');
  clearTransactionsSearch();
}

function toggleSearchFilterGrid(){
  const box = document.getElementById('mmSearchBox');
  const btn = document.getElementById('btnToggleSearch');
  if(!box) return;
  const open = box.style.display === 'none';
  box.style.display = open ? 'block' : 'none';
  btn?.classList.toggle('active', open || hasAnyTransAdvFilter());
  if(open && activeTransSubTab === 'monthly'){
    switchTransSubTab('daily');
  }
  updateTransFilterGridUI();
}
function toggleSearchBar(){
  toggleSearchFilterGrid();
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
            <input id="fltDateFromInp" type="date" value="${esc(defStart)}" onchange="document.getElementById('fltFromDisp').textContent=formatDateDMY(this.value)" style="position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer">
          </div>
        </div>
        <div class="c-row" onclick="openNativeInputPicker('fltDateToInp')">
          <label>إلى تاريخ</label>
          <div class="picker-trigger" style="position:relative">
            <b id="fltToDisp" dir="ltr">${formatDateDMY(defEnd)}</b>
            <input id="fltDateToInp" type="date" value="${esc(defEnd)}" onchange="document.getElementById('fltToDisp').textContent=formatDateDMY(this.value)" style="position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer">
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
  }
}

function selectTransFilterAccount(id, name){
  transAdvFilter.accountId = id;
  transAdvFilter.accountLabel = id ? name : '';
  setv('actAccountFilter', id);
  closeAppDialog();
  updateTransFilterGridUI();
  renderTransactionsScreen();
}
function selectTransFilterMainCat(mc){
  transAdvFilter.mainCat = mc;
  if(mc && transAdvFilter.subCat){
    const allowed = [...(state.categoryTree.expense?.[mc]||[]), ...(state.categoryTree.income?.[mc]||[])];
    if(!allowed.includes(transAdvFilter.subCat)) transAdvFilter.subCat = '';
  }
  closeAppDialog();
  updateTransFilterGridUI();
  renderTransactionsScreen();
}
function selectTransFilterSubCat(sc){
  transAdvFilter.subCat = sc;
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
  try{localStorage.setItem(KEY,JSON.stringify(state))}catch(_){}
  const clrBtn = document.getElementById('btnClearSearch');
  if(clrBtn) clrBtn.style.display = (qVal || hasAnyTransAdvFilter()) ? 'block' : 'none';
  renderTransactionsScreen();
}
function clearTransactionsSearch(){
  activeReportCategoryFilter = null;
  transAdvFilter = { dateFrom:'', dateTo:'', accountId:'', accountLabel:'', mainCat:'', subCat:'', amountFrom:'', amountTo:'' };
  setv('actAccountFilter', '');
  const inp = document.getElementById('actSearch');
  if(inp) inp.value = '';
  state.prefs = state.prefs || {};
  state.prefs.savedSearch = '';
  try{localStorage.setItem(KEY,JSON.stringify(state))}catch(_){}
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

/* Accounting Core */
function isCardPurchaseTx(t){
  return t.type==='card_purchase' || String(t.source||'').startsWith('card-purchase:');
}
function monthTx(m){return state.transactions.filter(t=>monthKey(t.date)===m)}
function isActualExpenseTx(t){
  if(t.type !== 'expense') return false;
  if(isCardPurchaseTx(t)) return false;
  if(t.source === 'card-payment') return false;
  return true;
}
function totals(m){
  let a=monthTx(m),
      inc=round2(a.filter(t=>t.type==='income').reduce((s,t)=>s+(Number(t.amount)||0),0)),
      exp=round2(a.filter(t=>isActualExpenseTx(t)).reduce((s,t)=>s+(Number(t.amount)||0),0));
  return{a,inc,exp,net:round2(inc-exp)};
}
function accountBalance(a){
  let n=Number(a.opening)||0;
  for(const t of state.transactions){
    if(t.accountId===a.id){
      if(t.type==='income'||t.type==='fund')n+=Number(t.amount)||0;
      else if(t.type==='expense'||t.type==='credit_payment')n-=Number(t.amount)||0;
    }
  }
  for(const l of state.ledger){
    if(l.type==='adjust'){if(l.from===a.id)n+=Number(l.delta??l.amount)||0;continue;}
    if(l.from===a.id)n-=(Number(l.amount)||0)+(Number(l.fee)||0);
    if(l.to===a.id)n+=Number(l.amount)||0;
  }
  return round2(n);
}
function allAccountsAvailable(){
  return round2((state.accounts||[]).filter(a=>a.type!=='credit').reduce((s,a)=>s+accountBalance(a),0));
}
function opOutstanding(op){
  return op.type==='installment'
    ? (op.schedules||[]).reduce((s,x)=>s+Math.max(0,(Number(x.amount)||0)-(Number(x.paid)||0)),0)+Math.max(0,(Number(op.feeDue)||0)-(Number(op.feePaid)||0))
    : Math.max(0,(Number(op.amount)||0)-(Number(op.paid)||0));
}
function cardOpsOutstandingFor(cardId){
  return (state.cardOps||[]).filter(o=>o.cardId===cardId).reduce((s,o)=>s+opOutstanding(o),0);
}
function cardTotalOutstanding(card){
  return round2(Math.max(0,Number(card.balance)||0) + cardOpsOutstandingFor(card.id));
}
function cardCurrentAvailable(card){
  const lim=Number(card.limit)||0;
  if(lim<=0) return 0;
  return round2(Math.max(0, lim - cardTotalOutstanding(card)));
}
function allCardsOutstanding(){
  return round2((state.cards||[]).reduce((s,c)=>s+cardTotalOutstanding(c),0));
}
function commitmentDue(c,month){
  const st = String(c.start||'0000-01');
  const en = String(c.end||'');
  return month >= st && (!en || month <= en);
}

function isSuezCanalBankCard(card){
  const nm = String(card?.name||'').toLowerCase();
  return nm.includes('قناة السويس') || nm.includes('قناه السويس') || nm.includes('suez');
}
function computeCardInstallmentNumbers(card, amount, months, customIrDec, customFeeDec){
  const isSuez = isSuezCanalBankCard(card);
  const t = (card?.terms || {})[months] || {monthlyRate:0, adminRate:0};
  const mRate = (customIrDec !== undefined && customIrDec !== null) ? customIrDec : (Number(t.monthlyRate)||0);
  const aRate = (customFeeDec !== undefined && customFeeDec !== null) ? customFeeDec : (Number(t.adminRate)||0);
  if(isSuez){
    // Suez Canal Bank: Installment is strictly (amount / months) e.g. 6000 / 6 = 1000! Admin fee is paid in month 1.
    const effAdminRate = aRate > 0 ? aRate : (mRate * months);
    const fee = round2(amount * effAdminRate);
    const base = round2(amount / months);
    return { isSuez: true, interest: 0, fee, base, total: round2(amount + fee) };
  }
  const interest = round2(amount * mRate * months);
  const fee = round2(amount * aRate);
  const base = round2((amount + interest) / months);
  return { isSuez: false, interest, fee, base, total: round2(amount + interest + fee) };
}

function buildInstallmentSchedulesForCard(card, purchaseYM, months, baseInstallment, fee){
  const isSuez = isSuezCanalBankCard(card);
  const feeYM = addMonthsYM(purchaseYM, 1);
  const firstInstOffset = isSuez ? 2 : 1;
  let [py, pm] = purchaseYM.split('-').map(Number);
  const schedules = Array.from({length: months}, (_, i) => {
    const dt = new Date(py, (pm - 1) + firstInstOffset + i, 1);
    const mk = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
    return { month: mk, amount: baseInstallment, principalAndInterest: baseInstallment, fee: 0, paid: 0 };
  });
  return { feeYM, firstInstYM: schedules[0]?.month || feeYM, schedules };
}

// Auto-heal any existing Suez Canal Bank installment ops so 6000 / 6 is 1000
function healSuezCanalBankOps(){
  for(const op of (state.cardOps || [])){
    if(op.type !== 'installment') continue;
    const card = (state.cards || []).find(c => c.id === op.cardId);
    if(card && isSuezCanalBankCard(card)){
      const m = Number(op.months) || 12;
      const amt = Number(op.amount) || 0;
      const expectedBase = round2(amt / m);
      if(amt > 0 && Math.abs((Number(op.installment)||0) - expectedBase) > 1){
        const nums = computeCardInstallmentNumbers(card, amt, m);
        if((Number(op.feeDue)||0) <= 0 && nums.fee > 0) op.feeDue = nums.fee;
        op.adminFee = op.feeDue || nums.fee;
        op.interest = 0;
        op.installment = expectedBase;
        op.total = round2(amt + (Number(op.feeDue)||0));
        (op.schedules || []).forEach(sc => { sc.amount = expectedBase; sc.principalAndInterest = expectedBase; });
      }
    }
  }
}
healSuezCanalBankOps();

/* =========================================================
   #2.2 DIRECT-TAP DAILY TRANSACTIONS BUILDER
   (Tapping any transaction opens it directly in Edit Mode, where Copy & Delete live inside!)
   ========================================================= */
let activeTransSubTab = 'daily';

function switchTransSubTab(mode){
  activeTransSubTab = (mode === 'monthly' || mode === 'yr') ? mode : 'daily';
  document.getElementById('transTabDaily')?.classList.toggle('active', activeTransSubTab === 'daily' || activeTransSubTab === 'monthly');
  document.getElementById('transTabYr')?.classList.toggle('active', activeTransSubTab === 'yr');

  const dailyWrap = document.getElementById('transDailyMainWrap');
  const yrWrap = document.getElementById('planViewYr');
  if(dailyWrap) dailyWrap.style.display = activeTransSubTab === 'yr' ? 'none' : 'block';
  if(yrWrap) yrWrap.style.display = activeTransSubTab === 'yr' ? 'block' : 'none';

  updateFabVisibility();
  updateTopTabTitle('trans');
  if(activeTransSubTab === 'yr'){
    renderYearlyExcelReport();
  } else {
    renderTransactionsScreen();
  }
}

function toggleMonthlySummaryFromFab(){
  if(activeTransSubTab === 'monthly'){
    switchTransSubTab('daily');
  } else {
    switchTransSubTab('monthly');
  }
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
    const op = state.cardOps.find(o=>o.id===opId);
    return !!(op && op.cardId === cid);
  }
  const sid = String(targetAccId);
  if(String(it.accountId||'') === sid || String(it.toAccountId||'') === sid) return true;

  const targetAcc = state.accounts.find(a=>a.id === sid);
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
      if(it.type === 'income') dayInc += Number(it.amount)||0;
      else if(isActualExpenseTx(it) || isCardPurchaseTx(it)) dayExp += Number(it.amount)||0;
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
      const memoLine = isDupTitle ? '' : rawTitle;
      const itemKind = it._kind || 'tx';

      // 2.2 Direct tap on row opens openEditAnyItem directly!
      return `
        <div class="tx-wrap" onclick="openEditAnyItem('${esc(it.id)}','${itemKind}')">
          <div class="tx-row">
            <div class="tx-cat-col">
              <b>${esc(it.category||'أخرى')}</b>
              ${it.subCategory ? `<small>${esc(it.subCategory)}</small>` : ''}
            </div>
            <div class="tx-acc-col">
              ${memoLine ? `<span>${esc(memoLine)}</span>` : ''}
              <small>${esc(accName)}</small>
            </div>
            <div class="tx-amt-col ${amtClass}">${maskable(amtPrefix + fmt(Math.abs(Number(it.amount)||0)))} EGP</div>
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
  const t = isHomeYearly ? (()=>{
    const a = (state.transactions||[]).filter(tx=>String(tx.date||'').startsWith(yStrHome));
    const inc = round2(a.filter(tx=>tx.type==='income').reduce((s,tx)=>s+(Number(tx.amount)||0),0));
    const exp = round2(a.filter(tx=>isActualExpenseTx(tx)).reduce((s,tx)=>s+(Number(tx.amount)||0),0));
    return { a, inc, exp, net: round2(inc - exp) };
  })() : totals(m);
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
    const fInc = round2(combined.filter(x=>x.type==='income').reduce((s,x)=>s+(Number(x.amount)||0),0));
    const fExp = round2(combined.filter(x=>isActualExpenseTx(x)).reduce((s,x)=>s+(Number(x.amount)||0),0));
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
    state.ledger.push({
      ...origL,
      id: uid('ledger'),
      date: today(),
      createdAt: nowTs
    });
    persist();
    refreshSecondaryFeeds();
    toast('تم نسخ التحويل بتاريخ اليوم ✓');
    return;
  }
  const orig = state.transactions.find(x=>String(x.id)===String(id));
  if(!orig) return;

  if(isCardPurchaseTx(orig)){
    const oldOpId = String(orig.source||'').replace('card-purchase:','');
    const origOp = state.cardOps.find(o=>o.id===oldOpId);
    const newOpId = uid('op');
    const dToday = today();
    if(origOp){
      const card = state.cards.find(c=>c.id===origOp.cardId);
      const newOp = JSON.parse(JSON.stringify(origOp));
      newOp.id = newOpId;
      newOp.date = dToday;
      newOp.paid = 0;
      newOp.dueDate = card ? dueDateFor(card, dToday) : dToday;
      if(newOp.type === 'installment'){
        const pYM = dToday.slice(0,7);
        const months = Number(newOp.months)||12;
        const built = buildInstallmentSchedulesForCard(card, pYM, months, newOp.installment, newOp.feeDue||0);
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
        date: dToday,
        paid: 0,
        dueDate: dueDateFor(fallbackCard, dToday)
      });
    }
    state.transactions.push({
      ...orig,
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

  state.transactions.push({
    ...orig,
    id: uid('tx'),
    date: today(),
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

function revertLinkedPaymentOnTxDelete(txObj){
  if(!txObj) return;
  if(txObj.linkedCommitmentPaymentId){
    state.commitmentPayments = (state.commitmentPayments||[]).filter(p=>p.id !== txObj.linkedCommitmentPaymentId);
  } else if(txObj.source === 'commitment-payment'){
    const idx = (state.commitmentPayments||[]).findIndex(p=>p.date===txObj.date && Math.abs((Number(p.amount)||0)-(Number(txObj.amount)||0))<0.01);
    if(idx !== -1) state.commitmentPayments.splice(idx, 1);
  }
  if(txObj.linkedCardOpId){
    const op = (state.cardOps||[]).find(o=>o.id === txObj.linkedCardOpId);
    const amt = Number(txObj.amount)||0;
    if(op && amt > 0){
      if(txObj.linkedCardPayKind === 'card_swipe'){
        op.paid = round2(Math.max(0, (Number(op.paid)||0) - amt));
      } else if(txObj.linkedCardPayKind === 'card_fee'){
        op.feePaid = round2(Math.max(0, (Number(op.feePaid)||0) - amt));
      } else if(txObj.linkedCardPayKind === 'card_inst'){
        const sc = (op.schedules||[]).find(s=>s.month === txObj.linkedCardPayMonth);
        if(sc) sc.paid = round2(Math.max(0, (Number(sc.paid)||0) - amt));
      }
    }
    if(txObj.linkedCardPaymentRecordId){
      state.cardPayments = (state.cardPayments||[]).filter(p=>p.id !== txObj.linkedCardPaymentRecordId);
    }
  }
}

function deleteAnyItem(id, kind){
  if(kind === 'ledger'){
    showAppConfirm('حذف التحويل', 'هل تريد حذف عملية التحويل هذه؟', ()=>{
      state.ledger = state.ledger.filter(x=>String(x.id)!==String(id));
      persist(); refreshSecondaryFeeds(); toast('تم الحذف ✓');
    }, true);
    return;
  }
  const t = state.transactions.find(x=>String(x.id)===String(id));
  if(t && isCardPurchaseTx(t)){
    const opId = String(t.source||'').replace('card-purchase:','');
    showAppConfirm('حذف عملية البطاقة', 'هل تريد حذف هذه المعاملة وإلغاء عمليتها المرتبطة بالبطاقة؟', ()=>{
      state.transactions = state.transactions.filter(x=>String(x.id)!==String(id));
      if(opId) state.cardOps = state.cardOps.filter(o=>o.id!==opId);
      syncCardInstallmentsToCommitments();
      persist(); refreshSecondaryFeeds(); toast('تم الحذف ✓');
    }, true);
    return;
  }
  deleteTransaction(id);
}

function deleteTransaction(id){
  showAppConfirm('حذف الحركة', 'هل تريد حذف هذه الحركة نهائياً؟', ()=>{
    const txObj = state.transactions.find(x=>String(x.id)===String(id));
    if(txObj) revertLinkedPaymentOnTxDelete(txObj);
    state.transactions = state.transactions.filter(x=>String(x.id)!==String(id));
    persist();
    refreshSecondaryFeeds();
    toast('تم الحذف ✓');
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


/* Analytics & Category Drill-Down loaded from analytics.js */

/* =========================================================
   #1. QUICK TRANSACTION ENTRY MODAL (#quickModal)
   - 1.1 Compact upper section
   - 1.2 Fixed-size lower dock (never collapses or resizes)
   - 1.3 Clear divider line
   - 2.2 Direct Edit with Copy & Delete buttons inside modal
   ========================================================= */
let qmState = { type:'expense', accountId:'', toAccountId:'', category:'', subCategory:'', isCard:false, cardMode:'swipe', editId:null, editKind:'tx', dock:'acc', calcTarget:'qmAmount', calcExpr:'' };

function formatDateDMY(iso){
  const s = String(iso || today()).slice(0, 10);
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)){
    return `${s.slice(8,10)}-${s.slice(5,7)}-${s.slice(0,4)}`;
  }
  return s;
}

function syncQmDateDisplay(){
  const raw = val('qmDate') || today();
  const disp = document.getElementById('qmDateDisplay');
  if(disp) disp.textContent = formatDateDMY(raw);
}

function openQmNativeDatePicker(){
  const inp = document.getElementById('qmDate');
  if(!inp) return;
  try{
    if(typeof inp.showPicker === 'function') inp.showPicker();
    else inp.focus();
  }catch(_){ inp.focus(); }
}

document.getElementById('qmDesc')?.addEventListener('input', autoResizeQmDesc);
function onQmDescFocus(){
  document.getElementById('quickModal')?.classList.add('hide-bottom-dock');
}
function onQmDescBlur(){
  autoResizeQmDesc();
  setTimeout(()=>{
    if(document.activeElement?.id !== 'qmDesc'){
      document.getElementById('quickModal')?.classList.remove('hide-bottom-dock');
    }
  }, 120);
}
function onQmTextInputFocus(hideDock){
  if(!hideDock) document.getElementById('quickModal')?.classList.remove('hide-bottom-dock');
}

function getActiveCatTree(){
  syncCategoryTrees();
  return qmState.type === 'income' ? state.categoryTree.income : state.categoryTree.expense;
}

function evaluateCalcExpression(expr){
  const sanitized = String(expr || '')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/[^0-9.+\-*/]/g, '');
  if(!sanitized) return 0;
  const trimmed = sanitized.replace(/[+\-*/.]+$/, '');
  if(!trimmed) return 0;
  try{
    const res = Function('"use strict"; return (' + trimmed + ')')();
    if(Number.isFinite(res)) return Math.max(0, round2(res));
  }catch(_){}
  return 0;
}

function updateQmCalcDisplay(){
  const targetId = qmState.calcTarget || 'qmAmount';
  const titleEl = document.getElementById('qmCalcTargetTitle');
  if(titleEl) titleEl.textContent = targetId === 'qmFee' ? 'الرسوم' : 'المبلغ';
  const prevEl = document.getElementById('qmCalcExprPreview');
  const expr = qmState.calcExpr || '';
  const hasOp = /[+\-×÷]/.test(expr.slice(1));
  const valNum = evaluateCalcExpression(expr);
  if(prevEl){
    prevEl.textContent = expr ? (hasOp ? `${expr} = ${valNum}` : expr) : '0';
  }
  setv(targetId, valNum > 0 ? String(valNum) : '');
}

function qmCalcPress(key){
  let expr = String(qmState.calcExpr || '');
  if(key === 'C'){
    expr = '';
  } else if(key === '⌫'){
    expr = expr.slice(0, -1);
  } else if(key === '='){
    const valNum = evaluateCalcExpression(expr);
    expr = valNum > 0 ? String(valNum) : '';
    qmState.calcExpr = expr;
    updateQmCalcDisplay();
    toast('تم إدراج الناتج في المبلغ ✓');
    return;
  } else if(['+','-','×','÷'].includes(key)){
    if(!expr) expr = '0';
    if(['+','-','×','÷'].includes(expr.slice(-1))){
      expr = expr.slice(0, -1) + key;
    } else {
      expr += key;
    }
  } else if(key === '.'){
    const parts = expr.split(/[+\-×÷]/);
    const curPart = parts[parts.length - 1] || '';
    if(!curPart.includes('.')){
      expr += (curPart ? '.' : '0.');
    }
  } else {
    if(expr === '0') expr = key === '00' ? '0' : key;
    else expr += key;
  }
  qmState.calcExpr = expr;
  updateQmCalcDisplay();
}

function autoResizeQmDesc(){
  const ta = document.getElementById('qmDesc');
  if(!ta) return;
  if(!ta.value){
    ta.style.setProperty('height', '30px', 'important');
    return;
  }
  ta.style.setProperty('height', 'auto', 'important');
  const h = Math.max(30, ta.scrollHeight + 4);
  ta.style.setProperty('height', h + 'px', 'important');
}

function setQmDockMode(mode, calcFieldId){
  if(mode === ''){
    qmState.dock = '';
    document.getElementById('quickModal')?.classList.add('hide-bottom-dock');
    ['qmAccTrigger','qmToAccTrigger','qmCatTrigger'].forEach(id=>{
      document.getElementById(id)?.classList.remove('focused-field');
    });
    return;
  }
  document.getElementById('quickModal')?.classList.remove('hide-bottom-dock');
  if(document.activeElement && (document.activeElement.id === 'qmDesc' || document.activeElement.id === 'qmNote')){
    document.activeElement.blur();
  }
  const effectiveMode = (mode === 'acc' || mode === 'toAcc' || mode === 'cat' || mode === 'calc')
    ? mode
    : (qmState.type === 'transfer' ? 'toAcc' : 'cat');
  qmState.dock = effectiveMode;
  if(effectiveMode === 'calc'){
    const tgt = calcFieldId || qmState.calcTarget || 'qmAmount';
    qmState.calcTarget = tgt;
    const curVal = val(tgt);
    if(!qmState.calcExpr || qmState.calcTarget !== tgt){
      qmState.calcExpr = curVal && Number(curVal) > 0 ? String(curVal) : '';
    }
    updateQmCalcDisplay();
  }

  const dAcc = document.getElementById('qmDockAcc');
  const dToAcc = document.getElementById('qmDockToAcc');
  const dCat = document.getElementById('qmDockCat');
  const dCalc = document.getElementById('qmDockCalc');
  const tAcc = document.getElementById('qmAccTrigger');
  const tToAcc = document.getElementById('qmToAccTrigger');
  const tCat = document.getElementById('qmCatTrigger');

  [tAcc, tToAcc, tCat].forEach(el=>{ if(el) el.classList.remove('focused-field'); });

  if(dAcc) dAcc.style.display = effectiveMode === 'acc' ? 'flex' : 'none';
  if(dToAcc) dToAcc.style.display = effectiveMode === 'toAcc' ? 'flex' : 'none';
  if(dCat) dCat.style.display = effectiveMode === 'cat' ? 'flex' : 'none';
  if(dCalc) dCalc.style.display = effectiveMode === 'calc' ? 'flex' : 'none';

  if(effectiveMode === 'acc' && tAcc) tAcc.classList.add('focused-field');
  if(effectiveMode === 'toAcc' && tToAcc) tToAcc.classList.add('focused-field');
  if(effectiveMode === 'cat' && tCat) tCat.classList.add('focused-field');
}

function updateQmEditActionButtons(){
  const hasEdit = !!qmState.editId;
  const btnCopy = document.getElementById('qmBtnCopyExisting');
  const btnDel = document.getElementById('qmBtnDeleteExisting');
  if(btnCopy) btnCopy.style.display = hasEdit ? 'inline-block' : 'none';
  if(btnDel) btnDel.style.display = hasEdit ? 'inline-block' : 'none';
}

function toggleQuickTransferFeeRow(){
  const row = document.getElementById('qmFeeRow');
  const btn = document.getElementById('qmFeeToggleBtn');
  if(!row) return;
  const show = row.style.display === 'none';
  row.style.display = show ? 'flex' : 'none';
  if(btn) btn.classList.toggle('active', show);
  if(show){ qmState.calcExpr=''; setQmDockMode('calc','qmFee'); }
  else setv('qmFee', '');
}

function swapQuickTransferAccounts(){
  if(!qmState.accountId && !qmState.toAccountId) return;
  const tmp = qmState.accountId;
  qmState.accountId = qmState.toAccountId;
  qmState.toAccountId = tmp;
  renderQuickPickers();
  toast('تم عكس اتجاه التحويل ⇅');
}

function openQuickAddModal(defaultType){
  const tree = defaultType === 'income' ? state.categoryTree.income : state.categoryTree.expense;
  const firstMain = Object.keys(tree)[0] || 'أخرى';
  qmState = {
    type: defaultType || 'expense',
    accountId: state.prefs?.defaultAccount || (state.accounts[0]?.id || ''),
    toAccountId: state.accounts[1]?.id || (state.accounts[0]?.id || ''),
    category: firstMain,
    subCategory: '',
    isCard: false,
    cardMode: 'swipe',
    editId: null,
    editKind: 'tx',
    dock: 'acc'
  };
  document.getElementById('qmHeaderTitle').textContent = 'إضافة معاملة';
  qmState.calcExpr = '';
  setv('qmDate', today());
  syncQmDateDisplay();
  setv('qmAmount', '');
  setv('qmFee', '');
  setv('qmNote', '');
  setv('qmDesc', '');
  document.getElementById('qmFeeRow').style.display = 'none';
  document.getElementById('qmFeeToggleBtn')?.classList.remove('active');
  updateQmEditActionButtons();
  setQuickTxType(qmState.type);
  renderQuickPickers();
  setQmDockMode('acc');
  document.getElementById('quickModal').classList.add('show');
  setTimeout(autoResizeQmDesc, 35);
}

function openEditQuickTx(id){
  const t = state.transactions.find(x=>String(x.id)===String(id));
  if(!t) return;
  const isCardTx = isCardPurchaseTx(t);
  let cardId = '';
  let cardMode = 'swipe';
  if(isCardTx){
    const opId = String(t.source||'').replace('card-purchase:','');
    const op = state.cardOps.find(o=>o.id===opId);
    if(op){
      cardId = op.cardId;
      cardMode = op.type || 'swipe';
      if(op.months) syncQmCardMonthsPills(op.months);
    }
  }
  qmState = {
    type: t.type === 'income' ? 'income' : 'expense',
    accountId: isCardTx ? (cardId || state.cards[0]?.id || '') : (t.accountId || ''),
    toAccountId: '',
    category: t.category || 'أخرى',
    subCategory: t.subCategory || '',
    isCard: isCardTx,
    cardMode: cardMode,
    editId: t.id,
    editKind: 'tx',
    dock: ''
  };
  document.getElementById('qmHeaderTitle').textContent = 'تعديل معاملة';
  qmState.calcExpr = String(t.amount || '');
  setv('qmDate', t.date || today());
  syncQmDateDisplay();
  setv('qmAmount', t.amount || '');
  setv('qmFee', '');
  setv('qmNote', String(t.title||'').replace(/^شراء بالبطاقة\s*-\s*/,''));
  setv('qmDesc', t.description || '');
  document.getElementById('qmFeeRow').style.display = 'none';
  updateQmEditActionButtons();
  setQuickTxType(qmState.type);
  renderQuickPickers();
  setQmDockMode('');
  document.getElementById('quickModal').classList.add('show');
  setTimeout(autoResizeQmDesc, 35);
  setTimeout(autoResizeQmDesc, 35);
}

function openEditLedgerModal(l){
  qmState = {
    type: 'transfer',
    accountId: l.from || '',
    toAccountId: l.to || '',
    category: '',
    subCategory: '',
    isCard: false,
    cardMode: 'swipe',
    editId: l.id,
    editKind: 'ledger',
    dock: ''
  };
  document.getElementById('qmHeaderTitle').textContent = 'تعديل معاملة';
  qmState.calcExpr = String(l.amount || '');
  setv('qmDate', l.date || today());
  syncQmDateDisplay();
  setv('qmAmount', l.amount || '');
  setv('qmFee', l.fee || '');
  setv('qmNote', (l.note && l.note !== 'تحويل بين الحسابات') ? l.note : '');
  setv('qmDesc', l.description || '');
  autoResizeQmDesc();
  updateQmEditActionButtons();
  setQuickTxType('transfer');
  const feeRow = document.getElementById('qmFeeRow');
  const feeBtn = document.getElementById('qmFeeToggleBtn');
  if((Number(l.fee)||0) > 0){
    if(feeRow) feeRow.style.display = 'flex';
    if(feeBtn) feeBtn.classList.add('active');
  }
  renderQuickPickers();
  setQmDockMode('');
  document.getElementById('quickModal').classList.add('show');
  setTimeout(autoResizeQmDesc, 35);
  setTimeout(autoResizeQmDesc, 35);
}

function closeQuickModal(){
  document.getElementById('quickModal').classList.remove('show');
}

function setQuickTxType(t){
  qmState.type = t;
  document.getElementById('qmTabInc').classList.toggle('active', t==='income');
  document.getElementById('qmTabExp').classList.toggle('active', t==='expense');
  document.getElementById('qmTabTrn').classList.toggle('active', t==='transfer');

  const isTrn = (t === 'transfer');
  document.getElementById('qmToAccRow').style.display = isTrn ? 'flex' : 'none';
  document.getElementById('qmSwapAccRow').style.display = isTrn ? 'flex' : 'none';
  document.getElementById('qmCatRow').style.display = isTrn ? 'none' : 'flex';
  document.getElementById('qmAccLabelTitle').textContent = isTrn ? 'من حساب' : 'الحساب';

  const feeBtn = document.getElementById('qmFeeToggleBtn');
  const feeRow = document.getElementById('qmFeeRow');
  if(feeBtn) feeBtn.style.display = isTrn ? 'inline-block' : 'none';
  if(!isTrn && feeRow) feeRow.style.display = 'none';

  if(t !== 'expense'){
    qmState.isCard = false;
    document.getElementById('qmCardModeRow').style.display = 'none';
    document.getElementById('qmCardMonthsRow').style.display = 'none';
  }
  if(!isTrn){
    const tree = getActiveCatTree();
    if(!tree[qmState.category]){
      qmState.category = Object.keys(tree)[0] || 'أخرى';
      qmState.subCategory = '';
    }
  }
  renderQuickPickers();
  setQmDockMode(qmState.editId ? '' : 'acc');
}

function selectQmCardMonthsPill(mVal, btn){
  setv('qmCardMonths', mVal);
  document.querySelectorAll('#qmCardMonthsPills .m-pill').forEach(b=>b.classList.toggle('active', b===btn));
}
function syncQmCardMonthsPills(mVal){
  const target = String(mVal || 12);
  setv('qmCardMonths', target);
  document.querySelectorAll('#qmCardMonthsPills .m-pill').forEach(b=>{
    b.classList.toggle('active', b.textContent.trim() === target);
  });
}
function setQmCardMode(mode){
  qmState.cardMode = mode;
  document.getElementById('qmCardSwipeBtn').classList.toggle('active', mode==='swipe');
  document.getElementById('qmCardInstBtn').classList.toggle('active', mode==='installment');
  document.getElementById('qmCardMonthsRow').style.display = mode==='installment' ? 'flex' : 'none';
}

function updateQmCatLabel(){
  const label = qmState.subCategory ? `${qmState.category} / ${qmState.subCategory}` : (qmState.category || 'اختر القسم');
  document.getElementById('qmCatSelectedText').textContent = label;
}

function renderQuickPickers(){
  let accItems = state.accounts.map(a=>({id:a.id, name:a.name, isCard:false}));
  if(qmState.type === 'expense'){
    state.cards.forEach(c=>accItems.push({id:c.id, name:'💳 ' + c.name, isCard:true}));
  }
  const selAcc = accItems.find(x=>x.id===qmState.accountId) || accItems[0];
  if(selAcc){
    qmState.accountId = selAcc.id;
    qmState.isCard = selAcc.isCard;
    document.getElementById('qmAccSelectedText').textContent = selAcc.name;
    document.getElementById('qmCardModeRow').style.display = selAcc.isCard ? 'flex' : 'none';
    document.getElementById('qmCardMonthsRow').style.display = (selAcc.isCard && qmState.cardMode==='installment') ? 'flex' : 'none';
  } else {
    document.getElementById('qmAccSelectedText').textContent = 'كاش';
  }
  document.getElementById('qmAccGrid').innerHTML = accItems.map(a=>`
    <button type="button" class="qg-item ${a.id===qmState.accountId?'selected':''}" onclick="selectQuickAcc('${escJs(a.id)}', ${a.isCard})">${esc(a.name)}</button>
  `).join('');

  const toAcc = state.accounts.find(a=>a.id===qmState.toAccountId) || state.accounts.find(a=>a.id!==qmState.accountId) || state.accounts[0];
  if(toAcc){
    qmState.toAccountId = toAcc.id;
    document.getElementById('qmToAccSelectedText').textContent = toAcc.name;
  }
  document.getElementById('qmToAccGrid').innerHTML = state.accounts.map(a=>`
    <button type="button" class="qg-item ${a.id===qmState.toAccountId?'selected':''}" onclick="selectQuickToAcc('${escJs(a.id)}')">${esc(a.name)}</button>
  `).join('');

  const tree = getActiveCatTree();
  const mainCats = Object.keys(tree);
  if(!mainCats.length){
    qmState.category = '';
    qmState.subCategory = '';
    document.getElementById('qmCatSelectedText').textContent = 'لا توجد أقسام';
  } else {
    if(!qmState.category || !tree[qmState.category]){
      qmState.category = mainCats[0];
      qmState.subCategory = '';
    }
    updateQmCatLabel();
  }

  const mainColEl = document.getElementById('qmMainCatList');
  const subColEl = document.getElementById('qmSubCatList');
  if(mainColEl && subColEl){
    if(!mainCats.length){
      mainColEl.innerHTML = '<div class="empty" style="padding:14px 4px;font-size:.68rem">اضغط «＋ رئيسي» للإضافة</div>';
      subColEl.innerHTML = '<div class="empty" style="padding:14px 4px;font-size:.68rem">—</div>';
    } else {
      mainColEl.innerHTML = mainCats.map(mc=>{
        const subsCount = (tree[mc]||[]).length;
        return `<button type="button" class="mm-cat-item ${mc===qmState.category?'active':''}" onclick="selectQuickMainCat('${escJs(mc)}')">
          <span>${esc(mc)}</span>
          ${subsCount ? `<small style="opacity:.7">›</small>` : ''}
        </button>`;
      }).join('');

      const subs = tree[qmState.category] || [];
      if(!subs.length){
        subColEl.innerHTML = '<div class="empty" style="padding:14px 6px;font-size:.68rem">بدون أقسام فرعية</div>';
      } else {
        subColEl.innerHTML = subs.map(sc=>`
          <button type="button" class="mm-cat-item ${sc===qmState.subCategory?'active':''}" onclick="selectQuickSubCat('${escJs(sc)}')"><span>${esc(sc)}</span></button>
        `).join('');
      }
    }
  }
}

function selectQuickAcc(id, isCard){
  qmState.accountId = id;
  qmState.isCard = !!isCard;
  renderQuickPickers();
  if(qmState.type === 'transfer'){
    setQmDockMode('toAcc');
  } else {
    setQmDockMode('cat');
  }
}
function selectQuickToAcc(id){
  qmState.toAccountId = id;
  renderQuickPickers();
  setQmDockMode('calc','qmAmount');
}
function selectQuickMainCat(mc){
  qmState.category = mc;
  qmState.subCategory = '';
  renderQuickPickers();
  const subs = getActiveCatTree()[mc] || [];
  if(!subs.length){
    setQmDockMode('calc','qmAmount');
  }
}
function selectQuickSubCat(sc){
  qmState.subCategory = (qmState.subCategory === sc) ? '' : sc;
  renderQuickPickers();
  setQmDockMode('calc','qmAmount');
}
function openEditQuickCatPrompt(isSub){
  const isInc = qmState.type === 'income';
  const tree = isInc ? state.categoryTree.income : state.categoryTree.expense;
  if(isSub){
    const oldSub = qmState.subCategory;
    const parent = qmState.category;
    if(!oldSub || !parent) return toast('اختر قسماً فرعياً أولاً لتعديله');
    showAppPrompt(`تعديل القسم الفرعي «${oldSub}»`, 'الاسم الجديد...', oldSub, (n)=>{
      const clean = String(n||'').trim();
      if(!clean || clean === oldSub) return;
      tree[parent] = (tree[parent]||[]).map(s => s === oldSub ? clean : s);
      state.transactions.forEach(t=>{ if(t.category===parent && t.subCategory===oldSub) t.subCategory=clean; });
      qmState.subCategory = clean;
      persist();
      renderQuickPickers();
      toast('تم تعديل القسم الفرعي ✓');
    });
  } else {
    const oldMain = qmState.category;
    if(!oldMain) return toast('اختر قسماً رئيسياً أولاً لتعديله');
    showAppPrompt(`تعديل القسم الرئيسي «${oldMain}»`, 'الاسم الجديد...', oldMain, (n)=>{
      const clean = String(n||'').trim();
      if(!clean || clean === oldMain) return;
      const subs = tree[oldMain] || [];
      const keys = Object.keys(tree);
      const rebuilt = {};
      keys.forEach(k => { rebuilt[k === oldMain ? clean : k] = (k === oldMain ? subs : tree[k]); });
      if(isInc){
        state.categoryTree.income = rebuilt;
        state.incomeCategories = Object.keys(rebuilt);
      } else {
        state.categoryTree.expense = rebuilt;
        state.categories = Object.keys(rebuilt);
      }
      state.transactions.forEach(t=>{ if(t.category===oldMain) t.category=clean; });
      qmState.category = clean;
      persist();
      renderQuickPickers();
      toast('تم تعديل القسم الرئيسي ✓');
    });
  }
}

function openAddQuickCatPrompt(isSub){
  const label = isSub ? `إضافة قسم فرعي داخل «${qmState.category}»` : 'إضافة قسم رئيسي جديد';
  showAppPrompt(label, 'اكتب الاسم هنا...', '', (name)=>{
    if(!name || !name.trim()) return;
    const clean = name.trim();
    const isInc = qmState.type === 'income';
    const tree = isInc ? state.categoryTree.income : state.categoryTree.expense;
    if(isSub){
      const parent = qmState.category || Object.keys(tree)[0] || 'أخرى';
      tree[parent] = [...new Set([...(tree[parent]||[]), clean])];
      qmState.subCategory = clean;
    } else {
      if(!tree[clean]) tree[clean] = [];
      if(isInc) state.incomeCategories = [...new Set([...(state.incomeCategories||[]), clean])];
      else state.categories = [...new Set([...(state.categories||[]), clean])];
      qmState.category = clean;
      qmState.subCategory = '';
    }
    persist();
    renderQuickPickers();
    toast('تمت الإضافة ✓');
  });
}

function saveQuickModal(){
  if(qmState.dock === 'calc' && qmState.calcExpr){ updateQmCalcDisplay(); }
  const amount = num('qmAmount');
  const fee = num('qmFee');
  const date = val('qmDate') || today();
  const note = val('qmNote').trim();
  const description = val('qmDesc').trim();
  const nowTs = Date.now();
  if(amount <= 0) return toast('أدخل المبلغ بشكل صحيح');

  if(qmState.type === 'transfer'){
    if(!qmState.accountId || !qmState.toAccountId || qmState.accountId === qmState.toAccountId){
      return toast('اختر حسابين مختلفين للتحويل');
    }
    const cleanFee = Math.max(0, fee);
    if(qmState.editId && qmState.editKind === 'ledger'){
      const l = state.ledger.find(x=>String(x.id)===String(qmState.editId));
      if(l){
        l.from = qmState.accountId;
        l.to = qmState.toAccountId;
        l.amount = amount;
        l.fee = 0;
        l.note = note;
        l.description = description;
        l.date = date;
      }
      if(cleanFee > 0){
        syncCategoryTrees();
        if(!state.categoryTree.expense['رسوم']) state.categoryTree.expense['رسوم'] = ['رسوم تحويل'];
        if(!state.categories.includes('رسوم')) state.categories.push('رسوم');
        state.transactions.push({
          id: uid('tx-fee'),
          type: 'expense',
          category: 'رسوم',
          subCategory: 'رسوم تحويل',
          title: note ? ('رسوم تحويل - ' + note) : 'رسوم تحويل',
          description: '',
          amount: cleanFee,
          date,
          accountId: qmState.accountId,
          createdAt: nowTs + 1
        });
      }
      persist(); refreshSecondaryFeeds(); closeQuickModal(); toast('تم تعديل التحويل ✓');
      return;
    }
    state.ledger.push({
      id: uid('ledger'),
      type: 'transfer',
      from: qmState.accountId,
      to: qmState.toAccountId,
      amount,
      fee: 0,
      note: note,
      description,
      date,
      createdAt: nowTs
    });
    if(cleanFee > 0){
      syncCategoryTrees();
      if(!state.categoryTree.expense['رسوم']) state.categoryTree.expense['رسوم'] = ['رسوم تحويل'];
      if(!state.categories.includes('رسوم')) state.categories.push('رسوم');
      state.transactions.push({
        id: uid('tx-fee'),
        type: 'expense',
        category: 'رسوم',
        subCategory: 'رسوم تحويل',
        title: note ? ('رسوم تحويل - ' + note) : 'رسوم تحويل',
        description: '',
        amount: cleanFee,
        date,
        accountId: qmState.accountId,
        createdAt: nowTs + 1
      });
    }
    persist(); refreshSecondaryFeeds(); closeQuickModal(); toast(cleanFee > 0 ? 'تم تسجيل التحويل والرسوم في معاملة مستقلة ✓' : 'تم تسجيل التحويل ✓');
    return;
  }

  if(qmState.editId){
    const t = state.transactions.find(x=>String(x.id)===String(qmState.editId));
    if(t){
      t.description = description;
      if(isCardPurchaseTx(t)){
        const opId = String(t.source||'').replace('card-purchase:','');
        const op = state.cardOps.find(o=>o.id===opId);
        const title = note || qmState.subCategory || qmState.category || 'شراء بالبطاقة';
        t.category = qmState.category || 'مشتريات بطاقة';
        t.subCategory = qmState.subCategory || '';
        t.title = 'شراء بالبطاقة - ' + title;
        t.amount = amount;
        t.date = date;
        if(op){
          op.title = title;
          op.amount = amount;
          op.date = date;
          const card = state.cards.find(c=>c.id===op.cardId);
          if(op.type === 'installment' && card){
            const months = Number(op.months)||12;
            const trm = (card.terms||{})[months] || {monthlyRate:0, adminRate:0};
            const interest = round2(amount * trm.monthlyRate * months);
            const adminFee = round2(amount * trm.adminRate);
            const base = round2((amount + interest) / months);
            const built = buildInstallmentSchedulesForCard(card, date.slice(0,7), months, base, adminFee);
            op.interest = interest;
            op.adminFee = adminFee;
            op.installment = base;
            op.total = round2(amount + interest + adminFee);
            op.feeMonth = built.feeYM;
            op.feeDue = adminFee;
            op.schedules = built.schedules;
            syncCardInstallmentsToCommitments();
          }
        }
      } else {
        t.type = qmState.type;
        t.category = qmState.category;
        t.subCategory = qmState.subCategory || '';
        t.title = note;
        t.amount = amount;
        t.date = date;
        t.accountId = qmState.accountId || null;
      }
    }
    persist(); refreshSecondaryFeeds(); closeQuickModal(); toast('تم تعديل الحركة ✓');
    return;
  }

  if(qmState.isCard && qmState.type === 'expense'){
    const card = state.cards.find(c=>c.id===qmState.accountId);
    if(!card) return toast('اختر البطاقة');
    const title = note || qmState.subCategory || qmState.category || 'شراء بالبطاقة';
    const opType = qmState.cardMode;
    let op = {id:uid('op'), cardId:card.id, type:opType, title, amount, date, paid:0, dueDate:dueDateFor(card,date), createdAt:nowTs};
    if(opType === 'installment'){
      const months = num('qmCardMonths') || 12;
      const nums = computeCardInstallmentNumbers(card, amount, months);
      const purchaseYM = date.slice(0,7);
      const built = buildInstallmentSchedulesForCard(card, purchaseYM, months, nums.base, nums.fee);
      op.purchaseMonth = purchaseYM; op.months = months; op.interest = nums.interest;
      op.adminFee = nums.fee; op.installment = nums.base; op.total = nums.total;
      op.feeMonth = built.feeYM; op.feeDue = nums.fee; op.feePaid = 0;
      op.schedules = built.schedules;
    }
    state.cardOps.push(op);
    state.transactions.push({id:'card-purchase-'+op.id, type:'card_purchase', title:'شراء بالبطاقة - '+title, description, category:qmState.category||'مشتريات بطاقة', subCategory:qmState.subCategory||'', amount, date, accountId:null, source:'card-purchase:'+op.id, createdAt:nowTs});
    if(opType === 'installment') syncCardInstallmentsToCommitments();
    persist(); refreshSecondaryFeeds(); closeQuickModal(); toast(opType==='installment'?'تم تسجيل التقسيط وإضافة أقساطه ✓':'تم تسجيل الشراء على البطاقة ✓');
    return;
  }

  state.transactions.push({
    id: uid('tx'),
    type: qmState.type,
    category: qmState.category,
    subCategory: qmState.subCategory || '',
    title: note,
    description,
    amount,
    date,
    accountId: qmState.accountId || null,
    createdAt: nowTs
  });
  persist(); refreshSecondaryFeeds(); closeQuickModal(); toast('تم الحفظ ✓');
}


/* =========================================================
   MONEY MANAGER (.mmbak) IMPORTER WITH USD & CNY EXCHANGE RATES
   ========================================================= */
let mmPending = null;
function mmDefaultType(name, currency){
  if(/credit/i.test(String(name||''))) return 'skip';
  if(/cash/i.test(String(name||''))) return 'cash';
  if(/vodafone|wallet|wechat|alipay/i.test(String(name||''))) return 'wallet';
  return 'bank';
}
function mmTypeSelect(i, selected){
  const opts=[['cash','كاش'],['bank','بنك / Debit'],['wallet','محفظة إلكترونية'],['prepaid','بطاقة مسبقة'],['skip','استبعاد']];
  return `<select class="mmtype" data-index="${i}" style="width:100%;background:var(--surface);color:var(--text);border:1px solid var(--line2);border-radius:9px;padding:6px;margin-top:4px">${opts.map(([v,l])=>`<option value="${v}" ${selected===v?'selected':''}>${l}</option>`).join('')}</select>`;
}

function detectCurrencyCodeAndRate(rawCurUid, currencyMap){
  const key = String(rawCurUid||'').trim();
  if(!key) return { code:'EGP', rate:1, supported:true };
  if(currencyMap[key]) return currencyMap[key];
  const up = key.toUpperCase();
  if(up.includes('EGP')) return { code:'EGP', rate:1, supported:true };
  if(up.includes('USD')) return currencyMap['__ISO_USD__'] || { code:'USD', rate:1, supported:true };
  if(up.includes('CNY') || up.includes('RMB')) return currencyMap['__ISO_CNY__'] || { code:'CNY', rate:1, supported:true };
  return { code:up, rate:1, supported:false };
}

function readMmbak(ev){
  let file = ev.target.files && ev.target.files[0]; if(!file) return;
  const dtBox = document.getElementById('mmDateRangeBox'); if(dtBox) dtBox.style.display = 'flex';
  let out = document.getElementById('mmbakPreview'); out.textContent = 'جارٍ قراءة النسخة والعملات والأقسام…';
  if(!window.initSqlJs){ out.textContent = 'مكتبة SQL غير متاحة.'; return; }
  let reader = new FileReader();
  reader.onload = async e => {
    try{
      let SQL = await initSqlJs({locateFile:f=>'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/'+f});
      let db = new SQL.Database(new Uint8Array(e.target.result));

      let currencyMap = {};
      let fxSummary = [];
      try{
        const tables = (db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values||[]).map(x=>String(x[0]));
        const curTable = tables.find(tn=>/^CURRENCY$/i.test(tn)) || tables.find(tn=>/currency/i.test(tn));
        if(curTable){
          const pragma = db.exec(`PRAGMA table_info("${curTable}")`)[0]?.values || [];
          const cols = pragma.map(x=>String(x[1]));
          const uidCol = cols.find(c=>/^uid$/i.test(c)) || cols.find(c=>/id/i.test(c)) || cols[0];
          const isoCol = cols.find(c=>/^(ISO|CODE|SYMBOL|NAME)$/i.test(c)) || cols.find(c=>/iso|code|name/i.test(c)) || uidCol;
          const nameCol = cols.find(c=>/^NAME$/i.test(c)) || isoCol;
          const rateCol = cols.find(c=>/^RATE$/i.test(c)) || cols.find(c=>/rate|exch/i.test(c));

          const qCur = `SELECT "${uidCol}", "${isoCol}", "${nameCol}", ${rateCol?`"${rateCol}"`:'1'} FROM "${curTable}"`;
          const cRows = db.exec(qCur)[0]?.values || [];
          for(const r of cRows){
            const u = String(r[0]??'').trim();
            const iso = String(r[1]??'').trim().toUpperCase();
            const nm = String(r[2]??'').trim().toUpperCase();
            let rt = Number(r[3]);
            if(!Number.isFinite(rt) || rt <= 0) rt = 1;
            const combinedStr = `${u} ${iso} ${nm}`.toUpperCase();
            let code = 'OTHER';
            let supported = false;
            if(combinedStr.includes('EGP')){ code = 'EGP'; rt = 1; supported = true; }
            else if(combinedStr.includes('USD')){ code = 'USD'; supported = true; }
            else if(combinedStr.includes('CNY') || combinedStr.includes('RMB') || combinedStr.includes('YUAN')){ code = 'CNY'; supported = true; }

            const info = { code, rate: rt, supported };
            if(u) currencyMap[u] = info;
            if(iso) currencyMap[iso] = info;
            if(supported && (code === 'USD' || code === 'CNY')){
              currencyMap['__ISO_' + code + '__'] = info;
              fxSummary.push(`${code} = ${fmt(rt)} EGP`);
            }
          }
        }
      }catch(err){ console.warn('MM CURRENCY parse:', err); }

      let assets = [];
      try{
        assets = db.exec("SELECT uid,NIC_NAME,currencyUid,IFNULL(BALANCE,IFNULL(ZMONEY,IFNULL(AMOUNT,0))) FROM ASSETS")[0]?.values || [];
      }catch(_){
        assets = (db.exec("SELECT uid,NIC_NAME,currencyUid FROM ASSETS")[0]?.values||[]).map(r=>[r[0],r[1],r[2],0]);
      }

      let catInfoMap = {};
      let expTree = {};
      let incTree = {};
      try{
        const tables = (db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values||[]).map(x=>String(x[0]));
        const catTable = tables.find(tn=>/^ZCATEGORY$/i.test(tn)) || tables.find(tn=>/^(CATEGORY|CTG)$/i.test(tn));
        if(catTable){
          const pragma = db.exec(`PRAGMA table_info("${catTable}")`)[0]?.values || [];
          const cols = pragma.map(x=>String(x[1]));
          const idCol = cols.find(c=>/^ID$/i.test(c)) || cols.find(c=>/id/i.test(c));
          const uidCol = cols.find(c=>/^uid$/i.test(c)) || idCol;
          const nameCol = cols.find(c=>/^NAME$/i.test(c)) || cols.find(c=>/name/i.test(c));
          const typeCol = cols.find(c=>/^TYPE$/i.test(c)) || cols.find(c=>/type/i.test(c));
          const pUidCol = cols.find(c=>/^pUid$/i.test(c)) || cols.find(c=>/p_?uid|parent/i.test(c));
          const delCol = cols.find(c=>/^C_IS_DEL$/i.test(c)) || cols.find(c=>/is_del/i.test(c));
          const statusCol = cols.find(c=>/^STATUS$/i.test(c));
          const ordCol = cols.find(c=>/^ORDERSEQ$/i.test(c)) || cols.find(c=>/order|seq/i.test(c));

          const qSql = `SELECT ${idCol?`"${idCol}"`:'0'}, "${uidCol}", "${nameCol}", ${typeCol?`"${typeCol}"`:'1'}, ${pUidCol?`"${pUidCol}"`:"'0'"}, ${delCol?`COALESCE("${delCol}",0)`:'0'}, ${statusCol?`COALESCE("${statusCol}",0)`:'0'} FROM "${catTable}" ORDER BY ${ordCol?`COALESCE("${ordCol}",0) ASC, `:''}${idCol?`"${idCol}"`:'1'} ASC`;
          const rows = db.exec(qSql)[0]?.values || [];
          const byKey = {};
          const allObjs = [];
          for(const r of rows){
            const rawId = String(r[0]??'').trim();
            const rawUid = String(r[1]??'').trim();
            const nm = String(r[2]??'').trim();
            const tp = Number(r[3]);
            const rawP = String(r[4]??'').trim();
            const pu = (!rawP || rawP === '0' || rawP === '-1' || /^null$/i.test(rawP)) ? '' : rawP;
            const isDel = Number(r[5]) === 1;
            const st = Number(r[6]) || 0;
            if(!nm) continue;
            const obj = {id:rawId, uid:rawUid||rawId, name:nm, type:tp, pUid:pu, isDel, status:st};
            allObjs.push(obj);
            if(rawUid) byKey[rawUid] = obj;
            if(rawId && !byKey[rawId]) byKey[rawId] = obj;
          }
          for(const obj of allObjs){
            let parent = (obj.pUid && obj.pUid !== obj.uid && obj.pUid !== obj.id) ? byKey[obj.pUid] : null;
            if(parent && parent.pUid && parent.pUid !== parent.uid && parent.pUid !== parent.id && byKey[parent.pUid]){
              parent = byKey[parent.pUid];
            }
            const effType = parent ? parent.type : obj.type;
            const info = {
              name: obj.name,
              parentName: parent ? parent.name : '',
              doType: String(effType)
            };
            if(obj.uid) catInfoMap[obj.uid] = info;
            if(obj.id && !catInfoMap[obj.id]) catInfoMap[obj.id] = info;

            if(!obj.isDel){
              const tTree = effType === 0 ? incTree : expTree;
              if(parent){
                if(!parent.isDel){
                  tTree[parent.name] = tTree[parent.name] || [];
                  if(!tTree[parent.name].includes(obj.name)) tTree[parent.name].push(obj.name);
                }
              } else {
                tTree[obj.name] = tTree[obj.name] || [];
              }
            }
          }
        }
      }catch(err){ console.warn('MM ZCATEGORY parse:', err); }

      const ioCols = (db.exec(`PRAGMA table_info("INOUTCOME")`)[0]?.values||[]).map(x=>String(x[1]));
      const subCol = ioCols.find(c=>/^(sub_?ctg|sub_?cat|zsub|subctg)/i.test(c));
      const catNameCol = ioCols.find(c=>/^(ctg_?name|cat_?name|category_?name)/i.test(c));
      const extraSel = [subCol ? `"${subCol}"` : "''", catNameCol ? `"${catNameCol}"` : "''"].join(',');

      let tx = db.exec(`SELECT uid,assetUid,toAssetUid,ZDATE,DO_TYPE,ZMONEY,ZCONTENT,ctgUid,currencyUid,WDATE,txUidTrans,${extraSel} FROM INOUTCOME WHERE COALESCE(IS_DEL,0)=0 ORDER BY CASE WHEN DO_TYPE='3' THEN 0 ELSE 1 END`)[0]?.values || [];
      mmPending = {assets, tx, catInfoMap, expTree, incTree, currencyMap};

      const totalCats = Object.keys(expTree).length + Object.keys(incTree).length;
      const totalSubs = Object.values(expTree).reduce((s,a)=>s+a.length,0) + Object.values(incTree).reduce((s,a)=>s+a.length,0);
      const fxNote = fxSummary.length ? `<div class="hint" style="color:var(--blue)">أسعار الصرف المستخرجة من قاعدة البيانات: <b>${esc(fxSummary.join(' | '))}</b></div>` : '';

      out.innerHTML = `<p class="hint">تم العثور على <b>${assets.length}</b> حساب، <b>${tx.length}</b> حركة، <b>${totalCats}</b> قسم رئيسي، و<b>${totalSubs}</b> قسم فرعي:</p>` +
        fxNote +
        `<label style="display:flex;align-items:center;gap:8px;font-size:.74rem;color:var(--mint);margin:6px 0 8px;cursor:pointer"><input type="checkbox" id="mmReplaceCatsChk" checked> مطابقة واستبدال الأقسام بأقسام Money Manager وتحديث المعاملات</label>` +
        assets.map((a,i)=>{
          const cInfo = detectCurrencyCodeAndRate(a[2], currencyMap);
          return `<div style="display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)"><input type="checkbox" class="mmasset" value="${i}" ${cInfo.supported?'checked':''}><div><b style="font-size:.78rem">${esc(a[1]||'حساب')}</b><small style="display:block;color:var(--muted);font-size:.66rem">${esc(cInfo.code)} ${cInfo.rate!==1?`(سعر الصرف: ${fmt(cInfo.rate)})`:''} · رصيد: ${esc(String(a[3]??0))}</small>${mmTypeSelect(i, cInfo.supported ? mmDefaultType(a[1],a[2]) : 'skip')}</div></div>`;
        }).join('') +
        `<button class="primary" style="margin-top:10px" onclick="commitMmbakDirect()">استيراد الحسابات والأقسام والحركات (EGP / USD / CNY)</button>`;
    }catch(err){ out.textContent = 'تعذر قراءة الملف: ' + err.message; }
  };
  reader.readAsArrayBuffer(file);
}

function commitMmbakDirect(){
  if(!mmPending) return;
  const chosen = [...document.querySelectorAll('.mmasset:checked')].map(x=>Number(x.value));
  if(!chosen.length) return toast('اختر حسابًا واحدًا على الأقل');

  const replaceCats = document.getElementById('mmReplaceCatsChk')?.checked;
  if(replaceCats && (Object.keys(mmPending.expTree||{}).length || Object.keys(mmPending.incTree||{}).length)){
    state.categoryTree = {
      expense: JSON.parse(JSON.stringify(mmPending.expTree||{})),
      income: JSON.parse(JSON.stringify(mmPending.incTree||{}))
    };
    state.categories = Object.keys(state.categoryTree.expense);
    state.incomeCategories = Object.keys(state.categoryTree.income);
  } else {
    syncCategoryTrees();
    for(const [main, subs] of Object.entries(mmPending.expTree||{})){
      state.categoryTree.expense[main] = [...new Set([...(state.categoryTree.expense[main]||[]), ...subs])];
      if(!state.categories.includes(main)) state.categories.push(main);
    }
    for(const [main, subs] of Object.entries(mmPending.incTree||{})){
      state.categoryTree.income[main] = [...new Set([...(state.categoryTree.income[main]||[]), ...subs])];
      if(!state.incomeCategories.includes(main)) state.incomeCategories.push(main);
    }
  }

  const map = new Map(), assetCurMap = new Map(), newAccounts = [];
  for(const i of chosen){
    const a = mmPending.assets[i], name = String(a[1]||'حساب').trim(), currency = String(a[2]||'EGP_EGP');
    const cInfo = detectCurrencyCodeAndRate(currency, mmPending.currencyMap||{});
    if(!cInfo.supported) continue;
    const type = document.querySelector(`.mmtype[data-index="${i}"]`)?.value || mmDefaultType(name,currency);
    if(type === 'skip') continue;
    const existing = state.accounts.find(x=>x.name.trim().toLowerCase()===name.toLowerCase());
    const openingEgp = round2((Number(a[3])||0) * (cInfo.rate || 1));
    const dest = existing || {id:'mm-'+String(a[0]), name, type, opening:openingEgp};
    if(!existing) newAccounts.push(dest);
    map.set(a[0], dest.id);
    assetCurMap.set(a[0], cInfo);
  }

  const txs = [], seenTransferKeys = new Set();
  const existingTxById = new Map(state.transactions.map(x=>[String(x.id), x]));
  const seen = new Set([...state.transactions, ...state.ledger].map(x=>String(x.id)));
  let fxConvertedCount = 0;

  for(const r of mmPending.tx){
    const [uid,asset,to,date,kind,money,content,cat,currency,wdate,txUidTrans,subCtgRaw,catNameRaw] = r;
    if(!map.has(asset)) continue;
    const rawMoney = Math.abs(Number(money)||0);
    if(!rawMoney) continue;

    const txCurInfo = detectCurrencyCodeAndRate(currency, mmPending.currencyMap||{});
    const assetCurInfo = assetCurMap.get(asset) || {code:'EGP', rate:1, supported:true};
    const effCur = txCurInfo.supported ? txCurInfo : assetCurInfo;
    if(!effCur.supported) continue;
    const n = round2(rawMoney * (effCur.rate || 1));
    if(effCur.code === 'USD' || effCur.code === 'CNY') fxConvertedCount++;

    let ds = String(wdate||'').slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(ds)){
      const raw=Number(date);
      ds=Number.isFinite(raw)&&raw>100000000000?localDateISO(new Date(raw)):String(date).slice(0,10);
    }
    const from = val('mmFrom')||'0000-01-01', dateTo = val('mmTo')||'9999-12-31';
    if(ds < from || ds > dateTo) continue;

    const t = String(kind)==='1'?'expense':String(kind)==='0'?'income':(String(kind)==='3'||String(kind)==='4')?'transfer':null;
    if(!t) continue;

    const transferKey = t==='transfer' ? String(txUidTrans||uid) : '';
    if(t==='transfer' && seenTransferKeys.has(transferKey)) continue;
    if(t==='transfer') seenTransferKeys.add(transferKey);
    if(t==='transfer' && !map.has(to)) continue;

    const rawCatKey = String(cat??'').trim();
    const rawSubKey = String(subCtgRaw??'').trim();
    const rawCatName = String(catNameRaw??'').trim();
    const catObj = rawCatKey ? mmPending.catInfoMap[rawCatKey] : null;
    const subObj = rawSubKey ? mmPending.catInfoMap[rawSubKey] : null;
    const nameObj = rawCatName ? mmPending.catInfoMap[rawCatName] : null;

    const cleanMemo = String(content??'').trim();
    const isMemoUuid = /^[0-9a-f-]{16,}$/i.test(cleanMemo);
    let usableMemo = (cleanMemo && !isMemoUuid) ? cleanMemo : '';
    if(effCur.code === 'USD' || effCur.code === 'CNY'){
      const fxTag = `[${fmt(rawMoney)} ${effCur.code}]`;
      usableMemo = usableMemo ? `${usableMemo} ${fxTag}` : fxTag;
    }

    let mainCat = '';
    let subCat = '';
    if(subObj){
      mainCat = subObj.parentName || (catObj ? (catObj.parentName || catObj.name) : subObj.name);
      subCat = (subObj.name && subObj.name !== mainCat) ? subObj.name : '';
    } else if(catObj){
      mainCat = catObj.parentName || catObj.name;
      subCat = catObj.parentName ? catObj.name : '';
    } else if(nameObj){
      mainCat = nameObj.parentName || nameObj.name;
      subCat = nameObj.parentName ? nameObj.name : '';
    } else if(rawCatName && !/^\d+$/.test(rawCatName) && !/^[0-9a-f-]{16,}$/i.test(rawCatName)){
      mainCat = rawCatName;
    } else if(rawCatKey && !/^\d+$/.test(rawCatKey) && !/^[0-9a-f-]{16,}$/i.test(rawCatKey)){
      mainCat = rawCatKey;
    } else {
      mainCat = 'أخرى';
    }
    const titleText = usableMemo;

    if(t === 'expense' || t === 'income'){
      const targetTree = t === 'income' ? state.categoryTree.income : state.categoryTree.expense;
      const targetList = t === 'income' ? state.incomeCategories : state.categories;
      if(mainCat){
        if(!targetTree[mainCat]) targetTree[mainCat] = [];
        if(!targetList.includes(mainCat)) targetList.push(mainCat);
        if(subCat && !targetTree[mainCat].includes(subCat)){
          targetTree[mainCat].push(subCat);
        }
      }
    }

    const id = t==='transfer' ? 'mm-xfer-'+transferKey : 'mm-'+uid;
    if(seen.has(id)){
      const prev = existingTxById.get(id);
      if(prev && t !== 'transfer'){
        prev.category = mainCat;
        prev.subCategory = subCat;
        prev.amount = n;
        prev.title = titleText;
      }
      continue;
    }
    seen.add(id);

    txs.push({
      id,
      type: t,
      title: titleText,
      category: mainCat,
      subCategory: subCat,
      amount: n,
      date: ds,
      accountId: map.get(asset),
      toAccountId: t==='transfer' ? map.get(to) : null,
      importSource: 'mmbak'
    });
  }

  const netByAcc = {};
  for(const t of txs){
    const n = Number(t.amount)||0;
    if(t.type==='transfer'){
      netByAcc[t.accountId] = (netByAcc[t.accountId]||0) - n;
      netByAcc[t.toAccountId] = (netByAcc[t.toAccountId]||0) + n;
    } else if(t.type==='income'){
      netByAcc[t.accountId] = (netByAcc[t.accountId]||0) + n;
    } else if(t.type==='expense'){
      netByAcc[t.accountId] = (netByAcc[t.accountId]||0) - n;
    }
  }
  for(const a of newAccounts){
    a.opening = round2((Number(a.opening)||0) - (netByAcc[a.id]||0));
  }

  state.accounts.push(...newAccounts);
  state.transactions.push(...txs.filter(x=>x.type!=='transfer'));
  state.ledger.push(...txs.filter(x=>x.type==='transfer').map(x=>({id:x.id,type:'transfer',from:x.accountId,to:x.toAccountId,amount:x.amount,fee:0,date:x.date,note:x.title})));

  mmPending = null;
  persist();
  document.getElementById('mmbakPreview').innerHTML = `<div class="hint" style="color:var(--mint)">✓ تم استيراد <b>${newAccounts.length}</b> حساب و<b>${txs.length}</b> حركة (منها <b>${fxConvertedCount}</b> حركة محولة من USD/CNY إلى EGP)!</div>`;
  toast('تم الاستيراد بنجاح ✓');
}


/* =========================================================
   #4.1 FULL STATEMENT MODAL FOR ACCOUNTS & CARDS
   (Daily Transactions Style + Month Filter + Income / Expenses / Net Summary Boxes!)
   ========================================================= */
function addAccount(){
  let name = val('accName').trim(), opening = num('accOpening');
  if(!name) return toast('اكتب اسم الحساب');
  state.accounts.push({id:uid('acc'), name, type:val('accType'), opening});
  persist(); setv('accName',''); setv('accOpening','');
  document.getElementById('addAccountFold')?.removeAttribute('open');
  toast('تمت إضافة الحساب ✓');
}
function deleteAccount(id){
  showAppConfirm('حذف الحساب', 'هل تريد حذف هذا الحساب؟', ()=>{
    state.accounts = state.accounts.filter(a=>a.id!==id);
    persist(); toast('تم حذف الحساب');
  }, true);
}
function closeAccountModal(){
  document.getElementById('accountModal').classList.remove('show');
}

function openCategoriesManagerModal(){
  renderSettingsCategories();
  document.getElementById('catsManagerModal')?.classList.add('show');
}
function closeCategoriesManagerModal(){
  document.getElementById('catsManagerModal')?.classList.remove('show');
}

let stmtAdvFilter = { dateFrom:'', dateTo:'', amountFrom:'', amountTo:'', type:'', cat:'' };

function toggleStmtFilterGrid(){
  const box = document.getElementById('stmtFilterBox');
  const btn = document.getElementById('btnToggleStmtFilter');
  if(!box) return;
  const open = box.style.display === 'none';
  box.style.display = open ? 'block' : 'none';
  const hasAny = !!(stmtAdvFilter.dateFrom || stmtAdvFilter.dateTo || stmtAdvFilter.amountFrom || stmtAdvFilter.amountTo || stmtAdvFilter.type || stmtAdvFilter.cat);
  btn?.classList.toggle('active', open || hasAny);
  updateStmtFilterUI();
}

function updateStmtFilterUI(){
  const hasD = !!(stmtAdvFilter.dateFrom || stmtAdvFilter.dateTo);
  document.getElementById('stmtFCardDate')?.classList.toggle('active', hasD);
  const dEl = document.getElementById('stmtFValDate');
  if(dEl) dEl.textContent = hasD ? `${formatDateDMY(stmtAdvFilter.dateFrom||stmtAdvFilter.dateTo).slice(0,5)} ✕` : '';

  const hasA = !!(stmtAdvFilter.amountFrom || stmtAdvFilter.amountTo);
  document.getElementById('stmtFCardAmt')?.classList.toggle('active', hasA);
  const aEl = document.getElementById('stmtFValAmt');
  if(aEl) aEl.textContent = hasA ? `${stmtAdvFilter.amountFrom||stmtAdvFilter.amountTo} ✕` : '';

  document.getElementById('stmtFCardType')?.classList.toggle('active', !!stmtAdvFilter.type);
  const tEl = document.getElementById('stmtFValType');
  if(tEl) tEl.textContent = stmtAdvFilter.type ? `${stmtAdvFilter.type === 'income' ? 'دخل' : (stmtAdvFilter.type === 'transfer' ? 'تحويل' : 'مصروف')} ✕` : '';

  document.getElementById('stmtFCardCat')?.classList.toggle('active', !!stmtAdvFilter.cat);
  const cEl = document.getElementById('stmtFValCat');
  if(cEl) cEl.textContent = stmtAdvFilter.cat ? `${stmtAdvFilter.cat} ✕` : '';
}

function handleStmtFilterTap(kind){
  if(kind === 'date'){
    if(stmtAdvFilter.dateFrom || stmtAdvFilter.dateTo){
      stmtAdvFilter.dateFrom=''; stmtAdvFilter.dateTo='';
      updateStmtFilterUI(); renderFullStatementModalContent(); return;
    }
    const defS = selected() + '-01', defE = today();
    showAppCustomForm('فلترة بالتاريخ', `<div class="c-list">
      <div class="c-row" onclick="openNativeInputPicker('stFDateF')"><label>من تاريخ</label><div class="picker-trigger" style="position:relative"><b id="stFDispF" dir="ltr">${formatDateDMY(defS)}</b><input id="stFDateF" type="date" value="${esc(defS)}" onchange="document.getElementById('stFDispF').textContent=formatDateDMY(this.value)" style="position:absolute;inset:0;opacity:0;width:100%;height:100%"></div></div>
      <div class="c-row" onclick="openNativeInputPicker('stFDateT')"><label>إلى تاريخ</label><div class="picker-trigger" style="position:relative"><b id="stFDispT" dir="ltr">${formatDateDMY(defE)}</b><input id="stFDateT" type="date" value="${esc(defE)}" onchange="document.getElementById('stFDispT').textContent=formatDateDMY(this.value)" style="position:absolute;inset:0;opacity:0;width:100%;height:100%"></div></div>
    </div>`, ()=>{
      stmtAdvFilter.dateFrom = val('stFDateF')||'';
      stmtAdvFilter.dateTo = val('stFDateT')||'';
      updateStmtFilterUI(); renderFullStatementModalContent(); return true;
    });
    return;
  }
  if(kind === 'amount'){
    if(stmtAdvFilter.amountFrom || stmtAdvFilter.amountTo){
      stmtAdvFilter.amountFrom=''; stmtAdvFilter.amountTo='';
      updateStmtFilterUI(); renderFullStatementModalContent(); return;
    }
    showAppCustomForm('فلترة بالمبلغ', `<div class="c-list">
      <div class="c-row"><label>من مبلغ</label><input id="stFAmtF" type="number" step="0.01" placeholder="0"></div>
      <div class="c-row"><label>إلى مبلغ</label><input id="stFAmtT" type="number" step="0.01" placeholder="اختياري"></div>
    </div>`, ()=>{
      stmtAdvFilter.amountFrom = String(val('stFAmtF')||'').trim();
      stmtAdvFilter.amountTo = String(val('stFAmtT')||'').trim();
      updateStmtFilterUI(); renderFullStatementModalContent(); return true;
    });
    return;
  }
  if(kind === 'type'){
    if(stmtAdvFilter.type){
      stmtAdvFilter.type=''; updateStmtFilterUI(); renderFullStatementModalContent(); return;
    }
    const html = `<div class="cs-opt-list">
      <button type="button" class="cs-opt-btn" onclick="stmtAdvFilter.type='income';closeAppDialog();updateStmtFilterUI();renderFullStatementModalContent()"><span>دخل</span><span>○</span></button>
      <button type="button" class="cs-opt-btn" onclick="stmtAdvFilter.type='expense';closeAppDialog();updateStmtFilterUI();renderFullStatementModalContent()"><span>مصروف</span><span>○</span></button>
      <button type="button" class="cs-opt-btn" onclick="stmtAdvFilter.type='transfer';closeAppDialog();updateStmtFilterUI();renderFullStatementModalContent()"><span>تحويل</span><span>○</span></button>
    </div>`;
    showAppCustomForm('فلترة بالنوع', html, null, true);
    return;
  }
  if(kind === 'cat'){
    if(stmtAdvFilter.cat){
      stmtAdvFilter.cat=''; updateStmtFilterUI(); renderFullStatementModalContent(); return;
    }
    syncCategoryTrees();
    const allC = [...new Set([...Object.keys(state.categoryTree.expense||{}), ...Object.keys(state.categoryTree.income||{})])];
    const html = `<div class="cs-opt-list">` + allC.map(c=>`
      <button type="button" class="cs-opt-btn" onclick="stmtAdvFilter.cat='${escJs(c)}';closeAppDialog();updateStmtFilterUI();renderFullStatementModalContent()"><span>${esc(c)}</span><span>○</span></button>
    `).join('') + `</div>`;
    showAppCustomForm('فلترة بالقسم', html, null, true);
  }
}

function openAccountStatement(id){
  const acc = state.accounts.find(a=>a.id===id);
  if(!acc) return;
  activeStatementState = { kind:'account', id, year:activeYear, month:activeMonth, mode:'monthly' };
  stmtAdvFilter = { dateFrom:'', dateTo:'', amountFrom:'', amountTo:'', type:'', cat:'' };
  updateStmtFilterUI();
  setv('stmtSearchInp', '');
  renderFullStatementModalContent();
  document.getElementById('statementFullModal').classList.add('show');
}

function openCardStatement(cardId){
  const card = state.cards.find(c=>c.id===cardId);
  if(!card) return;
  activeStatementState = { kind:'card', id:cardId, year:activeYear, month:activeMonth, mode:'monthly' };
  stmtAdvFilter = { dateFrom:'', dateTo:'', amountFrom:'', amountTo:'', type:'', cat:'' };
  updateStmtFilterUI();
  setv('stmtSearchInp', '');
  renderFullStatementModalContent();
  document.getElementById('statementFullModal').classList.add('show');
}

function closeFullStatementModal(){
  document.getElementById('statementFullModal')?.classList.remove('show');
  activeStatementState = null;
}

function shiftStatementMonth(delta){
  if(!activeStatementState) return;
  if(activeStatementState.mode === 'yearly'){
    activeStatementState.year += delta;
  } else {
    activeStatementState.mode = 'monthly';
    let m = activeStatementState.month + delta;
    let y = activeStatementState.year;
    if(m < 1){ m = 12; y -= 1; }
    else if(m > 12){ m = 1; y += 1; }
    activeStatementState.month = m;
    activeStatementState.year = y;
  }
  renderFullStatementModalContent();
}

function openStatementPeriodModeDialog(){
  if(!activeStatementState) return;
  openCompactYMPicker(
    null,
    false,
    (chosenYM)=>{
      const [y,m] = chosenYM.split('-').map(Number);
      activeStatementState.year = y;
      activeStatementState.month = m;
      activeStatementState.mode = 'monthly';
      renderFullStatementModalContent();
    },
    (chosenYear)=>{
      activeStatementState.year = chosenYear;
      activeStatementState.mode = 'yearly';
      renderFullStatementModalContent();
    }
  );
  ymPickerState.year = activeStatementState.year;
  ymPickerState.month = activeStatementState.month;
  renderCompactYMPicker();
}

function setStatementYearMode(){
  if(!activeStatementState) return;
  activeStatementState.mode = 'yearly';
  renderFullStatementModalContent();
}

function openStatementMonthPicker(){
  if(!activeStatementState) return;
  openCompactYMPicker(null, false, (chosenYM)=>{
    const [y,m] = chosenYM.split('-').map(Number);
    activeStatementState.year = y;
    activeStatementState.month = m;
    activeStatementState.mode = 'monthly';
    renderFullStatementModalContent();
  });
}

function renderFullStatementModalContent(){
  if(!activeStatementState) return;
  const { kind, id, year, month, mode } = activeStatementState;
  const isYearly = (mode === 'yearly');
  const isEn = (state.prefs?.lang === 'en');
  const ym = String(year) + '-' + String(month).padStart(2,'0');
  const yStr = String(year);
  document.getElementById('stmtPeriodLabel').textContent = isYearly ? yStr : formatYMArabic(ym);

  let combined = [];
  const topTitleEl = document.getElementById('stmtTopTabTitle');
  if(topTitleEl) topTitleEl.textContent = (kind === 'card') ? 'البطاقات' : 'الحسابات';
  const stmtQ = (document.getElementById('stmtSearchInp')?.value || '').trim().toLowerCase();

  if(kind === 'account'){
    const acc = state.accounts.find(a=>a.id===id);
    document.getElementById('stmtModalTitle').textContent = acc ? acc.name : 'الحساب';

    const txItems = (state.transactions||[])
      .filter(t => txMatchesAccount(t, id) && (isYearly ? String(t.date||'').startsWith(yStr) : monthKey(t.date)===ym))
      .map((x, idx)=>({...x, _kind:'tx', _order:getItemTimestampOrder(x, idx)}));

    const ledItems = (state.ledger||[])
      .filter(l => (l.from===id || l.to===id) && (isYearly ? String(l.date||'').startsWith(yStr) : monthKey(l.date)===ym))
      .map((l, idx)=>{
        const fromA = state.accounts.find(a=>a.id===l.from)?.name || (isEn?'Cash':'كاش');
        const toA = state.accounts.find(a=>a.id===l.to)?.name || (isEn?'Cash':'كاش');
        const feeTxt = (Number(l.fee)||0) > 0 ? ` (${isEn?'Fee':'رسوم'}: ${fmt(l.fee)})` : '';
        return {
          id: l.id,
          type: l.type,
          category: l.type==='transfer' ? (isEn?'Transfer':'تحويل') : (isEn?'Adjustment':'تسوية'),
          subCategory: '',
          title: (l.note && l.note !== 'تحويل بين الحسابات') ? (l.note + feeTxt) : feeTxt.trim(),
          note: l.note || '',
          accountLabel: l.type==='transfer' ? `${fromA} → ${toA}` : fromA,
          accountId: l.from,
          toAccountId: l.to,
          amount: l.type==='transfer' ? Number(l.amount)||0 : Number(l.delta??l.amount)||0,
          fee: Number(l.fee)||0,
          date: l.date,
          _kind: 'ledger',
          _order: getItemTimestampOrder(l, 100000 + idx)
        };
      });

    combined = [...txItems, ...ledItems];
  } else {
    const card = state.cards.find(c=>c.id===id);
    const cName = card ? card.name : 'بطاقة';
    document.getElementById('stmtModalTitle').textContent = cName;

    const cardOpIds = new Set((state.cardOps||[]).filter(o=>o.cardId===id).map(o=>o.id));
    const cardPayIds = new Set((state.cardPayments||[]).filter(p=>p.cardId===id).map(p=>p.id));

    // Synthesize missing transaction rows for cardOps if needed
    const existingCardTxs = (state.transactions||[]).filter(t=>t.source && String(t.source).startsWith('card-purchase:'));
    const coveredOpIds = new Set(existingCardTxs.map(t=>String(t.source).replace('card-purchase:','')));
    for(const o of (state.cardOps||[]).filter(op=>op.cardId===id)){
      if(!coveredOpIds.has(o.id)){
        state.transactions.push({
          id: 'card-purchase-' + o.id,
          type: 'card_purchase',
          title: o.title,
          category: o.type==='installment' ? `تقسيط ${o.months} شهر` : 'مشتريات بطاقة',
          subCategory: '',
          amount: Number(o.amount)||0,
          date: o.date || (o.purchaseMonth ? o.purchaseMonth+'-01' : today()),
          accountId: null,
          accountLabel: cName,
          source: 'card-purchase:' + o.id,
          createdAt: o.createdAt || Date.now()
        });
      }
    }

    combined = (state.transactions||[]).filter(t=>{
      if(isYearly ? !String(t.date||'').startsWith(yStr) : monthKey(t.date) !== ym) return false;
      if(t.source && String(t.source).startsWith('card-purchase:')){
        const opId = String(t.source).replace('card-purchase:','');
        if(cardOpIds.has(opId)) return true;
      }
      if(t.linkedCardOpId && cardOpIds.has(t.linkedCardOpId)) return true;
      if(t.linkedCardPaymentRecordId && cardPayIds.has(t.linkedCardPaymentRecordId)) return true;
      if(t.source === 'card-payment' && String(t.title||'').includes(cName)) return true;
      return false;
    }).map((x, idx)=>({
      ...x,
      type: x.source === 'card-payment' ? 'income' : 'expense',
      accountLabel: cName,
      _kind: 'tx',
      _order: getItemTimestampOrder(x, idx)
    }));
  }

  if(stmtQ || stmtAdvFilter.dateFrom || stmtAdvFilter.dateTo || stmtAdvFilter.amountFrom || stmtAdvFilter.amountTo || stmtAdvFilter.type || stmtAdvFilter.cat){
    combined = combined.filter(it => {
      const ds = String(it.date||'').slice(0,10);
      if(stmtAdvFilter.dateFrom && ds < stmtAdvFilter.dateFrom) return false;
      if(stmtAdvFilter.dateTo && ds > stmtAdvFilter.dateTo) return false;
      if(stmtAdvFilter.type && it.type !== stmtAdvFilter.type) return false;
      if(stmtAdvFilter.cat && String(it.category||'').trim() !== stmtAdvFilter.cat) return false;
      if(stmtAdvFilter.amountFrom || stmtAdvFilter.amountTo){
        const amt = Math.abs(Number(it.amount)||0);
        const hasF = stmtAdvFilter.amountFrom !== '' && Number.isFinite(Number(stmtAdvFilter.amountFrom));
        const hasT = stmtAdvFilter.amountTo !== '' && Number.isFinite(Number(stmtAdvFilter.amountTo));
        if(hasF && !hasT && Math.abs(amt - Number(stmtAdvFilter.amountFrom)) > 0.009) return false;
        if(!hasF && hasT && Math.abs(amt - Number(stmtAdvFilter.amountTo)) > 0.009) return false;
        if(hasF && hasT){
          const mn = Math.min(Number(stmtAdvFilter.amountFrom), Number(stmtAdvFilter.amountTo));
          const mx = Math.max(Number(stmtAdvFilter.amountFrom), Number(stmtAdvFilter.amountTo));
          if(amt < mn - 0.009 || amt > mx + 0.009) return false;
        }
      }
      if(stmtQ){
        const hay = [it.title, it.note, it.description, it.category, it.subCategory, String(it.amount||'')].map(x=>String(x||'').toLowerCase()).join(' ');
        if(!hay.includes(stmtQ)) return false;
      }
      return true;
    });
  }
  combined.sort((a,b)=>{
    const dc = String(b.date||'').localeCompare(String(a.date||''));
    if(dc !== 0) return dc;
    return (b._order||0) - (a._order||0);
  });

  // Calculate Income, Expenses, and Net for the statement period (4.1)
  let stmtInc = 0, stmtExp = 0;
  for(const it of combined){
    if(kind === 'account'){
      if(it._kind === 'ledger'){
        if(it.type === 'transfer'){
          if(it.toAccountId === id) stmtInc += Number(it.amount)||0;
          if(it.accountId === id) stmtExp += (Number(it.amount)||0) + (Number(it.fee)||0);
        } else if(it.type === 'adjust'){
          const d = Number(it.amount)||0;
          if(d >= 0) stmtInc += d; else stmtExp += Math.abs(d);
        }
      } else {
        if(it.type === 'income' || it.type === 'fund') stmtInc += Number(it.amount)||0;
        else if(isActualExpenseTx(it) || it.type === 'credit_payment') stmtExp += Number(it.amount)||0;
      }
    } else {
      if(it.type === 'income') stmtInc += Number(it.amount)||0;
      else stmtExp += Number(it.amount)||0;
    }
  }
  stmtInc = round2(stmtInc);
  stmtExp = round2(stmtExp);
  const stmtNet = round2(stmtInc - stmtExp);

  document.getElementById('stmtIncomeHero').textContent = maskable(fmtNum(stmtInc));
  document.getElementById('stmtExpenseHero').textContent = maskable(fmtNum(stmtExp));
  const netEl = document.getElementById('stmtNetHero');
  netEl.textContent = maskable(fmtNum(stmtNet));
  netEl.className = stmtNet >= 0 ? 'mint' : 'red';

  document.getElementById('stmtTransactionsFeed').innerHTML = buildDailyGroupedFeedHtml(
    combined,
    `لا توجد معاملات مسجلة في (${isYearly ? yStr : formatYMArabic(ym)}).`
  );
}

function openEditAccountModal(id){
  const acc = state.accounts.find(a=>a.id===id);
  if(!acc) return;
  const curBal = accountBalance(acc);
  document.getElementById('accModalTitle').textContent = 'تعديل الحساب: ' + acc.name;
  document.getElementById('accModalBody').innerHTML = `
    <div class="c-list">
      <div class="c-row"><label>اسم الحساب</label><input id="editAccName" value="${esc(acc.name)}"></div>
      <div class="c-row"><label>النوع</label>
        <select id="editAccType">
          <option value="cash" ${acc.type==='cash'?'selected':''}>كاش</option>
          <option value="bank" ${acc.type==='bank'?'selected':''}>حساب بنكي</option>
          <option value="wallet" ${acc.type==='wallet'?'selected':''}>محفظة إلكترونية</option>
          <option value="prepaid" ${acc.type==='prepaid'?'selected':''}>بطاقة مسبقة الدفع</option>
        </select>
      </div>
      <div class="c-row"><label>الرصيد الحالي</label><input id="editAccCurBal" type="number" step="0.01" value="${curBal}"></div>
    </div>
    <p class="hint">عند تغيير الرصيد الحالي سيتم إضافة حركة تسوية تلقائية لضبط الرصيد.</p>
    <div class="actions">
      <button type="button" class="primary" onclick="saveEditedAccount('${acc.id}')">حفظ التعديل</button>
      <button type="button" class="secondary" onclick="closeAccountModal()">إلغاء</button>
    </div>
  `;
  syncCustomSelectTriggers();
  document.getElementById('accountModal').classList.add('show');
}
function saveEditedAccount(id){
  const acc = state.accounts.find(a=>a.id===id);
  if(!acc) return;
  const newName = val('editAccName').trim();
  if(!newName) return toast('اكتب اسم الحساب');
  const oldBal = accountBalance(acc);
  const newBal = num('editAccCurBal');
  const diff = round2(newBal - oldBal);
  acc.name = newName;
  acc.type = val('editAccType') || acc.type;
  if(Math.abs(diff) >= 0.01){
    state.ledger.push({
      id: uid('adj'),
      type: 'adjust',
      from: acc.id,
      delta: diff,
      amount: Math.abs(diff),
      note: 'تسوية رصيد الحساب',
      date: today()
    });
  }
  persist();
  closeAccountModal();
  toast('تم تعديل الحساب ✓');
}

function renderAccountsAndCards(){
  const total = allAccountsAvailable();
  document.getElementById('accountsTotal').textContent = maskable(egpSmart(total));
  document.getElementById('accountsList').innerHTML = state.accounts.length ? state.accounts.map(a=>`
    <div class="listitem" onclick="toggleItemActions(this,event)">
      <div class="info">
        <b>${esc(a.name)}</b>
        <small>${({cash:'كاش',bank:'حساب بنكي',wallet:'محفظة إلكترونية',prepaid:'بطاقة مسبقة الدفع'})[a.type]||a.type}</small>
      </div>
      <strong>${maskable(egpSmart(accountBalance(a)))}</strong>
      <div class="tap-actions">
        <button type="button" class="smallbtn" style="border-color:var(--mint);color:var(--mint)" onclick="openAccountStatement('${a.id}')">كشف حساب</button>
        <button type="button" class="smallbtn" style="border-color:var(--blue);color:var(--blue)" onclick="openEditAccountModal('${a.id}')">تعديل</button>
        <button type="button" class="smallbtn danger" onclick="deleteAccount('${a.id}')">حذف</button>
      </div>
    </div>
  `).join('') : '<div class="empty">لا توجد حسابات مسجلة.</div>';

  const debt = allCardsOutstanding();
  document.getElementById('cardDebtTotal').textContent = maskable(egpSmart(debt));

  const cardOpts = state.cards.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('') || '<option value="">لا توجد بطاقة</option>';
  const opCardEl = document.getElementById('opCard');
  if(opCardEl) opCardEl.innerHTML = cardOpts;

  document.getElementById('cardsList').innerHTML = state.cards.length ? state.cards.map(c=>{
    const d = cardTotalOutstanding(c);
    const av = cardCurrentAvailable(c);
    const lim = Number(c.limit)||0;
    return `<div class="listitem" onclick="toggleItemActions(this,event)">
      <div class="info">
        <b>${esc(c.name)}</b>
      </div>
      <strong class="mint" style="font-size:.82rem"><small style="color:var(--muted);font-size:.66rem;margin-right:4px">الرصيد المتاح:</small>${maskable(egpSmart(av))}</strong>
      <div class="card-detail-strip">
        <div><small>الحد الائتماني</small><b class="blue">${maskable(egp(lim))}</b></div>
        <div><small>المتاح</small><b class="mint">${maskable(egp(av))}</b></div>
        <div><small>المبلغ المستحق للسداد</small><b class="orange">${maskable(egp(d))}</b></div>
      </div>
      <div class="tap-actions">
        <button type="button" class="smallbtn" style="border-color:var(--mint);color:var(--mint)" onclick="openCardStatement('${c.id}')">كشف حساب</button>
        <button type="button" class="smallbtn" style="border-color:var(--blue);color:var(--blue)" onclick="openEditCardModal('${c.id}')">تعديل</button>
        <button type="button" class="smallbtn danger" onclick="deleteCard('${c.id}')">حذف</button>
      </div>
    </div>`;
  }).join('') : '<div class="empty">لا توجد بطاقات مسجلة.</div>';
}

function recalculateInstallmentOpWithTerms(op, card, monthlyRateDecimal, adminRateDecimal){
  if(op.type !== 'installment') return;
  const amount = Number(op.amount)||0;
  const months = Number(op.months)||12;
  const nums = computeCardInstallmentNumbers(card, amount, months, monthlyRateDecimal, adminRateDecimal);
  const { interest, fee, base } = nums;
  const purchaseYM = op.purchaseMonth || String(op.date||today()).slice(0,7);
  const oldPaidByMonth = {};
  (op.schedules||[]).forEach(sc=>{ oldPaidByMonth[sc.month] = Number(sc.paid)||0; });
  const built = buildInstallmentSchedulesForCard(card, purchaseYM, months, base, fee);
  op.purchaseMonth = purchaseYM;
  op.interest = interest;
  op.adminFee = fee;
  op.installment = base;
  op.total = round2(amount + interest + fee);
  op.feeMonth = built.feeYM;
  op.feeDue = fee;
  op.schedules = built.schedules.map(sc=>({
    ...sc,
    paid: Math.min(sc.amount, oldPaidByMonth[sc.month]||0)
  }));
}

function openEditCardModal(cardId){
  const card = state.cards.find(c=>c.id===cardId);
  if(!card) return;
  const curAvail = cardCurrentAvailable(card);
  const terms = card.terms || {};
  const termMonths = [3,6,9,12,15,18,24];
  const termsRowsHtml = termMonths.map(m=>{
    const t = terms[m] || {monthlyRate:0, adminRate:0};
    const irPct = round2((Number(t.monthlyRate)||0) * 100);
    const feePct = round2((Number(t.adminRate)||0) * 100);
    return `<div class="c-row" style="min-height:38px;padding:4px 8px">
      <label>${m} شهر</label>
      <div style="display:flex;gap:6px;width:62%">
        <input id="edIr${m}" type="number" step="0.01" value="${irPct}" placeholder="فائدة %" style="width:50%">
        <input id="edFee${m}" type="number" step="0.01" value="${feePct}" placeholder="رسوم %" style="width:50%">
      </div>
    </div>`;
  }).join('');

  const formHtml = `
    <div class="c-list">
      <div class="c-row"><label>اسم البطاقة</label><input id="edCardName" value="${esc(card.name)}"></div>
      <div class="c-row"><label>الحد الائتماني</label><input id="edCardLimit" type="number" step="0.01" value="${Number(card.limit)||0}"></div>
      <div class="c-row"><label>الرصيد المتاح</label><input id="edCardAvail" type="number" step="0.01" value="${curAvail}"></div>
      <div class="c-row"><label>يوم السداد</label><input id="edCardPayDay" type="number" min="1" max="28" value="${card.payDay||3}"></div>
    </div>
    <details class="fold" style="margin-top:8px" open>
      <summary><span class="ic-txt"><i>%</i><span>تعديل نظام التقسيط للبطاقة</span></span><span>▼</span></summary>
      <div class="fold-body">
        <div style="display:grid;grid-template-columns:38% 31% 31%;padding:4px 8px 8px;font-size:.68rem;color:var(--mint);border-bottom:1px solid var(--line);margin-bottom:6px">
          <span>المدة</span>
          <span style="text-align:center">الفائدة الشهرية %</span>
          <span style="text-align:center">الرسوم الإدارية %</span>
        </div>
        <div class="c-list">${termsRowsHtml}</div>
      </div>
    </details>
  `;

  showAppCustomForm('تعديل البطاقة: ' + card.name, formHtml, ()=>{
    const nm = val('edCardName').trim();
    const lim = num('edCardLimit');
    const av = num('edCardAvail');
    if(!nm || lim <= 0){ toast('أكمل اسم البطاقة والحد الائتماني'); return false; }

    const newTerms = {...(card.terms||{})};
    let termsChanged = false;
    termMonths.forEach(m=>{
      const oldT = (card.terms||{})[m] || {monthlyRate:0, adminRate:0};
      const newIr = round2(num('edIr'+m)/100);
      const newFee = round2(num('edFee'+m)/100);
      if(Math.abs(newIr - (oldT.monthlyRate||0)) > 0.00001 || Math.abs(newFee - (oldT.adminRate||0)) > 0.00001){
        termsChanged = true;
      }
      newTerms[m] = { monthlyRate: newIr, adminRate: newFee };
    });

    const hasExistingInstOps = state.cardOps.some(o=>o.cardId===card.id && o.type==='installment');
    card.name = nm;
    card.limit = lim;
    card.payDay = num('edCardPayDay') || 3;
    const opsOut = cardOpsOutstandingFor(card.id);
    card.balance = round2(Math.max(0, lim - av - opsOut));
    card.terms = newTerms;

    if(termsChanged && hasExistingInstOps){
      setTimeout(()=>{
        const askHtml = `
          <p class="hint" style="margin:0 0 12px;font-size:.8rem;color:var(--text)">تم تغيير نظام التقسيط للبطاقة. هل تريد تطبيق التعديل على:</p>
          <div style="display:flex;flex-direction:column;gap:8px">
            <button type="button" class="primary" onclick="applyCardTermsScope('${card.id}', 'new_only')">المعاملات الجديدة فقط</button>
            <button type="button" class="secondary" style="border-color:var(--mint);color:var(--mint)" onclick="applyCardTermsScope('${card.id}', 'all')">المعاملات الجديدة والحالية (إعادة احتساب الأقساط)</button>
          </div>
        `;
        showAppCustomForm('نطاق تطبيق نظام التقسيط', askHtml, null, true);
      }, 80);
      return true;
    }

    syncCardInstallmentsToCommitments();
    persist();
    toast('تم تعديل البطاقة ✓');
    return true;
  });
}

function applyCardTermsScope(cardId, scope){
  const card = state.cards.find(c=>c.id===cardId);
  if(card && scope === 'all'){
    state.cardOps.filter(o=>o.cardId===cardId && o.type==='installment').forEach(op=>{
      const m = Number(op.months)||12;
      const trm = (card.terms||{})[m] || {monthlyRate:0, adminRate:0};
      recalculateInstallmentOpWithTerms(op, card, trm.monthlyRate||0, trm.adminRate||0);
    });
  }
  syncCardInstallmentsToCommitments();
  closeAppDialog();
  persist();
  toast(scope === 'all' ? 'تم تطبيق نظام التقسيط على المعاملات الجديدة والحالية ✓' : 'تم حفظ النظام للمعاملات الجديدة فقط ✓');
}

function deleteCard(cardId){
  showAppConfirm('حذف البطاقة', 'هل تريد حذف هذه البطاقة وجميع عملياتها المسجلة؟', ()=>{
    const opIds = new Set(state.cardOps.filter(o=>o.cardId===cardId).map(o=>o.id));
    state.cards = state.cards.filter(c=>c.id!==cardId);
    state.cardOps = state.cardOps.filter(o=>o.cardId!==cardId);
    state.transactions = state.transactions.filter(t=>!t.source || ![...opIds].some(id=>t.source==='card-purchase:'+id));
    syncCardInstallmentsToCommitments();
    persist();
    toast('تم حذف البطاقة ✓');
  }, true);
}

function openEditCardOpModal(opId){
  const op = state.cardOps.find(o=>o.id===opId);
  if(!op) return;
  const card = state.cards.find(c=>c.id===op.cardId);
  const isInst = op.type === 'installment';
  const curMonths = Number(op.months)||12;
  const curTerm = (card?.terms||{})[curMonths] || {monthlyRate:0, adminRate:0};
  const curIrPct = op.amount && curMonths ? round2(((Number(op.interest)||0) / (Number(op.amount) * curMonths)) * 100) : round2((curTerm.monthlyRate||0)*100);
  const curFeePct = op.amount ? round2(((Number(op.adminFee)||0) / Number(op.amount)) * 100) : round2((curTerm.adminRate||0)*100);

  const formHtml = `
    <div class="c-list">
      <div class="c-row"><label>وصف العملية</label><input id="edOpTitle" value="${esc(op.title)}"></div>
      <div class="c-row"><label>المبلغ الأصلي</label><input id="edOpAmount" type="number" step="0.01" value="${Number(op.amount)||0}"></div>
      <div class="c-row"><label>شهر الشراء</label><input id="edOpPurchaseYM" type="month" value="${esc(op.purchaseMonth || monthKey(op.date) || selected())}"></div>
      ${isInst ? `
        <div class="c-row"><label>مدة التقسيط</label>
          <select id="edOpMonths">
            ${[3,6,9,12,15,18,24,36].map(m=>`<option value="${m}" ${curMonths===m?'selected':''}>${m} شهر</option>`).join('')}
          </select>
        </div>
        <div class="c-row"><label>الفائدة الشهرية %</label><input id="edOpIrPct" type="number" step="0.01" value="${curIrPct}"></div>
        <div class="c-row"><label>الرسوم الإدارية %</label><input id="edOpFeePct" type="number" step="0.01" value="${curFeePct}"></div>
      ` : ''}
    </div>
    <p class="hint">التعديل هنا يقتصر على هذه المعاملة فقط.</p>
  `;
  showAppCustomForm('تعديل معاملة البطاقة', formHtml, ()=>{
    const title = val('edOpTitle').trim();
    const amount = num('edOpAmount');
    const pYM = val('edOpPurchaseYM') || op.purchaseMonth || selected();
    if(!title || amount <= 0){ toast('أدخل الوصف والمبلغ بشكل صحيح'); return false; }

    op.title = title;
    op.amount = amount;
    op.purchaseMonth = pYM;
    op.date = pYM + '-' + (String(op.date||'01').slice(8,10) || '01');
    op.dueDate = card ? dueDateFor(card, op.date) : op.dueDate;

    if(isInst){
      const months = num('edOpMonths') || 12;
      const irDec = round2(num('edOpIrPct') / 100);
      const feeDec = round2(num('edOpFeePct') / 100);
      op.months = months;
      recalculateInstallmentOpWithTerms(op, card, irDec, feeDec);
    }

    const linkedTx = state.transactions.find(tx=>tx.source==='card-purchase:'+op.id);
    if(linkedTx){
      linkedTx.title = 'شراء بالبطاقة - ' + title;
      linkedTx.amount = amount;
      linkedTx.date = op.date;
    }
    syncCardInstallmentsToCommitments();
    persist();
    refreshSecondaryFeeds();
    toast('تم تعديل المعاملة ✓');
    return true;
  });
}

function deleteCardOp(opId){
  showAppConfirm('حذف عملية البطاقة', 'هل تريد حذف هذه العملية وإلغاء أقساطها المرتبطة؟', ()=>{
    state.cardOps = state.cardOps.filter(o=>o.id!==opId);
    state.transactions = state.transactions.filter(t=>t.source!=='card-purchase:'+opId);
    syncCardInstallmentsToCommitments();
    persist();
    refreshSecondaryFeeds();
    toast('تم حذف العملية ✓');
  }, true);
}

function applyKnownBankTerms(){
  let n = val('cardName').trim().toLowerCase();
  if(n.includes('qnb')){ [3,6,12].forEach(m=>setv('ir'+m,2.18)); [15,18,24].forEach(m=>setv('ir'+m,1.98)); }
}
function addCard(){
  let name = val('cardName').trim(); if(!name) return toast('اكتب اسم البطاقة');
  const limit = num('cardLimit'), available = num('cardAvailable');
  if(limit<=0) return toast('أدخل الحد الائتماني');
  let terms={}; [3,6,9,12,15,18,24,36].forEach(n=>terms[n]={monthlyRate:round2(num('ir'+n)/100), adminRate:round2(num('fee'+n)/100)});
  state.cards.push({id:uid('card'), name, payDay:num('cardPayDay')||3, limit, balance:round2(Math.max(0,limit-available)), terms});
  persist(); setv('cardName',''); setv('cardLimit',''); setv('cardAvailable','');
  document.getElementById('addCardFold')?.removeAttribute('open');
  toast('تم حفظ البطاقة ✓');
}
function dueDateFor(card,date){
  let d=new Date(date+'T12:00:00'), y=d.getFullYear(), m=d.getMonth()+1, day=card.payDay||3;
  let due=new Date(y,m,day);
  return due.getFullYear()+'-'+String(due.getMonth()+1).padStart(2,'0')+'-'+String(due.getDate()).padStart(2,'0');
}


/* =========================================================
   #6: COMMITMENTS PAGE (الالتزامات)
   - 6.1 & 6.2 جميع المستحقات: Add Amount column (المبلغ) & change "التزامات شهرية" to "شهري"
   ========================================================= */
function cancelAddCommitmentForm(){
  document.getElementById('addCommitmentFold')?.removeAttribute('open');
  setv('defTitle',''); setv('defAmount',''); setv('defNote','');
  setv('monTitle',''); setv('monAmount',''); setv('monNote','');
  setv('opTitle',''); setv('opAmount','');
}
function setCommitmentAddKind(kind){
  setv('comAddKind', kind);
  document.getElementById('comKindTabDef')?.classList.toggle('active', kind==='deferred');
  document.getElementById('comKindTabMon')?.classList.toggle('active', kind==='monthly');
  document.getElementById('comKindTabCard')?.classList.toggle('active', kind==='card');

  document.getElementById('comFormDeferred').style.display = kind==='deferred' ? 'flex' : 'none';
  document.getElementById('comFormMonthly').style.display = kind==='monthly' ? 'flex' : 'none';
  document.getElementById('comFormCard').style.display = kind==='card' ? 'flex' : 'none';

  if(kind === 'monthly') recalcMonthlyCommitmentEnd();
  if(kind === 'card') showCreditQuote();
}

function recalcMonthlyCommitmentEnd(){
  const startYM = val('comStartVal') || selected();
  const dur = Math.max(1, Math.round(num('monDuration') || 12));
  const endYM = addMonthsYM(startYM, dur - 1);
  setv('comEndVal', endYM);
  setv('comEndAutoLabel', formatYMArabic(endYM));
}

function selectOpMonthsPill(mVal, btn){
  setv('opMonths', mVal);
  document.querySelectorAll('#opMonthsPills .m-pill').forEach(b=>b.classList.toggle('active', b===btn));
  showCreditQuote();
}
function setCardOpType(t){
  setv('opType', t);
  document.getElementById('segOpSwipe')?.classList.toggle('active', t==='swipe');
  document.getElementById('segOpInst')?.classList.toggle('active', t==='installment');
  document.querySelectorAll('.installment-only').forEach(e=>e.style.display = t==='installment' ? 'flex' : 'none');
  showCreditQuote();
}

function openCardOpPurchasePicker(){
  openCompactYMPicker('opPurchase', false, ()=>{
    showCreditQuote();
  });
}

function showCreditQuote(){
  const el = document.getElementById('creditQuote'); if(!el) return;
  const card = state.cards.find(c=>c.id===val('opCard')), amount = num('opAmount'), months = num('opMonths')||12;
  if(!card || !amount || val('opType')!=='installment'){
    el.innerHTML='<div class="empty" style="padding:10px">أدخل المبلغ لعرض جدول الفائدة/الرسوم وأول قسط.</div>';
    return;
  }
  const nums = computeCardInstallmentNumbers(card, amount, months);
  const { isSuez, interest, fee, base } = nums;
  const purchaseYM = val('opPurchaseVal') || selected();
  const built = buildInstallmentSchedulesForCard(card, purchaseYM, months, base, fee);

  const firstRowLabel = isSuez ? 'رسوم إدارية' : 'فائدة';
  const firstRowAmt = isSuez ? fee : round2(interest / months);
  const firstRowMonth = isSuez ? formatYMArabic(built.feeYM) : formatYMArabic(built.firstInstYM);
  const instRowAmt = base;

  el.innerHTML = `
    <table class="com-all-table" style="font-size:.74rem">
      <thead>
        <tr>
          <th>البند</th>
          <th>المبلغ</th>
          <th>شهر الاستحقاق</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><b>${firstRowLabel}</b></td>
          <td dir="ltr" class="orange"><b>${fmtNum(firstRowAmt)}</b></td>
          <td>${esc(firstRowMonth)}</td>
        </tr>
        <tr>
          <td><b>أول قسط</b></td>
          <td dir="ltr" class="mint"><b>${fmtNum(instRowAmt)}</b></td>
          <td>${esc(formatYMArabic(built.firstInstYM))}</td>
        </tr>
      </tbody>
    </table>
  `;
}

function addCardOperation(){
  let card=state.cards.find(c=>c.id===val('opCard')), type=val('opType')||'installment', amount=num('opAmount'), title=val('opTitle').trim();
  const purchaseYM = val('opPurchaseVal') || selected();
  const date = purchaseYM + '-01';
  if(!card||!amount||!title) return toast('أكمل بيانات البطاقة والوصف والمبلغ');
  const nowTs = Date.now();
  let op={id:uid('op'), cardId:card.id, type, title, amount, date, purchaseMonth:purchaseYM, paid:0, dueDate:dueDateFor(card,date), createdAt:nowTs};
  if(type==='installment'){
    const months = num('opMonths')||12;
    const nums = computeCardInstallmentNumbers(card, amount, months);
    const built = buildInstallmentSchedulesForCard(card, purchaseYM, months, nums.base, nums.fee);
    op.months=months; op.interest=nums.interest; op.adminFee=nums.fee; op.installment=nums.base; op.total=nums.total;
    op.feeMonth=built.feeYM; op.feeDue=nums.fee; op.feePaid=0;
    op.schedules=built.schedules;
  }
  state.cardOps.push(op);
  state.transactions.push({id:'card-purchase-'+op.id, type:'card_purchase', title:'شراء بالبطاقة - '+title, category:'مشتريات بطاقة', amount, date, accountId:null, source:'card-purchase:'+op.id, createdAt:nowTs});
  if(type==='installment') syncCardInstallmentsToCommitments();
  persist(); setv('opTitle',''); setv('opAmount','');
  document.getElementById('addCommitmentFold')?.removeAttribute('open');
  toast('تم تسجيل عملية البطاقة وإدراجها في المستحقات ✓');
}

function saveNewCommitmentItem(){
  const kind = val('comAddKind') || 'deferred';
  const nowTs = Date.now();
  if(kind === 'deferred'){
    const title = val('defTitle').trim();
    const amount = num('defAmount');
    const dueDate = val('defDueDate') || today();
    const note = val('defNote').trim();
    if(!title || amount <= 0) return toast('أدخل اسم العملية والمبلغ');
    state.commitments.push({
      id: uid('com'),
      title,
      type: 'مستحقات مؤجلة',
      freq: 'once',
      amount,
      start: dueDate.slice(0,7),
      end: dueDate.slice(0,7),
      dueDate,
      note,
      createdAt: nowTs
    });
    setv('defTitle',''); setv('defAmount',''); setv('defNote','');
    document.getElementById('addCommitmentFold')?.removeAttribute('open');
    persist(); toast('تم حفظ المستحق المؤجل ✓');
    return;
  }
  if(kind === 'monthly'){
    const title = val('monTitle').trim();
    const amount = num('monAmount');
    const dur = Math.max(1, Math.round(num('monDuration') || 12));
    const startYM = val('comStartVal') || selected();
    const endYM = addMonthsYM(startYM, dur - 1);
    const note = val('monNote').trim();
    if(!title || amount <= 0) return toast('أدخل اسم الالتزام والمبلغ الشهري');
    state.commitments.push({
      id: uid('com'),
      title,
      type: 'شهري',
      freq: 'monthly',
      durationMonths: dur,
      amount,
      start: startYM,
      end: endYM,
      day: 1,
      note,
      createdAt: nowTs
    });
    setv('monTitle',''); setv('monAmount',''); setv('monNote','');
    document.getElementById('addCommitmentFold')?.removeAttribute('open');
    persist(); toast('تم حفظ الالتزام الشهري ✓');
  }
}

function syncCardInstallmentsToCommitments(){
  const validOpIds = new Set((state.cardOps||[]).filter(o=>o.type==='installment').map(o=>o.id));
  state.commitments = (state.commitments||[]).filter(c => !c.cardOpId || validOpIds.has(c.cardOpId));
  for(const op of (state.cardOps||[])){
    if(op.type !== 'installment') continue;
    const cName = state.cards.find(c=>c.id===op.cardId)?.name || 'بطاقة';
    const comId = 'com-cardop-' + op.id;
    const firstM = op.schedules?.[0]?.month || op.feeMonth || String(op.date||'').slice(0,7);
    const lastM = op.schedules?.[op.schedules.length-1]?.month || firstM;
    const existing = state.commitments.find(c=>c.id===comId);
    if(!existing){
      state.commitments.push({id:comId, cardOpId:op.id, title:`${op.title} (${cName})`, type:'معاملات بالبطاقة', freq:'monthly', durationMonths:Number(op.months)||12, amount:round2(Number(op.installment)||0), start:firstM, end:lastM, day:3, createdAt:op.createdAt||Date.now()});
    } else {
      existing.title = `${op.title} (${cName})`;
      existing.type = 'معاملات بالبطاقة';
      existing.durationMonths = Number(op.months)||12;
      existing.amount = round2(Number(op.installment)||0);
      existing.start = firstM;
      existing.end = lastM;
    }
  }
}

function getUnifiedMonthlyDues(m){
  syncCardInstallmentsToCommitments();
  const items = [];
  let totalDue = 0;

  const deferredList = (state.commitments||[]).filter(c => c.freq === 'once' && ((c.dueDate && String(c.dueDate).slice(0,7) === m) || (!c.dueDate && c.start === m)));
  for(const c of deferredList){
    const amt = round2(Number(c.amount)||0);
    const paid = round2((state.commitmentPayments||[]).filter(p=>p.commitmentId===c.id).reduce((s,p)=>s+(Number(p.amount)||0),0));
    const rem = round2(Math.max(0, amt - paid));
    totalDue = round2(totalDue + amt);
    items.push({
      uid: c.id,
      kind: 'commitment',
      categoryType: 'مستحق',
      title: c.title,
      sub: c.dueDate ? `استحقاق: ${c.dueDate}` : 'مرة واحدة',
      amount: amt,
      paid,
      remaining: rem
    });
  }

  const monthlyList = (state.commitments||[]).filter(c => (c.freq||'monthly') === 'monthly' && !c.cardOpId && commitmentDue(c, m));
  for(const c of monthlyList){
    const amt = round2(Number(c.amount)||0);
    const paid = round2((state.commitmentPayments||[]).filter(p=>p.commitmentId===c.id && p.month===m).reduce((s,p)=>s+(Number(p.amount)||0),0));
    const rem = round2(Math.max(0, amt - paid));
    totalDue = round2(totalDue + amt);
    items.push({
      uid: c.id,
      kind: 'commitment',
      categoryType: 'شهري',
      title: c.title,
      sub: `${formatYMArabic(c.start)} ← ${formatYMArabic(c.end)}`,
      amount: amt,
      paid,
      remaining: rem
    });
  }

  for(const op of (state.cardOps||[])){
    const card = state.cards.find(x=>x.id===op.cardId);
    const cName = card?.name || 'بطاقة';
    if(op.type === 'swipe'){
      const dueYM = op.dueDate ? op.dueDate.slice(0,7) : addMonthsYM(op.purchaseMonth || monthKey(op.date), 1);
      if(dueYM === m){
        const amt = round2(Number(op.amount)||0);
        const paid = round2(Number(op.paid)||0);
        const rem = round2(Math.max(0, amt - paid));
        totalDue = round2(totalDue + amt);
        items.push({
          uid: op.id,
          kind: 'card_swipe',
          opId: op.id,
          categoryType: cName,
          title: op.title,
          sub: 'شراء كامل',
          amount: amt,
          paid,
          remaining: rem
        });
      }
    } else if(op.type === 'installment'){
      if(op.feeMonth === m && (Number(op.feeDue)||0) > 0){
        const amt = round2(Number(op.feeDue)||0);
        const paid = round2(Number(op.feePaid)||0);
        const rem = round2(Math.max(0, amt - paid));
        totalDue = round2(totalDue + amt);
        items.push({
          uid: op.id + ':fee',
          kind: 'card_fee',
          opId: op.id,
          categoryType: 'رسوم ' + cName,
          title: `رسوم: ${op.title}`,
          sub: `تقسيط ${op.months} شهر`,
          amount: amt,
          paid,
          remaining: rem
        });
      }
      (op.schedules||[]).forEach((sc, idx)=>{
        if(sc.month === m){
          const amt = round2(Number(sc.amount)||0);
          const paid = round2(Number(sc.paid)||0);
          const rem = round2(Math.max(0, amt - paid));
          totalDue = round2(totalDue + amt);
          items.push({
            uid: `${op.id}:inst:${m}`,
            kind: 'card_inst',
            opId: op.id,
            month: m,
            categoryType: 'قسط ' + cName,
            title: op.title,
            sub: `قسط ${idx+1} من ${op.months}`,
            amount: amt,
            paid,
            remaining: rem
          });
        }
      });
    }
  }

  return { items, totalDue: round2(totalDue) };
}

function openPayDueDialog(kind, uid, opId, month, defaultAmt, itemTitle){
  if(defaultAmt <= 0){
    toast('مسدد بالكامل ✓ (احذف معاملة السداد من المعاملات اليومية لإلغاء السداد)');
    return;
  }
  const m = month || selected();
  const defAcc = state.prefs?.defaultAccount || state.accounts[0]?.id || '';
  const accOpts = state.accounts.map(a=>`<option value="${a.id}" ${a.id===defAcc?'selected':''}>${esc(a.name)} (${fmt(accountBalance(a))} EGP)</option>`).join('') || '<option value="">كاش</option>';

  const formHtml = `
    <div class="c-list">
      <div class="c-row"><label>البند</label><input value="${esc(itemTitle)}" readonly style="color:var(--mint)"></div>
      <div class="c-row"><label>السداد من حساب</label><select id="payDueAccSel">${accOpts}</select></div>
      <div class="c-row"><label>تاريخ السداد</label><input id="payDueDateInp" type="date" value="${today()}"></div>
      <div class="c-row"><label>المبلغ المسدد</label><input id="payDueAmtInp" type="number" step="0.01" value="${defaultAmt}"></div>
    </div>
    <p class="hint">سيتم تسجيل حركة سداد من الحساب المختار، وإذا حذفت الحركة من المعاملات اليومية لاحقاً سيعود البند إلى غير مسدد تلقائياً.</p>
  `;

  showAppCustomForm('تسجيل سداد مستحق', formHtml, ()=>{
    const accId = val('payDueAccSel') || null;
    const payDate = val('payDueDateInp') || today();
    const payAmt = round2(num('payDueAmtInp'));
    if(payAmt <= 0){ toast('أدخل مبلغ السداد بشكل صحيح'); return false; }
    const nowTs = Date.now();

    if(kind === 'commitment'){
      const c = state.commitments.find(x=>x.id===uid);
      if(!c) return false;
      const payRecId = uid('cmp');
      state.commitmentPayments.push({
        id: payRecId,
        commitmentId: c.id,
        month: m,
        amount: payAmt,
        date: payDate,
        accountId: accId
      });
      state.transactions.push({
        id: uid('com-pay'),
        type: 'expense',
        title: 'سداد ' + c.title,
        category: c.type || 'التزامات',
        amount: payAmt,
        date: payDate,
        accountId: accId,
        source: 'commitment-payment',
        linkedCommitmentPaymentId: payRecId,
        createdAt: nowTs
      });
      persist();
      toast('تم تسجيل السداد وخصمه من الحساب ✓');
      return true;
    }

    const op = state.cardOps.find(o=>o.id===opId);
    if(!op) return false;
    const card = state.cards.find(c=>c.id===op.cardId);
    const cName = card?.name || 'بطاقة';
    let payTitle = '';
    if(kind === 'card_swipe'){
      op.paid = round2((Number(op.paid)||0) + payAmt);
      payTitle = `سداد بطاقة (${cName}) - ${op.title}`;
    } else if(kind === 'card_fee'){
      op.feePaid = round2((Number(op.feePaid)||0) + payAmt);
      payTitle = `سداد رسوم بطاقة (${cName}) - ${op.title}`;
    } else if(kind === 'card_inst'){
      const sc = (op.schedules||[]).find(s=>s.month===m);
      if(sc) sc.paid = round2((Number(sc.paid)||0) + payAmt);
      payTitle = `سداد قسط بطاقة (${cName}) - ${op.title}`;
    }
    const cardPayRecId = uid('cp');
    state.cardPayments.push({id:cardPayRecId, cardId:op.cardId, amount:payAmt, date:payDate, accountId:accId});
    state.transactions.push({
      id: uid('cardpay'),
      type: 'credit_payment',
      title: payTitle,
      category: 'سداد بطاقة',
      amount: payAmt,
      date: payDate,
      accountId: accId,
      source: 'card-payment',
      linkedCardOpId: op.id,
      linkedCardPayKind: kind,
      linkedCardPayMonth: m,
      linkedCardPaymentRecordId: cardPayRecId,
      createdAt: nowTs
    });
    persist();
    toast('تم تسجيل سداد البطاقة ✓');
    return true;
  });
}

function openEditCommitmentModal(id){
  const c = state.commitments.find(x=>x.id===id);
  if(!c) return;
  if(c.cardOpId){
    openEditCardOpModal(c.cardOpId);
    return;
  }
  const isOnce = c.freq === 'once';
  const formHtml = `
    <div class="c-list">
      <div class="c-row"><label>اسم العملية</label><input id="edComTitle" value="${esc(c.title)}"></div>
      <div class="c-row"><label>المبلغ</label><input id="edComAmount" type="number" step="0.01" value="${Number(c.amount)||0}"></div>
      ${isOnce
        ? `<div class="c-row"><label>تاريخ الاستحقاق</label><input id="edComDueDate" type="date" value="${esc(c.dueDate||today())}"></div>`
        : `<div class="c-row"><label>تاريخ البدء</label><input id="edComStartYM" type="month" value="${esc(c.start||selected())}"></div>
           <div class="c-row"><label>الفترة بالأشهر</label><input id="edComDur" type="number" min="1" max="360" value="${Number(c.durationMonths)||12}"></div>`
      }
      <div class="c-row"><label>ملاحظة</label><input id="edComNote" value="${esc(c.note||'')}"></div>
    </div>
  `;
  showAppCustomForm('تعديل: ' + c.title, formHtml, ()=>{
    const title = val('edComTitle').trim();
    const amount = num('edComAmount');
    if(!title || amount <= 0){ toast('أدخل الاسم والمبلغ بشكل صحيح'); return false; }
    c.title = title;
    c.amount = amount;
    if(isOnce){
      const dd = val('edComDueDate') || today();
      c.dueDate = dd;
      c.start = dd.slice(0,7);
      c.end = dd.slice(0,7);
    } else {
      const st = val('edComStartYM') || c.start || selected();
      const dur = Math.max(1, Math.round(num('edComDur')||12));
      c.start = st;
      c.durationMonths = dur;
      c.end = addMonthsYM(st, dur - 1);
    }
    c.note = val('edComNote').trim();
    persist();
    toast('تم تعديل الالتزام ✓');
    return true;
  });
}

function deleteCommitment(id){
  showAppConfirm('حذف الالتزام', 'هل تريد حذف هذا الالتزام نهائياً؟', ()=>{
    state.commitments = state.commitments.filter(x=>x.id!==id);
    persist(); toast('تم الحذف');
  }, true);
}

function openMonthlyDueActionsModal(kind, uidStr, opId, month, leftAmt, titleStr){
  const isCardItem = kind !== 'commitment';
  const html = `
    <div style="display:flex;flex-direction:column;gap:8px">
      <button type="button" class="primary" onclick="closeAppDialog();openPayDueDialog('${escJs(kind)}','${escJs(uidStr)}','${escJs(opId)}','${escJs(month)}',${leftAmt},'${escJs(titleStr)}')">${leftAmt > 0 ? '💳 تسجيل سداد المستحق' : '✓ مسدد بالكامل'}</button>
      <button type="button" class="secondary" style="border-color:var(--blue);color:var(--blue)" onclick="closeAppDialog();${isCardItem ? `openEditCardOpModal('${escJs(opId)}')` : `openEditCommitmentModal('${escJs(uidStr)}')`}">✎ تعديل البيانات</button>
      <button type="button" class="smallbtn danger" style="padding:10px;border-radius:12px" onclick="closeAppDialog();${isCardItem ? `deleteCardOp('${escJs(opId)}')` : `deleteCommitment('${escJs(uidStr)}')`}">🗑 حذف</button>
    </div>
  `;
  showAppCustomForm(titleStr, html, null, true);
}

function renderPlanScreen(){
  const m = selected();
  const { items, totalDue } = getUnifiedMonthlyDues(m);
  document.getElementById('comHeroMonthLabel').textContent = formatYMArabic(m);
  document.getElementById('comHeroTotal').textContent = maskable(egpSmart(totalDue));
  document.getElementById('comMonthLabel').textContent = formatYMArabic(m);

  const listEl = document.getElementById('commitmentsList');
  if(!items.length){
    listEl.innerHTML = '<div class="empty">لا توجد مبالغ مستحقة في هذا الشهر.</div>';
  } else {
    // 4.5 Unified Horizontal-Scroll Table for Monthly Dues matching All Commitments with full details
    listEl.innerHTML = `
      <table class="com-all-table">
        <thead>
          <tr>
            <th>المعاملة</th>
            <th>النوع</th>
            <th>التفاصيل</th>
            <th style="text-align:right">المبلغ</th>
            <th style="text-align:right">المسدد</th>
            <th style="text-align:right">المتبقي</th>
            <th>الحالة</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(it=>{
            const left = it.remaining;
            const actCall = `openMonthlyDueActionsModal('${escJs(it.kind)}','${escJs(it.uid)}','${escJs(it.opId||'')}','${m}',${left},'${escJs(it.title)}')`;
            return `
              <tr style="cursor:pointer" onclick="${actCall}">
                <td><b>${esc(it.title)}</b></td>
                <td>${esc(it.categoryType)}</td>
                <td><small style="color:var(--muted)">${esc(it.sub)}</small></td>
                <td style="text-align:right;direction:ltr"><b>${maskable(fmtNum(it.amount))}</b></td>
                <td style="text-align:right;direction:ltr" class="mint">${maskable(fmtNum(it.paid))}</td>
                <td style="text-align:right;direction:ltr" class="${left>0?'orange':'mint'}"><b>${maskable(fmtNum(left))}</b></td>
                <td><span class="tag" style="color:${left>0?'var(--orange)':'var(--mint)'}">${left>0?'سداد':'مسدد'}</span></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  renderAllCommitmentsMasterTable();
  renderYearlyExcelReport();
}

/* 6.1 & 6.2 جميع المستحقات: Columns = المعاملة | النوع (شهري / مستحقات / بطاقة) | المبلغ | المدة | البدء | الانتهاء */
function openCommitmentDetailsModal(title, typeLbl, amtStr, durLbl, startLbl, endLbl){
  const html = `
    <div class="c-list">
      <div class="c-row"><label>النوع</label><b style="color:var(--mint)">${esc(typeLbl)}</b></div>
      <div class="c-row"><label>القيمة</label><b dir="ltr" class="orange">${esc(amtStr)}</b></div>
      <div class="c-row"><label>المدة</label><b>${esc(durLbl)}</b></div>
      <div class="c-row"><label>البدء</label><b>${esc(startLbl)}</b></div>
      <div class="c-row"><label>الانتهاء</label><b>${esc(endLbl)}</b></div>
    </div>
  `;
  showAppCustomForm(title, html, null, true);
}

function renderAllCommitmentsMasterTable(){
  const wrap = document.getElementById('allCommitmentsTableWrap');
  if(!wrap) return;
  syncCardInstallmentsToCommitments();

  const allRows = [];
  (state.commitments||[]).filter(c => !c.cardOpId).forEach((c, idx)=>{
    const isOnce = (c.freq === 'once');
    const startYM = isOnce ? (c.dueDate ? c.dueDate.slice(0,7) : c.start) : c.start;
    const endYM = isOnce ? '' : c.end;
    let durNum = Number(c.durationMonths) || 0;
    if(!isOnce && !durNum && startYM && endYM){
      const [sy, sm] = startYM.split('-').map(Number);
      const [ey, em] = endYM.split('-').map(Number);
      durNum = Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
    }
    allRows.push({
      id: c.id,
      isCard: false,
      title: c.title,
      typeLabel: isOnce ? 'مستحق' : 'شهري',
      amountVal: Number(c.amount)||0,
      durLabel: isOnce ? 'مرة' : (durNum ? `${durNum} ش` : 'شهري'),
      startLabel: formatYMArabic(startYM),
      endLabel: isOnce ? '—' : formatYMArabic(endYM),
      order: getItemTimestampOrder(c, idx)
    });
  });

  (state.cardOps||[]).forEach((op, idx)=>{
    const isInst = (op.type === 'installment');
    const firstM = isInst ? (op.schedules?.[0]?.month || op.feeMonth || op.purchaseMonth) : (op.dueDate ? op.dueDate.slice(0,7) : op.purchaseMonth);
    const lastM = isInst ? (op.schedules?.[op.schedules.length-1]?.month || firstM) : '';
    allRows.push({
      id: op.id,
      isCard: true,
      title: op.title,
      typeLabel: 'بطاقة',
      amountVal: isInst ? (Number(op.installment)||0) : (Number(op.amount)||0),
      durLabel: isInst ? `${op.months} ش` : 'مرة',
      startLabel: formatYMArabic(firstM),
      endLabel: isInst ? formatYMArabic(lastM) : '—',
      order: getItemTimestampOrder(op, 50000 + idx)
    });
  });

  allRows.sort((a,b) => (b.order||0) - (a.order||0));

  if(!allRows.length){
    wrap.innerHTML = '<div class="empty">لا توجد مستحقات أو التزامات مسجلة بعد.</div>';
    return;
  }

  wrap.innerHTML = allRows.map(r=>{
    const editCall = r.isCard ? `openEditCardOpModal('${escJs(r.id)}')` : `openEditCommitmentModal('${escJs(r.id)}')`;
    const delCall = r.isCard ? `deleteCardOp('${escJs(r.id)}')` : `deleteCommitment('${escJs(r.id)}')`;
    const detCall = `openCommitmentDetailsModal('${escJs(r.title)}','${escJs(r.typeLabel)}','${maskable(egpSmart(r.amountVal))}','${escJs(r.durLabel)}','${escJs(r.startLabel)}','${escJs(r.endLabel)}')`;
    return `
      <div class="listitem" onclick="toggleItemActions(this,event)">
        <div class="info">
          <b>${esc(r.title)}</b>
          <small>${esc(r.typeLabel)}</small>
        </div>
        <strong class="orange">${maskable(egpSmart(r.amountVal))}</strong>
        <div class="tap-actions">
          <button type="button" class="smallbtn" style="border-color:var(--mint);color:var(--mint)" onclick="${detCall}">تفاصيل</button>
          <button type="button" class="smallbtn" style="border-color:var(--blue);color:var(--blue)" onclick="${editCall}">تعديل</button>
          <button type="button" class="smallbtn danger" onclick="${delCall}">حذف</button>
        </div>
      </div>
    `;
  }).join('');
}


/* =========================================================
   #7. MANUAL YEARLY FINANCIAL REPORT + COLLAPSIBLE LIST OF ADDED ITEMS ("تعديل البنود المضافة")
   ========================================================= */
function setAnnualPlanItemType(t){
  setv('annItemType', t);
  document.getElementById('annTypeIncBtn')?.classList.toggle('active', t==='income');
  document.getElementById('annTypeExpBtn')?.classList.toggle('active', t==='expense');
}

function recalcAnnualPlanItemEnd(){
  const startYM = val('annStartVal') || (String(forecastYear) + '-01');
  const dur = Math.max(1, Math.round(num('annItemDuration') || 12));
  const endYM = addMonthsYM(startYM, dur - 1);
  setv('annEndVal', endYM);
  setv('annEndAutoLabel', formatYMArabic(endYM));
}

function saveAnnualPlanItem(){
  const type = val('annItemType') || 'income';
  const title = val('annItemTitle').trim();
  const amount = num('annItemAmount');
  const dur = Math.max(1, Math.round(num('annItemDuration') || 12));
  const startYM = val('annStartVal') || (String(forecastYear) + '-01');
  const endYM = addMonthsYM(startYM, dur - 1);
  if(!title || amount <= 0) return toast('أدخل اسم البند والمبلغ الشهري');

  state.annualPlanItems = state.annualPlanItems || [];
  state.annualPlanItems.push({
    id: uid('ann'),
    type,
    title,
    amount: round2(amount),
    durationMonths: dur,
    start: startYM,
    end: endYM
  });
  setv('annItemTitle', '');
  setv('annItemAmount', '');
  document.getElementById('addManualAnnualFold')?.removeAttribute('open');
  persist();
  toast('تمت إضافة البند للتقرير السنوي ✓');
}

function openEditAnnualPlanItem(id){
  const item = (state.annualPlanItems||[]).find(x=>x.id===id);
  if(!item) return;
  const formHtml = `
    <div class="c-list">
      <div class="c-row"><label>نوع البند</label>
        <select id="edAnnType">
          <option value="income" ${item.type==='income'?'selected':''}>بند دخل</option>
          <option value="expense" ${item.type==='expense'?'selected':''}>بند صرف / التزام</option>
        </select>
      </div>
      <div class="c-row"><label>اسم البند</label><input id="edAnnTitle" value="${esc(item.title)}"></div>
      <div class="c-row"><label>المبلغ الشهري</label><input id="edAnnAmt" type="number" step="0.01" value="${Number(item.amount)||0}"></div>
      <div class="c-row"><label>تاريخ البدء</label><input id="edAnnStart" type="month" value="${esc(item.start)}"></div>
      <div class="c-row"><label>المدة بالأشهر</label><input id="edAnnDur" type="number" min="1" max="120" value="${Number(item.durationMonths)||12}"></div>
    </div>
    <div style="margin-top:10px">
      <button type="button" class="smallbtn danger" style="width:100%;padding:8px" onclick="deleteAnnualPlanItem('${item.id}')">حذف هذا البند من الجدول السنوي</button>
    </div>
  `;
  showAppCustomForm('تعديل بند التقرير السنوي', formHtml, ()=>{
    const t = val('edAnnTitle').trim();
    const a = num('edAnnAmt');
    const st = val('edAnnStart') || item.start;
    const dur = Math.max(1, Math.round(num('edAnnDur')||12));
    if(!t || a <= 0){ toast('أكمل الاسم والمبلغ'); return false; }
    item.type = val('edAnnType') || item.type;
    item.title = t;
    item.amount = round2(a);
    item.start = st;
    item.durationMonths = dur;
    item.end = addMonthsYM(st, dur - 1);
    persist();
    toast('تم تحديث البند ✓');
    return true;
  });
}

function deleteAnnualPlanItem(id){
  state.annualPlanItems = (state.annualPlanItems||[]).filter(x=>x.id!==id);
  closeAppDialog();
  persist();
  toast('تم حذف البند من الجدول السنوي');
}

function renderYearlyExcelReport(){
  const headEl = document.getElementById('yearlyExcelHead');
  const bodyEl = document.getElementById('yearlyBreakdownBody');
  const listContainer = document.getElementById('annualPlanItemsListContainer');
  if(!headEl || !bodyEl) return;

  const curYM = selected();
  const y = String(forecastYear);
  document.getElementById('forecastYearLabel').textContent = y;

  const items = state.annualPlanItems || [];
  // 7.1 Render added items inside the collapsible "تعديل البنود المضافة" fold
  if(listContainer){
    if(!items.length){
      listContainer.innerHTML = '<div class="empty" style="padding:12px">لا توجد بنود مضافة بعد. افتح «إضافة بند للتقرير السنوي» بالأعلى لإضافة بنود الدخل أو المصروفات.</div>';
    } else {
      listContainer.innerHTML = items.map(it=>`
        <div class="listitem" style="padding:9px 4px;cursor:pointer" onclick="openEditAnnualPlanItem('${it.id}')">
          <div class="info">
            <b>${esc(it.title)} <span class="tag" style="color:${it.type==='income'?'var(--blue)':'var(--orange)'}">${it.type==='income'?'دخل':'صرف'}</span></b>
            <small>${formatYMArabic(it.start)} ← ${formatYMArabic(it.end)} (${it.durationMonths||12} شهر)</small>
          </div>
          <strong class="${it.type==='income'?'blue':'orange'}">${maskable(egpSmart(it.amount))} ✎</strong>
        </div>
      `).join('');
    }
  }

  const incItems = items.filter(x=>x.type==='income');
  const expItems = items.filter(x=>x.type==='expense');
  const incCols = [...new Set(incItems.map(x=>x.title))];
  const expCols = [...new Set(expItems.map(x=>x.title))];

  const monthData = [];
  for(let m=1; m<=12; m++){
    const mk = y + '-' + String(m).padStart(2,'0');
    const incByCol = {};
    const expByCol = {};
    let totInc = 0, totExp = 0;

    incCols.forEach(col => {
      const valSum = incItems
        .filter(it => it.title === col && mk >= it.start && mk <= it.end)
        .reduce((s, it) => s + (Number(it.amount)||0), 0);
      incByCol[col] = round2(valSum);
      totInc = round2(totInc + valSum);
    });

    expCols.forEach(col => {
      const valSum = expItems
        .filter(it => it.title === col && mk >= it.start && mk <= it.end)
        .reduce((s, it) => s + (Number(it.amount)||0), 0);
      expByCol[col] = round2(valSum);
      totExp = round2(totExp + valSum);
    });

    const net = round2(totInc - totExp);
    monthData.push({ m, mk, incByCol, expByCol, totInc, totExp, net });
  }

  headEl.innerHTML = `
    <tr>
      <th class="sticky-col">الشهر</th>
      ${incCols.map(c=>`<th style="color:var(--blue)">${esc(c)}</th>`).join('')}
      ${expCols.map(c=>`<th style="color:var(--orange)">${esc(c)}</th>`).join('')}
      <th style="color:var(--blue);background:var(--surface)">إجمالي الدخل</th>
      <th style="color:var(--red);background:var(--surface)">إجمالي المصروفات</th>
      <th style="color:var(--mint);background:var(--surface)">الصافي</th>
    </tr>
  `;

  const colSums = {
    inc: Object.fromEntries(incCols.map(c=>[c,0])),
    exp: Object.fromEntries(expCols.map(c=>[c,0])),
    totInc: 0, totExp: 0, net: 0
  };

  let rowsHtml = '';
  for(const md of monthData){
    incCols.forEach(c => { colSums.inc[c] = round2(colSums.inc[c] + (md.incByCol[c]||0)); });
    expCols.forEach(c => { colSums.exp[c] = round2(colSums.exp[c] + (md.expByCol[c]||0)); });
    colSums.totInc = round2(colSums.totInc + md.totInc);
    colSums.totExp = round2(colSums.totExp + md.totExp);
    colSums.net = round2(colSums.net + md.net);

    rowsHtml += `
      <tr class="${md.mk===curYM?'cur-row':''}">
        <td class="sticky-col"><b>${monthNamesAr[md.m-1]}</b></td>
        ${incCols.map(c=>`<td>${maskable(fmtInt(md.incByCol[c]||0))}</td>`).join('')}
        ${expCols.map(c=>`<td>${maskable(fmtInt(md.expByCol[c]||0))}</td>`).join('')}
        <td class="blue"><b>${maskable(fmtInt(md.totInc))}</b></td>
        <td class="red"><b>${maskable(fmtInt(md.totExp))}</b></td>
        <td class="${md.net>=0?'mint':'red'}"><b>${maskable((md.net>0?'+':'')+fmtInt(md.net))}</b></td>
      </tr>
    `;
  }

  rowsHtml += `
    <tr class="sum-row">
      <td class="sticky-col"><b>الإجمالي</b></td>
      ${incCols.map(c=>`<td class="blue"><b>${maskable(fmtInt(colSums.inc[c]||0))}</b></td>`).join('')}
      ${expCols.map(c=>`<td class="orange"><b>${maskable(fmtInt(colSums.exp[c]||0))}</b></td>`).join('')}
      <td class="blue"><b>${maskable(fmtInt(colSums.totInc))}</b></td>
      <td class="red"><b>${maskable(fmtInt(colSums.totExp))}</b></td>
      <td class="${colSums.net>=0?'mint':'red'}"><b>${maskable((colSums.net>0?'+':'')+fmtInt(colSums.net))}</b></td>
    </tr>
  `;
  bodyEl.innerHTML = rowsHtml;
}


/* =========================================================
   SALARY CALCULATOR (Inside More / Settings)
   ========================================================= */
function initSalary(){
  let y=document.getElementById('salYear'), m=document.getElementById('salMonth'); if(!y||!m) return;
  for(let i=new Date().getFullYear()-3; i<=new Date().getFullYear()+10; i++) y.add(new Option(i,String(i)));
  monthNamesAr.forEach((n,i)=>m.add(new Option(n,String(i+1))));
  y.value = String(activeYear); m.value = String(activeMonth);
  loadSalaryConfig();
}
function loadSalaryConfig(){
  let y=val('salYear'), c=state.salaryConfig[y]||{};
  const cfg={Basic:0,Attendance:0,Years:0,WorkHours:8,WorkDays:30,AllowanceRate:1,RestRate:2,OTRate:1.5,HolidayRate:2,MealPrice:70,InsAdd1:1400,InsAdd2:800,InsuranceBaseRate:10,MedicalRate:6,MartyrsRate:0.05};
  Object.entries(cfg).forEach(([k,v])=>setv('sal'+k, c[k]??v));
  let k=y+'-'+String(Number(val('salMonth')||1)).padStart(2,'0'), d=state.salaryMonths[k]||{};
  setv('salRating',d.Rating??0); setv('salAllowanceHours',d.AllowanceHours??0); setv('salRestHours',d.RestHours??0);
  setv('salOvertime',d.Overtime??0); setv('salHoliday',d.Holiday??0); setv('salDays',d.Days??0); setv('sal12H',d.Hours12??0); setv('salOther',d.Other??0);
  updateMealPreview(); showSalaryResult();
}
function saveSalaryConfig(){
  let y=val('salYear');
  state.salaryConfig[y]={Basic:num('salBasic'),Attendance:num('salAttendance'),Years:num('salYears'),WorkHours:num('salWorkHours')||8,WorkDays:num('salWorkDays')||30,AllowanceRate:num('salAllowanceRate'),RestRate:num('salRestRate'),OTRate:num('salOTRate'),HolidayRate:num('salHolidayRate'),MealPrice:num('salMealPrice'),InsAdd1:num('salInsAdd1'),InsAdd2:num('salInsAdd2'),InsuranceBaseRate:num('salInsuranceBaseRate'),MedicalRate:num('salMedicalRate'),MartyrsRate:num('salMartyrsRate')};
  persist(); toast('تم حفظ إعدادات '+y);
}
function updateMealPreview(){
  let days=num('salDays'), h12=num('sal12H'), aH=num('salAllowanceHours'), wH=num('salWorkHours')||8;
  setv('sal8Days', round2(Math.max(0, days-(aH/wH)-h12)));
}
function calcTaxFromNovember(gross,insurance){
  const a=Math.max(0,(gross-insurance)*12);
  let annual=0;
  if(a<=60000) annual=0;
  else if(a<=75000) annual=(a-60000)*0.10;
  else if(a<=90000) annual=(a-75000)*0.15+1500;
  else if(a<=220000) annual=(a-90000)*0.20+3750;
  else if(a<=420000) annual=(a-220000)*0.225+29750;
  else if(a<=620000) annual=(a-420000)*0.25+74750;
  else if(a<=720000) annual=(a-620000)*0.25+128750;
  else if(a<=820000) annual=(a-720000)*0.25+156500;
  else if(a<=920000) annual=(a-820000)*0.25+185000;
  else if(a<=1220000) annual=(a-920000)*0.25+215000;
  else annual=(a-1220000)*0.275+300000;
  return round2(annual/12);
}
function calcSalary(d,c){
  const B=+c.Basic||0, hourly=B/(+c.WorkDays||30)/(+c.WorkHours||8);
  const aPay=round2(hourly*(+c.AllowanceRate||0)*(+d.AllowanceHours||0));
  const rPay=round2(hourly*(+c.RestRate||0)*(+d.RestHours||0));
  const oPay=round2(hourly*(+c.OTRate||0)*(+d.Overtime||0));
  const hPay=round2(hourly*(+c.HolidayRate||0)*(+d.Holiday||0));
  const h8=round2(Math.max(0,(+d.Days||0)-((+d.AllowanceHours||0)/(+c.WorkHours||8))-(+d.Hours12||0)));
  const meal=round2(h8*(+c.MealPrice||70)+(+d.Hours12||0)*(+c.MealPrice||70)*2);
  const gross=round2(B+(+d.Rating||0)+aPay+rPay+oPay+hPay+meal+(+c.Attendance||0)+(+c.Years||0)+(+d.Other||0));
  const martyrs=round2(gross*((+c.MartyrsRate||0)/100));
  const insBase=ceilTo((B+(+c.InsAdd1||0)+(+c.InsAdd2||0))/1.3,10);
  const insurance=round2(insBase*((+c.InsuranceBaseRate||0)/100)+(B+(+c.InsAdd1||0)+(+c.InsAdd2||0))*((+c.MedicalRate||0)/100));
  const tax=calcTaxFromNovember(gross,insurance);
  return {gross, martyrs, insurance, tax, net:round2(gross-martyrs-insurance-tax)};
}
function saveSalaryMonth(){
  saveSalaryConfig();
  let y=val('salYear'), key=y+'-'+String(num('salMonth')).padStart(2,'0');
  let d={Rating:num('salRating'),AllowanceHours:num('salAllowanceHours'),RestHours:num('salRestHours'),Overtime:num('salOvertime'),Holiday:num('salHoliday'),Days:num('salDays'),Hours12:num('sal12H'),Other:num('salOther'),PayDay:num('salPayDay')||1};
  let r=calcSalary(d, state.salaryConfig[y]||{});
  state.salaryMonths[key]={...d, result:r};
  const aid = state.prefs?.defaultAccount || state.accounts[0]?.id || null;
  const date = key + '-' + String(d.PayDay).padStart(2,'0');
  let ex = state.transactions.find(t=>t.source==='salary:'+key);
  if(ex){ ex.amount=r.net; ex.date=date; }
  else { state.transactions.push({id:'salary-'+key, type:'income', title:'صافي المرتب', amount:r.net, category:'راتب', date, source:'salary:'+key, accountId:aid, createdAt:Date.now()}); }
  persist(); showSalaryResult(); toast('تم حساب وحفظ صافي المرتب ✓');
}
function showSalaryResult(){
  let y=val('salYear'), key=y+'-'+String(Number(val('salMonth')||1)).padStart(2,'0'), d=state.salaryMonths[key], el=document.getElementById('salaryResult');
  if(!el) return;
  if(!d){ el.innerHTML='<div class="empty">أدخل بيانات الشهر واضغط احسب لعرض تفاصيل المرتب.</div>'; return; }
  let r=calcSalary(d, state.salaryConfig[y]||{});
  el.innerHTML=`<div class="rowline"><span>إجمالي المرتب</span><b>${egp(r.gross)}</b></div><div class="rowline"><span>التأمينات</span><b>${egp(r.insurance)}</b></div><div class="rowline"><span>الضرائب</span><b>${egp(r.tax)}</b></div><div class="hero" style="margin-top:10px;min-height:74px"><label>صافي المرتب</label><div class="amount">${egp(r.net)}</div></div>`;
}


/* =========================================================
   SETTINGS CATEGORIES TREE MANAGER
   ========================================================= */
let settingsCatMode = 'income';
let expandedSettingsMainCats = {};

function onSettingsCatsFoldToggle(det){
  const ic = document.getElementById('settingsCatsFoldIcon');
  if(!ic) return;
  if(det.open){
    ic.textContent = '＋';
    ic.title = 'إضافة قسم رئيسي جديد';
    ic.onclick = function(ev){
      ev.preventDefault();
      ev.stopPropagation();
      addMainCategoryInSettings();
    };
  } else {
    ic.textContent = '▼';
    ic.title = '';
    ic.onclick = null;
  }
}

function setSettingsCatTab(mode){
  settingsCatMode = mode;
  document.getElementById('setCatTabInc')?.classList.toggle('active', mode==='income');
  document.getElementById('setCatTabExp')?.classList.toggle('active', mode==='expense');
  renderSettingsCategories();
}

function addMainCategoryInSettings(){
  const title = settingsCatMode==='income' ? 'إضافة قسم دخل رئيسي' : 'إضافة قسم مصروفات رئيسي';
  showAppPrompt(title, 'اكتب اسم القسم الرئيسي...', '', (n)=>{
    if(!n || !n.trim()) return;
    const clean = n.trim();
    syncCategoryTrees();
    const tree = settingsCatMode==='income' ? state.categoryTree.income : state.categoryTree.expense;
    if(!tree[clean]) tree[clean] = [];
    if(settingsCatMode==='income') state.incomeCategories = [...new Set([...(state.incomeCategories||[]), clean])];
    else state.categories = [...new Set([...(state.categories||[]), clean])];
    persist();
    toast('تمت إضافة القسم الرئيسي ✓');
  });
}

function renameMainCategoryInSettings(oldName){
  showAppPrompt('تعديل اسم القسم الرئيسي', 'الاسم الجديد...', oldName, (n)=>{
    if(!n || !n.trim() || n.trim()===oldName) return;
    const clean = n.trim();
    syncCategoryTrees();
    const tree = settingsCatMode==='income' ? state.categoryTree.income : state.categoryTree.expense;
    const subs = tree[oldName] || [];
    delete tree[oldName];
    tree[clean] = [...new Set([...(tree[clean]||[]), ...subs])];
    if(settingsCatMode==='income'){
      state.incomeCategories = (state.incomeCategories||[]).map(x=>x===oldName?clean:x);
    } else {
      state.categories = (state.categories||[]).map(x=>x===oldName?clean:x);
    }
    state.transactions.forEach(t=>{ if(t.category===oldName) t.category=clean; });
    persist();
    toast('تم تعديل اسم القسم ✓');
  });
}

function addSubCategoryInSettings(mainName){
  showAppPrompt(`إضافة فرعي داخل «${mainName}»`, 'اكتب اسم القسم الفرعي...', '', (n)=>{
    if(!n || !n.trim()) return;
    const clean = n.trim();
    syncCategoryTrees();
    const tree = settingsCatMode==='income' ? state.categoryTree.income : state.categoryTree.expense;
    tree[mainName] = [...new Set([...(tree[mainName]||[]), clean])];
    expandedSettingsMainCats[mainName] = true;
    persist();
    toast('تمت إضافة القسم الفرعي ✓');
  });
}

function renameSubCategoryInSettings(mainName, oldSub){
  showAppPrompt('تعديل اسم القسم الفرعي', 'الاسم الجديد...', oldSub, (n)=>{
    if(!n || !n.trim() || n.trim()===oldSub) return;
    const clean = n.trim();
    syncCategoryTrees();
    const tree = settingsCatMode==='income' ? state.categoryTree.income : state.categoryTree.expense;
    tree[mainName] = (tree[mainName]||[]).map(s=>s===oldSub?clean:s);
    state.transactions.forEach(t=>{ if(t.category===mainName && t.subCategory===oldSub) t.subCategory=clean; });
    persist();
    toast('تم تعديل القسم الفرعي ✓');
  });
}

function toggleSettingsMainCatExpand(mainName){
  const was = !!expandedSettingsMainCats[mainName];
  expandedSettingsMainCats = {};
  if(!was) expandedSettingsMainCats[mainName] = true;
  renderSettingsCategories();
}

function moveMainCategoryOrder(mainName, dir){
  syncCategoryTrees();
  const isInc = (settingsCatMode === 'income');
  const tree = isInc ? state.categoryTree.income : state.categoryTree.expense;
  const keys = Object.keys(tree || {});
  const idx = keys.indexOf(mainName);
  const newIdx = idx + dir;
  if(idx === -1 || newIdx < 0 || newIdx >= keys.length) return;
  const swapped = [...keys];
  const tmp = swapped[idx];
  swapped[idx] = swapped[newIdx];
  swapped[newIdx] = tmp;
  const rebuilt = {};
  swapped.forEach(k => { rebuilt[k] = tree[k]; });
  if(isInc){
    state.categoryTree.income = rebuilt;
    state.incomeCategories = swapped;
  } else {
    state.categoryTree.expense = rebuilt;
    state.categories = swapped;
  }
  persist();
}

function moveSubCategoryOrder(mainName, subName, dir){
  syncCategoryTrees();
  const isInc = (settingsCatMode === 'income');
  const tree = isInc ? state.categoryTree.income : state.categoryTree.expense;
  const subs = [...(tree[mainName] || [])];
  const idx = subs.indexOf(subName);
  const newIdx = idx + dir;
  if(idx === -1 || newIdx < 0 || newIdx >= subs.length) return;
  const tmp = subs[idx];
  subs[idx] = subs[newIdx];
  subs[newIdx] = tmp;
  tree[mainName] = subs;
  persist();
}

function renderSettingsCategories(){
  const container = document.getElementById('settingsCatsTreeContainer');
  if(!container) return;
  syncCategoryTrees();
  document.getElementById('setCatTabInc')?.classList.toggle('active', settingsCatMode==='income');
  document.getElementById('setCatTabExp')?.classList.toggle('active', settingsCatMode==='expense');
  const isInc = (settingsCatMode === 'income');
  const tree = isInc ? state.categoryTree.income : state.categoryTree.expense;
  const entries = Object.entries(tree||{});
  if(!entries.length){
    container.innerHTML = '<div class="empty">لا توجد أقسام مسجلة. اضغط على علامة ＋ بالأعلى للإضافة.</div>';
    return;
  }
  container.innerHTML = entries.map(([mc, subs])=>{
    const isOpen = !!expandedSettingsMainCats[mc];
    const previewSubs = subs.length ? subs.slice(0,5).join('، ') + (subs.length>5 ? '…' : '') : 'لا توجد أقسام فرعية';
    const subsHtml = isOpen ? `
      <div class="cat-mgr-subs" data-parent-cat="${esc(mc)}">
        <div class="sub-drag-list" data-parent-cat="${esc(mc)}">
          ${subs.map(sc=>`
            <div class="cat-mgr-sub-row" data-cat-name="${esc(sc)}" style="margin-bottom:4px">
              <div style="display:flex;align-items:center;min-width:0;flex:1">
                <span class="cat-drag-handle sub-drag-handle" title="اسحب لإعادة الترتيب">☰</span>
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(sc)}</span>
              </div>
              <button type="button" class="icon-act-btn" title="تعديل الفرعي" onclick="renameSubCategoryInSettings('${escJs(mc)}','${escJs(sc)}')">✎</button>
            </div>
          `).join('')}
        </div>
        <button type="button" class="smallbtn" style="width:100%;margin-top:2px;border-color:var(--mint);color:var(--mint)" onclick="addSubCategoryInSettings('${escJs(mc)}')">＋ إضافة قسم فرعي</button>
      </div>
    ` : '';
    return `
      <div class="cat-mgr-row" data-cat-name="${esc(mc)}">
        <div class="cat-mgr-main">
          <span class="cat-drag-handle main-drag-handle" title="اسحب لإعادة الترتيب">☰</span>
          <div class="cat-mgr-main-title" onclick="toggleSettingsMainCatExpand('${escJs(mc)}')">
            <b>${esc(mc)} <span style="color:var(--muted);font-weight:400">(${subs.length})</span></b>
            <small>${esc(previewSubs)}</small>
          </div>
          <div class="cat-mgr-icons">
            <button type="button" class="icon-act-btn" title="تعديل القسم الرئيسي" onclick="renameMainCategoryInSettings('${escJs(mc)}')">✎</button>
            <button type="button" class="icon-act-btn" title="عرض الأقسام الفرعية" onclick="toggleSettingsMainCatExpand('${escJs(mc)}')">${isOpen?'▲':'▼'}</button>
          </div>
        </div>
        ${subsHtml}
      </div>
    `;
  }).join('');

  // Attach Touch/Pointer Drag-to-Reorder for Main Categories & Open Subcategory Lists
  initDragReorderContainer(container, '.cat-mgr-row', '.main-drag-handle', (newOrder)=>{
    const curTree = isInc ? state.categoryTree.income : state.categoryTree.expense;
    const rebuilt = {};
    newOrder.forEach(k => { if(curTree[k] !== undefined) rebuilt[k] = curTree[k]; });
    Object.keys(curTree).forEach(k => { if(rebuilt[k] === undefined) rebuilt[k] = curTree[k]; });
    if(isInc){
      state.categoryTree.income = rebuilt;
      state.incomeCategories = Object.keys(rebuilt);
    } else {
      state.categoryTree.expense = rebuilt;
      state.categories = Object.keys(rebuilt);
    }
    persist();
    toast('تم حفظ ترتيب الأقسام ✓');
  });

  container.querySelectorAll('.sub-drag-list').forEach(subListEl => {
    const parentMc = subListEl.getAttribute('data-parent-cat');
    initDragReorderContainer(subListEl, '.cat-mgr-sub-row', '.sub-drag-handle', (newSubOrder)=>{
      const curTree = isInc ? state.categoryTree.income : state.categoryTree.expense;
      if(parentMc && curTree[parentMc]){
        curTree[parentMc] = newSubOrder;
        persist();
        toast('تم حفظ ترتيب الأقسام الفرعية ✓');
      }
    });
  });
}

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

/* =========================================================
   #8.3 GOOGLE DRIVE CLOUD SYNC (Gmail Account + Direct Cloud Upload via Google Script / OAuth2 / Android Share)
   ========================================================= */
function updateLocalAutoFreqBtnText(){
  const btn = document.getElementById('btnLocalAutoFreq');
  if(!btn) return;
  const freq = state.prefs?.autoDriveFreq || 'off';
  const map = { off:'🔄 تلقائي', daily:'🔄 تلقائي: يومي', weekly:'🔄 تلقائي: أسبوعي', monthly:'🔄 تلقائي: شهري' };
  btn.textContent = map[freq] || '🔄 تلقائي';
}

function openAutoBackupFreqDialog(){
  const cur = state.prefs?.autoDriveFreq || 'off';
  const opts = [
    ['off', 'معطل (إيقاف النسخ التلقائي)'],
    ['daily', 'يومياً (حفظ نسخة كل يوم)'],
    ['weekly', 'أسبوعياً (حفظ نسخة كل أسبوع)'],
    ['monthly', 'شهرياً (حفظ نسخة كل شهر)']
  ];
  const html = `<div class="cs-opt-list">` + opts.map(([v, lbl])=>`
    <button type="button" class="cs-opt-btn ${cur===v?'selected':''}" onclick="closeAppDialog();saveAutoDriveBackupFreq('${v}')">
      <span>${esc(lbl)}</span><span>${cur===v?'●':'○'}</span>
    </button>
  `).join('') + `</div>`;
  showAppCustomForm('نوع النسخ المحلي التلقائي', html, null, true);
}

function saveAutoDriveBackupFreq(freq){
  state.prefs = state.prefs || {};
  state.prefs.autoDriveFreq = freq || 'off';
  if(freq !== 'off'){
    createAutomaticLocalSnapshot();
  }
  persist();
  updateLocalAutoFreqBtnText();
  renderAutoSnapshotsList();
  toast(freq === 'off' ? 'تم إيقاف النسخ التلقائي' : 'تم تفعيل النسخ التلقائي وحفظ نسخة فورية ✓');
}

function createAutomaticLocalSnapshot(){
  _autoSnapshotsMemory = Array.isArray(_autoSnapshotsMemory) ? _autoSnapshotsMemory : [];
  const dStr = today();
  const cleanCopy = getSanitizedStateForBackup(state);
  const existingIdx = _autoSnapshotsMemory.findIndex(s => s.date === dStr);
  const entry = {
    id: uid('snap'),
    date: dStr,
    txCount: (state.transactions||[]).length,
    payload: JSON.stringify(cleanCopy)
  };
  if(existingIdx !== -1) _autoSnapshotsMemory[existingIdx] = entry;
  else _autoSnapshotsMemory.unshift(entry);
  _autoSnapshotsMemory = _autoSnapshotsMemory.slice(0, 5);
  state.prefs.lastDriveBackup = dStr;
  try{ localStorage.setItem('xw_last_auto_snap', dStr); }catch(_){}
  try{ localStorage.setItem(SNAP_KEY, JSON.stringify(_autoSnapshotsMemory)); }catch(_){}
}

function renderAutoSnapshotsList(){
  const cntEl = document.getElementById('autoSnapsCountLbl');
  const snaps = _autoSnapshotsMemory || [];
  if(cntEl) cntEl.textContent = String(snaps.length);
  const syncBtn = document.getElementById('btnCloudSyncSetup');
  if(syncBtn){
    const hasCloud = !!(state.prefs?.driveWebhookUrl || state.prefs?.driveAccessToken);
    syncBtn.textContent = hasCloud ? '☁ مزامنة متصلة ✓' : '⚙ ربط تلقائي';
  }
}

function openAutoSnapshotsDialog(){
  const snaps = _autoSnapshotsMemory || [];
  if(!snaps.length){
    toast('لا توجد نسخ تلقائية محفوظة بعد. فعّل النسخ التلقائي أولاً.');
    return;
  }
  const html = `<div class="cs-opt-list">` + snaps.map((s, idx)=>`
    <div style="display:flex;align-items:center;justify-content:space-between;background:var(--surface);border:1px solid var(--line2);border-radius:11px;padding:9px 12px;font-size:.76rem">
      <span class="bidi-ar">📅 نسخة <bdi>${esc(formatDateDMY(s.date))}</bdi> (<bdi>${s.txCount||0}</bdi> معاملة)</span>
      <button type="button" class="smallbtn" style="border-color:var(--mint);color:var(--mint)" onclick="closeAppDialog();restoreFromAutoSnapshot(${idx})">استعادة</button>
    </div>
  `).join('') + `</div>`;
  showAppCustomForm('النسخ التلقائية المحفوظة', html, null, true);
}

function preserveDeviceSecurityAndDrivePrefs(oldPrefs, newState){
  newState.prefs = newState.prefs || {};
  const op = oldPrefs || {};
  const keysToKeep = [
    'secPinHash', 'secPinSalt', 'bioEnabled', 'bioCredentialId',
    'appLockOnStart', 'bioOnPrivacy',
    'driveEmail', 'driveWebhookUrl', 'driveAccessToken', 'autoDriveFreq', 'lastDriveBackup'
  ];
  for(const k of keysToKeep){
    if(op[k] !== undefined && op[k] !== '') newState.prefs[k] = op[k];
  }
  delete newState.prefs.secPin;
  return newState;
}

function restoreFromAutoSnapshot(idx){
  const s = (_autoSnapshotsMemory||[])[idx];
  if(!s || !s.payload) return;
  showAppConfirm('استعادة نسخة تلقائية', `هل تريد استعادة النسخة المحفوظة بتاريخ ${formatDateDMY(s.date)}؟`, ()=>{
    try{
      const oldPrefs = JSON.parse(JSON.stringify(state.prefs || {}));
      const parsed = JSON.parse(s.payload);
      delete parsed.autoSnapshots;
      state = preserveDeviceSecurityAndDrivePrefs(oldPrefs, parsed);
      syncCategoryTrees();
      applyPreferences();
      persist();
      renderAll();
      toast('تمت استعادة النسخة التلقائية مع الحفاظ على إعدادات الأمان والمزامنة ✓');
    }catch(_){ toast('تعذر استعادة النسخة'); }
  }, false);
}

let _cloudSyncDebounce = null;
function triggerSilentAutoCloudSyncIfEnabled(){
  const p = state.prefs || {};
  if(!p.driveWebhookUrl && !p.driveAccessToken) return;
  if(_cloudSyncDebounce) clearTimeout(_cloudSyncDebounce);
  _cloudSyncDebounce = setTimeout(()=>{
    exportBackupToGoogleDrive(true);
  }, 2500);
}

async function quickShareBackupToDrive(){
  // If direct cloud webhook or OAuth token is configured, upload directly in the cloud AND offer share sheet
  const p = state.prefs || {};
  const fileName = `x-wallet-backup-${today()}.json`;
  const jsonStr = JSON.stringify(getSanitizedStateForBackup(state));

  // CRITICAL: Call navigator.share IMMEDIATELY while transient user activation is active!
  if(navigator.share){
    try{
      const jsonFile = new File([jsonStr], fileName, {type: 'application/json'});
      if(!navigator.canShare || navigator.canShare({files: [jsonFile]})){
        await navigator.share({
          title: fileName,
          text: 'نسخة X-Wallet الاحتياطية — اختر Google Drive للحفظ',
          files: [jsonFile]
        });
        state.prefs.lastBackupDate = today();
        state.prefs.lastDriveBackup = today();
        persist();
        toast('تمت مشاركة النسخة إلى Google Drive ✓');
        return;
      }
    }catch(err){
      if(err && err.name === 'AbortError') return;
    }
    // Fallback 2: Some Android WebViews only allow text/plain files in navigator.share
    try{
      const txtFile = new File([jsonStr], `x-wallet-backup-${today()}.txt`, {type: 'text/plain'});
      if(!navigator.canShare || navigator.canShare({files: [txtFile]})){
        await navigator.share({
          title: fileName,
          text: 'نسخة X-Wallet الاحتياطية — اختر Google Drive للحفظ',
          files: [txtFile]
        });
        state.prefs.lastBackupDate = today();
        state.prefs.lastDriveBackup = today();
        persist();
        toast('تمت مشاركة النسخة إلى Google Drive ✓');
        return;
      }
    }catch(err){
      if(err && err.name === 'AbortError') return;
    }
  }

  // If direct cloud sync is configured, upload directly to Drive in background
  if(p.driveWebhookUrl || p.driveAccessToken){
    await exportBackupToGoogleDrive(false);
    return;
  }

  // Fallback 3: File System Save Picker or download
  await triggerEasyDriveSave(jsonStr, fileName);
}

async function triggerEasyDriveSave(jsonStr, fileName){
  const blob = new Blob([jsonStr], {type: 'application/json'});
  if(window.showSaveFilePicker){
    try{
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: 'JSON Backup', accept: {'application/json': ['.json']} }]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      toast('تم حفظ النسخة بنجاح ✓');
      return;
    }catch(err){
      if(err && err.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  toast('تم تنزيل ملف النسخة الاحتياطية ✓');
}

function openDriveCloudSetupModal(){
  const p = state.prefs || {};
  const html = `
    <p class="hint" style="margin:0 0 10px;color:var(--text-sub)">
      لأن التطبيق يعمل محلياً بدون سيرفر وسيط، أسهل وأضمن طريقة للموبايل هي استخدام زر <b>«☁ جوجل درايف»</b> لفتح تطبيق Drive مباشرة وحفظ النسخة بضغطة واحدة، مع تفعيل <b>النسخ المحلي التلقائي</b> يومياً أو أسبوعياً.
    </p>
    <div style="display:flex;flex-direction:column;gap:8px">
      <button type="button" class="primary" style="background:var(--blue);color:#fff" onclick="closeAppDialog();quickShareBackupToDrive()">☁ مشاركة وحفظ في Google Drive الآن</button>
      <button type="button" class="secondary" onclick="closeAppDialog();openAutoBackupFreqDialog()">🔄 ضبط جدول النسخ التلقائي</button>
    </div>
  `;
  showAppCustomForm('الحفظ السحابي على Google Drive', html, null, true);
}

async function exportBackupToGoogleDrive(silentAuto){
  const p = state.prefs || {};
  const email = (p.driveEmail || val('prefDriveEmail') || '').trim();
  if(!email && !p.driveWebhookUrl && !p.driveAccessToken){
    if(!silentAuto){
      openDriveCloudSetupModal();
      toast('أدخل حساب الجيميل وإعدادات الربط أولاً');
    }
    return;
  }

  const fileName = `x-wallet-backup-${today()}.json`;
  const jsonStr = JSON.stringify(getSanitizedStateForBackup(state));

  // Route 1: Direct Cloud Upload via Google Apps Script Web App Bridge (Zero prompts, uploads directly into user's Google Drive!)
  if(p.driveWebhookUrl){
    toast('جاري الرفع السحابي المباشر إلى Google Drive… ☁');
    try{
      await fetch(p.driveWebhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {'Content-Type': 'text/plain;charset=utf-8'},
        body: jsonStr
      });
      state.prefs.lastDriveBackup = today();
      state.prefs.lastBackupDate = today();
      persist();
      toast(`تم رفع النسخة تلقائياً إلى Google Drive (${email||'السحابة'}) ✓`);
      return;
    }catch(err){
      if(!silentAuto) toast('تعذر الاتصال برابط السحابة؛ جاري فتح المشاركة إلى Drive');
    }
  }

  // Route 2: Direct Google Drive REST API v3 Multipart Upload via OAuth2 Access Token
  if(p.driveAccessToken){
    toast('جاري الرفع عبر Google Drive API… ☁');
    try{
      const metadata = { name: fileName, mimeType: 'application/json' };
      const boundary = '-------314159265358979323846';
      const delimiter = "\r\n--" + boundary + "\r\n";
      const close_delim = "\r\n--" + boundary + "--";
      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        jsonStr +
        close_delim;

      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + p.driveAccessToken,
          'Content-Type': 'multipart/related; boundary="' + boundary + '"'
        },
        body: multipartRequestBody
      });
      if(res.ok){
        state.prefs.lastDriveBackup = today();
        state.prefs.lastBackupDate = today();
        persist();
        toast('تم رفع النسخة مباشرة إلى Google Drive ✓');
        return;
      }
    }catch(_){}
  }

  // Route 3: Mobile Native Share Sheet to Google Drive app (instead of silent local download)
  if(!silentAuto && navigator.canShare && navigator.share){
    try{
      const blob = new Blob([jsonStr], {type: 'application/json'});
      const fileObj = new File([blob], fileName, {type: 'application/json'});
      if(navigator.canShare({files: [fileObj]})){
        await navigator.share({
          title: `X-Wallet Backup (${email})`,
          text: `نسخة احتياطية لحساب ${email} - اختر تطبيق Google Drive للحفظ`,
          files: [fileObj]
        });
        state.prefs.lastDriveBackup = today();
        state.prefs.lastBackupDate = today();
        persist();
        toast('تم إرسال النسخة إلى Google Drive ✓');
        return;
      }
    }catch(_){
      return;
    }
  }

  if(!silentAuto){
    openDriveCloudSetupModal();
  }
}

function checkScheduledDriveBackupOnBoot(){
  renderAutoSnapshotsList();
  const freq = state.prefs?.autoDriveFreq || 'off';
  if(freq === 'off') return;
  const last = localStorage.getItem('xw_last_auto_snap') || state.prefs?.lastDriveBackup || '';
  const todayStr = today();
  if(last === todayStr) return;
  const nowDate = new Date();
  let due = false;
  if(!last){
    due = true;
  } else {
    const lastDt = new Date(last + 'T00:00:00');
    const diffDays = Math.floor((nowDate - lastDt) / (1000 * 60 * 60 * 24));
    if(freq === 'daily' && diffDays >= 1) due = true;
    else if(freq === 'weekly' && diffDays >= 7) due = true;
    else if(freq === 'monthly' && diffDays >= 30) due = true;
  }
  if(due && (state.transactions?.length || state.accounts?.length)){
    createAutomaticLocalSnapshot();
    try{ localStorage.setItem('xw_last_auto_snap', todayStr); }catch(_){}
    try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(_){}
    renderAutoSnapshotsList();
    triggerSilentAutoCloudSyncIfEnabled();
  }
}

function openFilePicker(id){ const e=document.getElementById(id); if(e){ e.value=''; e.click(); } }
function backup(){
  state.prefs = state.prefs || {};
  state.prefs.lastBackupDate = today();
  persist();
  const cleanJson = JSON.stringify(getSanitizedStateForBackup(state));
  let b = new Blob([cleanJson], {type:'application/json'}), a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = 'x-wallet-backup-' + today() + '.json';
  a.click();
  toast('تم تصدير النسخة الاحتياطية بنجاح ✓');
}
function restore(e){
  let f=e.target.files[0]; if(!f) return;
  let r=new FileReader();
  r.onload=()=>{
    try{
      let v=JSON.parse(r.result); if(!Array.isArray(v.transactions)) throw 0;
      const oldPrefs = JSON.parse(JSON.stringify(state.prefs || {}));
      delete v.autoSnapshots;
      state = preserveDeviceSecurityAndDrivePrefs(oldPrefs, v);
      syncCategoryTrees(); applyPreferences(); persist(); renderAll();
      toast('تم استرجاع النسخة مع الحفاظ على الأمان وإعدادات Drive ✓');
    }catch{ toast('ملف غير صالح'); }
  };
  r.readAsText(f);
}
function openPasteRestoreModal(){
  showAppPrompt('استعادة نسخة احتياطية (JSON)', 'الصق محتوى ملف JSON هنا...', '', (raw)=>{
    if(!raw || !raw.trim()) return;
    try{
      let v=JSON.parse(raw.trim()); if(!Array.isArray(v.transactions)) throw 0;
      state=v; syncCategoryTrees(); applyPreferences(); persist(); toast('تم استرجاع النسخة ✓');
    }catch{ toast('النص غير صالح'); }
  }, true);
}
function showUpdateCardModal(ver, notesText){
  const m = document.getElementById('updateAvailableModal');
  if(!m) return;
  document.getElementById('updModalTitle').textContent = '🚀 تحديث جديد: X-Wallet V' + ver;
  const lines = String(notesText||'تحسينات جديدة في التطبيق').split(/\n|\+/).map(s=>s.trim()).filter(Boolean);
  document.getElementById('updModalNotes').innerHTML =
    '<div style="font-weight:400;margin-bottom:6px;color:var(--text)">ملخص التحديث:</div>' +
    lines.map(s=>`<div style="margin:3px 0">• ${esc(s.replace(/^•\s*/,''))}</div>`).join('');
  m.classList.add('show');
}
function checkForUpdate(silent){
  const box = document.getElementById('updateDetailsBox');
  if(!silent && box) box.innerHTML = '<div class="hint" style="margin:0">جاري البحث عن تحديثات…</div>';
  fetch('./version.json?t='+Date.now(),{cache:'no-store'}).then(r=>r.json()).then(v=>{
    const rem = String(v.version||v.appVersion||'').trim();
    const notes = String(v.notes||'تحسينات عامة في الأداء والاستقرار').trim();
    const notesHtml = notes.split(/\n|\+/).map(s=>s.trim()).filter(Boolean).map(s=>`<div style="margin:3px 0">• ${esc(s.replace(/^•\s*/,''))}</div>`).join('');
    if(!rem || rem === APP_VERSION){
      if(!silent){
        if(box) box.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <b style="color:var(--mint);font-size:.8rem">✓ أنت على أحدث إصدار (V${esc(APP_VERSION)})</b>
          </div>
          <div class="hint" style="margin:0;font-size:.7rem">${notesHtml}</div>
        `;
        toast('أنت على آخر إصدار V' + APP_VERSION);
      }
    } else {
      if(box) box.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <b style="color:var(--orange);font-size:.82rem">🚀 يتوفر تحديث جديد: V${esc(rem)}</b>
          <span class="tag">الحالي: V${esc(APP_VERSION)}</span>
        </div>
        <div class="hint" style="margin:0 0 10px;font-size:.72rem;color:var(--text-sub)"><b>أهم التحسينات:</b>${notesHtml}</div>
        <button type="button" class="primary" style="padding:9px" onclick="forceAppUpdate()">تحديث</button>
      `;
      showUpdateCardModal(rem, notes);
    }
  }).catch(()=>{
    if(!silent){
      if(box) box.innerHTML = '<div class="hint" style="margin:0;color:var(--red)">تعذر الاتصال للبحث عن تحديث. تأكد من الإنترنت.</div>';
      toast('تعذر فحص التحديث');
    }
  });
}
async function forceAppUpdate(){
  toast('جاري التحديث…');
  try{
    if('caches' in window){ const ks=await caches.keys(); await Promise.all(ks.map(k=>caches.delete(k))); }
    if('serviceWorker' in navigator){ const rs=await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(r=>r.unregister())); }
  }catch(_){}
  const u=new URL(location.href); u.searchParams.set('v', Date.now()); location.replace(u.toString());
}
function clearTransactionsAndCats(){
  showAppConfirm('تصفير المعاملات والأقسام', 'هل تريد تصفير جميع المعاملات والتحويلات والأقسام لتصبح فارغة؟', ()=>{
    state.transactions=[]; state.ledger=[];
    state.categories=[]; state.incomeCategories=[];
    state.categoryTree={expense:{}, income:{}};
    persist(); toast('تم تصفير المعاملات والأقسام ✓');
  }, true);
}
function resetApp(){
  showAppConfirm('حذف كل بيانات التطبيق', 'هل أنت متأكد من حذف كل بيانات التطبيق نهائياً من الجهاز؟', ()=>{
    localStorage.removeItem(KEY);
    openSafeIDB().then(db=>{
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(KEY);
      tx.oncomplete = () => location.reload();
    }).catch(()=>location.reload());
  }, true);
}
function installPWA(){
  if(window.__deferredInstallPrompt){ window.__deferredInstallPrompt.prompt(); return; }
  toast('من قائمة المتصفح ⋮ اختر «تثبيت التطبيق»');
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

function renderActiveScreenOnly(){
  syncCustomSelectTriggers();
  updateFabVisibility();
  const activePage = document.querySelector('.screen.active')?.id || 'trans';
  if(activePage === 'trans'){ if(activeTransSubTab==='yr') renderYearlyExcelReport(); else renderTransactionsScreen(); }
  else if(activePage === 'reports'){
    renderReportsScreen();
    if(activeCatDrillState) renderCategoryDrillDownContent();
  }
  else if(activePage === 'wallet') renderAccountsAndCards();
  else if(activePage === 'plan') renderPlanScreen();
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
  if(activeCatDrillState) renderCategoryDrillDownContent();
  renderAccountsAndCards();
  renderPlanScreen();
  renderSettingsCategories();
  renderAutoSnapshotsList();
}

/* Horizontal Swipe Navigation */
(function initSwipeNavigation(){
  const MAIN_PAGES = ['trans', 'reports', 'wallet', 'settings'];
  const SUB_TABS = {
    trans: {
      list: ['daily', 'yr'],
      getActive: () => activeTransSubTab || 'daily',
      setActive: (val) => switchTransSubTab(val)
    },
    reports: {
      list: ['inc', 'exp'],
      getActive: () => activeReportTab || 'exp',
      setActive: (val) => switchReportTab(val)
    },
    wallet: {
      list: ['acc', 'card', 'com'],
      getActive: () => {
        if(document.getElementById('tabBtnCom')?.classList.contains('active')) return 'com';
        if(document.getElementById('tabBtnCard')?.classList.contains('active')) return 'card';
        return 'acc';
      },
      setActive: (val) => switchWalletTab(val)
    }
  };

  let startX = 0, startY = 0, startTime = 0, ignoreTouch = false;

  document.addEventListener('touchstart', function(e){
    if(e.touches.length !== 1) { ignoreTouch = true; return; }
    if(document.querySelector('.modal.show')) { ignoreTouch = true; return; }
    const tgt = e.target;
    if(tgt && tgt.closest('input, textarea, select, .excel-table-wrap, .com-table-wrap, .com-all-table, .yr-table-wrap, [contenteditable="true"]')) {
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
    if(document.querySelector('.modal.show')) return;
    const dt = Date.now() - startTime;
    if(dt > 650) return;

    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if(Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.4) return;

    const curPage = document.querySelector('.screen.active')?.id || 'trans';
    const pageIdx = MAIN_PAGES.indexOf(curPage);
    if(pageIdx === -1) return;

    const step = (dx < 0) ? 1 : -1;

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

/* Boot */
applyPreferences();
initSalary();
const curYM = selected();
setv('comStartVal', curYM);
const comStartLbl = document.getElementById('comStartLabel');
if(comStartLbl) comStartLbl.textContent = formatYMArabic(curYM);
setv('opPurchaseVal', curYM);
const opPurLbl = document.getElementById('opPurchaseLabel');
if(opPurLbl) opPurLbl.textContent = formatYMArabic(curYM);
const defaultYrStart = String(forecastYear) + '-01';
setv('annStartVal', defaultYrStart);
const annStartLbl = document.getElementById('annStartLabel');
if(annStartLbl) annStartLbl.textContent = formatYMArabic(defaultYrStart);
setv('defDueDate', today());
recalcMonthlyCommitmentEnd();
recalcAnnualPlanItemEnd();
updateBackupStatusUI();
renderAll();
recoverFromIndexedDBIfNeeded();
checkAppLockOnBoot();
checkScheduledDriveBackupOnBoot();
try{
  if('serviceWorker' in navigator){
    window.addEventListener('load', ()=>{
      navigator.serviceWorker.register('./sw.js', {updateViaCache: 'none'}).then(reg => {
        reg.update().catch(()=>{});
        reg.addEventListener('updatefound', ()=>{
          const newWorker = reg.installing;
          if(newWorker){
            newWorker.addEventListener('statechange', ()=>{
              if(newWorker.state === 'installed' && navigator.serviceWorker.controller){
                checkForUpdate(false);
              }
            });
          }
        });
      }).catch(()=>{});
      setTimeout(()=>checkForUpdate(true), 1500);
    });
  }
}catch(e){}
