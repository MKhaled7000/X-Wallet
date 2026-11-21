async function verifyGoogleScriptEndpoint(p){
  if(!p.driveSharedSecret||p.driveSharedSecret.length<32)throw new Error('أضف سراً مشتركاً عشوائياً لا يقل عن 32 حرفاً');
  const endpoint=new URL(p.driveWebhookUrl);
  if(endpoint.protocol!=='https:'||endpoint.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(endpoint.pathname))throw new Error('استخدم رابط نشر Apps Script الرسمي المنتهي بـ /exec');
  endpoint.searchParams.set('secret',p.driveSharedSecret);endpoint.searchParams.set('action','status');
  const response=await fetch(endpoint.toString(),{cache:'no-store',referrerPolicy:'no-referrer'});
  if(!response.ok)throw new Error('تعذر التحقق من السكريبت الآمن');
  let status;try{status=await response.json();}catch(_){throw new Error('السكريبت قديم أو السر غير صحيح. استبدل الكود وأعد النشر قبل الرفع.');}
  if(status?.protocol!=='x-wallet-secure-drive-v2'||status?.authenticated!==true)throw new Error('لم يؤكد الخادم دعم الحماية الجديدة؛ لم يتم إرسال النسخة');
  return true;
}

/* X-Wallet V14.2 — Cloud backup upload and restore workflows */

/* Split large Gist payloads into API-readable files (< 1 MB each), avoiding raw-host CORS on restore. */
const GITHUB_GIST_CHUNK_SIZE = 200000;
async function buildGitHubGistBackupFiles(contentStr){
  const content=String(contentStr??'');
  if(content.length<=GITHUB_GIST_CHUNK_SIZE)return {'x-wallet-backup.json':{content}};
  if(content.length>50000000)throw new Error('حجم النسخة أكبر من الحد المدعوم لرفع GitHub Gist');
  const chunkId=Date.now().toString(36)+Math.random().toString(36).slice(2,8);
  const chunks=[];
  for(let start=0;start<content.length;){
    let end=Math.min(content.length,start+GITHUB_GIST_CHUNK_SIZE);
    if(end<content.length){const code=content.charCodeAt(end-1);if(code>=0xD800&&code<=0xDBFF)end--;}
    chunks.push(content.slice(start,end));start=end;
  }
  const manifest={format:'x-wallet-gist-chunks',schemaVersion:1,chunkId,chunkCount:chunks.length,contentLength:content.length,checksumAlgorithm:'SHA-256',checksum:await backupSha256Hex(content)};
  const files={'x-wallet-backup.json':{content:JSON.stringify(manifest)}};
  chunks.forEach((chunk,index)=>{files[`xw-${chunkId}-${String(index+1).padStart(3,'0')}.part`]={content:chunk};});
  return files;
}
async function restoreGitHubGistContent(manifestText,files){
  let manifest;try{manifest=JSON.parse(manifestText);}catch(_){return manifestText;}
  if(manifest?.format!=='x-wallet-gist-chunks')return manifestText;
  if(manifest.schemaVersion!==1||!/^[a-z0-9]+$/.test(String(manifest.chunkId||''))||!Number.isInteger(manifest.chunkCount)||manifest.chunkCount<1||manifest.chunkCount>250||!Number.isInteger(manifest.contentLength)||manifest.contentLength<1||manifest.contentLength>50000000||manifest.checksumAlgorithm!=='SHA-256'||typeof manifest.checksum!=='string')throw new Error('بيانات تقسيم نسخة GitHub غير صالحة');
  const parts=[];
  for(let i=1;i<=manifest.chunkCount;i++){
    const name=`xw-${manifest.chunkId}-${String(i).padStart(3,'0')}.part`;
    const file=files?.[name];
    if(!file||file.truncated||typeof file.content!=='string')throw new Error(`جزء النسخة مفقود أو غير مكتمل: ${i}`);
    parts.push(file.content);
  }
  const content=parts.join('');
  if(content.length!==manifest.contentLength)throw new Error('حجم أجزاء نسخة GitHub لا يطابق البيان');
  const checksum=await backupSha256Hex(content);
  if(checksum!==manifest.checksum)throw new Error('فشل التحقق من سلامة أجزاء نسخة GitHub');
  return content;
}


async function uploadCloudBackupContent(contentStr, options={}){
  const p = state.prefs || {};
  const encrypted=isEncryptedBackupDocument(contentStr);
  if(!encrypted)throw new Error('الرفع السحابي يتطلب نسخة مشفرة؛ لم يتم إرسال البيانات');
  const provider = options.provider || p.syncProvider || 'github';

  if(provider === 'google'){
    if(!p.driveWebhookUrl && !p.driveAccessToken && !p.driveEmail){
      if(!options.silent) openCloudSyncModal();
      return {success:false, reason:'not-configured'};
    }
    return exportBackupToGoogleDrive(!!options.silent, {content:contentStr, encrypted});
  }

  if(!p.ghToken){
    if(!options.silent) openCloudSyncModal();
    return {success:false, reason:'not-configured'};
  }

  if(!options.silent) toast(encrypted ? 'جاري تشفير ورفع النسخة إلى GitHub…' : 'جاري المزامنة عبر GitHub…');
  try{
    const headers = {
      'Authorization': 'Bearer ' + p.ghToken,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    };
    const nextGistFiles = await buildGitHubGistBackupFiles(contentStr);
    const requestBodyData = {
      description: encrypted ? 'X-Wallet Encrypted Cloud Backup' : 'X-Wallet Cloud Backup',
      files: nextGistFiles
    };
    let url = 'https://api.github.com/gists';
    let method = 'POST';
    if(p.ghGistId){
      const existingUrl = 'https://api.github.com/gists/' + encodeURIComponent(p.ghGistId);
      const existingRes = await fetch(existingUrl, {headers, cache:'no-store'});
      if(!existingRes.ok) throw new Error(`تعذر فحص المفكرة المرتبطة في GitHub (HTTP ${existingRes.status})`);
      const existingGist = await existingRes.json();
      if(existingGist?.public === true){
        throw new Error('المفكرة المرتبطة في GitHub عامة. لم يتم رفع بياناتك؛ امسح رقم المفكرة وارفع مجدداً لإنشاء مفكرة خاصة.');
      }
      // Remove old chunk files so repeated large backups do not exhaust the Gist file limit.
      for(const oldName of Object.keys(existingGist.files||{})){
        if(/^xw-[a-z0-9]+-\d{3}\.part$/.test(oldName) && !(oldName in nextGistFiles)) requestBodyData.files[oldName] = null;
      }
      url = existingUrl;
      method = 'PATCH';
    } else {
      // Gist visibility is selected only when creating a new Gist.
      requestBodyData.public = false;
    }
    const res = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(requestBodyData)
    });
    if(!res.ok){
      let detail = '';
      try{detail = (await res.json())?.message || '';}catch(_){}
      throw new Error(`GitHub HTTP ${res.status}${detail ? ': '+detail : ''}`);
    }
    const data = await res.json();
    if(!data?.id) throw new Error('GitHub لم يُرجع رقم النسخة الاحتياطية');
    state.prefs = state.prefs || {};
    state.prefs.ghGistId = data.id;
    state.prefs.lastDriveBackup = today();
    state.prefs.lastBackupDate = today();
    persist();
    if(!options.silent) toast(encrypted ? 'تم رفع النسخة المشفرة والتحقق من استجابة GitHub ✓' : 'تمت المزامنة السحابية بنجاح ✓');
    return {success:true, verified:true, provider:'github'};
  }catch(err){
    console.error('X-Wallet GitHub backup upload failed:', err);
    if(!options.silent) toast(err?.message ? `تعذر رفع النسخة: ${err.message}` : 'تعذر إتمام الرفع إلى GitHub');
    return {success:false, reason:'upload-failed', error:err};
  }
}

function requestEncryptedCloudBackup(provider){
  showAppPrompt('تشفير النسخة السحابية','كلمة مرور لا تقل عن 10 أحرف. لن تُحفظ؛ احتفظ بها للاستعادة.','',password=>{
    if(String(password).length<10){toast('كلمة المرور يجب ألا تقل عن 10 أحرف');return;}
    showAppPrompt('تأكيد كلمة مرور النسخة','أعد كتابة كلمة المرور','',async confirmation=>{
      if(password!==confirmation){toast('كلمتا المرور غير متطابقتين؛ لم يتم الرفع');return;}
      try{
        const content=await createEncryptedBackupDocument(state,password);
        await uploadCloudBackupContent(content,{encrypted:true,provider});
      }catch(err){toast(err?.message||'تعذر تجهيز النسخة المشفرة');}
    },false,'password');
  },false,'password');
}
async function syncCloudNow(){
  const p=state.prefs||{};const provider=p.syncProvider||'github';
  if((provider==='google'&&!p.driveWebhookUrl&&!p.driveAccessToken&&!p.driveEmail)||(provider!=='google'&&!p.ghToken)){openCloudSyncModal();return;}
  requestEncryptedCloudBackup(provider);
}

async function applyCloudBackupState(parsedDoc, source, encrypted){
  await applyImportedBackupState(parsedDoc, source, encrypted);
}

function restoreCloudBackupText(rawText, source){
  if(isEncryptedBackupDocument(rawText)){
    showAppPrompt(
      'فك تشفير نسخة السحابة',
      'أدخل كلمة مرور النسخة المشفرة',
      '',
      async pass => {
        try{
          const parsedDoc = await parseEncryptedBackupDocument(rawText, pass);
          await applyCloudBackupState(parsedDoc, source, true);
        }catch(err){
          toast(err?.message || 'تعذر فك تشفير النسخة؛ تحقق من كلمة المرور والملف');
        }
      },
      false,
      'password'
    );
    return;
  }
  parseBackupDocument(rawText).then(parsedDoc=>applyCloudBackupState(parsedDoc, source, false)).catch(err=>{
    toast(err?.message === 'Backup integrity check failed' ? 'النسخة تالفة أو تم تعديلها؛ لم تتم الاستعادة' : (err?.message || 'ملف النسخة السحابية غير صالح'));
  });
}

async function restoreFromCloudSync(){
  const p = state.prefs || {};
  const provider = p.syncProvider || 'github';
  if(provider === 'google'){
    if(!p.driveWebhookUrl && !p.driveAccessToken){
      openCloudSyncModal();
      return;
    }
    toast('جاري تنزيل النسخة من Google Drive…');
    try{
      let rawCloud = '';
      if(p.driveWebhookUrl){
        if(!p.driveSharedSecret)throw new Error('أضف السر المشترك وأعد نشر كود Apps Script الآمن أولاً');
        await verifyGoogleScriptEndpoint(p);
        const endpoint=new URL(p.driveWebhookUrl);
        if(endpoint.protocol!=='https:')throw new Error('رابط المزامنة يجب أن يستخدم HTTPS');
        endpoint.searchParams.set('secret',p.driveSharedSecret);
        const res = await fetch(endpoint.toString(), {cache:'no-store',referrerPolicy:'no-referrer'});
        if(!res.ok) throw new Error(`Google Drive HTTP ${res.status}`);
        rawCloud = await res.text();
      }else{
        const query = "trashed = false and (name contains 'x-wallet-backup-' or name contains 'x-wallet-encrypted-backup-')";
        const listRes = await fetch('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(query) + '&orderBy=modifiedTime%20desc&pageSize=1&fields=files(id,name,modifiedTime)', {
          headers:{'Authorization':'Bearer ' + p.driveAccessToken, 'Accept':'application/json'},
          cache:'no-store'
        });
        if(!listRes.ok) throw new Error(`Google Drive HTTP ${listRes.status}`);
        const listing = await listRes.json();
        const latest = listing?.files?.[0];
        if(!latest?.id) throw new Error('لم يتم العثور على نسخة محفوظة في Google Drive');
        const fileRes = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(latest.id) + '?alt=media', {
          headers:{'Authorization':'Bearer ' + p.driveAccessToken},
          cache:'no-store'
        });
        if(!fileRes.ok) throw new Error(`تعذر تنزيل ملف النسخة من Google Drive (HTTP ${fileRes.status})`);
        rawCloud = await fileRes.text();
      }
      if(!rawCloud || rawCloud.trim() === '{}') throw new Error('لم يتم العثور على نسخة محفوظة في Google Drive');
      restoreCloudBackupText(rawCloud, 'Google Drive');
    }catch(err){
      toast(err?.message || 'تعذر تنزيل النسخة من Google Drive');
    }
    return;
  }

  if(!p.ghToken || !p.ghGistId){
    openCloudSyncModal();
    return;
  }
  toast('جاري تنزيل النسخة من GitHub…');
  try{
    const apiUrl = 'https://api.github.com/gists/' + encodeURIComponent(p.ghGistId);
    const res = await fetch(apiUrl, {
      headers: {
        'Authorization': 'Bearer ' + p.ghToken,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      cache:'no-store'
    });
    if(!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
    const data = await res.json();
    const gistFile = data?.files?.['x-wallet-backup.json'];
    if(!gistFile) throw new Error('ملف x-wallet-backup.json غير موجود داخل المفكرة');
    let raw = gistFile.content || '';
    if(gistFile.truncated || !raw){
      if(!gistFile.raw_url) throw new Error('GitHub لم يوفر رابط تنزيل الملف الكامل');
      // Do not send the API token to gist.githubusercontent.com: it causes a cross-origin preflight.
      const rawRes = await fetch(gistFile.raw_url, {method:'GET',mode:'cors',credentials:'omit',cache:'no-store',headers:{'Accept':'text/plain'}});
      if(!rawRes.ok) throw new Error(`تعذر تنزيل ملف النسخة الكامل من GitHub (HTTP ${rawRes.status})`);
      raw = await rawRes.text();
    }
    if(!raw.trim()) throw new Error('ملف النسخة داخل GitHub فارغ');
    raw = await restoreGitHubGistContent(raw, data.files);
    restoreCloudBackupText(raw, 'GitHub');
  }catch(err){
    console.error('X-Wallet GitHub restore failed:',err);
    const msg = err?.name === 'TypeError' && /fetch/i.test(err.message||'')
      ? 'تعذر الاتصال بتنزيل GitHub؛ قد يكون السبب حظر CORS أو الشبكة. لم يتم تغيير بياناتك.'
      : (err?.message || 'تعذر تنزيل النسخة من GitHub');
    toast(msg);
  }
}

