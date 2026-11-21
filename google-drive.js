/* X-Wallet 15.3.6: GIS token model. OAuth tokens never enter wallet state/storage. */
const GOOGLE_DRIVE_SCOPE='https://www.googleapis.com/auth/drive.file';
/* X-Wallet 15.3.8: developer configuration separated from normal use.
   When the developer ships a client ID here, the user only picks a Google
   account and approves; the field in إعداد الربط stays as an advanced override.
   An OAuth Web Client ID is a public identifier, not a secret. */
const XW_GOOGLE_CLIENT_ID='256393782346-d176rh2tcl5r19mj5gptd27o1ecmclg1.apps.googleusercontent.com';
function xwEffectiveGoogleClientId(){
  const custom=String(state.prefs?.driveClientId||'').trim();
  return custom||XW_GOOGLE_CLIENT_ID;
}
let _googleDriveSession=null;
let _googleDriveAuthPending=false;
let _googleDriveBusy=false;
function clearGoogleDriveSession(){_googleDriveSession=null;if(typeof refreshCloudBackupUI==='function')refreshCloudBackupUI();}
function googleDriveToken(){
  return _googleDriveSession && _googleDriveSession.clientId===xwEffectiveGoogleClientId() && Date.now()<_googleDriveSession.expiresAt ? _googleDriveSession.token : '';
}
function authorizeGoogleDrive(){
  const clientId=xwEffectiveGoogleClientId();
  if(!/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)){
    openCloudSyncModal();return Promise.reject(new Error('أضف OAuth Client ID الصحيح في إعداد الربط أولاً'));
  }
  if(location.protocol!=='https:' && !['localhost','127.0.0.1'].includes(location.hostname))return Promise.reject(new Error('افتح التطبيق عبر HTTPS أو localhost، وليس كملف محلي'));
  if(googleDriveToken())return Promise.resolve(googleDriveToken());
  if(_googleDriveAuthPending)return Promise.reject(new Error('أكمل نافذة تسجيل دخول Google المفتوحة أولاً'));
  if(!window.google?.accounts?.oauth2)return Promise.reject(new Error('مكتبة Google لم تجهز. تحقق من الإنترنت ثم اضغط المزامنة مرة أخرى'));
  _googleDriveAuthPending=true;
  return new Promise((resolve,reject)=>{
    let done=false;
    const finish=(error,response)=>{
      if(done)return;done=true;clearTimeout(timer);_googleDriveAuthPending=false;
      if(error){clearGoogleDriveSession();reject(error);return;}
      _googleDriveSession={clientId,token:response.access_token,expiresAt:Date.now()+Math.max(0,Number(response.expires_in)-60)*1000};
      refreshCloudBackupUI();
      const session=_googleDriveSession;
      googleDriveFetch('https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)').then(r=>r.json()).then(data=>{if(_googleDriveSession===session){session.accountLabel=data.user?.emailAddress||data.user?.displayName||'';refreshCloudBackupUI();}}).catch(()=>{});
      resolve(_googleDriveSession.token);
    };
    const timer=setTimeout(()=>finish(new Error('انتهى انتظار تسجيل الدخول؛ أغلق النافذة وحاول مجدداً')),120000);
    try{
      const client=google.accounts.oauth2.initTokenClient({
        client_id:clientId,scope:GOOGLE_DRIVE_SCOPE,include_granted_scopes:false,
        callback:response=>{
          if(response.error || !response.access_token || !(Number(response.expires_in)>60) || !google.accounts.oauth2.hasGrantedAllScopes(response,GOOGLE_DRIVE_SCOPE)){
            finish(new Error('لم تمنح Google صلاحية ملفات التطبيق؛ لم يتم رفع أي بيانات'));return;
          }
          if(xwEffectiveGoogleClientId()!==clientId){finish(new Error('تغير إعداد الربط؛ حاول مرة أخرى'));return;}
          finish(null,response);
        },
        error_callback:()=>finish(new Error('أُغلقت نافذة Google أو منعها المتصفح؛ اسمح بالنوافذ المنبثقة وحاول مجدداً'))
      });
      // Called synchronously from a click, before any encryption or network await.
      client.requestAccessToken({prompt:'select_account'});
    }catch(_){finish(new Error('تعذر فتح تسجيل دخول Google. تحقق من Client ID وعنوان الموقع المسموح'));}
  });
}
async function googleDriveFetch(url,options={}){
  const token=googleDriveToken();
  if(!token)throw new Error('انتهت جلسة Google. اضغط المزامنة أو الاستيراد لتسجيل الدخول مجدداً');
  const response=await fetch(url,{...options,credentials:'omit',cache:'no-store',headers:{...options.headers,Authorization:'Bearer '+token}});
  if(response.status===401){clearGoogleDriveSession();throw new Error('انتهت صلاحية Google؛ اضغط الزر مجدداً لإعادة تسجيل الدخول');}
  if(!response.ok)throw new Error(response.status===403?'رفض Google الطلب. تحقق من تفعيل Drive API والصلاحية وحصة الحساب':`تعذر الاتصال بـ Google Drive (HTTP ${response.status})`);
  return response;
}
async function exportBackupToGoogleDrive(silentAuto,options={}){
  if(typeof options.content!=='string'){
    if(!silentAuto){try{await authorizeGoogleDrive();requestEncryptedCloudBackup('google');}catch(err){toast(err.message);}}
    return {success:false,reason:'awaiting-encryption'};
  }
  if(!isEncryptedBackupDocument(options.content))throw new Error('لن تُرفع نسخة غير مشفرة');
  if(_googleDriveBusy){if(!silentAuto)toast('انتظر اكتمال عملية Google الحالية');return {success:false,reason:'busy'};}
  _googleDriveBusy=true;
  try{
    if(!googleDriveToken())throw new Error('انتهت جلسة Google؛ اضغط المزامنة مجدداً لتسجيل الدخول');
    if(!silentAuto)toast('جاري رفع النسخة المشفرة إلى Google Drive…');
    const folder=await ensureGoogleBackupFolder();
    const name=googleBackupFileName();
    const metadata={name,mimeType:'application/json',parents:[folder.id],appProperties:{xWalletBackup:'encrypted-v1'}};
    // Resumable protocol also supports backups above the multipart 5 MB range.
    // The session URL stays in memory; a failed upload is never reported as success.
    const init=await googleDriveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size',{
      method:'POST',headers:{'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':'application/json'},body:JSON.stringify(metadata)
    });
    const uploadLocation=init.headers.get('Location');
    if(!uploadLocation)throw new Error('Google لم يرجع رابط جلسة الرفع؛ لم يتم إرسال النسخة');
    const uploadURL=new URL(uploadLocation);
    if(uploadURL.protocol!=='https:'||uploadURL.hostname!=='www.googleapis.com'||uploadURL.username||uploadURL.password||!uploadURL.pathname.startsWith('/upload/drive/v3/files'))throw new Error('رابط جلسة الرفع غير موثوق؛ لم يتم إرسال النسخة');
    const res=await googleDriveFetch(uploadURL.toString(),{method:'PUT',headers:{'Content-Type':'application/json'},body:options.content});
    const uploaded=await res.json();
    if(!uploaded?.id)throw new Error('Google لم يؤكد إنشاء ملف النسخة');
    // Read the uploaded ciphertext back before declaring backup success.
    const verify=await googleDriveFetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(uploaded.id)+'?alt=media');
    if(await verify.text()!==options.content)throw new Error('لم يتطابق الملف بعد الرفع. لم نؤكد نجاح النسخة؛ حاول مجدداً');
    const locationCheck=await googleDriveFetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(uploaded.id)+'?fields=name,parents');
    const savedMetadata=await locationCheck.json();
    if(savedMetadata.name!==name||!savedMetadata.parents?.includes(folder.id))throw new Error('لم يؤكد Google اسم النسخة ومجلدها. لم نسجل نجاح الحفظ');
    state.prefs.lastDriveBackup=today();state.prefs.lastBackupDate=today();state.prefs.lastDriveBackupAt=new Date().toISOString();
    persist();refreshCloudBackupUI();
    if(!silentAuto)toast('تم رفع نسخة مشفرة والتحقق من محتواها على Google Drive ✓');
    return {success:true,verified:true,provider:'google-drive-api',fileId:uploaded.id};
  }catch(err){if(!silentAuto)toast(err.message||'تعذر الرفع؛ لم نؤكد حفظ نسخة جديدة');return {success:false,reason:'upload-failed',error:err};}
  finally{_googleDriveBusy=false;}
}
async function restoreGoogleDriveBackup(){
  if(_googleDriveBusy){toast('انتظر اكتمال عملية Google الحالية');return;}
  _googleDriveBusy=true;
  try{
    await authorizeGoogleDrive();
    const query="trashed = false and appProperties has { key='xWalletBackup' and value='encrypted-v1' }";
    let token='';const files=[];
    do{
      const url='https://www.googleapis.com/drive/v3/files?q='+encodeURIComponent(query)+'&orderBy=modifiedTime%20desc&pageSize=100&fields=nextPageToken,files(id,name,modifiedTime)'+(token?'&pageToken='+encodeURIComponent(token):'');
      const response=await googleDriveFetch(url);const result=await response.json();files.push(...(result.files||[]));token=result.nextPageToken||'';
    }while(token);
    _googleRestoreFiles=files;
    if(!files.length)throw new Error('لا توجد نسخ لهذا التطبيق في الحساب المختار. يمكنك استيراد ملف قديم من جهازك');
    const html='<p class="hint">اختر نسخة. تُحفظ نقطة استعادة محلية قبل استبدال بياناتك. لن تُحذف النسخ القديمة.</p><div class="cloud-restore-list">'+files.map((file,index)=>'<button type="button" class="secondary cloud-restore-item" onclick="chooseGoogleRestoreFile('+index+')"><b dir="ltr">'+esc(file.name)+'</b><small>'+esc(new Date(file.modifiedTime).toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'}))+'</small></button>').join('')+'</div>';
    showAppCustomForm('استرجاع نسخة سحابية',html,null,true);
  }catch(error){toast(error.message||'تعذر عرض النسخ؛ لم تتغير بياناتك');}
  finally{_googleDriveBusy=false;}
}

/* Existing folders only. Never silently create a duplicate or fall back to Drive root. */
const XW_DRIVE_FOLDER_NAME='X-Wallet Backups';
const XW_GOOGLE_PROJECT_NUMBER='256393782346';
function refreshCloudBackupUI(){
  const account=document.getElementById('cloudBackupAccount');
  if(account)account.textContent='Google Drive · '+(_googleDriveSession?.accountLabel||(googleDriveToken()?'متصل لهذه الجلسة':'غير متصل'));
  const last=document.getElementById('cloudBackupLast');
  if(last){const at=state.prefs?.lastDriveBackupAt;last.textContent=at?'آخر نسخة ناجحة: '+new Date(at).toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'}):state.prefs?.lastDriveBackup?'تاريخ نسخة سابقة: '+formatDateDMY(state.prefs.lastDriveBackup)+' (الوقت والتحقق غير مسجلين)':'آخر نسخة ناجحة: لم تُحفظ نسخة بعد';}
}
async function readGoogleBackupFolder(id){
  const result=await googleDriveFetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(id)+'?fields=id,name,mimeType,trashed,capabilities(canAddChildren)');
  const folder=await result.json();
  if(folder.trashed||folder.mimeType!=='application/vnd.google-apps.folder'||folder.name!==XW_DRIVE_FOLDER_NAME||!folder.capabilities?.canAddChildren)throw new Error('اختر مجلد X-Wallet Backups الموجود مع صلاحية الحفظ داخله');
  return folder;
}
let _drivePickerLoading=null;
function loadGoogleFolderPicker(){
  if(window.google?.picker)return Promise.resolve();
  if(_drivePickerLoading)return _drivePickerLoading;
  _drivePickerLoading=new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('تعذر تحميل اختيار المجلد. تحقق من الإنترنت وحاول مرة أخرى')),20000);
    const load=()=>{if(!window.gapi){clearTimeout(timeout);reject(new Error('مكتبة اختيار Google لم تجهز بعد. حاول مرة أخرى'));return;}
      gapi.load('picker',{callback:()=>{clearTimeout(timeout);resolve();},onerror:()=>{clearTimeout(timeout);reject(new Error('تعذر تحميل اختيار المجلد'));}});
    };load();
  }).catch(e=>{_drivePickerLoading=null;throw e;});
  return _drivePickerLoading;
}
async function chooseGoogleBackupFolder(){
  await loadGoogleFolderPicker();
  return new Promise((resolve,reject)=>{
    const view=new google.picker.DocsView(google.picker.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMode(google.picker.DocsViewMode.LIST);
    const picker=new google.picker.PickerBuilder().setAppId(XW_GOOGLE_PROJECT_NUMBER).setOAuthToken(googleDriveToken()).setOrigin(location.origin).setLocale('ar').setTitle('اختر مجلد X-Wallet Backups الموجود').addView(view).setCallback(async data=>{
      if(data.action===google.picker.Action.CANCEL){picker.dispose();resolve(null);return;}
      if(data.action!==google.picker.Action.PICKED)return;
      picker.dispose();
      try{const folder=await readGoogleBackupFolder(data.docs?.[0]?.id||'');state.prefs=state.prefs||{};state.prefs.driveFolderId=folder.id;persist();resolve(folder);}
      catch(error){reject(error);}
    }).build();
    picker.setVisible(true);
  });
}
async function selectGoogleBackupFolder(){
  try{await authorizeGoogleDrive();const folder=await chooseGoogleBackupFolder();if(folder)toast('تم اختيار المجلد الموجود ✓');}
  catch(error){toast(error.message||'تعذر اختيار المجلد');}
}
async function ensureGoogleBackupFolder(){
  if(state.prefs?.driveFolderId){
    try{return await readGoogleBackupFolder(state.prefs.driveFolderId);}catch(error){delete state.prefs.driveFolderId;persist();}
  }
  const q="trashed = false and mimeType = 'application/vnd.google-apps.folder' and name = 'X-Wallet Backups'";
  const response=await googleDriveFetch('https://www.googleapis.com/drive/v3/files?q='+encodeURIComponent(q)+'&pageSize=100&fields=nextPageToken,files(id,name)');
  const result=await response.json();
  if(result.files?.length===1&&!result.nextPageToken){const folder=await readGoogleBackupFolder(result.files[0].id);state.prefs=state.prefs||{};state.prefs.driveFolderId=folder.id;persist();return folder;}
  const chosen=await chooseGoogleBackupFolder();
  if(!chosen)throw new Error('لم يتم اختيار مجلد. لم تُرفع أي بيانات');
  return chosen;
}
function googleBackupFileName(date=new Date()){
  const part=n=>String(n).padStart(2,'0');
  return 'X-Wallet '+date.getFullYear()+'-'+part(date.getMonth()+1)+'-'+part(date.getDate())+' '+part(date.getHours())+'-'+part(date.getMinutes())+'-'+part(date.getSeconds())+'.json';
}
let _googleRestoreFiles=[];
async function chooseGoogleRestoreFile(index){
  const file=_googleRestoreFiles[index];
  if(!file?.id)return;
  if(_googleDriveBusy){toast('انتظر اكتمال العملية الحالية');return;}
  _googleDriveBusy=true;
  try{
    await authorizeGoogleDrive();
    const response=await googleDriveFetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(file.id)+'?alt=media');
    const raw=await response.text();
    if(!isEncryptedBackupDocument(raw))throw new Error('الملف ليس نسخة مشفرة صالحة؛ لم تتغير بياناتك');
    closeAppDialog();
    showAppConfirm('استرجاع نسخة Google Drive','سيتم استبدال بيانات المحفظة بنسخة '+file.name+'. تُحفظ نقطة استعادة محلية قبل التغيير. أكمل؟',()=>restoreCloudBackupText(raw,'Google Drive'),true);
  }catch(error){toast(error.message||'تعذر تنزيل النسخة؛ لم تتغير بياناتك');}
  finally{_googleDriveBusy=false;}
}
