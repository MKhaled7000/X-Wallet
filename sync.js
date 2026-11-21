/* Local state is stored in the regular LocalStorage + IndexedDB stores. Portable backup files
   may still be encrypted independently by backup.js. */
async function persistAutoSnapshotStore(){
  if(typeof saveAutoSnapshotsStore==='function') await saveAutoSnapshotsStore();
  else if(typeof saveAutoSnapshotsSecurely==='function') await saveAutoSnapshotsSecurely(); // Legacy isolated test/compatibility context only.
  return true;
}
async function persistCurrentStateStore(){
  if(typeof persistStorageOnly!=='function') throw new Error('وحدة التخزين المحلي غير متاحة');
  return persistStorageOnly();
}
function cloneWalletStateForRollback(value){return JSON.parse(JSON.stringify(value||{}));}
function restoreWalletStateAfterCriticalFailure(previousState){
  state=cloneWalletStateForRollback(previousState);
  return true;
}
async function verifyCriticalWalletPersistence(){
  await verifyStoredWallet(state);return true;
}
let _criticalWalletBusy=false;
async function runCriticalWalletAction(label,mutate){
  if(_criticalWalletBusy){toast('انتظر اكتمال الحفظ الحالي');return false;}
  _criticalWalletBusy=true;const wasInert=document.body.inert;document.body.inert=true;
  let previous=null;
  try{
    await flushLiveDatabaseWrites();previous=cloneWalletStateForRollback(state);
    await createPreRestoreSnapshot(label);
    const snapshots=cloneWalletStateForRollback(_autoSnapshotsMemory||[]);
    mutate();await commitCriticalWalletState(previous,snapshots,label);
    try{renderAll();}catch(renderError){console.error('Saved wallet, but UI refresh failed:',renderError);}
    return true;
  }catch(err){
    if(previous){previous.storageRevision=Math.max(Number(previous.storageRevision)||0,Number(state?.storageRevision)||0);state=previous;}
    try{renderAll();}catch(_){}
    toast(err?.message||'تعذر تنفيذ التغيير؛ تم الاحتفاظ بالبيانات السابقة');return false;
  }finally{document.body.inert=wasInert;_criticalWalletBusy=false;}
}
async function commitCriticalWalletState(previousState,rollbackSnapshots,actionLabel='التغيير'){
  if(_idbSaveTimer){clearTimeout(_idbSaveTimer);_idbSaveTimer=null;}
  await _writeQueue.catch(()=>{});
  const previous=cloneWalletStateForRollback(previousState);
  const previousRevision=Number(previous.storageRevision)||0;
  const attemptedRevision=Number(state?.storageRevision)||0;
  state.storageRevision=Math.max(previousRevision,attemptedRevision)+1;
  try{
    await persistStorageOnly(false);
    await verifyCriticalWalletPersistence();
    return true;
  }catch(commitError){
    const failedRevision=Number(state?.storageRevision)||attemptedRevision;
    state=previous;
    state.storageRevision=Math.max(previousRevision,attemptedRevision,failedRevision)+1;
    _autoSnapshotsMemory=Array.isArray(rollbackSnapshots)?cloneWalletStateForRollback(rollbackSnapshots):[];
    try{
      await persistStorageOnly(false);
      await verifyCriticalWalletPersistence();
    }catch(rollbackError){
      throw new Error(`فشل حفظ ${actionLabel} وفشل تأكيد استعادة الحالة السابقة. تجنب إغلاق التطبيق قبل مراجعة النسخة الاحتياطية. سبب الحفظ: ${commitError?.message||commitError}؛ سبب التراجع: ${rollbackError?.message||rollbackError}`);
    }
    throw new Error(`تعذر حفظ ${actionLabel}؛ تمت استعادة البيانات السابقة والتحقق منها. ${commitError?.message||commitError}`);
  }
}

/* =========================================================
   #8.3 GOOGLE DRIVE CLOUD SYNC (Direct Google Drive OAuth and local snapshots)
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

async function saveAutoDriveBackupFreq(freq){
  state.prefs = state.prefs || {};
  state.prefs.autoDriveFreq = freq || 'off';
  if(freq !== 'off'){
    try{ await createAutomaticLocalSnapshot(); }
    catch(_){ toast('تعذر إنشاء النسخة المحلية؛ تحقق من تشغيل التطبيق عبر اتصال آمن HTTPS'); return; }
  }
  persist();
  updateLocalAutoFreqBtnText();
  renderAutoSnapshotsList();
  toast(freq === 'off' ? 'تم إيقاف النسخ التلقائي' : 'تم تفعيل النسخ التلقائي وحفظ نسخة فورية ✓');
}

async function createAutomaticLocalSnapshot(){
  _autoSnapshotsMemory = Array.isArray(_autoSnapshotsMemory) ? _autoSnapshotsMemory : [];
  const previousSnapshots=cloneWalletStateForRollback(_autoSnapshotsMemory);
  const previousBackupDate=state.prefs?.lastDriveBackup;
  const dStr = today();
  // Never fall back to an unverified plaintext snapshot when hashing or backup creation fails.
  const backupDocument = await createBackupDocument(state);
  const existingIdx = _autoSnapshotsMemory.findIndex(s => s.date === dStr);
  const entry = {
    id: uid('snap'),
    date: dStr,
    txCount: (state.transactions||[]).length,
    payload: backupDocument
  };
  if(existingIdx !== -1) _autoSnapshotsMemory[existingIdx] = entry;
  else _autoSnapshotsMemory.unshift(entry);
  _autoSnapshotsMemory = _autoSnapshotsMemory.slice(0, 5);
  state.prefs.lastDriveBackup = dStr;
  try{ localStorage.setItem('xw_last_auto_snap', dStr); }catch(_){}
  try{await persistAutoSnapshotStore();}
  catch(err){_autoSnapshotsMemory=previousSnapshots;if(previousBackupDate===undefined)delete state.prefs.lastDriveBackup;else state.prefs.lastDriveBackup=previousBackupDate;throw err;}
}

function renderAutoSnapshotsList(){
  const cntEl = document.getElementById('autoSnapsCountLbl');
  const snaps = _autoSnapshotsMemory || [];
  if(cntEl) cntEl.textContent = String(snaps.length);
  const syncBtn = document.getElementById('btnCloudSyncSetup');
  if(syncBtn){
    const hasCloud = typeof xwEffectiveGoogleClientId==='function' ? !!xwEffectiveGoogleClientId() : !!state.prefs?.driveClientId;
    syncBtn.textContent = hasCloud ? '☁ إعداد Google جاهز' : '⚙ إعداد Google';
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

async function createPreRestoreSnapshot(source){
  // A restore-point must never overwrite the scheduled same-day snapshot.
  _autoSnapshotsMemory = Array.isArray(_autoSnapshotsMemory) ? _autoSnapshotsMemory : [];
  const payload = await createBackupDocument(state);
  const now = new Date();
  const entry = {
    id: uid('pre-restore'),
    date: today(),
    time: now.toLocaleTimeString('ar-EG'),
    source: String(source || 'استعادة'),
    txCount: (state.transactions || []).length,
    payload
  };
  const previousSnapshots=_autoSnapshotsMemory.filter(x=>String(x.id)!==String(entry.id));
  _autoSnapshotsMemory.unshift(entry);
  _autoSnapshotsMemory = _autoSnapshotsMemory.slice(0, 10);
  try{await persistAutoSnapshotStore();}
  catch(err){_autoSnapshotsMemory=previousSnapshots;throw err;}
  return entry;
}

function validateRestoredState(parsedDoc){
  const source=parsedDoc?.state;
  if(!source || typeof source!=='object' || Array.isArray(source)) throw new Error('بنية النسخة الاحتياطية غير صالحة');
  let restored;
  try{restored=JSON.parse(JSON.stringify(source));}catch(_){throw new Error('تعذر قراءة بيانات النسخة الاحتياطية');}
  if(!Array.isArray(restored.transactions)) throw new Error('قائمة المعاملات غير موجودة أو غير صالحة');
  const arrayKeys=['accounts','cards','cardOps','cardPayments','commitments','commitmentPayments','ledger','categories','incomeCategories','annualPlanItems','budgets','goals','goalMovements','recurringRules','currencies','currencyRates','auditLog','restoreLog','alertRules','duplicateReviews','importBatches','cancelledTransactions','savedTransactionFilters'];
  for(const key of arrayKeys){
    if(restored[key]!==undefined && !Array.isArray(restored[key])) throw new Error(`البيانات داخل النسخة غير صالحة: ${key}`);
    if(restored[key]===undefined) restored[key]=[];
  }
  restored.prefs=restored.prefs&&typeof restored.prefs==='object'&&!Array.isArray(restored.prefs)?restored.prefs:{};
  restored.salaryConfig=restored.salaryConfig&&typeof restored.salaryConfig==='object'&&!Array.isArray(restored.salaryConfig)?restored.salaryConfig:{};
  restored.salaryMonths=restored.salaryMonths&&typeof restored.salaryMonths==='object'&&!Array.isArray(restored.salaryMonths)?restored.salaryMonths:{};
  restored.categoryTree=restored.categoryTree&&typeof restored.categoryTree==='object'&&!Array.isArray(restored.categoryTree)?restored.categoryTree:{expense:{},income:{}};
  for(const kind of ['expense','income']) if(!restored.categoryTree[kind]||typeof restored.categoryTree[kind]!=='object'||Array.isArray(restored.categoryTree[kind])) restored.categoryTree[kind]={};
  const maxTransactions=500000;
  if(restored.transactions.length>maxTransactions) throw new Error('عدد المعاملات في النسخة يتجاوز الحد الآمن للاستيراد');
  const idCollections=['transactions','accounts','cards','cardOps','cardPayments','commitments','commitmentPayments','ledger','budgets','goals','goalMovements','recurringRules','auditLog','restoreLog','duplicateReviews','importBatches','cancelledTransactions','savedTransactionFilters'];
  for(const key of idCollections){
    const seen=new Set();
    for(let i=0;i<restored[key].length;i++){
      const item=restored[key][i];
      if(!item||typeof item!=='object'||Array.isArray(item)) throw new Error(`عنصر غير صالح داخل ${key} (${i+1})`);
      if(item.id!==undefined&&item.id!==null&&String(item.id)!==''){
        const id=String(item.id);
        if(seen.has(id)) throw new Error(`معرّف مكرر داخل ${key}: ${id}`);
        seen.add(id);
      }
    }
  }
  for(let i=0;i<restored.transactions.length;i++){
    const tx=restored.transactions[i];
    if(tx.amount!==undefined && !Number.isFinite(Number(tx.amount))) throw new Error(`مبلغ غير صالح في المعاملة ${i+1}`);
    if(tx.date!==undefined && tx.date && !/^\d{4}-\d{2}-\d{2}/.test(String(tx.date))) throw new Error(`تاريخ غير صالح في المعاملة ${i+1}`);

  }
  // Backups from pre-EGP-only releases are normalized before they can replace
  // the live state. Missing historical FX fails the restore without mutation.
  if(typeof buildSingleCurrencyState==='function' && !(Number(restored.singleCurrencySchemaVersion)>=1)){
    restored=buildSingleCurrencyState(restored);
  }else if(Number(restored.singleCurrencySchemaVersion)>=1){
    restored.prefs.defaultCurrency='EGP';
    restored.currencies=[{code:'EGP',name:'جنيه مصري',rate:1}];
    restored.currencyRates=[];
  }
  return stripRetiredAttachments(restored);
}

function preserveDeviceSecurityAndDrivePrefs(oldPrefs, newState){
  newState.prefs = newState.prefs || {};
  const op = oldPrefs || {};
  // Never import device-bound secrets or cloud credentials from a backup file.
  // Keep them only from the currently active device after cleaning imported data.
  const localOnlyKeys = [
    'secPin', 'secPinHash', 'secPinSalt', 'bioEnabled', 'bioCredentialId',
    'appLockOnStart', 'bioOnPrivacy',
    'driveEmail', 'driveWebhookUrl', 'driveAccessToken', 'driveClientId', 'driveSharedSecret',
    'ghToken', 'ghGistId', 'syncProvider', 'driveFolderId', 'lastDriveBackupAt',
    'autoDriveFreq', 'lastDriveBackup', 'lastBackupDate'
  ];
  for(const k of localOnlyKeys) delete newState.prefs[k];
  for(const k of localOnlyKeys){
    if(['driveEmail','driveWebhookUrl','driveAccessToken','driveSharedSecret','ghToken','ghGistId','syncProvider'].includes(k))continue;
    if(op[k] !== undefined && op[k] !== '') newState.prefs[k] = op[k];
  }
  return newState;
}

function restoreFromAutoSnapshot(idx){
  const snapshot=(_autoSnapshotsMemory||[])[idx];
  if(!snapshot || !snapshot.payload) return;
  showAppConfirm('استعادة نسخة تلقائية',`هل تريد استعادة النسخة المحفوظة بتاريخ ${formatDateDMY(snapshot.date)}؟`,async()=>{
    let previousState=null;
    try{
      if(typeof flushLiveDatabaseWrites==='function') await flushLiveDatabaseWrites();
      previousState=cloneWalletStateForRollback(state);
      const parsedDoc=await parseBackupDocument(snapshot.payload);
      const restored=validateRestoredState(parsedDoc);
      await createPreRestoreSnapshot('قبل استعادة نسخة محلية');
      const rollbackSnapshots=cloneWalletStateForRollback(_autoSnapshotsMemory||[]);
      const oldPrefs=JSON.parse(JSON.stringify(state.prefs||{}));
      const localRestoreHistory=Array.isArray(state.restoreLog)?state.restoreLog.slice(0,100):[];
      delete restored.autoSnapshots;
      state=preserveDeviceSecurityAndDrivePrefs(oldPrefs,restored);
      state.restoreLog=localRestoreHistory;
      state.restoreLog.unshift({id:uid('restore'),at:new Date().toISOString(),source:'نسخة محلية',integrity:parsedDoc.integrity,result:'success'});
      state.restoreLog=state.restoreLog.slice(0,100);
      syncCategoryTrees();
      if(typeof auditRecord==='function') auditRecord('استعادة','نسخة احتياطية',snapshot.id,null,{source:'نسخة محلية',integrity:parsedDoc.integrity});
      await commitCriticalWalletState(previousState,rollbackSnapshots,'استعادة النسخة المحلية');
      applyPreferences();renderAll();if(typeof renderManagementHub==='function')renderManagementHub();
      toast(parsedDoc.integrity==='verified'?'تم التحقق من النسخة واستعادتها وحفظها محلياً ✓':'تمت استعادة نسخة قديمة غير مزودة ببصمة تحقق وحفظها محلياً');
    }catch(err){
      if(previousState&&restoreWalletStateAfterCriticalFailure(previousState)){try{applyPreferences();renderAll();}catch(_){}}
      toast(err?.message||'تعذر استعادة النسخة؛ لم يتم اعتماد التغيير');
    }
  },false);
}

async function quickShareBackupToDrive(){
  const p = state.prefs || {};
  const fileName = `x-wallet-backup-${today()}.json`;
  // Keep navigator.share in the original user-activation turn; legacy JSON remains importable.
  const shareJsonStr = JSON.stringify(getSanitizedStateForBackup(state));
  if(navigator.share){
    try{
      const jsonFile = new File([shareJsonStr], fileName, {type: 'application/json'});
      if(!navigator.canShare || navigator.canShare({files: [jsonFile]})){
        await navigator.share({
          title: fileName,
          text: 'نسخة X-Wallet عادية غير مشفرة — اختر Google Drive للحفظ',
          files: [jsonFile]
        });
        state.prefs.lastBackupDate = today();
        state.prefs.lastDriveBackup = today();
        persist();
        toast('تمت مشاركة نسخة عادية غير مشفرة؛ احتفظ بها في مكان آمن');
        return;
      }
    }catch(err){
      if(err && err.name === 'AbortError') return;
    }
    try{
      const txtFile = new File([shareJsonStr], `x-wallet-backup-${today()}.txt`, {type: 'text/plain'});
      if(!navigator.canShare || navigator.canShare({files: [txtFile]})){
        await navigator.share({
          title: fileName,
          text: 'نسخة X-Wallet عادية غير مشفرة — اختر Google Drive للحفظ',
          files: [txtFile]
        });
        state.prefs.lastBackupDate = today();
        state.prefs.lastDriveBackup = today();
        persist();
        toast('تمت مشاركة نسخة عادية غير مشفرة؛ احتفظ بها في مكان آمن');
        return;
      }
    }catch(err){
      if(err && err.name === 'AbortError') return;
    }
  }
  if(p.driveClientId){
    await exportBackupToGoogleDrive(false);
    return;
  }
  const verifiedJson = await createBackupDocument(state);
  await triggerEasyDriveSave(verifiedJson, fileName);
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
  const html = `
    <p class="hint" style="margin:0 0 10px;color:var(--text-sub)">
      المزامنة السحابية مشفرة افتراضياً وتطلب كلمة مرور لا تُحفظ. المشاركة العادية أدناه خيار يدوي غير مشفر. النسخ المجدول محلي على الجهاز فقط.
    </p>
    <div style="display:flex;flex-direction:column;gap:8px">
      <button type="button" class="primary" style="background:var(--blue);color:#fff" onclick="closeAppDialog();quickShareBackupToDrive()">☁ مشاركة نسخة عادية (غير مشفرة)</button>
      <button type="button" class="secondary" onclick="closeAppDialog();openAutoBackupFreqDialog()">🔄 ضبط جدول النسخ المحلي</button>
    </div>
  `;
  showAppCustomForm('الحفظ اليدوي والنسخ المحلي', html, null, true);
}

async function checkScheduledDriveBackupOnBoot(){
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
    await createAutomaticLocalSnapshot();
    try{ localStorage.setItem('xw_last_auto_snap', todayStr); }catch(_){}
    await persistCurrentStateStore();
    renderAutoSnapshotsList();
  }
}

function openFilePicker(id){ const e=document.getElementById(id); if(e){ e.value=''; e.click(); } }
async function backup(){
  try{
    const cleanJson = await createBackupDocument(state);
    const blob = new Blob([cleanJson], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'x-wallet-backup-' + today() + '.json';
    anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
    state.prefs = state.prefs || {};
    state.prefs.lastBackupDate = today();
    persist();
    toast('تم تصدير النسخة الاحتياطية بنجاح ✓');
  }catch(err){
    toast(err?.message || 'تعذر إنشاء ملف النسخة الاحتياطية');
  }
}

async function applyImportedBackupState(parsedDoc,source,encrypted){
  if(typeof flushLiveDatabaseWrites==='function') await flushLiveDatabaseWrites();
  const previousState=cloneWalletStateForRollback(state);
  const restored=validateRestoredState(parsedDoc);
  await createPreRestoreSnapshot('قبل الاستيراد من '+source);
  const rollbackSnapshots=cloneWalletStateForRollback(_autoSnapshotsMemory||[]);
  try{
    delete restored.autoSnapshots;
    const oldPrefs=JSON.parse(JSON.stringify(state.prefs||{}));
    const restoreHistory=Array.isArray(state.restoreLog)?state.restoreLog.slice(0,100):[];
    state=preserveDeviceSecurityAndDrivePrefs(oldPrefs,restored);
    state.restoreLog=restoreHistory;
    state.restoreLog.unshift({id:uid('restore'),at:new Date().toISOString(),source:String(source),integrity:parsedDoc.integrity,result:'success'});
    state.restoreLog=state.restoreLog.slice(0,100);
    syncCategoryTrees();
    if(typeof auditRecord==='function') auditRecord('استعادة','نسخة احتياطية',source,null,{integrity:parsedDoc.integrity,encrypted:!!encrypted});
    await commitCriticalWalletState(previousState,rollbackSnapshots,'استيراد النسخة الاحتياطية');
  }catch(err){
    if(restoreWalletStateAfterCriticalFailure(previousState)){try{applyPreferences();renderAll();}catch(_){}}
    throw err;
  }
  try{applyPreferences();renderAll();if(typeof renderManagementHub==='function')renderManagementHub();}
  catch(renderError){console.warn('Backup restore committed; view refresh deferred',renderError);}
  const integrityText=parsedDoc.integrity==='verified'?'تم التحقق من بصمة SHA-256 للنسخة':(parsedDoc.integrity==='authenticated'?'تم التحقق من تشفير ومصادقة النسخة':'تم استيراد نسخة قديمة غير مزودة ببصمة تحقق');
  toast(`${integrityText}${encrypted?' وفك تشفيرها':''} من ${source}؛ تم التحقق من الحفظ محلياً ✓`);
  return true;
}
function restoreBackupText(rawText, source){
  if(isEncryptedBackupDocument(rawText)){
    showAppPrompt(
      'فك تشفير النسخة الاحتياطية',
      'أدخل كلمة مرور النسخة المشفرة',
      '',
      async pass => {
        try{
          const parsedDoc = await parseEncryptedBackupDocument(rawText, pass);
          await applyImportedBackupState(parsedDoc, source, true);
        }catch(err){
          toast(err?.message || 'تعذر فك تشفير النسخة؛ تحقق من كلمة المرور والملف');
        }
      },
      false,
      'password'
    );
    return;
  }
  parseBackupDocument(rawText).then(parsedDoc=>applyImportedBackupState(parsedDoc, source, false)).catch(err=>{
    toast(err?.message === 'Backup integrity check failed' ? 'النسخة تالفة أو تم تعديلها؛ لم تتم الاستعادة' : (err?.message || 'ملف النسخة غير صالح'));
  });
}

function restore(e){
  const file = e?.target?.files?.[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>restoreBackupText(String(reader.result || ''), 'الملف');
  reader.onerror = ()=>toast('تعذرت قراءة ملف النسخة الاحتياطية');
  reader.readAsText(file);
}


let _latestRemoteVer = '';
function dismissUpdateModal(){
  const m = document.getElementById('updateAvailableModal');
  if(m) m.classList.remove('show');
  if(_latestRemoteVer){
    try{ sessionStorage.setItem('xw_upd_dismissed', _latestRemoteVer); }catch(_){}
  }
}
function updateNotesList(notes){
  if(Array.isArray(notes)) return notes.map(s=>String(s).trim()).filter(Boolean);
  return String(notes||'تحسينات جديدة في التطبيق').split(/\n|\+/).map(s=>s.trim()).filter(Boolean);
}
function renderUpdateNotesHtml(notes){
  return updateNotesList(notes).map(s=>`<div dir="rtl" style="margin:4px 0;unicode-bidi:isolate">• ${esc(s.replace(/^•\s*/,''))}</div>`).join('');
}
function showUpdateCardModal(ver, notes){
  const m = document.getElementById('updateAvailableModal');
  if(!m) return;
  _latestRemoteVer = String(ver || '');
  document.getElementById('updModalTitle').textContent = '🚀 تحديث جديد: X-Wallet V' + ver;
  document.getElementById('updModalNotes').innerHTML =
    '<div dir="rtl" style="font-weight:400;margin-bottom:6px;color:var(--text)">ملخص التحديث:</div>' +
    renderUpdateNotesHtml(notes);
  m.classList.add('show');
}
function checkForUpdate(silent){
  const box = document.getElementById('updateDetailsBox');
  if(!silent && box) box.innerHTML = '<div class="hint" style="margin:0">جاري البحث عن تحديثات…</div>';
  fetch('./version.json?t='+Date.now(),{cache:'no-store'}).then(r=>r.json()).then(v=>{
    const rem = String(v.version||v.appVersion||'').trim();
    const notes = (v.notes === undefined || v.notes === null) ? 'تحسينات عامة في الأداء والاستقرار' : v.notes;
    const notesHtml = renderUpdateNotesHtml(notes);
    if(!rem || rem === APP_VERSION){
      try{ sessionStorage.removeItem('xw_upd_dismissed'); }catch(_){}
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
      _latestRemoteVer = rem;
      if(box) box.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <b style="color:var(--orange);font-size:.82rem">🚀 يتوفر تحديث جديد: V${esc(rem)}</b>
          <span class="tag">الحالي: V${esc(APP_VERSION)}</span>
        </div>
        <div class="hint" style="margin:0 0 10px;font-size:.72rem;color:var(--text-sub)"><b>أهم التحسينات:</b>${notesHtml}</div>
        <button type="button" class="primary" style="padding:9px" onclick="forceAppUpdate()">تحديث</button>
      `;
      let dismissed = '';
      try{ dismissed = sessionStorage.getItem('xw_upd_dismissed') || ''; }catch(_){}
      if(!silent || dismissed !== rem){
        showUpdateCardModal(rem, notes);
      }
    }
  }).catch(()=>{
    if(!silent){
      if(box) box.innerHTML = '<div class="hint" style="margin:0;color:var(--red)">تعذر الاتصال للبحث عن تحديث. تأكد من الإنترنت.</div>';
      toast('تعذر فحص التحديث');
    }
  });
}
function setAppUpdateProgressUI(pct, label){
  const safePct = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  const modalWrap = document.getElementById('updProgressWrap');
  const modalFill = document.getElementById('updProgressBar');
  const modalTxt = document.getElementById('updProgressText');
  if(modalWrap) modalWrap.style.display = 'block';
  if(modalFill) modalFill.style.width = safePct + '%';
  if(modalTxt) modalTxt.textContent = label || (`جاري تحميل التحديث... ${safePct}%`);
  const topBar = document.getElementById('globalUpdateBar');
  const topFill = document.getElementById('globalUpdateFill');
  const topTxt = document.getElementById('globalUpdateLabel');
  if(topBar) topBar.classList.add('show');
  if(topFill) topFill.style.width = safePct + '%';
  if(topTxt) topTxt.textContent = label || (`جاري التحديث ${safePct}%`);
}

if(typeof navigator !== 'undefined' && 'serviceWorker' in navigator && !window.__xwSwProgressBound){
  window.__xwSwProgressBound = true;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if(window.__xwSwReloading) return;
    window.__xwSwReloading = true;
    setAppUpdateProgressUI(100, 'تم التحديث — جاري إعادة الفتح…');
    const u = new URL(location.href);
    u.searchParams.set('_xw_sw_ready', String(Date.now()));
    location.replace(u.toString());
  });
  navigator.serviceWorker.addEventListener('message', ev => {
    const d = ev?.data;
    if(!d || d.type !== 'SW_UPDATE_PROGRESS') return;
    let lbl = `جاري تحميل التحديث... ${d.loaded}/${d.total} (${d.pct}%)`;
    if(d.stage === 'activating') lbl = 'جاري تفعيل النسخة الجديدة… 98%';
    else if(d.stage === 'reloading') lbl = 'اكتمل التحديث — جاري إعادة الفتح… 100%';
    setAppUpdateProgressUI(d.stage === 'activating' ? 98 : d.pct, lbl);
    if((d.stage === 'activating' || d.stage === 'reloading') && !window.__xwAutoReloadScheduled){
      window.__xwAutoReloadScheduled = true;
      setTimeout(() => {
        if(window.__xwSwReloading) return;
        window.__xwSwReloading = true;
        setAppUpdateProgressUI(100, 'اكتمل التحديث — جاري إعادة الفتح… 100%');
        const u = new URL(location.href);
        u.searchParams.set('_xw_sw_done', String(Date.now()));
        location.replace(u.toString());
      }, 950);
    }
  });
}

async function forceAppUpdate(){
  setAppUpdateProgressUI(8, 'جاري الاتصال بخادم التحديثات…');
  let fallbackTimer = setTimeout(()=>{
    const u=new URL(location.href);
    u.searchParams.set('_xw_refresh',String(Date.now()));
    location.replace(u.toString());
  }, 15000);
  try{
    if('serviceWorker' in navigator){
      const reg=await navigator.serviceWorker.getRegistration();
      if(reg){
        setAppUpdateProgressUI(15, 'جاري فحص ملفات النسخة الجديدة…');
        await reg.update();
        if(reg.waiting){
          setAppUpdateProgressUI(95, 'جاري تفعيل التحديث…');
          reg.waiting.postMessage({type:'SKIP_WAITING'});
          return;
        }
        if(reg.installing){
          setAppUpdateProgressUI(22, 'جاري تحميل ملفات التحديث…');
          return;
        }
      }
    }
  }catch(err){console.warn('X-Wallet service worker update check failed:',err);}
  clearTimeout(fallbackTimer);
  setAppUpdateProgressUI(100, 'جاري إعادة تحميل التطبيق…');
  const u=new URL(location.href);
  u.searchParams.set('_xw_refresh',String(Date.now()));
  location.replace(u.toString());
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
  showAppConfirm('حذف كل بيانات التطبيق', 'هل أنت متأكد من حذف كل بيانات التطبيق والنسخ المحلية نهائياً من هذا الجهاز؟', async ()=>{
    try{await resetLocalWalletStorage();location.reload();}
    catch(err){toast(err?.message||'تعذر حذف بيانات التطبيق');}
  }, true);
}
function installPWA(){
  if(window.__deferredInstallPrompt){ window.__deferredInstallPrompt.prompt(); return; }
  toast('من قائمة المتصفح ⋮ اختر «تثبيت التطبيق»');
}

