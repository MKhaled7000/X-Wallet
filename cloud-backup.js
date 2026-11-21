/* X-Wallet cloud backups: encrypted Google Drive only. */
async function uploadCloudBackupContent(content, options={}){
  if(!isEncryptedBackupDocument(content))throw new Error('لن تُرفع نسخة غير مشفرة');
  return exportBackupToGoogleDrive(!!options.silent,{content});
}

function requestEncryptedCloudBackup(provider, manualOnly=false){
  if(!manualOnly && window.backupBiometric){
    backupBiometric.offer(async password=>{
      let content='';
      try{content=await createEncryptedBackupDocument(state,password);password='';await uploadCloudBackupContent(content,{encrypted:true,provider});}
      finally{password='';content='';}
    },()=>requestEncryptedCloudBackup(provider,true));
    return;
  }
  showAppPrompt('تشفير النسخة السحابية','كلمة مرور لا تقل عن 10 أحرف. لن تُحفظ؛ احتفظ بها للاستعادة.','',password=>{
    if(String(password).length<10){toast('كلمة المرور يجب ألا تقل عن 10 أحرف');return;}
    showAppPrompt('تأكيد كلمة مرور النسخة','أعد كتابة كلمة المرور','',async confirmation=>{
      if(password!==confirmation){toast('كلمتا المرور غير متطابقتين؛ لم يتم الرفع');return;}
      try{
        const content=await createEncryptedBackupDocument(state,password);
        await uploadCloudBackupContent(content,{encrypted:true,provider});
      }catch(err){toast(err?.message||'تعذر تجهيز النسخة المشفرة');}
      finally{password='';confirmation='';}
    },false,'password');
  },false,'password');
}
async function syncCloudNow(){
  try{await authorizeGoogleDrive();await ensureGoogleBackupFolder();requestEncryptedCloudBackup('google');}
  catch(error){toast(error.message||'تعذر تجهيز النسخ الاحتياطي');}
}

async function applyCloudBackupState(parsedDoc, source, encrypted){
  await applyImportedBackupState(parsedDoc, source, encrypted);
}

function restoreCloudBackupText(rawText, source, manualOnly=false){
  if(isEncryptedBackupDocument(rawText)){
    if(!manualOnly && window.backupBiometric){
      backupBiometric.offer(async password=>{
        try{
          const parsedDoc=await parseEncryptedBackupDocument(rawText,password);password='';
          await applyCloudBackupState(parsedDoc,source,true);
        }finally{password='';}
      },()=>restoreCloudBackupText(rawText,source,true));
      return;
    }
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
        }finally{pass='';}
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

async function restoreFromCloudSync(){await restoreGoogleDriveBackup();}
