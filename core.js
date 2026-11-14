/* =========================================================
   X-Wallet V13.5 — Core Engine (core.js)
   - Local Device Date (Fixes post-midnight Cairo timezone bug)
   - Unique Collision-Proof IDs (uid)
   - Safe JS String Escaping in Inline Handlers (escJs)
   - SHA-256 PIN Hashing + Brute-Force Rate Limiting
   - Separate IndexedDB Store for Auto-Snapshots (Fixes 8.2MB vs 3MB backup size)
   - Selective Screen Rendering on Persist (Instant Save Speed)
   ========================================================= */
const APP_VERSION = '13.13';
const APP_BUILD = '2026-11-14';
const KEY = 'raseed_mobile_v2';
const SNAP_KEY = 'raseed_auto_snapshots_v1';

const monthNamesAr = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const monthNamesEn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const dayNamesAr = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const dayNamesEn = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

/* 1. Local Device Date (Never uses UTC toISOString, fixing 12AM-3AM Cairo date shift) */
function localDateISO(dObj){
  const d = (dObj instanceof Date && !isNaN(dObj)) ? dObj : new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const today = () => localDateISO(new Date());

/* 2. Collision-Proof Unique ID Generator (Even during bulk imports or rapid taps) */
let _uidSeq = 0;
function uid(prefix){
  _uidSeq = (_uidSeq + 1) % 1000000;
  return (prefix || 'id') + '-' + Date.now() + '-' + _uidSeq.toString(36) + Math.random().toString(36).slice(2, 5);
}

/* 3. Safe HTML & Inline JS Attribute Escaping (Fixes buttons breaking when names contain ' or ") */
function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escJs(s){
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/\r?\n/g, ' ');
}

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
  try{
    if(window.crypto && window.crypto.subtle){
      const enc = new TextEncoder().encode('xwallet_pin_v1:' + clean);
      const buf = await window.crypto.subtle.digest('SHA-256', enc);
      return 'sha256:' + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
  }catch(_){}
  return fallbackHashPin(clean);
}

const DEVICE_SALT_KEY = 'xw_device_pin_salt_v1';
const PIN_FAIL_KEY = 'xw_pin_fails_perm';
const PIN_LOCK_KEY = 'xw_pin_lock_until_perm';

function getOrCreateDeviceSalt(){
  let salt = '';
  try{ salt = localStorage.getItem(DEVICE_SALT_KEY) || ''; }catch(_){}
  if(!salt){
    const bytes = new Uint8Array(16);
    if(window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for(let i=0;i<16;i++) bytes[i] = Math.floor(Math.random()*256);
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
    if(window.crypto && window.crypto.subtle){
      const enc = new TextEncoder();
      const keyMat = await window.crypto.subtle.importKey('raw', enc.encode(clean), 'PBKDF2', false, ['deriveBits']);
      const bits = await window.crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: enc.encode('xw_salt_' + salt), iterations: 120000, hash: 'SHA-256' },
        keyMat,
        256
      );
      return 'pbkdf2:' + Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
  }catch(_){}
  return fallbackHashPin(salt + ':' + clean);
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
      try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(_){}
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
      try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(_){}
    }
    recordPinAttemptResult(ok);
    return ok;
  }
  return true;
}

/* 5. Sanitized Export Payload (Strips PIN, Salt, Tokens, Secrets & Snapshots) */
function getSanitizedStateForBackup(rawState){
  const copy = JSON.parse(JSON.stringify(rawState || {}));
  delete copy.autoSnapshots;
  if(copy.prefs){
    delete copy.prefs.secPin;
    delete copy.prefs.secPinHash;
    delete copy.prefs.secPinSalt;
    delete copy.prefs.driveAccessToken;
    delete copy.prefs.driveWebhookUrl;
    delete copy.prefs.bioCredentialId;
  }
  return copy;
}


/* 6. VisualViewport Native Keyboard Guard (Prevents In-App Calculator from EVER overlapping Mobile Keyboard) */
(function initMobileKeyboardGuard(){
  function checkKeyboard(){
    const qm = document.getElementById('quickModal');
    if(!qm || !qm.classList.contains('show')) return;
    const activeEl = document.activeElement;
    const isTextFocused = activeEl && (activeEl.id === 'qmNote' || activeEl.id === 'qmDesc' || (activeEl.tagName === 'INPUT' && !activeEl.readOnly && activeEl.type !== 'date'));
    const vpHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const kbOpen = vpHeight < (window.screen.availHeight * 0.72) || isTextFocused;
    if(kbOpen){
      qm.classList.add('hide-bottom-dock');
    }
  }
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize', checkKeyboard);
  }
  document.addEventListener('focusin', (e)=>{
    const t = e.target;
    if(t && (t.id === 'qmNote' || t.id === 'qmDesc')){
      document.getElementById('quickModal')?.classList.add('hide-bottom-dock');
    }
  });
})();

/* 5.1 Continuous Multi-Row Touch + Mouse Drag-to-Reorder Engine */
function initDragReorderContainer(containerEl, itemSelector, handleSelector, onReorderDone){
  if(!containerEl) return;
  containerEl.querySelectorAll(handleSelector).forEach(handle => {
    handle.style.touchAction = 'none';

    const startDrag = (startClientY, isTouch) => {
      const dragItem = handle.closest(itemSelector);
      if(!dragItem) return;

      dragItem.classList.add('dragging-cat-row');
      dragItem.style.position = 'relative';
      dragItem.style.zIndex = '25';
      dragItem.style.transition = 'none';

      const handleMove = (curY) => {
        // Continuously swap across ALL rows the finger passes over in a single drag!
        let swapped = true;
        let guard = 0;
        while(swapped && guard < 40){
          swapped = false;
          guard++;
          const siblings = [...containerEl.querySelectorAll(':scope > ' + itemSelector)];
          const dragIdx = siblings.indexOf(dragItem);
          if(dragIdx > 0){
            const prevSib = siblings[dragIdx - 1];
            const prevRect = prevSib.getBoundingClientRect();
            if(curY < prevRect.top + prevRect.height * 0.6){
              containerEl.insertBefore(dragItem, prevSib);
              swapped = true;
              continue;
            }
          }
          if(dragIdx < siblings.length - 1){
            const nextSib = siblings[dragIdx + 1];
            const nextRect = nextSib.getBoundingClientRect();
            if(curY > nextRect.top + nextRect.height * 0.4){
              containerEl.insertBefore(dragItem, nextSib.nextSibling);
              swapped = true;
            }
          }
        }
      };

      const finishDrag = () => {
        dragItem.classList.remove('dragging-cat-row');
        dragItem.style.position = '';
        dragItem.style.zIndex = '';
        dragItem.style.transition = '';
        if(isTouch){
          document.removeEventListener('touchmove', onTouchMove);
          document.removeEventListener('touchend', onTouchEnd);
          document.removeEventListener('touchcancel', onTouchEnd);
        } else {
          document.removeEventListener('pointermove', onPtrMove);
          document.removeEventListener('pointerup', onPtrEnd);
          document.removeEventListener('pointercancel', onPtrEnd);
        }
        const orderedNames = [...containerEl.querySelectorAll(':scope > ' + itemSelector)].map(el => el.getAttribute('data-cat-name')).filter(Boolean);
        if(onReorderDone && orderedNames.length) onReorderDone(orderedNames);
      };

      const onTouchMove = (tev) => {
        if(!tev.touches || !tev.touches.length) return;
        tev.preventDefault();
        handleMove(tev.touches[0].clientY);
      };
      const onTouchEnd = () => finishDrag();

      const onPtrMove = (pev) => {
        pev.preventDefault();
        handleMove(pev.clientY);
      };
      const onPtrEnd = () => finishDrag();

      if(isTouch){
        document.addEventListener('touchmove', onTouchMove, {passive: false});
        document.addEventListener('touchend', onTouchEnd);
        document.addEventListener('touchcancel', onTouchEnd);
      } else {
        document.addEventListener('pointermove', onPtrMove);
        document.addEventListener('pointerup', onPtrEnd);
        document.addEventListener('pointercancel', onPtrEnd);
      }
    };

    handle.ontouchstart = function(tev){
      if(!tev.touches || !tev.touches.length) return;
      tev.preventDefault();
      tev.stopPropagation();
      startDrag(tev.touches[0].clientY, true);
    };
    handle.onpointerdown = function(pev){
      if(pev.pointerType === 'touch') return;
      pev.preventDefault();
      pev.stopPropagation();
      startDrag(pev.clientY, false);
    };
  });
}
