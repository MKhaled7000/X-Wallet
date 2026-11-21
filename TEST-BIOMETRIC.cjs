/* Isolated tests only: no browser, live authenticator, wallet data or network. */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {webcrypto,generateKeyPairSync,createHash,sign}=require('node:crypto');
const STORE='xw_backup_biometric_prf_v1',PASSWORD='temporary-test-password-123';
const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const spki=pair.publicKey.export({type:'spki',format:'der'});
const rawId=Buffer.from('synthetic-platform-credential');
const prf=Buffer.alloc(32,77);
const source=fs.readFileSync(__dirname+'/backup-biometric.js','utf8');
let count=0;
function fixture(){
  const elements=new Map(),storage=new Map(),events={},toasts=[];
  const el=id=>{if(!elements.has(id))elements.set(id,{id,value:'',hidden:false,checked:false,disabled:false,textContent:'',classList:{add(){},remove(){}}});return elements.get(id);};
  let mode='ok',calls=0,creates=0,gets=0,writeFail=false,delFail=false;
  const array=b=>Uint8Array.from(b).buffer;
  const client=(type,challenge)=>array(Buffer.from(JSON.stringify({type,origin:'https://wallet.example',challenge:Buffer.from(challenge).toString('base64url'),crossOrigin:false})));
  function auth(){const b=Buffer.alloc(37);createHash('sha256').update('wallet.example').digest().copy(b);b[32]=mode==='no-uv'?1:5;return array(b);}
  const navigator={credentials:{
    create:async({publicKey,signal})=>{
      calls++;creates++;if(signal.aborted)throw Error('cancel');
      return {type:'public-key',rawId:array(rawId),authenticatorAttachment:'platform',response:{
        clientDataJSON:client('webauthn.create',publicKey.challenge),getPublicKey:()=>array(spki),getAuthenticatorData:auth
      },getClientExtensionResults:()=>({prf:{enabled:mode!=='no-prf'}})};
    },
    get:async({publicKey,signal})=>{
      calls++;gets++;
      if(mode==='cancel'||signal.aborted)throw Error('cancel');
      if(mode==='delayed'){await new Promise(resolve=>setTimeout(resolve,25));}
      let data=client('webauthn.get',mode==='wrong-challenge'?Buffer.alloc(32,9):publicKey.challenge);
      const ad=auth();let signature=sign('sha256',Buffer.concat([Buffer.from(ad),createHash('sha256').update(Buffer.from(data)).digest()]),pair.privateKey);
      if(mode==='bad-signature')signature[signature.length-1]^=1;
      return {type:'public-key',rawId:array(mode==='wrong-id'?Buffer.from('wrong'):rawId),response:{clientDataJSON:data,authenticatorData:ad,signature:array(signature)},getClientExtensionResults:()=>mode==='no-prf'?{prf:{}}:{prf:{results:{first:array(mode==='wrong-prf'?Buffer.alloc(32,88):prf)}}}};
    }
  }};
  const document={hidden:false,getElementById:el,querySelectorAll:selector=>selector==='[data-backup-bio-toggle]'?[el('toggle')]:selector==='[data-backup-bio-status]'?[el('status')]:[],addEventListener:(k,v)=>events[k]=v};
  const ctx={crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,AbortController,URL,console,
    setTimeout,clearTimeout,document,navigator,location:{origin:'https://wallet.example',hostname:'wallet.example'},
    isSecureContext:true,PublicKeyCredential:{isUserVerifyingPlatformAuthenticatorAvailable:async()=>true},
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>{if(writeFail)throw Error('quota');storage.set(k,v);},removeItem:k=>{if(delFail)throw Error('denied');storage.delete(k);}},
    btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),
    toast:s=>toasts.push(s),addEventListener:(k,v)=>events[k]=v};
  ctx.window=ctx;vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(__dirname+'/backup.js','utf8'),ctx);vm.runInContext(source,ctx);
  const api=ctx.backupBiometric;
  async function enroll(){api.toggle({checked:true});el('backupBioPassword').value=PASSWORD;await api.action();}
  async function unlock(){let used=null,fall=0;api.offer(async p=>{used=p;},()=>fall++);await api.action();return {used,fall};}
  return {ctx,api,el,events,storage,toasts,enroll,unlock,setMode:v=>mode=v,setWriteFail:v=>writeFail=v,setDelFail:v=>delFail=v,stats:()=>({calls,creates,gets})};
}
async function test(name,fn){await fn();count++;console.log('PASS '+name);}
(async()=>{
 await test('off by default: no WebAuthn and direct manual fallback',async()=>{const f=fixture();let manual=0;f.api.refresh();f.api.offer(()=>assert.fail(),()=>manual++);assert.equal(manual,1);assert.equal(f.stats().calls,0);assert.equal(f.el('toggle').checked,false);f.api.close();});
 await test('enrollment stores ciphertext only and fresh assertion opens exact password',async()=>{
   const f=fixture();await f.enroll();assert(f.storage.has(STORE));assert(!f.storage.get(STORE).includes(PASSWORD));assert.equal(f.el('backupBioPassword').value,'');assert.equal(f.el('toggle').checked,true);
   assert.deepEqual(await f.unlock(),{used:PASSWORD,fall:0});assert.deepEqual(await f.unlock(),{used:PASSWORD,fall:0});assert.deepEqual(f.stats(),{calls:4,creates:1,gets:3});assert(!f.toasts.join(' ').includes(PASSWORD));f.api.close();
 });
 for(const mode of ['cancel','no-prf','no-uv','bad-signature','wrong-challenge','wrong-id','wrong-prf']){
   await test('fail closed and manual fallback: '+mode,async()=>{const f=fixture();await f.enroll();f.setMode(mode);assert.deepEqual(await f.unlock(),{used:null,fall:1});f.api.close();});
 }
 await test('PRF unsupported: no persisted enrollment or weak fallback',async()=>{const f=fixture();f.setMode('no-prf');await f.enroll();assert.equal(f.storage.has(STORE),false);assert.equal(f.el('toggle').checked,false);f.api.close();});
 await test('no secure context: enrollment remains off',async()=>{const f=fixture();f.ctx.isSecureContext=false;f.api.toggle({checked:true});assert.equal(f.stats().calls,0);assert.equal(f.el('toggle').checked,false);f.api.close();});
 await test('storage write failure does not show an enabled vault',async()=>{const f=fixture();f.setWriteFail(true);await f.enroll();assert(!f.storage.has(STORE));assert.equal(f.el('toggle').checked,false);f.api.close();});
 await test('disable removes whole record and manual flow resumes',async()=>{const f=fixture();await f.enroll();f.api.toggle({checked:false});assert(!f.storage.has(STORE));let manual=0;f.api.offer(()=>assert.fail(),()=>manual++);assert.equal(manual,1);assert.equal(f.el('toggle').checked,false);f.api.close();});
 await test('deletion failure is reported and toggle reflects actual storage',async()=>{const f=fixture();await f.enroll();f.setDelFail(true);f.api.toggle({checked:false});assert(f.storage.has(STORE));assert.equal(f.el('toggle').checked,true);assert(f.toasts.some(s=>s.includes('تعذر مسح')));f.api.close();});
 for(const field of ['cipher','iv','salt','publicKey','origin','rp','id']){
   await test('tamper rejected: '+field,async()=>{const f=fixture();await f.enroll();const r=JSON.parse(f.storage.get(STORE));if(['origin','rp'].includes(field))r[field]='https://other.example';else{let b=Buffer.from(r[field],'base64');b[0]^=1;r[field]=b.toString('base64');}f.storage.set(STORE,JSON.stringify(r));const result=await f.unlock();assert.equal(result.used,null);assert.equal(result.fall,1);f.api.close();});
 }
 await test('background cancellation rejects delayed unlock',async()=>{const f=fixture();await f.enroll();f.setMode('delayed');let used=false;f.api.offer(()=>{used=true;},()=>{});const pending=f.api.action();f.ctx.document.hidden=true;f.events.visibilitychange();await pending;assert.equal(used,false);f.api.close();});
 await test('other-tab removal rejects delayed unlock',async()=>{const f=fixture();await f.enroll();f.setMode('delayed');let used=false;f.api.offer(()=>{used=true;},()=>{});const pending=f.api.action();f.storage.delete(STORE);f.events.storage({key:STORE});await pending;assert.equal(used,false);f.api.close();});
 await test('cancel choice opens manual prompt, clears password field',async()=>{const f=fixture();await f.enroll();let manual=0;f.api.offer(()=>assert.fail(),()=>manual++);f.el('backupBioPassword').value=PASSWORD;f.api.cancel();assert.equal(manual,1);assert.equal(f.el('backupBioPassword').value,'');f.api.close();});
 await test('short enrollment password causes no credential creation',async()=>{const f=fixture();f.api.toggle({checked:true});f.el('backupBioPassword').value='short';await f.api.action();assert.equal(f.stats().creates,0);assert(!f.storage.has(STORE));f.api.close();});
 // Exercise the cloud entry points with mocked crypto/upload callbacks, no network.
 await test('persisted record reopens after reload, never reuses an unlocked session',async()=>{const first=fixture();await first.enroll();const second=fixture();second.storage.set(STORE,first.storage.get(STORE));second.api.refresh();assert.equal(second.el('toggle').checked,true);assert.deepEqual(second.stats(),{calls:0,creates:0,gets:0});assert.deepEqual(await second.unlock(),{used:PASSWORD,fall:0});assert.deepEqual(second.stats(),{calls:1,creates:0,gets:1});first.api.close();second.api.close();});
 await test('no platform authenticator: no stored enrollment',async()=>{const f=fixture();f.ctx.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable=async()=>false;await f.enroll();assert.equal(f.stats().creates,0);assert.equal(f.storage.has(STORE),false);f.api.close();});
 await test('malformed local record falls back without WebAuthn',async()=>{const f=fixture();f.storage.set(STORE,'not-json');let manual=0;f.api.offer(()=>assert.fail(),()=>manual++);assert.equal(manual,1);assert.equal(f.stats().calls,0);f.api.close();});
 await test('cloud upload and restore route to biometric choice; manual mode stays intact',async()=>{
   const f=fixture();let offers=0,uploaded=0,restored=0,prompts=0;
   f.ctx.state={prefs:{},transactions:[]};f.ctx.showAppPrompt=()=>prompts++;
   f.ctx.backupBiometric={offer:(onPass)=>{offers++;f.ctx.pendingBio=()=>onPass(PASSWORD);}};
   vm.runInContext(fs.readFileSync(__dirname+'/cloud-backup.js','utf8'),f.ctx);
   f.ctx.createEncryptedBackupDocument=async(_state,pass)=>{assert.equal(pass,PASSWORD);return 'encrypted';};
   f.ctx.uploadCloudBackupContent=async content=>{assert.equal(content,'encrypted');uploaded++;};
   f.ctx.parseEncryptedBackupDocument=async(_raw,pass)=>{assert.equal(pass,PASSWORD);return {state:{transactions:[]}};};
   f.ctx.applyCloudBackupState=async()=>restored++;
   f.ctx.requestEncryptedCloudBackup('google');assert.equal(offers,1);await f.ctx.pendingBio();assert.equal(uploaded,1);
   f.ctx.restoreCloudBackupText('{"format":"x-wallet-encrypted-backup"}','Google Drive');assert.equal(offers,2);await f.ctx.pendingBio();assert.equal(restored,1);
   f.ctx.requestEncryptedCloudBackup('google',true);assert.equal(prompts,1);assert.equal(offers,2);
   f.ctx.restoreCloudBackupText('{"format":"x-wallet-encrypted-backup"}','Google Drive',true);assert.equal(prompts,2);f.api.close();
 });
 console.log('PASS all '+count+' isolated checks. Real-device/PWA/Google tests still required.');
})().catch(error=>{console.error(error);process.exitCode=1;});
