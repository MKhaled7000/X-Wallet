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

/* V15.3.5: verified IndexedDB primary, immutable legacy copies, retired attachment cleanup. */
const IDB_NAME='XWalletSafeDB_v1535';
const LEGACY_IDB_NAME='XWalletSafeDB';
const IDB_STORE='state_store'; // Kept intact for older builds and migration recovery.
const WALLET_STORE='wallet_v2';
const CACHE_KEY=KEY+'_v2_cache';
let _primaryStorageReady=false;
let _lastCommittedRevision=null;
let _writeQueue=Promise.resolve();
function openSafeIDB(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB' in window))return reject(new Error('IndexedDB غير متاح'));
    const req=indexedDB.open(IDB_NAME,1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      for(const name of [WALLET_STORE])if(!db.objectStoreNames.contains(name))db.createObjectStore(name);
    };
    req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>db.close();resolve(db);};
    req.onerror=()=>reject(req.error);
    req.onblocked=()=>reject(new Error('أغلق تبويبات X-Wallet الأخرى ثم أعد المحاولة'));
  });
}
function parseStoredValue(raw){
  if(raw===null||raw===undefined||raw==='')return null;
  try{return typeof raw==='string'?JSON.parse(raw):raw;}catch(_){return null;}
}
function isRetiredLiveEncryptionRecord(value){
  return !!value&&typeof value==='object'&&['x-wallet-live-database','x-wallet-live-config','x-wallet-live-migration-journal'].includes(value.format);
}
async function readIDBValue(storeName,key){
  const db=await openSafeIDB();
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction(storeName,'readonly');const req=tx.objectStore(storeName).get(key);
    let value;req.onsuccess=()=>{value=req.result;};
    tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('ألغيت قراءة التخزين'));
  });}finally{db.close();}
}
/* Never upgrade the old database just to inspect it: old encrypted builds must
   remain able to open their own schema for a separately authorized recovery. */
function openLegacyIDB(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB' in window))return reject(new Error('IndexedDB غير متاح'));
    const req=indexedDB.open(LEGACY_IDB_NAME);let absent=false;
    req.onupgradeneeded=()=>{absent=true;req.transaction.abort();};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>absent?resolve(null):reject(req.error);
    req.onblocked=()=>reject(new Error('أغلق التبويبات الأخرى قبل قراءة البيانات القديمة'));
  });
}
async function readLegacyIDBValue(key){
  const db=await openLegacyIDB();if(!db)return null;
  try{
    if(!db.objectStoreNames.contains(IDB_STORE))return null;
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(IDB_STORE,'readonly');const req=tx.objectStore(IDB_STORE).get(key);let value;
      req.onsuccess=()=>{value=req.result;};tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
  }finally{db.close();}
}
/* Detection only. Nothing is removed, decrypted or rewritten. */
async function detectLegacyLiveEncryptionData(){
  const keys=[KEY,SNAP_KEY,'xw_live_database_config_v1','xw_live_migration_journal_v1'];
  for(const key of keys){
    let local=null;try{local=parseStoredValue(localStorage.getItem(key));}catch(_){}
    if(isRetiredLiveEncryptionRecord(local))return true;
    if(isRetiredLiveEncryptionRecord(await readLegacyIDBValue(key)))return true;
  }
  return false;
}
/* The attachment feature is retired. Only this compatibility cleanup remains. */
function stripRetiredAttachments(value){
  if(!value||typeof value!=='object')return value;
  if(Array.isArray(value)){value.forEach(stripRetiredAttachments);return value;}
  delete value.receipts;delete value.receipt;delete value.receiptIds;delete value.receiptRefs;delete value.blobRef;
  for(const child of Object.values(value))stripRetiredAttachments(child);
  return value;
}
function cleanWalletCopy(value){return stripRetiredAttachments(JSON.parse(JSON.stringify(value)));}
async function cleanStoredSnapshots(snapshots){
  const cleaned=[];
  for(const original of Array.isArray(snapshots)?snapshots:[]){
    const entry=cleanWalletCopy(original);
    if(typeof entry.payload==='string'){
      // Local snapshots are plain backup documents. Rebuild their integrity field
      // after dropping retired fields; never retain a checksum for altered content.
      const doc=await parseBackupDocument(entry.payload);
      entry.payload=await createBackupDocument(cleanWalletCopy(doc.state));
    }
    cleaned.push(entry);
  }
  return cleaned;
}
function canonicalWalletJSON(value){
  return JSON.stringify(value,(_key,item)=>{
    if(item&&typeof item==='object'&&!Array.isArray(item))return Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]]));
    return item;
  });
}
async function verifyStoredWallet(expected){
  // Each read opens a new connection, not the connection that performed the write.
  const stored=await readIDBValue(WALLET_STORE,KEY);
  if(!stored)throw new Error('لم يتم العثور على الحالة بعد الحفظ');
  if(canonicalWalletJSON(stored)!==canonicalWalletJSON(cleanWalletCopy(expected)))throw new Error('لم تتطابق الحالة بعد إعادة فتح التخزين');
  return stored;
}
async function writeWalletPrimary(input,legacyCopy){
  const compact=cleanWalletCopy(input);
  const previous=await readIDBValue(WALLET_STORE,KEY);
  const db=await openSafeIDB();
  try{await new Promise((resolve,reject)=>{
    const tx=db.transaction([WALLET_STORE],'readwrite');const store=tx.objectStore(WALLET_STORE);
    let conflict=null;
    const current=store.get(KEY);
    current.onsuccess=()=>{
      const actual=Number(current.result?.storageRevision)||0;
      if(_lastCommittedRevision!==null&&actual!==_lastCommittedRevision){
        conflict=new Error('تغيرت المحفظة في تبويب آخر. لم يتم استبدال بياناته. أعد تحميل التطبيق قبل المتابعة.');tx.abort();return;
      }
      if(previous)store.put(previous,'previous_state');
      if(legacyCopy){store.put(legacyCopy,'migration_original');store.put(_autoSnapshotsMemory,SNAP_KEY);}
      store.put(compact,KEY);
    };
    tx.oncomplete=resolve;tx.onerror=()=>reject(conflict||tx.error);tx.onabort=()=>reject(conflict||tx.error||new Error('ألغيت كتابة المحفظة'));
  });}finally{db.close();}
  try{await verifyStoredWallet(input);}catch(err){
    // Keep the last verified read path if read-back verification fails.
    const rollbackDB=await openSafeIDB();
    try{await new Promise((resolve,reject)=>{
      const tx=rollbackDB.transaction(WALLET_STORE,'readwrite');const store=tx.objectStore(WALLET_STORE);
      const current=store.get(KEY);let conflict=null;
      current.onsuccess=()=>{
        if(JSON.stringify(current.result)!==JSON.stringify(compact)){conflict=new Error('تغير التخزين أثناء التحقق؛ أعد فتح التطبيق لمراجعة أحدث حالة');tx.abort();return;}
        if(previous)store.put(previous,KEY);else store.delete(KEY);
      };
      tx.oncomplete=resolve;tx.onerror=()=>reject(conflict||tx.error);tx.onabort=()=>reject(conflict||tx.error);
    });}finally{rollbackDB.close();}
    throw err;
  }
  _lastCommittedRevision=Number(compact.storageRevision)||0;
  if(legacyCopy){
    const activationDB=await openSafeIDB();
    try{await new Promise((resolve,reject)=>{
      const tx=activationDB.transaction(WALLET_STORE,'readwrite');tx.objectStore(WALLET_STORE).put(true,'primary_verified');
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });}finally{activationDB.close();}
  }
  try{localStorage.setItem(CACHE_KEY,JSON.stringify(compact));}catch(err){console.warn('Optional local cache unavailable:',err);}
  return true;
}
function saveToIndexedDB(dataObj){
  const copy=cleanWalletCopy(dataObj);
  const pending=_writeQueue.catch(()=>{}).then(()=>writeWalletPrimary(copy));_writeQueue=pending;return pending;
}
async function saveAutoSnapshotsStore(){
  const copy=await cleanStoredSnapshots(_autoSnapshotsMemory||[]);const db=await openSafeIDB();
  try{await new Promise((resolve,reject)=>{
    const tx=db.transaction(WALLET_STORE,'readwrite');tx.objectStore(WALLET_STORE).put(copy,SNAP_KEY);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
  const reopened=await readIDBValue(WALLET_STORE,SNAP_KEY);
  if(canonicalWalletJSON(reopened)!==canonicalWalletJSON(copy))throw new Error('لم يتم التحقق من حفظ نقطة الاستعادة؛ تم إيقاف التغيير');
  _autoSnapshotsMemory=copy;return true;
}
function shouldRecoverFromIndexedDB(localState,idbState){
  if(!idbState||!Array.isArray(idbState.transactions))return false;
  const lr=Number(localState?.storageRevision)||0,ir=Number(idbState.storageRevision)||0;
  const empty=!(localState?.transactions?.length||localState?.accounts?.length);
  return ir>lr||(ir===lr&&empty&&!!(idbState.transactions.length||idbState.accounts?.length));
}
async function recoverFromIndexedDBIfNeeded(){
  let stored=await readIDBValue(WALLET_STORE,KEY);
  let recovered=false;
  if(stored&&await readIDBValue(WALLET_STORE,'primary_verified')){
    state=normalizePersistedState(cleanWalletCopy(stored));recovered=true;
    const snaps=await readIDBValue(WALLET_STORE,SNAP_KEY);if(Array.isArray(snaps))_autoSnapshotsMemory=snaps;
  }else{
    const localOriginal=parseStoredValue(_initialLocalStateRaw);
    if(_initialLocalStateRaw&&(!localOriginal||!Array.isArray(localOriginal.transactions)))throw new Error('نسخة التخزين القديمة غير مقروءة؛ لن يتم استبدالها بمحفظة فارغة');
    const oldIDB=await readLegacyIDBValue(KEY);
    if(oldIDB&&!Array.isArray(oldIDB.transactions))throw new Error('قاعدة البيانات القديمة غير مقروءة؛ يلزم مراجعتها قبل الترحيل');
    const oldSnaps=await readLegacyIDBValue(SNAP_KEY);
    if(shouldRecoverFromIndexedDB(state,oldIDB)){state=normalizePersistedState(oldIDB);recovered=true;}
    if(Array.isArray(oldSnaps)&&oldSnaps.length)_autoSnapshotsMemory=oldSnaps;
    state=normalizePersistedState(cleanWalletCopy(state));
    _autoSnapshotsMemory=await cleanStoredSnapshots(_autoSnapshotsMemory);
    const original={localStateRaw:_initialLocalStateRaw,localSnapshotsRaw:_initialLocalSnapshotsRaw,indexedDBState:oldIDB||null,indexedDBSnapshots:oldSnaps||null,copiedAt:new Date().toISOString()};
    await writeWalletPrimary(state,original);
    stored=await verifyStoredWallet(state);
    state=normalizePersistedState(cleanWalletCopy(stored));
  }
  _lastCommittedRevision=Number(state.storageRevision)||0;
  _primaryStorageReady=true;syncCategoryTrees();
  if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
  return recovered;
}
async function resetLocalWalletStorage(){
  // Explicit full reset only. Boot and migrations never call this function.
  const db=await openSafeIDB();
  try{await new Promise((resolve,reject)=>{
    const tx=db.transaction([WALLET_STORE],'readwrite');
    for(const name of [WALLET_STORE])tx.objectStore(name).clear();
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
  const legacy=await openLegacyIDB();
  if(legacy){try{if(legacy.objectStoreNames.contains(IDB_STORE))await new Promise((resolve,reject)=>{
    const tx=legacy.transaction(IDB_STORE,'readwrite');const store=tx.objectStore(IDB_STORE);
    for(const key of [KEY,SNAP_KEY,'xw_live_database_config_v1','xw_live_migration_journal_v1'])store.delete(key);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{legacy.close();}}
  for(const key of [KEY,CACHE_KEY,SNAP_KEY,'xw_last_auto_snap','xw_live_database_config_v1','xw_live_migration_journal_v1'])localStorage.removeItem(key);
}
async function flushLiveDatabaseWrites(){
  if(_idbSaveTimer){clearTimeout(_idbSaveTimer);_idbSaveTimer=null;await persistStorageOnly(false);}
  await _writeQueue;
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
  if(!_primaryStorageReady)throw new Error('لم يكتمل التحقق من التخزين؛ لم يتم الحفظ');
  stripRetiredAttachments(state);
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
