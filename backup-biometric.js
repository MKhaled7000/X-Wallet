/* X-Wallet V15.3.7: PRF-only, opt-in encrypted cloud-password vault.
 * No plaintext, wrapping key or PRF result is persisted. See README security limits.
 */
(function(){
  'use strict';
  const STORE='xw_backup_biometric_prf_v1';
  const CONTEXT='X-Wallet backup password PRF v1';
  let busy=false, generation=0, controller=null, choice=null, expiry=null;
  const enc=new TextEncoder(), dec=new TextDecoder('utf-8',{fatal:true});
  const random=n=>crypto.getRandomValues(new Uint8Array(n));
  const b64=b=>backupBytesToBase64(b);
  const un64=s=>backupBase64ToBytes(s,'مخزن البصمة');
  const url64=b=>b64(b).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const equal=(a,b)=>a.length===b.length && a.every((v,i)=>v===b[i]);
  function error(){return new Error('تعذر فتح كلمة المرور بأمان. استخدم كلمة مرور النسخة أو أعد تفعيل البصمة');}
  function available(){return !!(window.isSecureContext && window.PublicKeyCredential && navigator.credentials && crypto?.subtle);}
  function load(){
    const raw=localStorage.getItem(STORE);
    if(!raw)return null;
    if(raw.length>18000)throw error();
    const r=JSON.parse(raw);
    if(r.v!==1 || r.origin!==location.origin || r.rp!==location.hostname)throw error();
    for(const key of ['id','salt','iv','cipher','publicKey'])if(typeof r[key]!=='string')throw error();
    const id=un64(r.id), salt=un64(r.salt), iv=un64(r.iv), cipher=un64(r.cipher), pk=un64(r.publicKey);
    if(!id.length||id.length>1024||salt.length!==32||iv.length!==12||cipher.length<26||cipher.length>8192||pk.length>1024||!pk.length)throw error();
    return r;
  }
  function enrolled(){try{return !!load();}catch(_){return false;}}
  function refresh(){
    const enabled=enrolled();
    document.querySelectorAll('[data-backup-bio-toggle]').forEach(el=>{el.checked=enabled;el.disabled=busy;});
    document.querySelectorAll('[data-backup-bio-status]').forEach(el=>{el.textContent=enabled?'مفعلة على هذا المتصفح. احتفظ بكلمة مرور النسخة للاستعادة.':'غير مفعلة. كلمة المرور هي وسيلة الاستعادة دائماً.';});
  }
  function stop(){
    generation++;
    if(controller)controller.abort();controller=null;
    clearTimeout(expiry);expiry=null;
  }
  function hide(){
    document.getElementById('backupBioModal')?.classList.remove('show');
    const input=document.getElementById('backupBioPassword');if(input)input.value='';
  }
  function close(){stop();hide();choice=null;}
  function disable(){
    stop();hide();choice=null;
    try{localStorage.removeItem(STORE);if(localStorage.getItem(STORE)!==null)throw error();toast('تم مسح كلمة المرور المشفرة وربط البصمة من التطبيق. احذف مفتاح المرور من إعدادات الجهاز إن أردت');}
    catch(_){toast('تعذر مسح مخزن البصمة. امسح بيانات هذا الموقع من المتصفح لإزالته');}
    refresh();
  }
  function open(mode){
    close();
    const enroll=mode==='enroll';
    document.getElementById('backupBioTitle').textContent=enroll?'تفعيل فتح بالبصمة':'فتح كلمة مرور النسخة';
    document.getElementById('backupBioEnrollFields').hidden=!enroll;
    document.getElementById('backupBioAction').textContent=enroll?'تفعيل والتحقق':'فتح بالبصمة';
    document.getElementById('backupBioFallback').hidden=enroll;
    document.getElementById('backupBioModal').classList.add('show');
    expiry=setTimeout(close,120000);
  }
  function toggle(el){
    if(busy){refresh();return;}
    if(!el.checked){disable();return;}
    refresh();
    if(!available()){toast('الحماية بالبصمة غير متاحة هنا. استخدم HTTPS ومتصفحاً يدعم WebAuthn وPRF؛ ستظل كلمة المرور متاحة');return;}
    open('enroll');
  }
  function offer(onPassword,onFallback){
    if(!enrolled()){onFallback();return;}
    if(busy || choice){toast('أكمل عملية كلمة مرور النسخة الحالية أولاً');return;}
    open('unlock');choice={onPassword,onFallback};
  }
  function fallback(){const next=choice?.onFallback;close();if(next)next();}
  function aad(r){return enc.encode(JSON.stringify([CONTEXT,r.origin,r.rp,r.id,r.salt,r.publicKey]));}
  function assertCurrent(g){if(g!==generation || document.hidden)throw error();}
  function checkClient(credential,challenge,type){
    if(!credential || credential.type!=='public-key')throw error();
    const client=JSON.parse(dec.decode(credential.response.clientDataJSON));
    if(client.type!==type || client.origin!==location.origin || client.challenge!==url64(challenge) || client.crossOrigin===true)throw error();
  }
  async function checkAuthData(data){
    const bytes=new Uint8Array(data);
    const expected=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(location.hostname)));
    if(bytes.length<37 || !equal(bytes.subarray(0,32),expected) || (bytes[32]&5)!==5)throw error();
  }
  // WebAuthn ES256 signatures are ASN.1 DER; WebCrypto expects r || s.
  function es256Raw(signature){
    const s=new Uint8Array(signature);
    if(s.length<8||s[0]!==48||s[1]!==s.length-2)throw error();
    let at=2;const out=new Uint8Array(64);
    for(let n=0;n<2;n++){
      if(s[at++]!==2)throw error();
      const len=s[at++];if(!len||len>33||at+len>s.length)throw error();
      let part=s.subarray(at,at+len);at+=len;
      if(part[0]&128)throw error();
      if(part.length===33){if(part[0]!==0)throw error();part=part.subarray(1);}
      if(part.length>32)throw error();out.set(part,n*32+32-part.length);
    }
    if(at!==s.length)throw error();return out;
  }
  async function wrappingKey(r,signal){
    const challenge=random(32), id=un64(r.id);
    const credential=await navigator.credentials.get({signal,publicKey:{
      challenge,rpId:r.rp,allowCredentials:[{type:'public-key',id,transports:['internal']}],
      userVerification:'required',timeout:60000,
      extensions:{prf:{evalByCredential:{[url64(id)]:{first:un64(r.salt)}}}}
    }});
    checkClient(credential,challenge,'webauthn.get');
    if(!equal(new Uint8Array(credential.rawId),id))throw error();
    await checkAuthData(credential.response.authenticatorData);
    const publicKey=await crypto.subtle.importKey('spki',un64(r.publicKey),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
    const auth=new Uint8Array(credential.response.authenticatorData);
    const clientHash=new Uint8Array(await crypto.subtle.digest('SHA-256',credential.response.clientDataJSON));
    const signed=new Uint8Array(auth.length+32);signed.set(auth);signed.set(clientHash,auth.length);
    if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},publicKey,es256Raw(credential.response.signature),signed))throw error();
    const result=credential.getClientExtensionResults()?.prf?.results?.first;
    if(!result || result.byteLength!==32){
      const unsupported=new Error('جهازك أو متصفحك لا يدعم حماية كلمة المرور عبر PRF. لم تُحفظ كلمة المرور؛ استخدم إدخالها يدوياً');
      unsupported.code='PRF_UNSUPPORTED';throw unsupported;
    }
    const secret=new Uint8Array(result);
    try{
      const material=await crypto.subtle.importKey('raw',secret,'HKDF',false,['deriveKey']);
      return await crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:un64(r.salt),info:aad(r)},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
    }finally{secret.fill(0);}
  }
  async function enroll(password,g,signal){
    if(!available() || !await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())throw new Error('لا تتوفر وسيلة تحقق آمنة على هذا الجهاز؛ استخدم كلمة المرور');
    assertCurrent(g);
    const challenge=random(32), salt=random(32);
    const credential=await navigator.credentials.create({signal,publicKey:{
      challenge,rp:{id:location.hostname,name:'X-Wallet'},
      user:{id:random(32),name:'x-wallet-backup-'+url64(random(6)),displayName:'كلمة مرور نسخة X-Wallet'},
      pubKeyCredParams:[{type:'public-key',alg:-7}],
      authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required',residentKey:'preferred'},
      attestation:'none',timeout:60000,extensions:{prf:{}}
    }});
    checkClient(credential,challenge,'webauthn.create');
    if(credential.authenticatorAttachment!=='platform')throw error();
    if(typeof credential.response.getPublicKey!=='function'||typeof credential.response.getAuthenticatorData!=='function')throw error();
    await checkAuthData(credential.response.getAuthenticatorData());
    const publicKey=credential.response.getPublicKey();if(!publicKey)throw error();
    const r={v:1,origin:location.origin,rp:location.hostname,id:b64(credential.rawId),salt:b64(salt),publicKey:b64(publicKey),iv:b64(random(12))};
    assertCurrent(g);
    // Always prove PRF availability by assertion, including authenticators with no create-time PRF result.
    const key=await wrappingKey(r,signal);assertCurrent(g);
    const plain=enc.encode(password);password='';
    try{
      r.cipher=b64(await crypto.subtle.encrypt({name:'AES-GCM',iv:un64(r.iv),additionalData:aad(r)},key,plain));
      assertCurrent(g);localStorage.setItem(STORE,JSON.stringify(r));
      if(localStorage.getItem(STORE)!==JSON.stringify(r))throw error();
    }finally{plain.fill(0);}
    toast('تم تفعيل فتح كلمة مرور النسخة بالتحقق الآمن. قد يطلب الجهاز بصمة أو رمز قفل الشاشة');
  }
  async function unlock(g,signal){
    const r=load();if(!r || !available())throw error();
    const key=await wrappingKey(r,signal);assertCurrent(g);
    const plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(r.iv),additionalData:aad(r)},key,un64(r.cipher)));
    try{assertCurrent(g);return dec.decode(plain);}finally{plain.fill(0);}
  }
  async function action(){
    if(busy)return;
    let password='';
    const next=choice;
    const input=document.getElementById('backupBioPassword');
    if(!next){
      password=input?.value||'';if(input)input.value='';
      const probe=enc.encode(password);
      const valid=password.length>=10 && probe.length<=8000;probe.fill(0);
      if(!valid){password='';toast('أدخل كلمة مرور النسخة، من 10 أحرف وبحد أقصى 8000 بايت');return;}
    }
    busy=true;refresh();controller=new AbortController();const signal=controller.signal,g=generation;
    hide();
    try{
      if(next){
        password=await unlock(g,signal);assertCurrent(g);choice=null;
        const work=next.onPassword(password);password='';await work;
      }else{
        const work=enroll(password,g,signal);password='';await work;
      }
    }catch(err){
      if(g===generation){
        if(!next){try{localStorage.removeItem(STORE);}catch(_){}}
        toast(err?.code==='PRF_UNSUPPORTED'?err.message:'تعذر التحقق أو تم الإلغاء. استخدم كلمة مرور النسخة؛ لم يتم تجاوز الحماية');if(next){choice=null;next.onFallback();}
      }
    }finally{
      password='';busy=false;if(g===generation){controller=null;clearTimeout(expiry);expiry=null;}refresh();
    }
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)close();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
  window.addEventListener('pagehide',close);
  window.addEventListener('storage',event=>{if(event.key===STORE||event.key===null){close();refresh();}});
  function cancel(){if(choice)fallback();else close();}
  window.backupBiometric={refresh,toggle,offer,action,fallback,close,cancel};
})();
