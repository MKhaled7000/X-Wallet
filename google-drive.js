/* X-Wallet 15.3.6: GIS token model. OAuth tokens never enter wallet state/storage. */
const GOOGLE_DRIVE_SCOPE='https://www.googleapis.com/auth/drive.file';
let _googleDriveSession=null;
let _googleDriveAuthPending=false;
let _googleDriveBusy=false;
function clearGoogleDriveSession(){_googleDriveSession=null;}
function googleDriveToken(){
  return _googleDriveSession && _googleDriveSession.clientId===state.prefs?.driveClientId && Date.now()<_googleDriveSession.expiresAt ? _googleDriveSession.token : '';
}
function authorizeGoogleDrive(){
  const clientId=String(state.prefs?.driveClientId||'').trim();
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
          if(state.prefs?.driveClientId!==clientId){finish(new Error('تغير إعداد الربط؛ حاول مرة أخرى'));return;}
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
    const stamp=new Date().toISOString().replace(/[:.]/g,'-');
    const name=`x-wallet-encrypted-backup-${stamp}.json`;
    const metadata={name,mimeType:'application/json',appProperties:{xWalletBackup:'encrypted-v1'}};
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
    state.prefs.lastDriveBackup=today();state.prefs.lastBackupDate=today();
    persist();
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
    toast('جاري تنزيل أحدث نسخة مشفرة من ملفات التطبيق…');
    const query="trashed = false and appProperties has { key='xWalletBackup' and value='encrypted-v1' }";
    const list=await googleDriveFetch('https://www.googleapis.com/drive/v3/files?q='+encodeURIComponent(query)+'&orderBy=modifiedTime%20desc&pageSize=1&fields=files(id,name,modifiedTime)');
    const latest=(await list.json())?.files?.[0];
    if(!latest?.id)throw new Error('لا توجد نسخة لهذا التطبيق في حساب Google المختار. نسخ السكريبت القديمة تُستورد كملف من الجهاز');
    const file=await googleDriveFetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(latest.id)+'?alt=media');
    const raw=await file.text();
    if(!isEncryptedBackupDocument(raw))throw new Error('ملف Google Drive ليس نسخة مشفرة صالحة؛ لم تتغير بياناتك');
    showAppConfirm('استعادة نسخة Google Drive',`سيتم استبدال المحفظة كاملة بنسخة ${latest.name}. تُحفظ نقطة استعادة محلية قبل التغيير. أكمل؟`,()=>restoreCloudBackupText(raw,'Google Drive'),true);
  }catch(err){toast(err.message||'تعذر تنزيل النسخة؛ لم تتغير بياناتك');}
  finally{_googleDriveBusy=false;}
}
