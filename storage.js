/* X-Wallet V14.0 module: storage.js | Extracted from V13.40 app.js */

/* ---- Original app.js lines 1-192 ---- */
/* Core constants loaded from core.js */

function createEmptyPersistedState(){
  return {transactions:[],paid:0,savings:0,debtTotal:0};
}
function normalizePersistedState(input){
  let next=input && typeof input==='object' && !Array.isArray(input) && Array.isArray(input.transactions) ? input : createEmptyPersistedState();
  next.salaryConfig=next.salaryConfig||{};
  next.salaryMonths=next.salaryMonths||{};
  next.cards=Array.isArray(next.cards)?next.cards:[];
  next.cardOps=Array.isArray(next.cardOps)?next.cardOps:[];
  next.cardPayments=Array.isArray(next.cardPayments)?next.cardPayments:[];
  next.commitments=Array.isArray(next.commitments)?next.commitments:[];
  next.commitmentPayments=Array.isArray(next.commitmentPayments)?next.commitmentPayments:[];
  next.accounts=Array.isArray(next.accounts)?next.accounts:[];
  next.ledger=Array.isArray(next.ledger)?next.ledger:[];
  next.importBatches=Array.isArray(next.importBatches)?next.importBatches:[];
  next.cancelledTransactions=Array.isArray(next.cancelledTransactions)?next.cancelledTransactions:[];
  const loadedRevision=Number(next.storageRevision);
  next.storageRevision=Number.isSafeInteger(loadedRevision)&&loadedRevision>=0?loadedRevision:0;
  next.reportDefaults=next.reportDefaults||{};
  next.annualPlanItems=Array.isArray(next.annualPlanItems)?next.annualPlanItems:[];
  next.categories=Array.isArray(next.categories)?next.categories:[];
  next.incomeCategories=Array.isArray(next.incomeCategories)?next.incomeCategories:[];
  next.categoryTree=next.categoryTree||{expense:{},income:{}};
  next.prefs=next.prefs&&typeof next.prefs==='object'&&!Array.isArray(next.prefs)?next.prefs:{
    lang:'ar',fontFamily:'system',fontSize:'1',theme:'mint',bgMode:'dark',userName:'',defaultAccount:'',
    privacy:false,homeDecimals:false,secPin:'',bioEnabled:false,bioCredentialId:'',
    appLockOnStart:true,bioOnPrivacy:true,autoDriveFreq:'off',lastDriveBackup:'',
    driveEmail:'',driveWebhookUrl:'',driveClientId:'',driveAccessToken:''
  };
  return next;
}
let _initialLocalStateRaw='';
let state;
try{
  _initialLocalStateRaw=localStorage.getItem(KEY)||'';
  const parsed=_initialLocalStateRaw?JSON.parse(_initialLocalStateRaw):null;
  state=parsed?.format==='x-wallet-live-database'?null:parsed;
}catch(e){state=null;}
state=normalizePersistedState(state);

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
// Local automatic snapshots are ordinary local records; portable backup files can be encrypted separately.
let _initialLocalSnapshotsRaw='';
let _autoSnapshotsMemory = [];
try{
  _initialLocalSnapshotsRaw=localStorage.getItem(SNAP_KEY)||'';
  const parsedSnaps=_initialLocalSnapshotsRaw?JSON.parse(_initialLocalSnapshotsRaw):null;
  if(Array.isArray(parsedSnaps)) _autoSnapshotsMemory=parsedSnaps;
}catch(_){}
if(Array.isArray(state.autoSnapshots) && state.autoSnapshots.length){
  if(!_autoSnapshotsMemory.length) _autoSnapshotsMemory=state.autoSnapshots.slice(0,5);
  delete state.autoSnapshots;
}
// Legacy plain-text PIN migration is performed asynchronously by security.js using PBKDF2.
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

function parseStoredValue(raw){
  if(raw===null || raw===undefined || raw==='') return null;
  try{return typeof raw==='string'?JSON.parse(raw):raw;}catch(_){return null;}
}
function isRetiredLiveEncryptionRecord(value){
  return !!value && typeof value==='object' && (
    value.format==='x-wallet-live-database' ||
    value.format==='x-wallet-live-config' ||
    value.format==='x-wallet-live-migration-journal'
  );
}

/* V15.1.2 retires live-database encryption. Encrypted V15.0/V15.1 DEV records
   are intentionally discarded on this test-data build; portable encrypted backups remain supported. */
async function removeLegacyLiveEncryptionData(){
  const localRecords={
    state:parseStoredValue(localStorage.getItem(KEY)),
    snapshots:parseStoredValue(localStorage.getItem(SNAP_KEY)),
    config:parseStoredValue(localStorage.getItem('xw_live_database_config_v1')),
    journal:parseStoredValue(localStorage.getItem('xw_live_migration_journal_v1'))
  };
  let idbRecords={};
  let db=null;
  try{
    db=await openSafeIDB();
    idbRecords=await new Promise((resolve,reject)=>{
      const result={};
      let tx;
      try{
        tx=db.transaction(IDB_STORE,'readonly');
        for(const key of [KEY,SNAP_KEY,'xw_live_database_config_v1','xw_live_migration_journal_v1']){
          const req=tx.objectStore(IDB_STORE).get(key);
          req.onsuccess=()=>{result[key]=req.result??null;};
        }
        tx.oncomplete=()=>resolve(result);
        tx.onerror=()=>reject(tx.error||new Error('تعذر فحص التخزين المحلي القديم'));
        tx.onabort=()=>reject(tx.error||new Error('تم إلغاء فحص التخزين المحلي القديم'));
      }catch(err){reject(err);}
    });
  }catch(err){
    console.warn('X-Wallet legacy encrypted IndexedDB inspection skipped:',err);
  }finally{try{db?.close();}catch(_){}}
  const hasRetiredEncryption=[
    ...Object.values(localRecords),
    ...Object.values(idbRecords)
  ].some(isRetiredLiveEncryptionRecord);
  if(!hasRetiredEncryption) return false;

  // The user confirmed this DEV database contains disposable test data.
  // Remove only the live DB state/snapshot keys and encryption metadata.
  for(const key of [KEY,SNAP_KEY,'xw_live_database_config_v1','xw_live_migration_journal_v1','xw_last_auto_snap']){
    try{localStorage.removeItem(key);}catch(_){}
  }
  try{
    db=await openSafeIDB();
    await new Promise((resolve,reject)=>{
      let tx;
      try{
        tx=db.transaction(IDB_STORE,'readwrite');
        const store=tx.objectStore(IDB_STORE);
        for(const key of [KEY,SNAP_KEY,'xw_live_database_config_v1','xw_live_migration_journal_v1']) store.delete(key);
        tx.oncomplete=resolve;
        tx.onerror=()=>reject(tx.error||new Error('تعذر تنظيف قاعدة البيانات المحلية القديمة'));
        tx.onabort=()=>reject(tx.error||new Error('تم إلغاء تنظيف قاعدة البيانات المحلية القديمة'));
      }catch(err){reject(err);}
    });
  }finally{try{db?.close();}catch(_){}}
  state=normalizePersistedState(null);
  _autoSnapshotsMemory=[];
  return true;
}

async function saveAutoSnapshotsStore(){
  const snapshots=Array.isArray(_autoSnapshotsMemory)?JSON.parse(JSON.stringify(_autoSnapshotsMemory)):[];
  const db=await openSafeIDB();
  try{
    await new Promise((resolve,reject)=>{
      let tx;
      try{
        tx=db.transaction(IDB_STORE,'readwrite');
        tx.objectStore(IDB_STORE).put(snapshots,SNAP_KEY);
        tx.oncomplete=resolve;
        tx.onerror=()=>reject(tx.error||new Error('تعذر حفظ النسخ المحلية في IndexedDB'));
        tx.onabort=()=>reject(tx.error||new Error('تم إلغاء حفظ النسخ المحلية'));
      }catch(err){reject(err);}
    });
  }finally{try{db.close();}catch(_){}}
  try{localStorage.setItem(SNAP_KEY,JSON.stringify(snapshots));}catch(err){
    console.warn('X-Wallet local snapshot LocalStorage mirror skipped:',err);
  }
  return true;
}

async function resetLocalWalletStorage(){
  for(const key of [KEY,SNAP_KEY,'xw_last_auto_snap','xw_live_database_config_v1','xw_live_migration_journal_v1']){
    try{localStorage.removeItem(key);}catch(_){}
  }
  const db=await openSafeIDB();
  try{
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(IDB_STORE,'readwrite');
      const store=tx.objectStore(IDB_STORE);
      for(const key of [KEY,SNAP_KEY,'xw_live_database_config_v1','xw_live_migration_journal_v1']) store.delete(key);
      tx.oncomplete=resolve;
      tx.onerror=()=>reject(tx.error||new Error('تعذر حذف البيانات المحلية'));
      tx.onabort=()=>reject(tx.error||new Error('تم إلغاء حذف البيانات المحلية'));
    });
  }finally{try{db.close();}catch(_){}}
}

function saveToIndexedDB(dataObj){
  return openSafeIDB().then(db=>new Promise((resolve,reject)=>{
    let tx;
    try{
      tx=db.transaction(IDB_STORE,'readwrite');
      tx.objectStore(IDB_STORE).put(JSON.parse(JSON.stringify(dataObj)),KEY);
      tx.oncomplete=()=>{try{db.close();}catch(_){}resolve(true);};
      tx.onerror=()=>{const err=tx.error||new Error('IndexedDB write failed');try{db.close();}catch(_){}reject(err);};
      tx.onabort=()=>{const err=tx.error||new Error('IndexedDB write aborted');try{db.close();}catch(_){}reject(err);};
    }catch(err){try{db.close();}catch(_){}reject(err);}
  }));
}

function shouldRecoverFromIndexedDB(localState,idbState){
  if(!idbState || !Array.isArray(idbState.transactions)) return false;
  const localRevision=Number(localState?.storageRevision)||0;
  const idbRevision=Number(idbState.storageRevision)||0;
  if(idbRevision>localRevision) return true;
  const localEmpty=(!localState?.transactions||!localState.transactions.length)&&(!localState?.accounts||!localState.accounts.length);
  const idbHasData=idbState.transactions.length>0||(Array.isArray(idbState.accounts)&&idbState.accounts.length>0);
  return idbRevision===localRevision&&localEmpty&&idbHasData;
}

function recoverFromIndexedDBIfNeeded(){
  const recovery=openSafeIDB().then(db=>new Promise(resolve=>{
    let recovered=false;
    let tx;
    try{
      tx=db.transaction(IDB_STORE,'readonly');
      const getReq=tx.objectStore(IDB_STORE).get(KEY);
      getReq.onsuccess=()=>{
        const idbState=getReq.result;
        if(shouldRecoverFromIndexedDB(state,idbState)){
          state=idbState;
          const recoveredRevision=Number(state.storageRevision);
          state.storageRevision=Number.isSafeInteger(recoveredRevision)&&recoveredRevision>=0?recoveredRevision:0;
          syncCategoryTrees();
          try{localStorage.setItem(KEY,JSON.stringify(state));}catch(err){console.error('X-Wallet localStorage recovery write failed:',err);}
          recovered=true;
        }
      };
      tx.oncomplete=()=>{
        try{db.close();}catch(_){}
        if(recovered){resolve(true);return;}
        saveToIndexedDB(state).then(()=>resolve(false)).catch(err=>{console.error('X-Wallet initial IndexedDB save failed:',err);resolve(false);});
      };
      tx.onerror=()=>{const err=tx.error||new Error('IndexedDB recovery read failed');try{db.close();}catch(_){}console.error('X-Wallet IndexedDB recovery check failed:',err);resolve(false);};
      tx.onabort=()=>{const err=tx.error||new Error('IndexedDB recovery read aborted');try{db.close();}catch(_){}console.error('X-Wallet IndexedDB recovery check failed:',err);resolve(false);};
    }catch(err){try{db.close();}catch(_){}console.error('X-Wallet IndexedDB recovery check failed:',err);resolve(false);}
  })).catch(err=>{console.error('X-Wallet IndexedDB recovery check failed:',err);return false;});
  if(navigator.storage&&navigator.storage.persist){navigator.storage.persist().catch(()=>{});}
  return recovery;
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
let _storageWarningShown = false;
async function persistStorageOnly(bumpRevision=true){
  if(bumpRevision && state){
    const current=Number(state.storageRevision)||0;
    state.storageRevision=Number.isSafeInteger(current)&&current>=0?current+1:1;
  }
  try{localStorage.setItem(KEY,JSON.stringify(state));}catch(err){throw err;}
  return saveToIndexedDB(state);
}
function persist(onlyActiveScreen){
  if(state && state.autoSnapshots) delete state.autoSnapshots;
  const previousRevision=Number(state?.storageRevision)||0;
  state.storageRevision=Number.isSafeInteger(previousRevision)&&previousRevision>=0?previousRevision+1:1;
  if(_idbSaveTimer) clearTimeout(_idbSaveTimer);
  _idbSaveTimer=setTimeout(()=>{
    _idbSaveTimer=null;
    persistStorageOnly(false).then(()=>{_storageWarningShown=false;}).catch(err=>{
      console.error('X-Wallet local persistence failed:',err);
      if(!_storageWarningShown){toast('تعذر حفظ البيانات محلياً. تحقق من مساحة التخزين قبل إغلاق التطبيق.');_storageWarningShown=true;}
    });
  },60);
  updateBackupStatusUI();
  renderActiveScreenOnly(onlyActiveScreen);
}

/* Custom Unified Dialog System */
