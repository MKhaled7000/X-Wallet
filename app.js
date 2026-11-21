function showWalletBootBlock(message){
  document.documentElement.classList.remove('xwallet-boot-loading');
  const panel=document.createElement('main');panel.dir='rtl';panel.style.cssText='max-width:36rem;margin:12vh auto;padding:24px;line-height:1.9';
  const heading=document.createElement('h2');heading.textContent='حماية بيانات المحفظة';
  const text=document.createElement('p');text.textContent=message;
  const retry=document.createElement('button');retry.textContent='إعادة المحاولة';retry.onclick=()=>location.reload();
  panel.append(heading,text,retry);document.body.replaceChildren(panel);
}
/* X-Wallet V14.0 module: app.js | Extracted from V13.40 app.js */

/* ---- Original app.js lines 4749-4853 ---- */
/* Boot: complete the IndexedDB recovery check before exposing the app UI. */
document.documentElement.classList.add('xwallet-boot-loading');
(async()=>{
  let restoredFromIndexedDB=false;

  try{
    if(await detectLegacyLiveEncryptionData()){
      const explain=window.confirm('توجد بيانات قديمة مشفرة من V15.0/V15.1. لن يتم حذفها أو تعديلها. تم إيقاف فتح المحفظة لحمايتها. هل تريد عرض إرشادات الاستعادة؟');
      if(explain)window.alert('احتفظ ببيانات هذا المتصفح. افتح النسخة القديمة المتوافقة وصدّر نسخة احتياطية، أو اطلب ترحيلاً منفصلاً. لا تمسح بيانات الموقع. هذه النسخة لا تفك تشفير قاعدة البيانات القديمة.');
      showWalletBootBlock('تم الاحتفاظ بالبيانات القديمة المشفرة دون تغيير. يلزم قرار وترحيل منفصل قبل استخدام هذه النسخة.');return;
    }
    restoredFromIndexedDB=!!(await recoverFromIndexedDBIfNeeded());
  }catch(err){
    console.error('X-Wallet local database initialization failed:',err);
    toast('تعذر تهيئة التخزين المحلي. أعد تحميل التطبيق وتحقق من مساحة التخزين.');
    showWalletBootBlock('تعذر فتح بيانات المحفظة بأمان. لم يتم حذف النسخ القديمة. أغلق التبويبات الأخرى وتحقق من التخزين ثم أعد التحميل.');
    return;
  }
  try{
    const migratedToEGP=await migrateWalletToEGP();
    if(migratedToEGP)console.info('X-Wallet historical currency normalization to EGP completed.');
  }catch(err){
    console.error('X-Wallet EGP normalization blocked safely:',err);
    toast(err?.message||'تعذر توحيد العملات إلى الجنيه المصري. لم يتم تغيير البيانات.');
    showWalletBootBlock('تعذر إكمال ترحيل العملات بأمان. احتفظ ببيانات الموقع وراجع النسخة الاحتياطية قبل المتابعة.');
    return;
  }
  // Retire the app's former GitHub sync credentials locally; remote backups are untouched.
  if(state.prefs&&['ghToken','ghGistId','syncProvider'].some(key=>key in state.prefs)){
    for(const key of ['ghToken','ghGistId','syncProvider'])delete state.prefs[key];
    persist();
  }
  applyPreferences();
  initSalary();
  const curYM=selected();
  setv('comStartVal',curYM);
  const comStartLbl=document.getElementById('comStartLabel');
  if(comStartLbl)comStartLbl.textContent=formatYMArabic(curYM);
  setv('opPurchaseVal',curYM);
  const opPurLbl=document.getElementById('opPurchaseLabel');
  if(opPurLbl)opPurLbl.textContent=formatYMArabic(curYM);
  const defaultYrStart=String(forecastYear)+'-01';
  setv('annStartVal',defaultYrStart);
  const annStartLbl=document.getElementById('annStartLabel');
  if(annStartLbl)annStartLbl.textContent=formatYMArabic(defaultYrStart);
  setv('defDueVal',curYM);
  const defDueLbl=document.getElementById('defDueLabel');
  if(defDueLbl)defDueLbl.textContent=formatYMArabic(curYM);
  recalcMonthlyCommitmentEnd();
  recalcAnnualPlanItemEnd();
  updateBackupStatusUI();
  renderAll();
  document.documentElement.classList.remove('xwallet-boot-loading');
  if(restoredFromIndexedDB)toast('تمت استعادة أحدث بياناتك تلقائياً من IndexedDB ✓');
  try{await migrateLegacyPlainPin();}catch(err){console.warn('Legacy PIN migration deferred:',err);}
  try{const created=runRecurringTransactions(today());if(created)toast(`تم إنشاء ${created} معاملة متكررة مستحقة ✓`);}catch(err){console.error('Recurring transaction processing failed:',err);}
  checkAppLockOnBoot();
  try{await checkScheduledDriveBackupOnBoot();}catch(err){console.warn('Scheduled local backup failed:',err);}
})();

try{
  if('serviceWorker' in navigator){
    // The active Service Worker performs the single controlled navigation after an update.
    // Avoid a second controllerchange-triggered reload racing that navigation.
    window.addEventListener('load', ()=>{
      navigator.serviceWorker.register('./sw.js', {updateViaCache: 'none'}).then(reg => {
        reg.update().catch(()=>{});
        reg.addEventListener('updatefound', ()=>{
          const newWorker = reg.installing;
          if(newWorker){
            newWorker.addEventListener('statechange', ()=>{
              if(newWorker.state === 'installed' && navigator.serviceWorker.controller){
                checkForUpdate(true);
              }
            });
          }
        });
      }).catch(()=>{});
      setTimeout(()=>checkForUpdate(true), 1500);
    });
  }
}catch(e){}

document.addEventListener('click', function(e){
  const wrap = document.getElementById('qmCardMonthsWrap');
  if(wrap && !wrap.contains(e.target)) closeQmMonthsMenu();
});

document.addEventListener('click', function(e){
  const sw = document.getElementById('fabSpeedWrap');
  if(sw && !sw.contains(e.target)) sw.classList.remove('open');
});
(function(){
  const inp = document.getElementById('actSearch');
  if(inp){
    inp.addEventListener('focus', function(){
      if(!_transSearchActive){
        _transSearchActive = true;
        try{ history.pushState({xwGuard:2, xwSearch:1}, ''); }catch(_){}
        updateFabVisibility();
      }
    });
  }
})();


/* 20. Smart Transfer Fee Learning (Like Money Manager) */
function suggestSmartTransferFee(){
  if(qmState.type !== 'transfer') return 0;
  const fromId = qmState.accountId;
  const toId = qmState.toAccountId;
  const amt = num('qmAmount');
  if(!fromId || amt <= 0) return 0;
  const past = (state.ledger || []).filter(l => l.type === 'transfer' && Number(l.fee) > 0);
  // Priority 1: Exact same from + to + amount
  for(let i = past.length - 1; i >= 0; i--){
    if(past[i].from === fromId && past[i].to === toId && Number(past[i].amount) === amt){
      return Number(past[i].fee);
    }
  }
  // Priority 2: Same from account + exact amount
  for(let i = past.length - 1; i >= 0; i--){
    if(past[i].from === fromId && Number(past[i].amount) === amt){
      return Number(past[i].fee);
    }
  }
  return 0;
}

/* Auto-suggest learned fee when typing transfer amount */
(function(){
  const origUpdCalc = updateQmCalcDisplay;
  updateQmCalcDisplay = function(){
    origUpdCalc();
    if(qmState.type === 'transfer' && qmState.calcTarget === 'qmAmount' && !qmState.editId){
      const suggested = suggestSmartTransferFee();
      if(suggested > 0){
        setv('qmFee', suggested);
      }
    }
  };
})();


/* ---- Original app.js lines 4873-5081 ---- */
/* Auto Backup Toggle */

/* Cloud settings are secondary to Save and Restore. */
function openCloudSyncModal(){
  const p=state.prefs||{};
  const html=`<div class="ft-form" dir="rtl">
    <section class="ft-card"><h3>Google Drive</h3>
      <p class="hint">نسخ مشفرة داخل مجلد X-Wallet Backups. بيانات التطبيق تظل على جهازك.</p>
      <button type="button" class="secondary" onclick="selectGoogleBackupFolder()">اختيار المجلد الموجود</button>
      <button type="button" class="smallbtn" onclick="clearGoogleDriveSession();refreshCloudBackupUI();toast('اختر الحساب عند الحفظ أو الاسترجاع')">تغيير حساب Google</button>
    </section>
    <details class="fold"><summary>إعداد متقدم</summary><div class="fold-body">
      <label class="ft-field" for="cfgDrvClientId"><span>OAuth Client ID</span><input id="cfgDrvClientId" dir="ltr" value="${esc(p.driveClientId||'')}" autocomplete="off"></label>
      <p class="hint">الربط جاهز مسبقاً. لا تغير المعرّف إلا عند استخدام مشروع Google مختلف.</p>
    </div></details>
  </div>`;
  showAppCustomForm('إعداد النسخ الاحتياطي السحابي',html,()=>{
    const id=(document.getElementById('cfgDrvClientId')?.value||'').trim();
    if(id&&!/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(id)){toast('معرّف العميل غير صحيح');return false;}
    state.prefs=state.prefs||{};
    if((state.prefs.driveClientId||'')!==id){clearGoogleDriveSession();delete state.prefs.driveFolderId;}
    state.prefs.driveClientId=id;
    for(const key of ['ghToken','ghGistId','syncProvider','driveWebhookUrl','driveSharedSecret','driveAccessToken','driveEmail'])delete state.prefs[key];
    persist();refreshCloudBackupUI();toast('تم حفظ الإعدادات');
  });
}

/* 22. Splash Screen Fade Out */
(function(){
  const sp = document.getElementById('appSplashScreen');
  if(sp){
    setTimeout(()=> sp.classList.add('hide'), 950);
  }
})();


function openImportChoiceModal(){
  const html = `
    <div style="display:flex;flex-direction:column;gap:8px">
      <button type="button" class="primary" onclick="closeAppDialog();openFilePicker('restore')">📂 اختيار ملف من الجهاز</button>
      <button type="button" class="secondary" onclick="closeAppDialog();openAutoSnapshotsDialog()">🔄 استعادة من النسخ التلقائية المحلية</button>
    </div>
  `;
  showAppCustomForm('استيراد نسخة احتياطية', html, null, true);
}


function openSettingsSubPage(paneKey, titleTxt){
  document.querySelectorAll('#settingsSubModal .set-sub-pane').forEach(p=>p.style.display='none');
  const pane = document.getElementById('setPane_' + paneKey);
  if(pane) pane.style.display = 'block';
  const ttl = document.getElementById('settingsSubModalTitle');
  if(ttl) ttl.textContent = titleTxt || 'الإعدادات';
  if(paneKey === 'fab') syncFabSettingsUI();
  if(paneKey === 'backup') refreshCloudBackupUI();
  applyPreferences();
  syncCustomSelectTriggers();
  document.getElementById('settingsSubModal')?.classList.add('show');
}
function closeSettingsSubPage(){
  document.getElementById('settingsSubModal')?.classList.remove('show');
}
function openAboutAppModal(){
  document.getElementById('aboutAppModal')?.classList.add('show');
}
document.addEventListener('click', function(e){
  const wrap = document.getElementById('qmCardModeWrap');
  if(wrap && !wrap.contains(e.target) && typeof closeQmMonthsMenu === 'function') closeQmMonthsMenu();
});
