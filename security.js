/* X-Wallet V14.0 — PIN hashing, migration and brute-force protection */
/* 4. SHA-256 PIN Hashing & Brute-Force Protection */
function fallbackHashPin(pinStr){
  const s = 'xwallet_salt_v1:' + String(pinStr || '').trim();
  let h1 = 0xdeadbeef ^ s.length, h2 = 0x41c6ce57 ^ s.length;
  for(let i = 0, ch; i < s.length; i++){
    ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 'h1:' + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

async function hashPinString(pinStr){
  const clean = String(pinStr || '').trim();
  if(!clean) return '';
  if(!window.crypto?.subtle) throw new Error('التشفير الآمن غير متاح؛ افتح التطبيق عبر HTTPS لتأكيد رمز المرور');
  const enc = new TextEncoder().encode('xwallet_pin_v1:' + clean);
  const buf = await window.crypto.subtle.digest('SHA-256', enc);
  return 'sha256:' + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const DEVICE_SALT_KEY = 'xw_device_pin_salt_v1';
const PIN_FAIL_KEY = 'xw_pin_fails_perm';
const PIN_LOCK_KEY = 'xw_pin_lock_until_perm';

function getOrCreateDeviceSalt(){
  let salt = '';
  try{ salt = localStorage.getItem(DEVICE_SALT_KEY) || ''; }catch(_){}
  if(!salt){
    const bytes = new Uint8Array(16);
    if(!window.crypto?.getRandomValues) throw new Error('مولد العشوائية الآمن غير متاح؛ افتح التطبيق عبر HTTPS');
    window.crypto.getRandomValues(bytes);
    salt = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    try{ localStorage.setItem(DEVICE_SALT_KEY, salt); }catch(_){}
  }
  return salt;
}

async function hashPinPBKDF2(pinStr, saltHex){
  const clean = String(pinStr || '').trim();
  if(!clean) return '';
  const salt = saltHex || getOrCreateDeviceSalt();
  try{
    if(!window.crypto?.subtle) throw new Error('التشفير الآمن غير متاح؛ افتح التطبيق عبر HTTPS');
    const enc = new TextEncoder();
    const keyMat = await window.crypto.subtle.importKey('raw', enc.encode(clean), 'PBKDF2', false, ['deriveBits']);
    const bits = await window.crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: enc.encode('xw_salt_' + salt), iterations: 120000, hash: 'SHA-256' },
      keyMat,
      256
    );
    return 'pbkdf2:' + Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
  }catch(err){
    if(err instanceof Error && err.message.includes('التشفير الآمن')) throw err;
    throw new Error('تعذر إنشاء بصمة آمنة لرمز المرور');
  }
}

let _pinFailCount = Number(localStorage.getItem(PIN_FAIL_KEY) || 0);
let _pinLockUntil = Number(localStorage.getItem(PIN_LOCK_KEY) || 0);

function checkPinRateLimit(){
  const now = Date.now();
  _pinLockUntil = Number(localStorage.getItem(PIN_LOCK_KEY) || _pinLockUntil || 0);
  if(_pinLockUntil > now){
    const sec = Math.ceil((_pinLockUntil - now) / 1000);
    toast(`تم قفل المحاولات مؤقتاً للأمان. حاول بعد ${sec} ثانية ⏳`);
    return false;
  }
  return true;
}

function recordPinAttemptResult(success){
  if(success){
    _pinFailCount = 0;
    _pinLockUntil = 0;
    try{
      localStorage.removeItem(PIN_FAIL_KEY);
      localStorage.removeItem(PIN_LOCK_KEY);
    }catch(_){}
  } else {
    _pinFailCount = Number(localStorage.getItem(PIN_FAIL_KEY) || _pinFailCount || 0) + 1;
    try{ localStorage.setItem(PIN_FAIL_KEY, String(_pinFailCount)); }catch(_){}
    if(_pinFailCount >= 3){
      const lockSec = Math.min(300, 30 * Math.pow(2, _pinFailCount - 3));
      _pinLockUntil = Date.now() + (lockSec * 1000);
      try{ localStorage.setItem(PIN_LOCK_KEY, String(_pinLockUntil)); }catch(_){}
      toast(`محاولات خاطئة متكررة! تم القفل لمدة ${lockSec} ثانية 🔒`);
    } else {
      toast(`رمز المرور غير صحيح (محاولة ${_pinFailCount} من 3)`);
    }
  }
}

async function verifyEnteredPin(enteredPin, prefsObj){
  if(!checkPinRateLimit()) return false;
  const clean = String(enteredPin || '').trim();
  if(!clean){
    recordPinAttemptResult(false);
    return false;
  }
  const p = prefsObj || {};
  if(p.secPinHash){
    if(p.secPinHash.startsWith('pbkdf2:')){
      const salt = p.secPinSalt || getOrCreateDeviceSalt();
      const computed = await hashPinPBKDF2(clean, salt);
      const ok = (computed === p.secPinHash);
      recordPinAttemptResult(ok);
      return ok;
    }
    // Legacy SHA-256 or h1 hash: verify and auto-migrate to PBKDF2 + per-device salt!
    const computedLegacy = p.secPinHash.startsWith('sha256:') ? await hashPinString(clean) : fallbackHashPin(clean);
    const ok = (computedLegacy === p.secPinHash);
    if(ok){
      const newSalt = getOrCreateDeviceSalt();
      p.secPinSalt = newSalt;
      p.secPinHash = await hashPinPBKDF2(clean, newSalt);
      try{ await persistStorageOnly(); }catch(err){console.error('X-Wallet PIN state save failed:',err);}
    }
    recordPinAttemptResult(ok);
    return ok;
  }
  if(p.secPin){
    const ok = (clean === String(p.secPin).trim());
    if(ok){
      const newSalt = getOrCreateDeviceSalt();
      p.secPinSalt = newSalt;
      p.secPinHash = await hashPinPBKDF2(clean, newSalt);
      delete p.secPin;
      try{ await persistStorageOnly(); }catch(err){console.error('X-Wallet PIN state save failed:',err);}
    }
    recordPinAttemptResult(ok);
    return ok;
  }
  return true;
}

async function migrateLegacyPlainPin(){
  const p = state?.prefs;
  if(!p?.secPin || p.secPinHash) return false;
  if(!window.crypto?.subtle) return false;
  const oldPin=p.secPin;
  const salt = getOrCreateDeviceSalt();
  p.secPinSalt = salt;
  p.secPinHash = await hashPinPBKDF2(oldPin, salt);
  delete p.secPin;
  try{ await persistStorageOnly(); }catch(err){
    p.secPin=oldPin; delete p.secPinHash; delete p.secPinSalt;
    throw new Error('تعذر حفظ ترحيل رمز المرور؛ أعد المحاولة بعد توفير مساحة تخزين');
  }
  return true;
}
