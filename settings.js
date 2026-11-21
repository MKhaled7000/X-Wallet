
let catsToolbarMode = '';
function toggleCatsToolbarMode(mode){
  catsToolbarMode = (catsToolbarMode === mode) ? '' : mode;
  const wrap = document.getElementById('settingsCatsTreeContainer');
  if(wrap){
    wrap.classList.toggle('cats-mode-reorder', catsToolbarMode === 'reorder');
    wrap.classList.toggle('cats-mode-delete', catsToolbarMode === 'delete');
  }
  document.getElementById('ctBtnReorder')?.classList.toggle('active', catsToolbarMode === 'reorder');
  document.getElementById('ctBtnDelete')?.classList.toggle('active', catsToolbarMode === 'delete');
}
function deleteMainCategoryInSettings(mc){
  showAppConfirm('حذف القسم الرئيسي', `هل تريد حذف قسم «${mc}» وجميع أقسامه الفرعية؟`, ()=>{
    syncCategoryTrees();
    const isInc = (settingsCatMode === 'income');
    const tree = isInc ? state.categoryTree.income : state.categoryTree.expense;
    delete tree[mc];
    if(isInc) state.incomeCategories = (state.incomeCategories||[]).filter(x=>x!==mc);
    else state.categories = (state.categories||[]).filter(x=>x!==mc);
    persist();
    renderSettingsCategories();
    toast('تم حذف القسم ✓');
  }, true);
}
function deleteSubCategoryInSettings(mc, sc){
  showAppConfirm('حذف القسم الفرعي', `هل تريد حذف «${sc}» من قسم «${mc}»؟`, ()=>{
    syncCategoryTrees();
    const isInc = (settingsCatMode === 'income');
    const tree = isInc ? state.categoryTree.income : state.categoryTree.expense;
    if(tree[mc]) tree[mc] = tree[mc].filter(x=>x!==sc);
    persist();
    renderSettingsCategories();
    toast('تم حذف القسم الفرعي ✓');
  }, true);
}

/* X-Wallet V14.0 module: settings.js | Extracted from V13.40 app.js */

/* ---- Original app.js lines 431-835 ---- */
const THEMES = {
  mint:    {mint:'#43d6b2', mint2:'#1a9c94', h1:'#1b8f83', h2:'#145e68', h3:'#174b63'},
  blue:    {mint:'#569aff', mint2:'#2d68c4', h1:'#2563eb', h2:'#1e40af', h3:'#1e3a8a'},
  gold:    {mint:'#f5b041', mint2:'#b9770e', h1:'#b7791f', h2:'#744210', h3:'#5f370e'},
  purple:  {mint:'#a582ff', mint2:'#6b46c1', h1:'#6b46c1', h2:'#44337a', h3:'#322659'},
  rose:    {mint:'#fb7185', mint2:'#be123c', h1:'#e11d48', h2:'#9f1239', h3:'#881337'},
  cyan:    {mint:'#22d3ee', mint2:'#0891b2', h1:'#06b6d4', h2:'#0e7490', h3:'#155e75'},
  orange:  {mint:'#fb923c', mint2:'#c2410c', h1:'#ea580c', h2:'#9a3412', h3:'#7c2d12'},
  lime:    {mint:'#a3e635', mint2:'#4d7c0f', h1:'#65a30d', h2:'#3f6212', h3:'#365314'},
  indigo:  {mint:'#6366f1', mint2:'#4338ca', h1:'#4f46e5', h2:'#3730a3', h3:'#312e81'},
  emerald: {mint:'#10b981', mint2:'#047857', h1:'#059669', h2:'#065f46', h3:'#064e3b'},
  teal:    {mint:'#14b8a6', mint2:'#0f766e', h1:'#0d9488', h2:'#115e59', h3:'#134e4a'},
  sky:     {mint:'#38bdf8', mint2:'#0284c7', h1:'#0ea5e9', h2:'#0369a1', h3:'#0c4a6e'},
  amber:   {mint:'#fbbf24', mint2:'#b45309', h1:'#d97706', h2:'#92400e', h3:'#78350f'},
  coral:   {mint:'#ff7a59', mint2:'#c2410c', h1:'#ea580c', h2:'#9a3412', h3:'#7c2d12'},
  crimson: {mint:'#f43f5e', mint2:'#be123c', h1:'#e11d48', h2:'#9f1239', h3:'#881337'},
  fuchsia: {mint:'#e879f9', mint2:'#a21caf', h1:'#c026d3', h2:'#86198f', h3:'#701a75'},
  violet:  {mint:'#8b5cf6', mint2:'#6d28d9', h1:'#7c3aed', h2:'#5b21b6', h3:'#4c1d95'},
  slate:   {mint:'#94a3b8', mint2:'#475569', h1:'#64748b', h2:'#334155', h3:'#1e293b'},
  olive:   {mint:'#84cc16', mint2:'#4d7c0f', h1:'#65a30d', h2:'#3f6212', h3:'#365314'},
  bronze:  {mint:'#d97706', mint2:'#92400e', h1:'#b45309', h2:'#78350f', h3:'#451a03'}
};

let _pendingTheme = null;
let _pendingBgMode = null;

let _pendingFontFamily = null;
const FONT_STACKS = {
  'system': "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, 'Tahoma', sans-serif",
  'Arial': "Arial, 'Noto Sans Arabic', sans-serif",
  'Calibri': "Calibri, 'Segoe UI', 'Noto Sans Arabic', sans-serif",
  'Tahoma': "Tahoma, 'Noto Sans Arabic', sans-serif",
  'Segoe UI': "'Segoe UI', Tahoma, 'Noto Sans Arabic', sans-serif",
  'Verdana': "Verdana, Tahoma, 'Noto Sans Arabic', sans-serif",
  'Times New Roman': "'Times New Roman', 'Amiri', serif",
  'Georgia': "Georgia, 'Amiri', serif",
  'Noto Sans Arabic': "'Noto Sans Arabic', system-ui, sans-serif",
  'IBM Plex Sans Arabic': "'IBM Plex Sans Arabic', 'Noto Sans Arabic', sans-serif",
  'Cairo': "'Cairo', 'Noto Sans Arabic', sans-serif",
  'Tajawal': "'Tajawal', 'Noto Sans Arabic', sans-serif",
  'Almarai': "'Almarai', 'Noto Sans Arabic', sans-serif",
  'Readex Pro': "'Readex Pro', 'Noto Sans Arabic', sans-serif",
  'Alexandria': "'Alexandria', 'Noto Sans Arabic', sans-serif",
  'Rubik': "'Rubik', 'Noto Sans Arabic', sans-serif",
  'Vazirmatn': "'Vazirmatn', 'Noto Sans Arabic', sans-serif",
  'Changa': "'Changa', 'Noto Sans Arabic', sans-serif",
  'Mada': "'Mada', 'Noto Sans Arabic', sans-serif",
  'El Messiri': "'El Messiri', 'Noto Sans Arabic', sans-serif",
  'Amiri': "'Amiri', 'Noto Sans Arabic', serif",
  'Roboto': "'Roboto', 'Noto Sans Arabic', sans-serif",
  'Inter': "'Inter', 'Noto Sans Arabic', sans-serif",
  'Poppins': "'Poppins', 'Noto Sans Arabic', sans-serif"
};
function previewFontFamily(fontKey){
  _pendingFontFamily = fontKey || 'system';
  requestAnimationFrame(()=>{
    document.documentElement.style.setProperty('--app-font', FONT_STACKS[_pendingFontFamily] || FONT_STACKS.system);
  });
}
function previewBgMode(mode){
  _pendingBgMode = mode;
  document.documentElement.setAttribute('data-bg', mode || 'dark');
}
let _pendingFieldStyle = null;
function previewFieldStyle(st){
  _pendingFieldStyle = st || 'frameless';
  document.documentElement.setAttribute('data-field-style', _pendingFieldStyle);
}
let _pendingHeaderStyle = null;
function previewHeaderStyle(st){
  _pendingHeaderStyle = st || 'framed';
  document.documentElement.setAttribute('data-header-style', _pendingHeaderStyle);
}
let _pendingItemStyle = null;
function previewItemStyle(st){
  _pendingItemStyle = st || 'framed';
  document.documentElement.setAttribute('data-item-style', _pendingItemStyle);
}
let _pendingRecordStyle = null;
function previewRecordStyle(st){
  _pendingRecordStyle = st || 'framed';
  document.documentElement.setAttribute('data-record-style', _pendingRecordStyle);
}
function selectTempTheme(thName){
  _pendingTheme = thName;
  document.querySelectorAll('.theme-dot').forEach(btn=>btn.classList.toggle('active', btn.dataset.theme===thName));
  const th = THEMES[thName] || THEMES.mint;
  document.documentElement.style.setProperty('--mint', th.mint);
  document.documentElement.style.setProperty('--mint2', th.mint2);
  document.documentElement.style.setProperty('--hero1', th.h1);
  document.documentElement.style.setProperty('--hero2', th.h2);
  document.documentElement.style.setProperty('--hero3', th.h3);
}
function applyPreferences(){
  const p = state.prefs || {};
  document.documentElement.style.setProperty('--scale', p.fontSize || '1');
  const fKey = p.fontFamily || 'system';
  document.documentElement.style.setProperty('--app-font', FONT_STACKS[fKey] || FONT_STACKS.system);
  setv('prefFontFamily', fKey);
  const bg = p.bgMode || 'dark';
  document.documentElement.setAttribute('data-bg', bg);
  setv('prefBgMode', bg);
  const bgG = p.bgGradient || 'gradient';
  document.documentElement.setAttribute('data-bg-gradient', bgG);
  setv('prefBgGradient', bgG);
  const bgP = p.bgPattern || 'plain';
  document.documentElement.setAttribute('data-bg-pattern', bgP);
  setv('prefBgPattern', bgP);
  const gf = (p.groupFrames !== false);
  document.documentElement.setAttribute('data-group-frames', gf ? 'on' : 'off');
  const gfCb = document.getElementById('prefGroupFrames');
  if(gfCb) gfCb.checked = gf;
  const fs = p.fieldStyle || 'frameless';
  document.documentElement.setAttribute('data-field-style', fs);
  setv('prefFieldStyle', fs);
  const hs = p.headerStyle || 'framed';
  document.documentElement.setAttribute('data-header-style', hs);
  setv('prefHeaderStyle', hs);
  const isty = p.itemStyle || 'framed';
  document.documentElement.setAttribute('data-item-style', isty);
  setv('prefItemStyle', isty);
  const rsty = p.recordStyle || 'framed';
  document.documentElement.setAttribute('data-record-style', rsty);
  setv('prefRecordStyle', rsty);
  if(typeof applyPageVisibilityPrefs === 'function') applyPageVisibilityPrefs();

  const th = THEMES[p.theme] || THEMES.mint;
  document.documentElement.style.setProperty('--mint', th.mint);
  document.documentElement.style.setProperty('--mint2', th.mint2);
  document.documentElement.style.setProperty('--hero1', th.h1);
  document.documentElement.style.setProperty('--hero2', th.h2);
  document.documentElement.style.setProperty('--hero3', th.h3);
  document.querySelectorAll('.theme-dot').forEach(btn=>btn.classList.toggle('active', btn.dataset.theme===(p.theme||'mint')));

  const lang = p.lang || 'ar';
  setv('prefLang', lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = 'ltr';
  if(typeof applyFullAppLanguage === 'function') applyFullAppLanguage(lang);
  setv('prefFontSize', p.fontSize || '1');
  setv('prefAutoDriveFreq', p.autoDriveFreq || 'off');
  if(typeof updateLocalAutoFreqBtnText === 'function') updateLocalAutoFreqBtnText();
  setv('secPinInput', (p.secPinHash || p.secPin) ? '••••' : '');
  setv('secAppLockOnStart', p.appLockOnStart === false ? '0' : '1');
  setv('secBioOnPrivacy', p.bioOnPrivacy === false ? '0' : '1');

  if(window.backupBiometric) backupBiometric.refresh();
  const bioBadge = document.getElementById('bioStatusBadge');
  if(bioBadge){
    bioBadge.textContent = p.bioEnabled ? 'البصمة مفعلة ✓' : 'أضف بصمة';
    bioBadge.style.color = p.bioEnabled ? 'var(--mint)' : 'var(--text)';
  }

  document.querySelectorAll('.dec-toggle-btn').forEach(b=>{
    b.classList.toggle('active', !!p.homeDecimals);
    if(b.classList.contains('mm-tool-btn')) b.textContent = '.00';
    else b.textContent = lang === 'en' ? '.00 Decimals' : '.00 الكسور';
  });
  document.querySelectorAll('.privacy-toggle-btn').forEach(b=>{
    b.classList.toggle('active', !!p.privacy);
    if(b.classList.contains('mm-tool-btn')) b.textContent = p.privacy ? '🙈' : '👁';
    else b.textContent = p.privacy ? (lang === 'en' ? '🙈 Hidden' : '🙈 مخفي') : (lang === 'en' ? '👁 Privacy' : '👁 الإخفاء');
  });
  applyLanguageTranslations(lang);

  (state.accounts||[]).forEach(a=>{ if(a && typeof a.name==='string' && /\s*\(Money Manager(?:\s*\d+)?\)/i.test(a.name)){ a.name = a.name.replace(/\s*\(Money Manager(?:\s*\d+)?\)/gi,'').trim(); } });
  const defAccSel = document.getElementById('prefDefaultAcc');
  if(defAccSel){
    defAccSel.innerHTML = `<option value="">${lang==='en'?'None':'بدون'}</option>` + state.accounts.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('');
    defAccSel.value = p.defaultAccount || '';
  }
  const defaultCurrencySelect=document.getElementById('prefDefaultCurrency');
  if(defaultCurrencySelect){
    const builtins=[{code:'EGP',name:'جنيه مصري'},{code:'USD',name:'دولار أمريكي'},{code:'CNY',name:'يوان صيني'}];
    const known=new Map(builtins.map(c=>[c.code,c]));
    (state.currencies||[]).forEach(c=>known.set(c.code,c));
    defaultCurrencySelect.innerHTML=[...known.values()].map(c=>`<option value="${esc(c.code)}">${esc(c.code)} · ${esc(c.name||c.code)}</option>`).join('');
    defaultCurrencySelect.value=p.defaultCurrency||'EGP';
  }
  setv('prefMonthStartDay', String(p.monthStartDay || 1));
  setv('prefSwipeMode', p.swipeMode || 'tabs');
  const privSw = document.getElementById('prefPrivacySwitch');
  if(privSw) privSw.checked = !!p.privacy;
  const decSw = document.getElementById('prefDecimalsSwitch');
  if(decSw) decSw.checked = !!p.homeDecimals;
  const secAppChk = document.getElementById('secAppLockOnStartChk');
  if(secAppChk) secAppChk.checked = (p.appLockOnStart !== false);
  const secBioChk = document.getElementById('secBioOnPrivacyChk');
  if(secBioChk) secBioChk.checked = (p.bioOnPrivacy !== false);
  const tNames = {mint:'أخضر',blue:'أزرق',gold:'ذهبي',purple:'بنفسجي',rose:'وردي',cyan:'سماوي',orange:'برتقالي',lime:'ليموني',indigo:'نيلي',emerald:'زمردي',teal:'تركواز',sky:'سماوي فاتح',amber:'كهرماني',coral:'مرجاني',crimson:'قرمزي',fuchsia:'فوشيا',violet:'أرجواني',slate:'رمادي أزرق',olive:'زيتوني',bronze:'برونزي'};
  const tLbl = document.getElementById('themePreviewName');
  if(tLbl) tLbl.textContent = tNames[p.theme || 'mint'] || 'اختيار اللون';
  document.querySelectorAll('#themeSelector .theme-dot-card').forEach(b=>{
    b.classList.toggle('active', b.dataset.theme === (p.theme || 'mint'));
  });
  const abTog = document.getElementById('prefAutoBackupToggle');
  const abSel = document.getElementById('prefAutoDriveFreq');
  const abOn = (p.autoDriveFreq && p.autoDriveFreq !== 'off');
  if(abTog) abTog.checked = abOn;
  if(abSel){
    abSel.disabled = !abOn;
    if(abOn) abSel.value = p.autoDriveFreq;
  }
}
function saveGeneralSettings(){
  const requestedDefaultCurrency=document.getElementById('prefDefaultCurrency')?.value||'EGP';
  try{getCurrencyRateToBase(requestedDefaultCurrency,today());}catch(err){toast(err.message);return false;}
  state.prefs = state.prefs || {};
  state.prefs.lang = document.getElementById('prefLang')?.value || 'ar';
  state.prefs.fontFamily = _pendingFontFamily || document.getElementById('prefFontFamily')?.value || 'system';
  state.prefs.fontSize = document.getElementById('prefFontSize')?.value || '1';
  state.prefs.defaultAccount = document.getElementById('prefDefaultAcc')?.value || '';
  state.prefs.defaultCurrency = requestedDefaultCurrency;
  state.prefs.monthStartDay = Number(document.getElementById('prefMonthStartDay')?.value || 1);
  state.prefs.swipeMode = document.getElementById('prefSwipeMode')?.value || 'tabs';
  state.prefs.bgMode = _pendingBgMode || document.getElementById('prefBgMode')?.value || 'dark';
  state.prefs.fieldStyle = _pendingFieldStyle || document.getElementById('prefFieldStyle')?.value || 'frameless';
  state.prefs.headerStyle = _pendingHeaderStyle || document.getElementById('prefHeaderStyle')?.value || 'framed';
  state.prefs.itemStyle = _pendingItemStyle || document.getElementById('prefItemStyle')?.value || 'framed';
  state.prefs.recordStyle = _pendingRecordStyle || document.getElementById('prefRecordStyle')?.value || 'framed';
  if(_pendingTheme) state.prefs.theme = _pendingTheme;
  _pendingTheme = null;
  _pendingBgMode = null;
  _pendingFontFamily = null;
  _pendingFieldStyle = null;
  _pendingHeaderStyle = null;
  _pendingItemStyle = null;
  _pendingRecordStyle = null;
  applyPreferences();
  syncCustomSelectTriggers();
  persist();
  toast('تم حفظ الإعدادات ✓');
}
function toggleDecimalsMode(){
  state.prefs.homeDecimals = !state.prefs?.homeDecimals;
  applyPreferences();
  persist();
}

/* =========================================================
   8.4 APP LOCK ON STARTUP WITH BIOMETRICS & PIN + PRIVACY LOCK
   ========================================================= */
let _appUnlockedThisSession = false;

async function saveSecuritySettings(){
  state.prefs = state.prefs || {};
  const rawPin = val('secPinInput').trim();
  try{
    if(rawPin && rawPin !== '••••'){
      const devSalt = getOrCreateDeviceSalt();
      const secureHash = await hashPinPBKDF2(rawPin, devSalt);
      state.prefs.secPinSalt = devSalt;
      state.prefs.secPinHash = secureHash;
    } else if(!rawPin){
      state.prefs.secPinHash = '';
      state.prefs.secPinSalt = '';
    }
    delete state.prefs.secPin;
    const cApp = document.getElementById('secAppLockOnStartChk');
    const cBio = document.getElementById('secBioOnPrivacyChk');
    state.prefs.appLockOnStart = cApp ? !!cApp.checked : true;
    state.prefs.bioOnPrivacy = cBio ? !!cBio.checked : true;
    applyPreferences();
    persist();
    toast('تم حفظ إعدادات الخصوصية والأمان 🔒✓');
  }catch(err){
    toast(err?.message || 'تعذر حفظ رمز المرور بأمان؛ لم يتم استخدام تشفير ضعيف');
  }
}

async function registerBiometricLock(){
  try{
    if(!window.PublicKeyCredential || !navigator.credentials){
      toast('المتصفح الحالي لا يدعم البصمة المباشرة؛ يمكنك استخدام رمز المرور PIN');
      return;
    }
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    const userId = new Uint8Array(16);
    crypto.getRandomValues(userId);
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'X-Wallet' },
        user: { id: userId, name: 'xwallet-user', displayName: 'X-Wallet User' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
        timeout: 60000
      }
    });
    if(cred && cred.rawId){
      const b64 = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
      state.prefs.bioEnabled = true;
      state.prefs.bioCredentialId = b64;
      state.prefs.appLockOnStart = true;
      _appUnlockedThisSession = true;
      applyPreferences();
      persist();
      toast('تم تفعيل البصمة لفتح التطبيق والأرقام 🫆✓');
    }
  }catch(err){
    toast('تعذر تسجيل البصمة أو تم الإلغاء');
  }
}

function checkAppLockOnBoot(){
  const p = state.prefs || {};
  const hasPin = !!(p.secPinHash || p.secPin);
  const shouldLock = p.appLockOnStart !== false && (p.bioEnabled || hasPin);
  const lockScreen = document.getElementById('appLockScreen');
  if(!shouldLock || _appUnlockedThisSession || !lockScreen) return;

  lockScreen.classList.add('show');
  const pinWrap = document.getElementById('lockPinWrap');
  if(pinWrap) pinWrap.style.display = hasPin ? 'flex' : 'none';

  if(p.bioEnabled){
    setTimeout(()=>unlockAppWithBiometrics(), 250);
  }
}

async function unlockAppWithBiometrics(){
  const p = state.prefs || {};
  if(p.bioEnabled && window.PublicKeyCredential && navigator.credentials){
    try{
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);
      const opts = {
        publicKey: {
          challenge,
          userVerification: 'required',
          timeout: 60000
        }
      };
      if(p.bioCredentialId){
        const bin = atob(p.bioCredentialId);
        const raw = new Uint8Array(bin.length);
        for(let i=0;i<bin.length;i++) raw[i] = bin.charCodeAt(i);
        opts.publicKey.allowCredentials = [{ type: 'public-key', id: raw }];
      }
      const assertion = await navigator.credentials.get(opts);
      if(assertion){
        _appUnlockedThisSession = true;
        document.getElementById('appLockScreen')?.classList.remove('show');
        
        return;
      }
    }catch(_){
      toast('اضغط فتح بالبصمة مرة أخرى أو أدخل الرمز');
    }
  } else if(p.secPinHash || p.secPin){
    document.getElementById('lockPinWrap').style.display = 'flex';
    document.getElementById('lockPinInput')?.focus();
  } else {
    _appUnlockedThisSession = true;
    document.getElementById('appLockScreen')?.classList.remove('show');
  }
}

async function unlockAppWithPin(){
  const p = state.prefs || {};
  const entered = val('lockPinInput').trim();
  const ok = await verifyEnteredPin(entered, p);
  if(ok){
    _appUnlockedThisSession = true;
    setv('lockPinInput', '');
    document.getElementById('appLockScreen')?.classList.remove('show');
    
  }
}

async function verifyBiometricOrPin(onSuccess){
  const p = state.prefs || {};
  const hasPin = !!(p.secPinHash || p.secPin);
  const needLock = p.bioOnPrivacy !== false && (p.bioEnabled || hasPin);
  if(!needLock){
    onSuccess();
    return;
  }
  if(p.bioEnabled && window.PublicKeyCredential && navigator.credentials){
    try{
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);
      const opts = {
        publicKey: {
          challenge,
          userVerification: 'required',
          timeout: 60000
        }
      };
      if(p.bioCredentialId){
        const bin = atob(p.bioCredentialId);
        const raw = new Uint8Array(bin.length);
        for(let i=0;i<bin.length;i++) raw[i] = bin.charCodeAt(i);
        opts.publicKey.allowCredentials = [{ type: 'public-key', id: raw }];
      }
      const assertion = await navigator.credentials.get(opts);
      if(assertion){
        onSuccess();
        return;
      }
    }catch(_){
      if(!hasPin){
        toast('لم يتم التحقق من البصمة');
        return;
      }
    }
  }
  if(hasPin){
    showAppPrompt('أدخل رمز المرور لإظهار الأرقام', 'رمز المرور (PIN)...', '', async (entered)=>{
      const ok = await verifyEnteredPin(entered, p);
      if(ok) onSuccess();
    }, false, 'password');
    return;
  }
  onSuccess();
}

function togglePrivacyMode(){
  if(state.prefs?.privacy){
    verifyBiometricOrPin(()=>{
      state.prefs.privacy = false;
      applyPreferences();
      persist();
      toast('تم إظهار الأرقام ✓');
    });
  } else {
    state.prefs.privacy = true;
    applyPreferences();
    persist();
    toast('تم إخفاء الأرقام 🙈');
  }
}


/* ---- Original app.js lines 4142-4356 ---- */
let settingsCatMode = 'income';
let expandedSettingsMainCats = {};


function setSettingsCatTab(mode){
  settingsCatMode = mode;
  document.getElementById('setCatTabInc')?.classList.toggle('active', mode==='income');
  document.getElementById('setCatTabExp')?.classList.toggle('active', mode==='expense');
  renderSettingsCategories();
}

function addMainCategoryInSettings(){
  const title = settingsCatMode==='income' ? 'إضافة قسم دخل رئيسي' : 'إضافة قسم مصروفات رئيسي';
  showAppPrompt(title, 'اكتب اسم القسم الرئيسي...', '', (n)=>{
    if(!n || !n.trim()) return;
    const clean = n.trim();
    syncCategoryTrees();
    const tree = settingsCatMode==='income' ? state.categoryTree.income : state.categoryTree.expense;
    if(!tree[clean]) tree[clean] = [];
    if(settingsCatMode==='income') state.incomeCategories = [...new Set([...(state.incomeCategories||[]), clean])];
    else state.categories = [...new Set([...(state.categories||[]), clean])];
    persist();
    toast('تمت إضافة القسم الرئيسي ✓');
  });
}

function renameMainCategoryInSettings(oldName){
  showAppPrompt('تعديل اسم القسم الرئيسي', 'الاسم الجديد...', oldName, (n)=>{
    if(!n || !n.trim() || n.trim()===oldName) return;
    const clean = n.trim();
    syncCategoryTrees();
    const tree = settingsCatMode==='income' ? state.categoryTree.income : state.categoryTree.expense;
    const subs = tree[oldName] || [];
    delete tree[oldName];
    tree[clean] = [...new Set([...(tree[clean]||[]), ...subs])];
    if(settingsCatMode==='income'){
      state.incomeCategories = (state.incomeCategories||[]).map(x=>x===oldName?clean:x);
    } else {
      state.categories = (state.categories||[]).map(x=>x===oldName?clean:x);
    }
    state.transactions.forEach(t=>{ if(t.category===oldName) t.category=clean; });
    persist();
    toast('تم تعديل اسم القسم ✓');
  });
}

function addSubCategoryInSettings(mainName){
  showAppPrompt(`إضافة فرعي داخل «${mainName}»`, 'اكتب اسم القسم الفرعي...', '', (n)=>{
    if(!n || !n.trim()) return;
    const clean = n.trim();
    syncCategoryTrees();
    const tree = settingsCatMode==='income' ? state.categoryTree.income : state.categoryTree.expense;
    tree[mainName] = [...new Set([...(tree[mainName]||[]), clean])];
    expandedSettingsMainCats[mainName] = true;
    persist();
    toast('تمت إضافة القسم الفرعي ✓');
  });
}

function renameSubCategoryInSettings(mainName, oldSub){
  showAppPrompt('تعديل اسم القسم الفرعي', 'الاسم الجديد...', oldSub, (n)=>{
    if(!n || !n.trim() || n.trim()===oldSub) return;
    const clean = n.trim();
    syncCategoryTrees();
    const tree = settingsCatMode==='income' ? state.categoryTree.income : state.categoryTree.expense;
    tree[mainName] = (tree[mainName]||[]).map(s=>s===oldSub?clean:s);
    state.transactions.forEach(t=>{ if(t.category===mainName && t.subCategory===oldSub) t.subCategory=clean; });
    persist();
    toast('تم تعديل القسم الفرعي ✓');
  });
}

function moveSubCategoryToMainCategory(fromMain, subName, toMain, mode=settingsCatMode){
  const isIncome = mode === 'income';
  const tree = isIncome ? state.categoryTree.income : state.categoryTree.expense;
  fromMain=String(fromMain||'').trim(); subName=String(subName||'').trim(); toMain=String(toMain||'').trim();
  if(!fromMain||!subName||!toMain||fromMain===toMain||!tree[fromMain]||!tree[toMain]) return false;
  const source=tree[fromMain];
  if(!source.includes(subName)) return false;
  tree[fromMain]=source.filter(x=>x!==subName);
  if(!tree[toMain].includes(subName)) tree[toMain].push(subName);
  // Existing transactions follow the subcategory to its new parent without changing values or IDs.
  (state.transactions||[]).forEach(t=>{
    if(t.type===(isIncome?'income':'expense') && String(t.category||'')===fromMain && String(t.subCategory||'')===subName) t.category=toMain;
  });
  expandedSettingsMainCats={}; expandedSettingsMainCats[toMain]=true;
  persist(); renderSettingsCategories();
  toast('تم نقل القسم الفرعي ومعاملاته إلى القسم الرئيسي الجديد ✓');
  return true;
}

function toggleSettingsMainCatExpand(mainName){
  const was = !!expandedSettingsMainCats[mainName];
  expandedSettingsMainCats = {};
  if(!was) expandedSettingsMainCats[mainName] = true;
  renderSettingsCategories();
}



function renderSettingsCategories(){
  const container = document.getElementById('settingsCatsTreeContainer');
  if(!container) return;
  syncCategoryTrees();
  document.getElementById('setCatTabInc')?.classList.toggle('active', settingsCatMode==='income');
  document.getElementById('setCatTabExp')?.classList.toggle('active', settingsCatMode==='expense');
  const isInc = (settingsCatMode === 'income');
  const tree = isInc ? state.categoryTree.income : state.categoryTree.expense;
  const entries = Object.entries(tree||{});
  if(!entries.length){
    container.innerHTML = '<div class="empty">لا توجد أقسام مسجلة. اضغط على علامة ＋ بالأعلى للإضافة.</div>';
    return;
  }
  container.innerHTML = entries.map(([mc, subs])=>{
    const isOpen = !!expandedSettingsMainCats[mc];
    const previewSubs = subs.length ? subs.slice(0,5).join('، ') + (subs.length>5 ? '…' : '') : 'لا توجد أقسام فرعية';
    const subsHtml = isOpen ? `
      <div class="cat-mgr-subs" data-parent-cat="${esc(mc)}">
        <div class="sub-drag-list" data-parent-cat="${esc(mc)}">
          ${subs.map(sc=>`
            <div class="cat-mgr-sub-row" data-cat-name="${esc(sc)}" style="margin-bottom:4px">
              <div style="display:flex;align-items:center;min-width:0;flex:1">
                <span class="cat-drag-handle sub-drag-handle cat-mode-reorder-el" title="اسحب لإعادة الترتيب">☰</span>
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(sc)}</span>
              </div>
              <button type="button" class="icon-act-btn subcat-move-icon-btn" title="نقل إلى قسم رئيسي آخر" onclick="openMoveSubCatModal('${escJs(mc)}','${escJs(sc)}','${isInc?'income':'expense'}')">⇄</button>
              <button type="button" class="icon-act-btn" title="تعديل الفرعي" onclick="renameSubCategoryInSettings('${escJs(mc)}','${escJs(sc)}')">✎</button><button type="button" class="icon-act-btn cat-mode-del-el" title="حذف الفرعي" onclick="deleteSubCategoryInSettings('${escJs(mc)}','${escJs(sc)}')">🗑</button>
            </div>
          `).join('')}
        </div>
        <button type="button" class="smallbtn" style="width:100%;margin-top:2px;border-color:var(--mint);color:var(--mint)" onclick="addSubCategoryInSettings('${escJs(mc)}')">＋ إضافة قسم فرعي</button>
      </div>
    ` : '';
    return `
      <div class="cat-mgr-row" data-cat-name="${esc(mc)}">
        <div class="cat-mgr-main">
          <div class="cat-mgr-main-title cat-clean-title" onclick="toggleSettingsMainCatExpand('${escJs(mc)}')">
            <b>${esc(mc)}</b>
            <span class="cat-mgr-count-badge">${subs.length}</span>
          </div>
          <div class="cat-mgr-icons">
            <button type="button" class="icon-act-btn" title="تعديل القسم الرئيسي" onclick="renameMainCategoryInSettings('${escJs(mc)}')">✎</button>
            <span class="cat-drag-handle main-drag-handle cat-mode-reorder-el" title="اسحب لإعادة الترتيب">☰</span>
            <button type="button" class="icon-act-btn cat-mode-del-el" title="حذف القسم" onclick="deleteMainCategoryInSettings('${escJs(mc)}')">🗑</button>
          </div>
        </div>
        ${subsHtml}
      </div>
    `;
  }).join('');

  // Attach Touch/Pointer Drag-to-Reorder for Main Categories & Open Subcategory Lists
  initDragReorderContainer(container, '.cat-mgr-row', '.main-drag-handle', (newOrder)=>{
    const curTree = isInc ? state.categoryTree.income : state.categoryTree.expense;
    const rebuilt = {};
    newOrder.forEach(k => { if(curTree[k] !== undefined) rebuilt[k] = curTree[k]; });
    Object.keys(curTree).forEach(k => { if(rebuilt[k] === undefined) rebuilt[k] = curTree[k]; });
    if(isInc){
      state.categoryTree.income = rebuilt;
      state.incomeCategories = Object.keys(rebuilt);
    } else {
      state.categoryTree.expense = rebuilt;
      state.categories = Object.keys(rebuilt);
    }
    persist();
    toast('تم حفظ ترتيب الأقسام ✓');
  });

  container.querySelectorAll('.sub-drag-list').forEach(subListEl => {
    const parentMc = subListEl.getAttribute('data-parent-cat');
    initDragReorderContainer(subListEl, '.cat-mgr-sub-row', '.sub-drag-handle', (newSubOrder)=>{
      const curTree = isInc ? state.categoryTree.income : state.categoryTree.expense;
      if(parentMc && curTree[parentMc]){
        curTree[parentMc] = newSubOrder;
        persist();
        toast('تم حفظ ترتيب الأقسام الفرعية ✓');
      }
    });
  });
}



function openMoveSubCatModal(fromMain, subName, mode){
  syncCategoryTrees();
  const isInc = (mode === 'income');
  const tree = isInc ? state.categoryTree.income : state.categoryTree.expense;
  const targets = Object.keys(tree || {}).filter(k => k !== fromMain);
  if(!targets.length) return toast('لا توجد أقسام رئيسية أخرى للنقل إليها');
  const html = `<div class="cs-opt-list">` + targets.map(t => `
    <button type="button" class="cs-opt-btn" onclick="closeAppDialog();moveSubCategoryToMainCategory('${escJs(fromMain)}','${escJs(subName)}','${escJs(t)}','${isInc?'income':'expense'}')">
      <span>${esc(t)}</span><span>←</span>
    </button>
  `).join('') + `</div>`;
  showAppCustomForm(`نقل «${subName}» إلى:`, html, null, true);
}

function previewBgGradient(v){
  state.prefs = state.prefs || {};
  state.prefs.bgGradient = v || 'gradient';
  document.documentElement.setAttribute('data-bg-gradient', state.prefs.bgGradient);
  persist();
}
function previewBgPattern(v){
  state.prefs = state.prefs || {};
  state.prefs.bgPattern = v || 'plain';
  document.documentElement.setAttribute('data-bg-pattern', state.prefs.bgPattern);
  persist();
}

function previewGroupFrames(checked){
  state.prefs = state.prefs || {};
  state.prefs.groupFrames = !!checked;
  document.documentElement.setAttribute('data-group-frames', state.prefs.groupFrames ? 'on' : 'off');
  persist();
}


/* =========================================================
   X-WALLET V15.3.0 FULL ARABIC <-> ENGLISH TRANSLATION ENGINE
   ========================================================= */
const XW_AR_TO_EN = {
  // Bottom Nav & Main Tabs
  'المعاملات':'Transactions', 'التحليل':'Analytics', 'المحفظة':'Wallet', 'الالتزامات':'Commitments', 'المزيد':'More',
  'السجل':'Records', 'الملخص':'Summary', 'الدخل':'Income', 'المصروفات':'Expenses', 'التحويلات':'Transfers', 'الصافي':'Net',
  'الأصول':'Assets', 'المديونيات':'Liabilities', 'الحسابات':'Accounts', 'البطاقات':'Cards',
  'الرصيد':'Balance', 'المتاح':'Available', 'المستحق':'Due', 'إجمالي التزامات الشهر':'Monthly Commitments Total',
  // Filter Cards & Actions
  'بالتاريخ':'Date', 'بالمبلغ':'Amount', 'بالحساب':'Account', 'بالقسم':'Category', 'بالنوع':'Type',
  '✕ إلغاء':'✕ Cancel', 'دخل':'Income', 'مصروف':'Expense', 'مصروفات':'Expenses', 'تحويل':'Transfer', 'تحويلات':'Transfers',
  'بحث':'Search', 'ابحث':'Search', 'ابحث في البنود...':'Search categories...', 'ابحث في الالتزامات':'Search commitments...',
  // Quick Entry
  'إضافة معاملة':'Add Transaction', 'تعديل معاملة':'Edit Transaction', 'التاريخ':'Date', 'الحساب':'Account',
  'من حساب':'From Account', 'إلى حساب':'To Account', 'القسم':'Category', 'اختر القسم':'Select Category',
  'اختر الحساب':'Select Account', 'المبلغ':'Amount', 'رسوم':'Fee', 'ملاحظات':'Note', 'الوصف':'Description',
  'حفظ':'Save', 'إلغاء':'Cancel', 'حذف':'Delete', 'نسخ':'Copy', 'تكرار':'Repeat', 'تقسيط':'Installment',
  // More & Settings Sub-pages
  'مديرك المالي الذكي':'Your Smart Finance Manager', 'إعدادات عامة':'General Settings', 'إعدادات المظهر':'Appearance',
  'الأمان والخصوصية':'Security & Privacy', 'النسخ الاحتياطي والاستعادة':'Backup & Restore',
  'تخصيص الأقسام':'Manage Categories', 'حاسبة الراتب':'Salary Calculator', 'التقرير السنوي':'Annual Report',
  'فحص التحديثات':'Check Updates', 'حول التطبيق':'About App', 'تصفير البيانات':'Reset Data',
  // General Settings
  'اللغة':'Language', 'العربية':'Arabic', 'English':'English', 'العملة الأساسية':'Base Currency',
  'طريقة التمرير':'Swipe Mode', 'تبديل القوائم':'Switch Tabs', 'تبديل الشهور':'Switch Months',
  'نوع النوافذ':'Modal Mode', 'نافذة واحدة':'Single Modal', 'نوافذ متعددة':'Multi Modal',
  'الاختصارات السريعة':'Quick Shortcuts', 'عرض / إخفاء الصفحات':'Show / Hide Pages',
  'صفحة المعاملات':'Transactions Page', 'صفحة التحليل':'Analytics Page', 'صفحة المحفظة':'Wallet Page', 'صفحة الالتزامات':'Commitments Page',
  'حفظ الإعدادات':'Save Settings',
  // Appearance
  'وضع الخلفية':'Background Mode', 'داكن':'Dark', 'فاتح':'Light', 'معدني':'Metallic', 'أسود':'Black',
  'تدرج الخلفية':'Background Gradient', 'مموج':'Gradient', 'لون واحد':'Solid', 'متوهج':'Glow',
  'نقشة الخلفية':'Background Pattern', 'سادة':'Plain', 'خطوط':'Lines', 'شبكة':'Grid', 'نقاط':'Dots', 'فريمات':'Frames',
  'إطار المجموعات والأيام':'Group & Day Frames',
  'تصميم الشريط العلوي':'Header Style', 'تصميم البطاقات والبنود':'Cards & Items Style',
  'تصميم حقول الإدخال':'Input Fields Style', 'تصميم صفوف السجل':'Records Row Style',
  'فريم':'Framed', 'ناعم':'Soft', 'خط فاصل':'Divider', 'خط فاصل طولي':'Vertical Divider', 'خط سفلي':'Underline',
  'لون الثيم':'Theme Color', 'اختيار اللون':'Pick Color', 'نوع الخط':'Font Family', 'حجم الخط':'Font Size',
  'الأرقام العشرية':'Decimal Places', 'إظهار':'Show', 'إخفاء':'Hide',
  // Backup & Security
  'النسخ السحابي':'Cloud Backup', 'تصدير':'Export', 'استيراد':'Import', 'استيراد ماني مانجر':'Import Money Manager',
  'قفل التطبيق بالبصمة':'Biometric App Lock', 'رمز المرور (PIN)':'PIN Passcode', 'إخفاء الأرقام بالبصمة':'Biometric Privacy Mask',
  'فتح التطبيق بالبصمة':'Unlock with Biometrics', 'فتح':'Unlock',
  // Modals & Calendar & Analytics
  'تأكيد الخروج':'Exit Confirmation', 'هل تريد الخروج من تطبيق X-Wallet؟':'Do you want to exit X-Wallet?',
  'البقاء في التطبيق':'Stay in App', 'نعم، خروج':'Yes, Exit', 'اليوم':'Today', 'إغلاق':'Close', 'تأكيد':'Confirm',
  'الصنف':'Item', 'النسبة':'Share', 'الإجمالي':'Total', 'المعاملة':'Item', 'النوع':'Type', 'الموعد':'Due Date', 'الإجراء':'Action',
  'سداد':'Pay', 'مدفوع':'Paid', 'لا توجد بيانات':'No data available', 'لا توجد التزامات مطابقة للبحث.':'No matching commitments.',
  'لا توجد مبالغ مستحقة في هذا الشهر.':'No dues for this month.', 'لا توجد حسابات مسجلة.':'No accounts added.',
  'لا توجد بطاقات مسجلة.':'No cards added.',
  'إضافة حساب':'Add Account', 'تعديل الحساب':'Edit Account', 'إضافة بطاقة':'Add Card', 'تعديل البطاقة':'Edit Card',
  'اختر الحساب أو البطاقة':'Select Account or Card',
  'فلترة بالتاريخ (من : إلى)':'Filter by Date (From : To)', 'فلترة بالمبلغ (من : إلى)':'Filter by Amount (From : To)',
  'فلترة بالحساب':'Filter by Account', 'فلترة بالقسم الرئيسي والفرعي':'Filter by Category', 'فلترة بالنوع':'Filter by Type',
  'من تاريخ':'From Date', 'إلى تاريخ':'To Date', 'من مبلغ':'Min Amount', 'إلى مبلغ':'Max Amount',
  'النسخ الاحتياطي':'Backup', 'الأمان':'Security', 'المظهر':'Appearance', 'عام':'General'
};

let _xwI18nObserver = null;
function translateDomTreeToLang(root, lang){
  if(!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let node;
  while((node = walker.nextNode())){
    const p = node.parentElement;
    if(!p || p.tagName === 'SCRIPT' || p.tagName === 'STYLE') continue;
    const raw = node.nodeValue;
    const trimmed = raw.trim();
    if(!trimmed) continue;
    if(lang === 'en'){
      if(!p.dataset.xwOrigAr && XW_AR_TO_EN[trimmed]){
        p.dataset.xwOrigAr = trimmed;
      }
      const key = p.dataset.xwOrigAr || trimmed;
      if(XW_AR_TO_EN[key] && trimmed !== XW_AR_TO_EN[key]){
        node.nodeValue = raw.replace(trimmed, XW_AR_TO_EN[key]);
      }
    } else {
      if(p.dataset.xwOrigAr && trimmed !== p.dataset.xwOrigAr){
        node.nodeValue = raw.replace(trimmed, p.dataset.xwOrigAr);
      }
    }
  }
  root.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => {
    const ph = (el.getAttribute('placeholder') || '').trim();
    if(lang === 'en'){
      if(!el.dataset.xwOrigPh && XW_AR_TO_EN[ph]) el.dataset.xwOrigPh = ph;
      const k = el.dataset.xwOrigPh || ph;
      if(XW_AR_TO_EN[k]) el.setAttribute('placeholder', XW_AR_TO_EN[k]);
    } else if(el.dataset.xwOrigPh){
      el.setAttribute('placeholder', el.dataset.xwOrigPh);
    }
  });
}

function applyFullAppLanguage(lang){
  const targetLang = (lang === 'en') ? 'en' : 'ar';
  translateDomTreeToLang(document.body, targetLang);
  if(typeof updateTopTabTitle === 'function') updateTopTabTitle();
  if(typeof syncCustomSelectTriggers === 'function') syncCustomSelectTriggers();
  if(!_xwI18nObserver && typeof MutationObserver !== 'undefined'){
    let rafId = 0;
    _xwI18nObserver = new MutationObserver(() => {
      if((state?.prefs?.lang || 'ar') !== 'en') return;
      if(rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        translateDomTreeToLang(document.body, 'en');
      });
    });
    _xwI18nObserver.observe(document.body, { childList: true, subtree: true });
  }
}
