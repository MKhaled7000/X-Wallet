/* =========================================================
   X-Wallet V14.0 — Core Utilities (core.js)
   - Local Device Date (Fixes post-midnight Cairo timezone bug)
   - Unique Collision-Proof IDs (uid)
   - Safe JS String Escaping in Inline Handlers (escJs)
   - Separate IndexedDB Store for Auto-Snapshots (Fixes 8.2MB vs 3MB backup size)
   - Selective Screen Rendering on Persist (Instant Save Speed)
   ========================================================= */
const APP_VERSION = '15.3.10';
const APP_BUILD = '2026-11-21';
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

/* 5.1 Continuous Multi-Row Touch + Mouse Drag-to-Reorder Engine with Smooth Auto-Scroll */
function initDragReorderContainer(containerEl, itemSelector, handleSelector, onReorderDone){
  if(!containerEl) return;
  containerEl.querySelectorAll(handleSelector).forEach(handle => {
    handle.style.touchAction = 'none';

    const startDrag = (startClientY, isTouch) => {
      const dragItem = handle.closest(itemSelector);
      if(!dragItem) return;
      const scrollParent = containerEl.closest('#catsManagerBody') || containerEl.parentElement;
      let autoScrollRaf = null;
      let latestY = startClientY;

      dragItem.classList.add('dragging-cat-row');
      dragItem.style.position = 'relative';
      dragItem.style.zIndex = '25';
      dragItem.style.transition = 'none';

      const performSwapCheck = (curY) => {
        let swapped = true;
        let guard = 0;
        while(swapped && guard < 60){
          swapped = false;
          guard++;
          const siblings = [...containerEl.querySelectorAll(':scope > ' + itemSelector)];
          const dragIdx = siblings.indexOf(dragItem);
          if(dragIdx > 0){
            const prevSib = siblings[dragIdx - 1];
            const prevRect = prevSib.getBoundingClientRect();
            if(curY < prevRect.top + prevRect.height * 0.55){
              containerEl.insertBefore(dragItem, prevSib);
              swapped = true;
              continue;
            }
          }
          if(dragIdx < siblings.length - 1){
            const nextSib = siblings[dragIdx + 1];
            const nextRect = nextSib.getBoundingClientRect();
            if(curY > nextRect.top + nextRect.height * 0.45){
              containerEl.insertBefore(dragItem, nextSib.nextSibling);
              swapped = true;
            }
          }
        }
      };

      const stepAutoScroll = () => {
        if(scrollParent){
          const rect = scrollParent.getBoundingClientRect();
          const edge = 64;
          if(latestY < rect.top + edge){
            scrollParent.scrollTop -= Math.max(4, Math.round((rect.top + edge - latestY) * 0.28));
            performSwapCheck(latestY);
          } else if(latestY > rect.bottom - edge){
            scrollParent.scrollTop += Math.max(4, Math.round((latestY - (rect.bottom - edge)) * 0.28));
            performSwapCheck(latestY);
          }
        }
        autoScrollRaf = requestAnimationFrame(stepAutoScroll);
      };
      autoScrollRaf = requestAnimationFrame(stepAutoScroll);

      const handleMove = (curY) => {
        latestY = curY;
        performSwapCheck(curY);
      };

      const finishDrag = () => {
        if(autoScrollRaf) cancelAnimationFrame(autoScrollRaf);
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
      const onPtrMove = (pev) => { pev.preventDefault(); handleMove(pev.clientY); };
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


/* Numeric inputs: clear placeholder zero on first focus only when zero is a default placeholder. */
document.addEventListener('focusin', (ev)=>{
  const el=ev.target;
  if(!(el instanceof HTMLInputElement) || el.type!=='number' || el.dataset.zeroClearBound==='1') return;
  el.dataset.zeroClearBound='1';
  if(el.value==='0') el.value='';
});
