/* X-Wallet V14.3 management: audit, duplicates, recurring, budgets, goals, currencies, alerts and receipts. */
function managementCurrencyOptions(selected='EGP'){
  ensureManagementState();
  const code=String(selected||'EGP').toUpperCase();
  return `<option value="EGP" selected>EGP · جنيه مصري</option>`;
}

function ensureManagementState(){
  state.auditLog=Array.isArray(state.auditLog)?state.auditLog:[];
  state.budgets=Array.isArray(state.budgets)?state.budgets:[];
  state.goals=Array.isArray(state.goals)?state.goals:[];
  state.goalMovements=Array.isArray(state.goalMovements)?state.goalMovements:[];
  state.recurringRules=Array.isArray(state.recurringRules)?state.recurringRules:[];
  state.currencies=Array.isArray(state.currencies)?state.currencies:[{code:'EGP',name:'جنيه مصري',rate:1}];
  if(!state.currencies.some(c=>c.code==='EGP')) state.currencies.unshift({code:'EGP',name:'جنيه مصري',rate:1});
  state.currencies=state.currencies.map(c=>c.code==='EGP'?{...c,rate:1}:c);
  state.currencyRates=Array.isArray(state.currencyRates)?state.currencyRates:[];
  state.alertRules=Array.isArray(state.alertRules)?state.alertRules:[];
  state.savedTransactionFilters=Array.isArray(state.savedTransactionFilters)?state.savedTransactionFilters:[];
  const defaultAlertRules=[
    {type:'budget-near-limit',enabled:true,thresholdPercent:80},
    {type:'budget-exceeded',enabled:true},
    {type:'commitment-unpaid',enabled:true},
    {type:'negative-balance',enabled:true}
  ];
  for(const rule of defaultAlertRules)if(!state.alertRules.some(x=>x.type===rule.type))state.alertRules.push({...rule});
  state.restoreLog=Array.isArray(state.restoreLog)?state.restoreLog:[];
  state.duplicateReviews=Array.isArray(state.duplicateReviews)?state.duplicateReviews:[];
  state.cancelledTransactions=Array.isArray(state.cancelledTransactions)?state.cancelledTransactions:[];
  state.prefs=state.prefs||{};
  if(!state.prefs.modalMode) state.prefs.modalMode='single';
}
ensureManagementState();

function auditCompact(value){
  if(value==null) return null;
  const copy=JSON.parse(JSON.stringify(value));
  const stripSecrets=o=>{
    if(!o||typeof o!=='object') return;
    if(Array.isArray(o)){o.forEach(stripSecrets);return;}
    for(const k of Object.keys(o)){
      const key=String(k);
      const sensitive=/password|passphrase|secret|token|authorization|credential|private.?key|pin|refresh.?token/i.test(key);
      if(key==='data'||key==='base64'||sensitive||['driveWebhookUrl','driveEmail','ghGistId','driveClientId'].includes(key)){
        if(key==='data' && typeof o[k]==='string' && o[k].startsWith('data:')) o[k]='[مرفق محفوظ]';
        else delete o[k];
      } else stripSecrets(o[k]);
    }
  };
  stripSecrets(copy);
  return copy;
}
function auditRecord(action, entity, entityId, before, after){
  ensureManagementState();
  state.auditLog.unshift({id:uid('audit'),at:new Date().toISOString(),action:String(action),entity:String(entity),entityId:String(entityId??''),before:auditCompact(before),after:auditCompact(after)});
  if(state.auditLog.length>3000) state.auditLog.length=3000;
}


function recurringDueDate(rule,ym){
  const [y,m]=ym.split('-').map(Number); const last=new Date(y,m,0).getDate();
  return `${ym}-${String(Math.min(last,Math.max(1,Number(rule.day)||1))).padStart(2,'0')}`;
}
function runRecurringTransactions(forDate=today()){
  ensureManagementState(); const current=String(forDate).slice(0,10); const ym=current.slice(0,7); let count=0;
  for(const r of state.recurringRules){
    if(!r.active || (r.startMonth && ym<r.startMonth) || (r.endMonth && ym>r.endMonth)) continue;
    if(r.frequency && r.frequency!=='monthly') continue; // unsupported frequencies are not silently run.
    const date=recurringDueDate(r,ym);
    if(date>current || r.lastCreatedMonth===ym) continue;
    const exists=state.transactions.some(t=>String(t.recurringRuleId||'')===String(r.id)&&String(t.date)===date);
    if(!exists){
      const tx={id:uid('tx'),type:r.type,date,amount:Number(r.amount),category:r.category||'',subCategory:r.subCategory||'',accountId:r.accountId||'',note:r.note||'معاملة متكررة',recurringRuleId:r.id,currency:'EGP',exchangeRateAtCreation:1,baseAmount:Number(r.amount),createdAt:new Date().toISOString()};
      state.transactions.push(tx); count++;
    }
    r.lastCreatedMonth=ym; r.lastCreatedDate=date;
  }
  if(count || state.recurringRules.length) persist();
  return count;
}

function getCurrencyRateToBase(code,date,lockedRate){
  date=date||(typeof today==='function'?today():new Date().toISOString().slice(0,10));
  const currency=String(code||'EGP').trim().toUpperCase();
  if(currency==='EGP') return 1;
  const locked=Number(lockedRate);
  if(lockedRate!==undefined&&lockedRate!==null&&lockedRate!==''&&Number.isFinite(locked)&&locked>0)return locked;
  const rate=Number(getHistoricalCurrencyRate(currency,String(date||today())));
  if(!Number.isFinite(rate)||rate<=0)throw new Error(`سعر صرف ${currency} غير مسجل. سجل سعر الصرف قبل استخدام العملة.`);
  return rate;
}
function convertCurrencyAmount(amount,fromCurrency,toCurrency='EGP',date=today(),lockedFromRate,lockedToRate){
  const value=Number(amount);
  if(!Number.isFinite(value))throw new Error('المبلغ غير صالح للتحويل');
  const fromCode=String(fromCurrency||'EGP').trim().toUpperCase();
  const toCode=String(toCurrency||'EGP').trim().toUpperCase();
  if(fromCode===toCode)return round2(value);
  const fromRate=getCurrencyRateToBase(fromCode,date,lockedFromRate);
  const toRate=getCurrencyRateToBase(toCode,date,lockedToRate);
  return round2(value*fromRate/toRate);
}
function transactionCurrencySnapshot(amount,currency,date){
  const value=round2(Number(amount||0));
  return {currency:'EGP',exchangeRateAtCreation:1,baseAmount:value};
}
function transactionBaseAmount(t){
  if(t.baseAmount!==undefined && t.baseAmount!==null && t.baseAmount!=='' && Number.isFinite(Number(t.baseAmount))) return round2(t.baseAmount);
  const code=String(t.currency||'EGP').toUpperCase();
  return round2((Number(t.amount)||0)*getCurrencyRateToBase(code,String(t.date||today()),t.exchangeRateAtCreation??t.currencyRate));
}
function setCurrencyRate(code,name,rate,effectiveDate=today()){
  ensureManagementState(); const c=String(code||'').trim().toUpperCase(), r=Number(rate);
  if(!/^[A-Z]{3}$/.test(c)||!Number.isFinite(r)||r<=0) throw new Error('أدخل رمز عملة من 3 أحرف وسعر صرف أكبر من صفر');
  if(c==='EGP'&&Math.abs(r-1)>0.0000001)throw new Error('الجنيه المصري هو العملة الأساسية وسعره ثابت عند 1');
  const effective=String(effectiveDate||today()).slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(effective)||Number.isNaN(Date.parse(effective))||effective>today())throw new Error('تاريخ سريان سعر الصرف غير صالح أو في المستقبل');
  const old=state.currencies.find(x=>x.code===c);
  const latest=state.currencyRates.filter(x=>x.code===c).map(x=>String(x.effectiveDate||'')).sort().at(-1)||String(old?.updatedAt||'');
  const isCurrentOrNewest=!latest||effective>=latest;
  const item={code:c,name:String(name||c),rate:isCurrentOrNewest?r:Number(old?.rate)||r,updatedAt:isCurrentOrNewest?effective:(old?.updatedAt||latest||effective)};
  if(old)Object.assign(old,item);else state.currencies.push(item);
  state.currencyRates=state.currencyRates.filter(x=>!(x.code===c&&String(x.effectiveDate)===effective));
  state.currencyRates.unshift({code:c,rate:r,effectiveDate:effective,recordedAt:new Date().toISOString()});
  state.currencyRates=state.currencyRates.slice(0,1000);
  persist(); return item;
}
function amountToBase(amount,currency,lockedRate,date){
  ensureManagementState();
  const value=Number(amount);if(!Number.isFinite(value))throw new Error('المبلغ غير صالح');
  return round2(value*getCurrencyRateToBase(currency,date,lockedRate));
}
function getHistoricalCurrencyRate(code,date){
  date=date||(typeof today==='function'?today():new Date().toISOString().slice(0,10));
  const c=String(code||'EGP').toUpperCase(); if(c==='EGP')return 1;
  const record=(state.currencyRates||[]).filter(x=>x.code===c&&x.effectiveDate<=date).sort((a,b)=>String(b.effectiveDate).localeCompare(String(a.effectiveDate)))[0];
  const historical=Number(record?.rate);
  if(Number.isFinite(historical)&&historical>0)return historical;
  const currentEntry=state.currencies.find(x=>x.code===c);
  const current=Number(currentEntry?.rate);
  const currentDate=String(currentEntry?.updatedAt||'');
  if(currentDate&&currentDate>date)return 0; // Never use a later quote for an earlier transaction date.
  return Number.isFinite(current)&&current>0?current:0;
}
function accountCurrency(accountOrId){return 'EGP';}
function validateTransferCurrencies(fromId,toId,date=today(),lockedFromRate,lockedToRate){
  const from=(state.accounts||[]).find(a=>String(a.id)===String(fromId));
  const to=(state.accounts||[]).find(a=>String(a.id)===String(toId));
  if(!from||!to)throw new Error('الحساب المحدد غير موجود');
  const fromCode='EGP',toCode='EGP';
  const fromRate=1,toRate=1;
  return {currency:fromCode,fromCurrency:fromCode,toCurrency:toCode,fromRate,toRate,from,to};
}

/* Receipt upload/attachment module removed in V15.3.2 cleanup */


/* Operational helpers for the management screen. Forecasts are explicitly indicative. */
function buildTransactionsCsv(){
  const accountNames=new Map((state.accounts||[]).map(a=>[String(a.id),a.name]));
  const columns=['التاريخ','النوع','القسم','القسم الفرعي','الوصف','المبلغ','العملة','الحساب'];
  const quote=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
  const rows=(state.transactions||[]).filter(t=>!t.deletedAt).map(t=>[
    t.date,t.type,t.category,t.subCategory,t.note||t.description||t.title,t.amount,t.currency||'EGP',accountNames.get(String(t.accountId))||''
  ]);
  return '\uFEFF'+[columns,...rows].map(row=>row.map(quote).join(',')).join('\r\n');
}

function renderManagementHub(){
  // Retired in V15.1.4 by user request: do not recreate the unwanted catch-all
  // "tools and financial logs" dialog after background actions. Individual
  // financial services remain available to their owning screens/modules.
  return false;
}


/* Audit snapshots cover financial data and non-secret configuration, without retaining receipt payloads or credentials. */
let _auditSnapshot=null;
function _auditFingerprint(){
  const keys=['transactions','accounts','cards','cardOps','cardPayments','commitments','commitmentPayments','ledger','budgets','goals','goalMovements','recurringRules','currencies','currencyRates','annualPlanItems','salaryConfig','salaryMonths','categories','incomeCategories','alertRules','savedTransactionFilters','restoreLog','duplicateReviews','importBatches','reportDefaults','categoryTree'];
  const snap={}; for(const key of keys) snap[key]=auditCompact(state[key]||[]);
  snap.prefs=auditCompact(state.prefs||{}); return snap;
}
function _auditDiff(before,after){
  const labels={transactions:'معاملة',accounts:'حساب',cards:'بطاقة',cardOps:'عملية بطاقة',cardPayments:'سداد بطاقة',commitments:'التزام',commitmentPayments:'سداد التزام',ledger:'حركة حساب',budgets:'ميزانية',goals:'هدف مالي',goalMovements:'حركة هدف مالي',recurringRules:'قاعدة متكررة',currencies:'عملة',currencyRates:'سعر صرف',annualPlanItems:'بند خطة سنوية',salaryConfig:'إعدادات راتب',salaryMonths:'راتب شهري',categories:'قسم مصروف',incomeCategories:'قسم دخل',savedTransactionFilters:'فلتر بحث محفوظ'};
  for(const key of Object.keys(labels)){
    const oldArr=Array.isArray(before?.[key])?before[key]:[]; const newArr=Array.isArray(after[key])?after[key]:[];
    const oldMap=new Map(oldArr.map((x,i)=>[String(x.id??i),x]));const newMap=new Map(newArr.map((x,i)=>[String(x.id??i),x]));
    for(const [id,n] of newMap){const o=oldMap.get(id);if(!o)auditRecord('إضافة',labels[key],id,null,n);else if(JSON.stringify(o)!==JSON.stringify(n))auditRecord('تعديل',labels[key],id,o,n);}
    for(const [id,o] of oldMap)if(!newMap.has(id))auditRecord('حذف',labels[key],id,o,null);
  }
  if(JSON.stringify(before?.prefs||{})!==JSON.stringify(after.prefs||{})) auditRecord('تعديل إعدادات','الإعدادات العامة','prefs',before?.prefs,after.prefs);
}
if(typeof persist==='function'&&!persist.__auditWrapped){
  const _basePersist=persist;
  const wrappedPersist=function(onlyActiveScreen){const now=_auditFingerprint();if(_auditSnapshot)_auditDiff(_auditSnapshot,now);_auditSnapshot=now;return _basePersist(onlyActiveScreen);};
  wrappedPersist.__auditWrapped=true;persist=wrappedPersist;_auditSnapshot=_auditFingerprint();
}

