/* X-Wallet V14.0 module: app.js | Extracted from V13.40 app.js */

/* ---- Original app.js lines 4749-4853 ---- */
/* Boot: complete the IndexedDB recovery check before exposing the app UI. */
document.documentElement.classList.add('xwallet-boot-loading');
(async()=>{
  let restoredFromIndexedDB=false;
  let retiredEncryptionRemoved=false;
  try{
    retiredEncryptionRemoved=await removeLegacyLiveEncryptionData();
    restoredFromIndexedDB=!!(await recoverFromIndexedDBIfNeeded());
  }catch(err){
    console.error('X-Wallet local database initialization failed:',err);
    toast('تعذر تهيئة التخزين المحلي. أعد تحميل التطبيق وتحقق من مساحة التخزين.');
    document.documentElement.classList.remove('xwallet-boot-loading');
    return;
  }
  try{
    const migratedToEGP=await migrateWalletToEGP();
    if(migratedToEGP)console.info('X-Wallet historical currency normalization to EGP completed.');
  }catch(err){
    console.error('X-Wallet EGP normalization blocked safely:',err);
    toast(err?.message||'تعذر توحيد العملات إلى الجنيه المصري. لم يتم تغيير البيانات.');
    document.documentElement.classList.remove('xwallet-boot-loading');
    return;
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
  if(retiredEncryptionRemoved)toast('تم إلغاء تشفير قاعدة البيانات الحية والعودة للتخزين المحلي. ملفات النسخ الاحتياطية المشفرة مستقلة ولم تتأثر.');
  else if(restoredFromIndexedDB)toast('تمت استعادة أحدث بياناتك تلقائياً من IndexedDB ✓');
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

/* 14. Unified Cloud Sync Setup (GitHub Private Gist + Google Drive) with pure unreversed Arabic */
function openCloudSyncModal(){
  const p = state.prefs || {};
  const ghToken = esc(p.ghToken || '');
  const ghGistId = esc(p.ghGistId || '');
  const drvUrl = esc(p.driveWebhookUrl || '');
  const html = `
    <div dir="rtl" style="text-align:right;unicode-bidi:plaintext;display:flex;flex-direction:column;gap:10px">
      <div style="background:var(--surface);border:1px solid var(--mint);border-radius:12px;padding:10px">
        <b style="color:var(--mint);font-size:.82rem;display:block;margin-bottom:6px">أولاً: المزامنة عبر جيت هاب (Gist غير عام)</b>
        <div class="hint" style="margin:0 0 6px;font-size:.72rem;line-height:1.7">
          ١. افتح الرابط التالي لإنشاء مفتاح الربط من موبايلك بصلاحية Gists فقط:<br>
          <a href="https://github.com/settings/tokens/new?scopes=gist&description=X-Wallet" target="_blank" style="color:var(--mint);text-decoration:underline">اضغط هنا لفتح صفحة إنشاء المفتاح في جيت هاب</a><br>
          ٢. انزل لآخر الصفحة واضغط زر توليد المفتاح ثم انسخه والصقه هنا.<br>
          ٣. اترك خانة رقم المفكرة فارغة في أول مرة وسيُنشأ Gist غير عام (Secret) تلقائياً. تنبيه: Secret ليس خاصاً فعلياً؛ من يملك الرابط يستطيع فتح الملف، لذلك استخدم الرفع المشفر.
        </div>
        <input id="cfgGhToken" type="password" autocomplete="off" value="${ghToken}" placeholder="الصق مفتاح جيت هاب هنا" style="width:100%;height:34px;margin-bottom:6px;background:var(--panel2);border:1px solid var(--line2);border-radius:8px;padding:0 10px;color:var(--text);font-size:.74rem">
        <small class="hint" style="display:block;margin:0 0 6px">مفتاح GitHub يُحفظ على هذا الجهاز داخل بيانات التطبيق؛ إخفاؤه هنا بصري فقط وليس تشفيراً له. استخدم مفتاحاً بصلاحية Gists فقط.</small>
        <input id="cfgGhGistId" type="text" value="${ghGistId}" placeholder="رقم المفكرة (يملأ تلقائياً)" style="width:100%;height:34px;background:var(--panel2);border:1px solid var(--line2);border-radius:8px;padding:0 10px;color:var(--text);font-size:.74rem">
      </div>
      <div style="background:var(--surface);border:1px solid var(--blue);border-radius:12px;padding:10px">
        <b style="color:var(--blue);font-size:.82rem;display:block;margin-bottom:6px">ثانياً: المزامنة عبر جوجل درايف</b>
        <div class="hint" style="margin:0 0 6px;font-size:.72rem;line-height:1.7">
          ١. افتح موقع سكريبتات جوجل من الرابط التالي:<br>
          <a href="https://script.google.com/" target="_blank" style="color:var(--blue);text-decoration:underline">اضغط هنا لفتح صفحة سكريبتات جوجل</a><br>
          ٢. أنشئ مشروعاً جديداً، الصق كود الحفظ، انشره كتطبيق ويب، ثم الصق الرابط هنا.
        </div>
        <button type="button" class="smallbtn" style="width:100%;margin-bottom:6px;border-color:var(--blue);color:var(--blue)" onclick="copyGoogleDriveScriptCode()">📋 نسخ كود الحفظ لجوجل درايف</button>
        <input id="cfgDrvWebhook" type="url" value="${drvUrl}" placeholder="الصق رابط سكريبت جوجل هنا" style="width:100%;height:34px;background:var(--panel2);border:1px solid var(--line2);border-radius:8px;padding:0 10px;color:var(--text);font-size:.74rem">
      </div>
      <div class="c-row" style="padding:4px 0">
        <label style="font-size:.75rem">الخدمة المستخدمة عند المزامنة:</label>
        <select id="cfgSyncProvider" style="height:32px;background:var(--panel2);border:1px solid var(--line2);border-radius:8px;color:var(--text);font-size:.74rem">
          <option value="github" ${p.syncProvider!=='google'?'selected':''}>جيت هاب</option>
          <option value="google" ${p.syncProvider==='google'?'selected':''}>جوجل درايف</option>
        </select>
      </div>
    </div>
  `;
  showAppCustomForm('إعداد المزامنة السحابية', html, ()=>{
    state.prefs = state.prefs || {};
    state.prefs.ghToken = (document.getElementById('cfgGhToken')?.value || '').trim();
    state.prefs.ghGistId = (document.getElementById('cfgGhGistId')?.value || '').trim();
    state.prefs.driveWebhookUrl = (document.getElementById('cfgDrvWebhook')?.value || '').trim();
    state.prefs.syncProvider = document.getElementById('cfgSyncProvider')?.value || 'github';
    persist();
    toast('تم حفظ إعدادات المزامنة ✓');
  });
}

/* 22. Splash Screen Fade Out */
(function(){
  const sp = document.getElementById('appSplashScreen');
  if(sp){
    setTimeout(()=> sp.classList.add('hide'), 950);
  }
})();


function copyGoogleDriveScriptCode(){
  const code = `function doPost(e) {
  var folderName = 'X-Wallet Backups';
  var dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var content = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
  var encrypted = false;
  try { encrypted = JSON.parse(content).format === 'x-wallet-encrypted-backup'; } catch (_) {}
  var fileName = (encrypted ? 'x-wallet-encrypted-backup-' : 'x-wallet-backup-') + dateStr + '.json';
  var folders = DriveApp.getFoldersByName(folderName);
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  var files = folder.getFilesByName(fileName);
  if (files.hasNext()) { files.next().setContent(content); }
  else { folder.createFile(fileName, content, MimeType.PLAIN_TEXT); }
  return ContentService.createTextOutput('OK');
}
function doGet() {
  var folderName = 'X-Wallet Backups';
  var folders = DriveApp.getFoldersByName(folderName);
  if (!folders.hasNext()) return ContentService.createTextOutput('{}');
  var files = folders.next().getFiles();
  var latest = null;
  while (files.hasNext()) {
    var f = files.next();
    if (!latest || f.getLastUpdated() > latest.getLastUpdated()) latest = f;
  }
  if (!latest) return ContentService.createTextOutput('{}');
  return ContentService.createTextOutput(latest.getBlob().getDataAsString()).setMimeType(ContentService.MimeType.JSON);
}`;
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(code).then(()=>toast('تم نسخ كود الحفظ ✓')).catch(()=>toast('تعذر النسخ التلقائي'));
  }
}

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
