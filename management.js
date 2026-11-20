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

function normalizeDuplicateText(value){return String(value??'').trim().toLocaleLowerCase('ar').replace(/\s+/g,' ');}
function duplicateTransactionKey(t){
  return [t.type,t.date,round2(t.amount),String(t.currency||'EGP').toUpperCase(),String(t.accountId||''),String(t.toAccountId||''),String(t.category||''),normalizeDuplicateText(t.note||t.description||t.title||'')].join('|');
}
function findPossibleDuplicateTransactions(){
  const seen=new Map(), dup=[];
  for(const t of (state.transactions||[])){
    if(!t || t.deletedAt || !['income','expense','transfer','fund','credit_payment'].includes(t.type)) continue;
    const key=duplicateTransactionKey(t);
    if(seen.has(key)) dup.push({first:seen.get(key),duplicate:t}); else seen.set(key,t);
  }
  return dup;
}
function searchTransactionsAdvanced(query='',filters={}){
  const q=normalizeDuplicateText(query);
  const accountNames=new Map((state.accounts||[]).map(a=>[String(a.id),a.name]));
  const cats=new Map();
  return (state.transactions||[]).filter(t=>{
    if(t.deletedAt) return false;
    if(filters.type && t.type!==filters.type) return false;
    if(filters.dateFrom && String(t.date)<filters.dateFrom) return false;
    if(filters.dateTo && String(t.date)>filters.dateTo) return false;
    if(filters.amountMin!==undefined && filters.amountMin!=='' && Number(t.amount)<Number(filters.amountMin)) return false;
    if(filters.amountMax!==undefined && filters.amountMax!=='' && Number(t.amount)>Number(filters.amountMax)) return false;
    if(filters.accountId && String(t.accountId)!==String(filters.accountId)) return false;
    if(filters.category && String(t.category||'')!==String(filters.category)) return false;
    if(!q) return true;
    const hay=[t.note,t.description,t.title,t.category,t.subCategory,t.type,t.date,t.amount,t.currency,accountNames.get(String(t.accountId))].join(' ');
    return normalizeDuplicateText(hay).includes(q);
  });
}

function validateRecurringPeriod(rule){
  const start=String(rule.startMonth||'');const end=String(rule.endMonth||'');
  if(start&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(start))throw new Error('شهر بداية التكرار غير صالح');
  if(end&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(end))throw new Error('شهر نهاية التكرار غير صالح');
  if(start&&end&&end<start)throw new Error('شهر نهاية التكرار يجب ألا يسبق شهر البداية');
  if(rule.accountId&&!(state.accounts||[]).some(a=>String(a.id)===String(rule.accountId)))throw new Error('الحساب المحدد غير موجود');
  return true;
}
function addRecurringRule(rule){
  ensureManagementState();
  const amount=Number(rule?.amount);
  if(!['income','expense'].includes(rule?.type)||!Number.isFinite(amount)||amount<=0) throw new Error('بيانات المعاملة المتكررة غير صحيحة');
  const day=Math.min(31,Math.max(1,Number(rule.day)||1));
  const r={id:uid('rec'),active:true,frequency:'monthly',day,lastCreatedMonth:'',lastCreatedDate:'',startMonth:selected(),endMonth:'',...rule,day,amount};
  if((state.accounts||[]).length && !r.accountId) throw new Error('اختر الحساب الذي ستُسجل عليه المعاملة المتكررة');
  validateRecurringPeriod(r);
  r.currency='EGP';
  state.recurringRules.push(r);
  persist(); return r;
}
function toggleRecurringRule(id,active){
  ensureManagementState(); const r=state.recurringRules.find(x=>String(x.id)===String(id)); if(!r)return false;
  r.active=!!active; persist(); return true;
}
function updateRecurringRule(id,patch){
  ensureManagementState();const r=state.recurringRules.find(x=>String(x.id)===String(id));if(!r)throw new Error('قاعدة التكرار غير موجودة');
  const amount=Number(patch?.amount??r.amount);if(!Number.isFinite(amount)||amount<=0)throw new Error('المبلغ يجب أن يكون أكبر من صفر');
  const day=Math.min(31,Math.max(1,Number(patch?.day??r.day)||1));
  const next={...r,...patch,amount,day,type:patch?.type||r.type,frequency:'monthly'};
  if(!['income','expense'].includes(next.type))throw new Error('نوع المعاملة المتكررة غير صالح');
  if((state.accounts||[]).length&&!next.accountId)throw new Error('اختر الحساب الذي ستُسجل عليه المعاملة المتكررة');
  validateRecurringPeriod(next);
  next.currency='EGP';
  Object.assign(r,next);persist();return r;
}
function deleteRecurringRule(id){
  const r=state.recurringRules.find(x=>String(x.id)===String(id)); if(!r)return false;
  if(typeof auditRecord==='function')auditRecord('حذف','قاعدة متكررة',r.id,r,null);
  state.recurringRules=state.recurringRules.filter(x=>String(x.id)!==String(id)); persist(); return true;
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

function saveBudget(b){
  ensureManagementState();
  const limit=Number(b.limit);
  if(!Number.isFinite(limit)||limit<=0) throw new Error('حد الميزانية يجب أن يكون أكبر من صفر');
  const currency='EGP';
  const item={id:b.id||uid('budget'),month:b.month||selected(),category:String(b.category||''),limit,currency};
  const duplicate=state.budgets.find(x=>String(x.id)!==String(item.id)&&x.month===item.month&&x.category===item.category&&String(x.currency||'EGP').toUpperCase()===currency);
  if(duplicate)throw new Error('توجد ميزانية بنفس الشهر والتصنيف والعملة');
  const i=state.budgets.findIndex(x=>String(x.id)===String(item.id));
  if(i>=0) state.budgets[i]=item;
  else state.budgets.push(item);
  persist(); return item;
}
function deleteBudget(id){const b=state.budgets.find(x=>String(x.id)===String(id));if(!b)return false;if(typeof auditRecord==='function')auditRecord('حذف','ميزانية',b.id,b,null);state.budgets=state.budgets.filter(x=>String(x.id)!==String(id));persist();return true;}
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
function budgetSpentInCurrency(month,category='',targetCurrency='EGP'){
  const target=String(targetCurrency||'EGP').toUpperCase();
  let spent=0;const missingFx=[];
  const items=(state.transactions||[]).filter(t=>!t.deletedAt&&monthKey(t.date)===month&&(!category||String(t.category||'')===String(category))&&typeof isActualExpenseTx==='function'&&isActualExpenseTx(t));
  for(const t of items){
    const source=String(t.currency||'EGP').toUpperCase();
    const amount=Number(t.amount)||0;
    const inferredBaseRate=Number(t.baseAmount)>0&&Number(t.amount)>0?Number(t.baseAmount)/Number(t.amount):undefined;
    const lockedRate=t.exchangeRateAtCreation??t.currencyRate??inferredBaseRate;
    try{
      spent+=convertCurrencyAmount(amount,source,target,t.date||month+'-01',lockedRate);
    }catch(error){
      missingFx.push({currency:source,date:String(t.date||month+'-01'),message:error?.message||'سعر الصرف غير متاح'});
    }
  }
  return {spent:missingFx.length?null:round2(spent),missingFx};
}
function budgetSpentBase(month,category=''){
  const result=budgetSpentInCurrency(month,category,'EGP');
  if(result.spent===null)throw new Error(`تعذر حساب الميزانية بسبب أسعار صرف ناقصة: ${result.missingFx.map(x=>x.currency+' '+x.date).join('، ')}`);
  return result.spent;
}
function budgetStatus(b){
  const currency=String(b.currency||'EGP').toUpperCase();
  const result=budgetSpentInCurrency(b.month,b.category,currency);
  if(result.spent===null)return {spent:null,remaining:null,percent:null,exceeded:false,missingFx:result.missingFx};
  const spent=result.spent;
  return {spent,remaining:round2(Number(b.limit)-spent),percent:b.limit?round2(spent/Number(b.limit)*100):0,exceeded:spent>Number(b.limit),missingFx:[]};
}
function goalHasMovementHistory(goalId){
  return (state.goalMovements||[]).some(m=>String(m.goalId)===String(goalId))
    ||(state.auditLog||[]).some(e=>e.entity==='حركة هدف مالي'&&String(e.before?.goalId||e.after?.goalId||'')===String(goalId));
}
function saveGoal(g){
  ensureManagementState(); const target=Number(g.target);
  if(!String(g.name||'').trim()||!Number.isFinite(target)||target<=0) throw new Error('أدخل اسم الهدف ومبلغاً مستهدفاً صحيحاً');
  const currency='EGP';
  const existing=state.goals.find(x=>String(x.id)===String(g.id||''));
  const item={id:g.id||uid('goal'),name:String(g.name).trim(),target,saved:Math.max(0,Number(g.saved)||0),deadline:g.deadline||'',currency};
  const i=state.goals.findIndex(x=>x.id===item.id);
  if(i>=0) state.goals[i]=item; else state.goals.push(item);
  persist(); return item;
}
function recordGoalMovement(goalId,type,amount,note=''){
  const goal=state.goals.find(g=>String(g.id)===String(goalId)); const value=Number(amount);
  if(!goal) throw new Error('الهدف المالي غير موجود');
  if(!['deposit','withdraw'].includes(type)||!Number.isFinite(value)||value<=0) throw new Error('قيمة الحركة غير صحيحة');
  if(type==='withdraw'&&value>Number(goal.saved||0)) throw new Error('لا يمكن سحب مبلغ أكبر من المدخر للهدف');
  goal.saved=round2((Number(goal.saved)||0)+(type==='deposit'?value:-value));
  const movement={id:uid('goal-move'),goalId:String(goalId),type,amount:value,currency:'EGP',note:String(note||''),date:today(),at:new Date().toISOString()};
  state.goalMovements.unshift(movement); persist(); return movement;
}
function deleteGoalMovement(movementId){
  const movement=state.goalMovements.find(x=>String(x.id)===String(movementId));if(!movement)return false;
  const goal=state.goals.find(g=>String(g.id)===String(movement.goalId));
  if(goal){const delta=Number(movement.amount)||0;goal.saved=round2(Math.max(0,(Number(goal.saved)||0)+(movement.type==='deposit'?-delta:delta)));}
  state.goalMovements=state.goalMovements.filter(x=>String(x.id)!==String(movementId));
  auditRecord('حذف','حركة هدف مالي',movementId,movement,null);persist();return true;
}
function deleteGoal(id){
  const g=state.goals.find(x=>String(x.id)===String(id));if(!g)return false;
  if(goalHasMovementHistory(id)){toast('لا يمكن حذف هدف له حركات مالية محفوظة أو مؤرشفة. عالج سجل الحركات أولاً للحفاظ على إمكانية الاستعادة.');return false;}
  if(typeof auditRecord==='function')auditRecord('حذف','هدف مالي',g.id,g,null);
  state.goals=state.goals.filter(x=>String(x.id)!==String(id));persist();return true;
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
function amountFromBase(amount,currency,date){
  ensureManagementState(); const rate=getCurrencyRateToBase(currency,date);
  return round2(Number(amount||0)/rate);
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

function receiptDataUrlMatchesType(dataUrl,type){
  const match=String(dataUrl||'').match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);
  if(!match||match[1]!==type||typeof atob!=='function')return false;
  let bytes;try{bytes=atob(match[2]);}catch(_){return false;}
  const b=i=>bytes.charCodeAt(i)||0;
  if(type==='application/pdf')return bytes.startsWith('%PDF-');
  if(type==='image/png')return bytes.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>b(i)===v);
  if(type==='image/jpeg')return bytes.length>=3&&b(0)===255&&b(1)===216&&b(2)===255;
  if(type==='image/gif')return bytes.startsWith('GIF87a')||bytes.startsWith('GIF89a');
  if(type==='image/webp')return bytes.length>=12&&bytes.startsWith('RIFF',0)&&bytes.slice(8,12)==='WEBP';
  return false;
}
function attachReceiptToTransaction(txId,file){
  return new Promise((resolve,reject)=>{
    if(!file)return reject(new Error('لم يتم اختيار ملف'));
    if(!Number.isFinite(Number(file.size))||Number(file.size)<=0)return reject(new Error('ملف الإيصال فارغ أو غير صالح'));
    if(file.size>5*1024*1024)return reject(new Error('حجم الإيصال أكبر من 5 ميجابايت'));
    if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type||'') && file.type!=='application/pdf') return reject(new Error('نوع الإيصال يجب أن يكون صورة PNG/JPEG/WEBP/GIF أو PDF'));
    const tx=state.transactions.find(x=>String(x.id)===String(txId));
    if(!tx||tx.deletedAt)return reject(new Error('المعاملة غير موجودة أو مؤرشفة'));
    const rd=new FileReader();
    rd.onload=async()=>{
      const current=state.transactions.find(x=>String(x.id)===String(txId));
      if(!current||current.deletedAt)return reject(new Error('المعاملة لم تعد متاحة لإرفاق الإيصال'));
      if(!receiptDataUrlMatchesType(rd.result,file.type))return reject(new Error('محتوى الملف لا يطابق نوعه المعلن؛ تم رفض الإيصال'));
      const previous=JSON.parse(JSON.stringify(state));
      current.receipts=Array.isArray(current.receipts)?current.receipts:[];
      const receipt={id:uid('receipt'),name:String(file.name||'receipt').replace(/[\/\0-\x1f]/g,'_').slice(0,160),type:file.type,data:rd.result,size:file.size,addedAt:new Date().toISOString()};
      current.receipts.push(receipt);
      if(typeof auditRecord==='function')auditRecord('إرفاق إيصال','إيصال معاملة',`${current.id}:${receipt.id}`,null,{transactionId:current.id,receiptId:receipt.id,name:receipt.name,type:receipt.type,size:receipt.size,addedAt:receipt.addedAt});
      try{
        if(typeof commitCriticalWalletState==='function') await commitCriticalWalletState(previous,_autoSnapshotsMemory||[],'إرفاق الإيصال');
        else if(typeof persist==='function') persist();
        resolve(true);
      }catch(err){if(typeof restoreWalletStateAfterCriticalFailure==='function')restoreWalletStateAfterCriticalFailure(previous);else state=previous;reject(err);}
    };
    rd.onerror=()=>reject(new Error('تعذر قراءة الملف'));
    rd.readAsDataURL(file);
  });
}

function promptAttachReceipt(txId){
  if(!txId || !state.transactions.some(t=>String(t.id)===String(txId))) return toast('اختر معاملة أولاً');
  const input=document.createElement('input');input.type='file';input.accept='image/*,application/pdf';
  input.onchange=async()=>{try{await attachReceiptToTransaction(txId,input.files?.[0]);toast('تم إرفاق الإيصال بالمعاملة ✓');renderManagementHub();}catch(e){toast(e.message||'تعذر إرفاق الإيصال');}};input.click();
}
function openTransactionReceipt(txId,receiptId){
  const tx=state.transactions.find(x=>String(x.id)===String(txId)&&!x.deletedAt);const r=tx?.receipts?.find(x=>String(x.id)===String(receiptId)&&!x.deletedAt);if(!r?.data)return toast('ملف الإيصال غير موجود أو تمت إزالته');
  const a=document.createElement('a');a.href=r.data;a.download=r.name||'receipt';a.target='_blank';a.rel='noopener';a.click();
}
async function deleteTransactionReceipt(txId,receiptId){
  const tx=state.transactions.find(x=>String(x.id)===String(txId)&&!x.deletedAt);if(!tx)return false;
  const r=(tx.receipts||[]).find(x=>String(x.id)===String(receiptId)&&!x.deletedAt);if(!r)return false;
  const previous=JSON.parse(JSON.stringify(state));
  const before={transactionId:tx.id,receiptId:r.id,name:r.name,type:r.type,size:r.size,addedAt:r.addedAt};
  r.deletedAt=new Date().toISOString();
  if(typeof auditRecord==='function')auditRecord('إزالة إيصال','إيصال معاملة',`${tx.id}:${r.id}`,before,{deletedAt:r.deletedAt});
  try{
    if(typeof commitCriticalWalletState==='function') await commitCriticalWalletState(previous,_autoSnapshotsMemory||[],'إزالة الإيصال');
    else if(typeof persist==='function') persist();
    if(typeof renderManagementHub==='function')renderManagementHub();
    toast('تمت إزالة الإيصال مع الاحتفاظ بنسخة قابلة للاستعادة ✓');
    return true;
  }catch(err){if(typeof restoreWalletStateAfterCriticalFailure==='function')restoreWalletStateAfterCriticalFailure(previous);else state=previous;toast(err?.message||'تعذر إزالة الإيصال؛ تم الحفاظ على البيانات');return false;}
}
async function restoreDeletedReceiptFromAudit(entry){
  const before=entry?.before||{};
  const tx=(state.transactions||[]).find(x=>String(x.id)===String(before.transactionId)&&!x.deletedAt);
  const receipt=tx?.receipts?.find(x=>String(x.id)===String(before.receiptId)&&!!x.deletedAt);
  if(!tx||!receipt||!receipt.data)return toast('لا توجد نسخة إيصال قابلة للاستعادة أو أن المعاملة غير موجودة');
  if(!receiptDataUrlMatchesType(receipt.data,receipt.type))return toast('بيانات الإيصال المحفوظة تالفة؛ لم تتم الاستعادة');
  const previous=JSON.parse(JSON.stringify(state));
  delete receipt.deletedAt;
  receipt.restoredAt=new Date().toISOString();
  if(typeof auditRecord==='function')auditRecord('استعادة إيصال','إيصال معاملة',`${tx.id}:${receipt.id}`,null,{transactionId:tx.id,receiptId:receipt.id,name:receipt.name});
  try{
    if(typeof commitCriticalWalletState==='function') await commitCriticalWalletState(previous,_autoSnapshotsMemory||[],'استعادة الإيصال');
    else if(typeof persist==='function') persist();
    if(typeof renderManagementHub==='function')renderManagementHub();
    toast('تمت استعادة الإيصال ✓');
    return true;
  }catch(err){if(typeof restoreWalletStateAfterCriticalFailure==='function')restoreWalletStateAfterCriticalFailure(previous);else state=previous;toast(err?.message||'تعذر استعادة الإيصال');return false;}
}


/* Operational helpers for the management screen. Forecasts are explicitly indicative. */
function addRecurringFromUI(){
  try{
    const rule=addRecurringRule({
      type:val('mgRecType')||'expense', amount:num('mgRecAmount'),
      category:val('mgRecCat').trim(), day:num('mgRecDay')||1,
      accountId:val('mgRecAccount')||'', note:val('mgRecNote').trim(),
      currency:'EGP', startMonth:selected()
    });
    if(rule){toast('تمت إضافة المعاملة المتكررة ✓');renderManagementHub();}
  }catch(err){toast(err?.message||'تعذر إضافة المعاملة المتكررة');}
}
function addGoalMovementFromUI(goalId,type){
  try{
    const amount=num('goalMoveAmt_'+goalId);
    recordGoalMovement(goalId,type,amount);
    toast(type==='deposit'?'تم تسجيل الإيداع ✓':'تم تسجيل السحب ✓');
    renderManagementHub();
  }catch(err){toast(err?.message||'تعذر تسجيل حركة الهدف');}
}
function currentTransactionSearchFilters(){
  return {type:val('mgSearchType')||'',dateFrom:val('mgSearchFrom')||'',dateTo:val('mgSearchTo')||'',accountId:val('mgSearchAccount')||'',category:val('mgSearchCategory')||''};
}
function searchManagementTransactions(){
  const host=document.getElementById('mgSearchResults'); if(!host)return;
  const q=val('mgSearchTx');
  const filters=currentTransactionSearchFilters();
  const rows=searchTransactionsAdvanced(q,filters).slice(0,50);
  host.innerHTML=rows.length?rows.map(t=>`<div class="c-row"><span>${esc(t.date||'')} · ${esc(t.category||t.type||'')} · ${esc(t.note||t.description||'')}</span><b>${fmt(t.amount)} ${esc(t.currency||'EGP')}</b></div>`).join(''):'<div class="empty">لا توجد نتائج مطابقة</div>';
}
function saveTransactionSearchFromUI(){
  const name=val('mgSearchName').trim(); if(!name)return toast('اكتب اسمًا للفلاتر المحفوظة');
  const item={id:uid('search'),name,query:val('mgSearchTx').trim(),filters:currentTransactionSearchFilters(),updatedAt:new Date().toISOString()};
  const old=state.savedTransactionFilters.find(x=>normalizeDuplicateText(x.name)===normalizeDuplicateText(name));
  if(old){item.id=old.id;Object.assign(old,item);}else state.savedTransactionFilters.unshift(item);
  state.savedTransactionFilters=state.savedTransactionFilters.slice(0,30);
  persist();renderManagementHub();toast('تم حفظ الفلتر ✓');
}
function applySavedTransactionSearch(id){
  const item=state.savedTransactionFilters.find(x=>String(x.id)===String(id));if(!item)return;
  setv('mgSearchTx',item.query||'');
  const f=item.filters||{};setv('mgSearchType',f.type||'');setv('mgSearchFrom',f.dateFrom||'');setv('mgSearchTo',f.dateTo||'');setv('mgSearchAccount',f.accountId||'');setv('mgSearchCategory',f.category||'');
  searchManagementTransactions();
}
function deleteSavedTransactionSearch(id){
  const item=state.savedTransactionFilters.find(x=>String(x.id)===String(id));if(!item)return false;
  state.savedTransactionFilters=state.savedTransactionFilters.filter(x=>String(x.id)!==String(id));persist();renderManagementHub();return true;
}
function saveFinancialAlertRuleFromUI(type){
  const enabled=!!document.getElementById('alertEnabled_'+type)?.checked;
  const index=state.alertRules.findIndex(x=>x.type===type);
  const before=index>=0?JSON.parse(JSON.stringify(state.alertRules[index])):null;
  const rule={...(index>=0?state.alertRules[index]:{}),type,enabled};
  if(type==='budget-near-limit'){
    const threshold=Number(document.getElementById('alertThreshold_'+type)?.value);
    if(!Number.isFinite(threshold)||threshold<1||threshold>100)return toast('نسبة التنبيه يجب أن تكون من 1 إلى 100');
    rule.thresholdPercent=threshold;
  }
  if(index>=0)state.alertRules[index]=rule;else state.alertRules.push(rule);
  auditRecord(before?'تعديل':'إضافة','قاعدة تنبيه مالي',type,before,rule);persist();renderManagementHub();toast('تم تحديث إعداد التنبيه ✓');
}
function financialAlertRule(type){
  const r=state.alertRules.find(x=>x.type===type);return r||{type,enabled:false,thresholdPercent:80};
}
function setDuplicateReview(firstId,duplicateId,status){
  ensureManagementState();
  if(!['not-duplicate','confirmed-duplicate'].includes(status))return false;
  state.duplicateReviews=Array.isArray(state.duplicateReviews)?state.duplicateReviews:[];
  const key=[String(firstId),String(duplicateId)].sort().join('|');
  const old=state.duplicateReviews.find(x=>x.key===key);
  if(old){old.status=status;old.reviewedAt=new Date().toISOString();}
  else state.duplicateReviews.unshift({key,firstId:String(firstId),duplicateId:String(duplicateId),status,reviewedAt:new Date().toISOString()});
  auditRecord('مراجعة','احتمال تكرار',key,null,{status});persist();renderManagementHub();return true;
}
function restoreCancelledTransaction(transactionId){
  ensureManagementState();
  const index=state.cancelledTransactions.findIndex(x=>String(x.transaction?.id||x.id)===String(transactionId));
  if(index<0)return false;
  const archive=state.cancelledTransactions[index];
  const tx=JSON.parse(JSON.stringify(archive.transaction||archive));
  if((state.transactions||[]).some(x=>String(x.id)===String(tx.id)))return false;
  const related=archive.related||{};
  if(tx.linkedTransferLedgerId && !(state.ledger||[]).some(x=>String(x.id)===String(tx.linkedTransferLedgerId)))return false;
  if(tx.linkedCardOpId){
    const linkedOp=(state.cardOps||[]).find(x=>String(x.id)===String(tx.linkedCardOpId));
    if(!linkedOp || !(state.cards||[]).some(c=>String(c.id)===String(linkedOp.cardId)))return false;
    const payRecord=(state.cardPayments||[]).find(x=>String(x.id)===String(tx.linkedCardPaymentRecordId||''))||related.cardPayment;
    if(tx.linkedCardPaymentRecordId&&!payRecord)return false;
    if(payRecord&&(String(payRecord.cardId)!==String(linkedOp.cardId)||(payRecord.cardOpId&&String(payRecord.cardOpId)!==String(tx.linkedCardOpId))))return false;
  }
  if(tx.linkedCommitmentPaymentId||related.commitmentPayment){
    const paymentRecord=(state.commitmentPayments||[]).find(x=>String(x.id)===String(tx.linkedCommitmentPaymentId||''))||related.commitmentPayment;
    if(!paymentRecord || !(state.commitments||[]).some(c=>String(c.id)===String(paymentRecord.commitmentId)))return false;
    if(tx.linkedCommitmentPaymentId&&String(paymentRecord.id)!==String(tx.linkedCommitmentPaymentId))return false;
  }
  if(related.cardPurchaseOp){
    const op=JSON.parse(JSON.stringify(related.cardPurchaseOp));
    if(!(state.cards||[]).some(c=>String(c.id)===String(op.cardId)))return false;
    if((state.cardOps||[]).some(x=>String(x.id)===String(op.id)))return false;
    state.cardOps.push(op);
  }
  state.transactions.push(tx);
  if(tx.linkedCardOpId && related.cardOp && !(state.cardOps||[]).some(x=>String(x.id)===String(related.cardOp.id))){state.transactions=state.transactions.filter(x=>String(x.id)!==String(tx.id));if(related.cardPurchaseOp)state.cardOps=state.cardOps.filter(x=>String(x.id)!==String(related.cardPurchaseOp.id));return false;}
  if(related.commitmentPayment && !(state.commitmentPayments||[]).some(x=>String(x.id)===String(related.commitmentPayment.id)))state.commitmentPayments.push(related.commitmentPayment);
  if(related.cardPayment && !(state.cardPayments||[]).some(x=>String(x.id)===String(related.cardPayment.id)))state.cardPayments.push(related.cardPayment);
  if(related.cardOp){
    const op=(state.cardOps||[]).find(x=>String(x.id)===String(related.cardOp.id));
    if(op){
      const amount=Number(tx.settledAmount??tx.amount)||0;
      if(tx.linkedCardPayKind==='card_swipe')op.paid=round2((Number(op.paid)||0)+amount);
      else if(tx.linkedCardPayKind==='card_fee')op.feePaid=round2((Number(op.feePaid)||0)+amount);
      else if(tx.linkedCardPayKind==='card_inst'){
        const sc=(op.schedules||[]).find(x=>String(x.month)===String(tx.linkedCardPayMonth));
        if(sc)sc.paid=round2((Number(sc.paid)||0)+amount);
      }
    }
  }
  state.cancelledTransactions.splice(index,1);
  if(related.cardPurchaseOp && typeof syncCardInstallmentsToCommitments==='function')syncCardInstallmentsToCommitments();
  auditRecord('استعادة','معاملة',tx.id,null,tx);persist();return true;
}
async function restoreDeletedAuditEntity(auditId){
  const entry=(state.auditLog||[]).find(x=>String(x.id)===String(auditId));
  if(entry?.action==='إزالة إيصال' && entry.entity==='إيصال معاملة') return await restoreDeletedReceiptFromAudit(entry);
  if(!entry)return toast('لا توجد بيانات كافية للاستعادة');
  const previous=JSON.parse(JSON.stringify(state));
  const rollbackSnapshots=typeof _autoSnapshotsMemory!=='undefined'&&Array.isArray(_autoSnapshotsMemory)?JSON.parse(JSON.stringify(_autoSnapshotsMemory)):[];
  const commitRestore=async label=>{
    try{
      if(typeof commitCriticalWalletState==='function') await commitCriticalWalletState(previous,rollbackSnapshots,label);
      else if(typeof persist==='function') persist();
      if(typeof renderAll==='function')renderAll();
      if(typeof renderManagementHub==='function')renderManagementHub();
      toast('تمت استعادة العنصر وحفظه والتحقق من التخزين المحلي ✓');
      return true;
    }catch(err){
      const restored=typeof restoreWalletStateAfterCriticalFailure==='function'?restoreWalletStateAfterCriticalFailure(previous):(state=previous,true);
      if(restored){try{applyPreferences?.();renderAll?.();renderManagementHub?.();}catch(_){}}
      toast(err?.message||'تعذرت الاستعادة؛ تم الحفاظ على البيانات السابقة');
      return false;
    }
  };
  if(entry.entity==='معاملة' && (state.cancelledTransactions||[]).some(x=>String(x.transaction?.id||x.id)===String(entry.entityId))){
    if(!restoreCancelledTransaction(entry.entityId))return false;
    return await commitRestore('استعادة المعاملة من سجل التدقيق');
  }
  if(entry.action!=='حذف'||!entry.before)return toast('لا توجد بيانات كافية للاستعادة');
  const map={'معاملة':'transactions','حساب':'accounts','بطاقة':'cards','عملية بطاقة':'cardOps','سداد بطاقة':'cardPayments','التزام':'commitments','سداد التزام':'commitmentPayments','حركة حساب':'ledger','ميزانية':'budgets','هدف مالي':'goals','حركة هدف مالي':'goalMovements','قاعدة متكررة':'recurringRules','عملة':'currencies','سعر صرف':'currencyRates','بند خطة سنوية':'annualPlanItems','قسم مصروف':'categories','قسم دخل':'incomeCategories'};
  const key=map[entry.entity]; if(!key)return toast('استعادة هذا النوع غير مدعومة');
  const collection=Array.isArray(state[key])?state[key]:(state[key]=[]);
  const stringCategory=['categories','incomeCategories'].includes(key);
  if(collection.some(x=>stringCategory?String(x)===String(entry.before):String(x?.id)===String(entry.entityId)))return toast('العنصر موجود بالفعل');
  if(entry.entity==='معاملة' && (entry.before.linkedCardOpId||entry.before.linkedCommitmentPaymentId||entry.before.linkedCardPaymentRecordId))return toast('بيانات الحركة المرتبطة غير متاحة في الأرشيف؛ لا يمكن استعادتها بأمان');
  if(entry.entity==='معاملة' && entry.before.accountId && !(state.accounts||[]).some(x=>String(x.id)===String(entry.before.accountId)))return toast('لا يمكن استعادة المعاملة قبل استعادة الحساب المرتبط بها');
  if(entry.entity==='عملية بطاقة' && !(state.cards||[]).some(x=>String(x.id)===String(entry.before.cardId)))return toast('لا يمكن استعادة عملية البطاقة قبل استعادة البطاقة المرتبطة بها');
  if(entry.entity==='سداد بطاقة' && entry.before.cardId && !(state.cards||[]).some(x=>String(x.id)===String(entry.before.cardId)))return toast('لا يمكن استعادة السداد قبل استعادة البطاقة المرتبطة به');
  if(entry.entity==='سداد التزام' && entry.before.commitmentId && !(state.commitments||[]).some(x=>String(x.id)===String(entry.before.commitmentId)))return toast('لا يمكن استعادة السداد قبل استعادة الالتزام المرتبط به');
  if(entry.entity==='التزام' && entry.before.cardOpId && !(state.cardOps||[]).some(x=>String(x.id)===String(entry.before.cardOpId)))return toast('لا يمكن استعادة الالتزام قبل استعادة عملية البطاقة المرتبطة به');
  if(entry.entity==='حركة حساب' && ((entry.before.from && !(state.accounts||[]).some(x=>String(x.id)===String(entry.before.from))) || (entry.before.to && !(state.accounts||[]).some(x=>String(x.id)===String(entry.before.to)))))return toast('لا يمكن استعادة التحويل قبل استعادة الحسابات المرتبطة به');
  if(entry.entity==='حركة حساب'&&entry.before.type==='transfer'&&entry.before.from&&entry.before.to){
    try{validateTransferCurrencies(entry.before.from,entry.before.to,entry.before.date||today(),entry.before.fromExchangeRateAtCreation??entry.before.exchangeRateAtCreation,entry.before.toExchangeRateAtCreation??entry.before.exchangeRateAtCreation);}
    catch(err){return toast(err.message);}
  }
  if(entry.entity==='حركة هدف مالي' && entry.before.goalId && !(state.goals||[]).some(x=>String(x.id)===String(entry.before.goalId)))return toast('لا يمكن استعادة حركة الهدف قبل استعادة الهدف المرتبط بها');
  if(entry.entity==='معاملة' && entry.before.source?.startsWith('card-purchase:')){
    const opId=entry.before.source.slice('card-purchase:'.length);
    if(!(state.cardOps||[]).some(x=>String(x.id)===opId))return toast('لا يمكن استعادة شراء البطاقة دون العملية المرتبطة؛ أعد تسجيل العملية من شاشة البطاقة');
  }
  collection.push(JSON.parse(JSON.stringify(entry.before)));
  auditRecord('استعادة محذوف','عنصر مالي',entry.entityId,null,{entity:entry.entity});
  return await commitRestore('استعادة عنصر من سجل التدقيق');
}
function calculateFinancialPosition(){
  const assets=typeof allAccountsAvailable==='function'?allAccountsAvailable():0;
  const cardLiabilities=typeof allCardsOutstanding==='function'?allCardsOutstanding():0;
  return {assets:round2(assets),cardLiabilities:round2(cardLiabilities),netLiquidity:round2(assets-cardLiabilities),scope:'أرصدة الحسابات ناقص مديونية البطاقات؛ لا يشمل الأصول أو الديون خارج التطبيق'};
}
function buildTransactionsCsv(){
  const accountNames=new Map((state.accounts||[]).map(a=>[String(a.id),a.name]));
  const columns=['التاريخ','النوع','القسم','القسم الفرعي','الوصف','المبلغ','العملة','الحساب'];
  const quote=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
  const rows=(state.transactions||[]).filter(t=>!t.deletedAt).map(t=>[
    t.date,t.type,t.category,t.subCategory,t.note||t.description||t.title,t.amount,t.currency||'EGP',accountNames.get(String(t.accountId))||''
  ]);
  return '\uFEFF'+[columns,...rows].map(row=>row.map(quote).join(',')).join('\r\n');
}
function downloadTransactionsCsv(){
  try{const blob=new Blob([buildTransactionsCsv()],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='X-Wallet-Transactions-'+today()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('تم تصدير سجل المعاملات لبرنامج Excel ✓');}
  catch(err){toast('تعذر تصدير ملف Excel: '+(err?.message||''));}
}
function commitmentScheduledInMonth(commitment,ym){
  if(!commitment)return false;
  if(commitment.freq==='once'){
    const dueYM=commitment.dueDate?String(commitment.dueDate).slice(0,7):String(commitment.start||'');
    return dueYM===String(ym);
  }
  return commitmentDue(commitment,ym);
}
function forecastCashFlow(monthCount=3){
  const count=Math.max(1,Math.min(12,Math.round(Number(monthCount)||3)));
  const now=new Date();const currentYM=selected();
  const history=[];
  for(let i=3;i>=1;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);const ym=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    const txs=monthTx(ym);
    const income=round2(txs.filter(t=>t.type==='income'&&!t.recurringRuleId).reduce((a,t)=>a+transactionBaseAmount(t),0));
    const expense=round2(txs.filter(t=>isActualExpenseTx(t)&&!t.recurringRuleId&&t.source!=='commitment-payment').reduce((a,t)=>a+transactionBaseAmount(t),0));
    history.push({month:ym,income,expense,net:round2(income-expense)});
  }
  const avgNet=history.length?round2(history.reduce((a,x)=>a+x.net,0)/history.length):0;
  let opening=null;
  let openingErrors=[];
  try{opening=allAccountsAvailable();}catch(error){openingErrors=[{currency:'أرصدة الحسابات',message:error?.message||'تعذر تحويل أرصدة الحسابات إلى الجنيه'}];}
  const months=[];
  for(let i=1;i<=count;i++){
    const d=new Date(now.getFullYear(),now.getMonth()+i,1);const ym=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    const conversionErrors=openingErrors.slice();
    const toBase=(amount,currency,date)=>{
      const numeric=Number(amount)||0;if(Math.abs(numeric)<0.0000001)return 0;
      try{return amountToBase(numeric,currency||'EGP',undefined,date||ym+'-01');}
      catch(error){conversionErrors.push({currency:String(currency||'EGP').toUpperCase(),message:error?.message||'سعر الصرف غير متاح'});return null;}
    };
    const sumConverted=(items,mapper)=>items.reduce((sum,item)=>{
      const value=mapper(item);return value===null?sum:sum+value;
    },0);
    const recurringItems=(state.recurringRules||[]).filter(r=>r.active!==false&&(!r.startMonth||ym>=r.startMonth)&&(!r.endMonth||ym<=r.endMonth)&&(r.frequency||'monthly')==='monthly');
    const recurringNet=round2(sumConverted(recurringItems,r=>{
      const amount=toBase(Number(r.amount)||0,r.currency||'EGP',ym+'-01');
      return amount===null?null:(r.type==='income'?amount:-amount);
    }));
    const commitmentItems=(state.commitments||[]).filter(c=>!c.cardOpId&&commitmentScheduledInMonth(c,ym));
    const regularCommitments=round2(sumConverted(commitmentItems,c=>{
      const paid=(state.commitmentPayments||[]).filter(p=>String(p.commitmentId)===String(c.id)&&((c.freq==='once')||String(p.month||'')===ym)).reduce((sum,p)=>sum+(Number(p.amount)||0),0);
      const remaining=Math.max(0,(Number(c.amount)||0)-paid);
      return toBase(remaining,c.currency||'EGP',c.dueDate||ym+'-01');
    }));
    // Pay-in-full card purchases must be included in the month in which the card statement is due.
    const swipeItems=(state.cardOps||[]).filter(op=>{
      if(op.type!=='swipe'||op.deletedAt)return false;
      const dueYM=op.dueDate?String(op.dueDate).slice(0,7):addMonthsYM(op.purchaseMonth||monthKey(op.date),1);
      return dueYM===ym;
    });
    const cardSwipeDues=round2(sumConverted(swipeItems,op=>{
      const remaining=Math.max(0,(Number(op.amount)||0)-(Number(op.paid)||0));
      const card=(state.cards||[]).find(c=>String(c.id)===String(op.cardId));
      return toBase(remaining,op.currency||card?.currency||'EGP',op.dueDate||ym+'-01');
    }));
    // Use the actual per-month installment schedule, including its final rounding adjustment.
    const installmentOps=(state.cardOps||[]).filter(op=>op.type==='installment'&&!op.deletedAt);
    const cardInstallments=round2(sumConverted(installmentOps,op=>{
      const card=(state.cards||[]).find(c=>String(c.id)===String(op.cardId));
      const due=(op.schedules||[]).filter(sc=>String(sc.month)===ym).reduce((n,sc)=>n+Math.max(0,(Number(sc.amount)||0)-(Number(sc.paid)||0)),0);
      return toBase(due,op.currency||card?.currency||'EGP',ym+'-01');
    }));
    // Administrative fees are separate dues and are not part of installment principal schedules.
    const feeOps=installmentOps.filter(op=>String(op.feeMonth||'')===ym&&(Number(op.feeDue)||0)>(Number(op.feePaid)||0));
    const cardFees=round2(sumConverted(feeOps,op=>{
      const card=(state.cards||[]).find(c=>String(c.id)===String(op.cardId));
      return toBase(Math.max(0,(Number(op.feeDue)||0)-(Number(op.feePaid)||0)),op.currency||card?.currency||'EGP',ym+'-01');
    }));
    const hasFxErrors=conversionErrors.length>0;
    const commitments=hasFxErrors?null:round2(regularCommitments+cardSwipeDues+cardInstallments+cardFees);
    const projectedNet=hasFxErrors?null:round2(avgNet+recurringNet-commitments);
    const start=opening;
    const closing=projectedNet===null||start===null?null:round2(start+projectedNet);
    months.push({month:ym,opening:start,baselineNet:avgNet,recurringNet:hasFxErrors?null:round2(recurringNet),commitments,regularCommitments:hasFxErrors?null:round2(regularCommitments),cardSwipeDues:hasFxErrors?null:round2(cardSwipeDues),cardInstallments:hasFxErrors?null:round2(cardInstallments),cardFees:hasFxErrors?null:round2(cardFees),net:projectedNet,closing,conversionErrors});
    opening=closing;
  }
  return {months,method:'average-3-completed-months-plus-known-recurring-and-commitments',averageNet:avgNet,history,currentMonth:currentYM};
}
function evaluateFinancialAlerts(){
  ensureManagementState();const alerts=[];const ym=selected();
  const exceededRule=financialAlertRule('budget-exceeded');
  const nearRule=financialAlertRule('budget-near-limit');
  for(const b of state.budgets){
    if(b.month!==ym)continue;const st=budgetStatus(b);
    if(st.spent===null){
      alerts.push({type:'budget-fx-missing',title:'تعذر حساب ميزانية بسبب سعر صرف ناقص',detail:`${b.category||'كل التصنيفات'}: ${[...new Set((st.missingFx||[]).map(x=>x.currency))].join('، ')}`});
      continue;
    }
    if(st.exceeded&&exceededRule.enabled!==false)alerts.push({type:'budget',title:'تم تجاوز الميزانية',detail:`${b.category||'كل التصنيفات'}: التجاوز ${fmt(Math.abs(st.remaining))} ${b.currency}`});
    else if(!st.exceeded&&nearRule.enabled!==false&&st.percent>=Math.max(1,Math.min(100,Number(nearRule.thresholdPercent)||80)))alerts.push({type:'budget-near-limit',title:'اقتربت من حد الميزانية',detail:`${b.category||'كل التصنيفات'}: استهلاك ${fmt(st.percent)}% من الحد`});
  }
  if(financialAlertRule('commitment-unpaid').enabled!==false){
    for(const c of state.commitments||[]){
      if(c.cardOpId||!commitmentScheduledInMonth(c,ym))continue;
      const paid=round2((state.commitmentPayments||[]).filter(p=>String(p.commitmentId)===String(c.id)&&((c.freq==='once')||String(p.month||'')===ym)).reduce((a,p)=>a+(Number(p.amount)||0),0));
      const remaining=round2(Math.max(0,(Number(c.amount)||0)-paid));
      if(remaining>0.009)alerts.push({type:'commitment',title:'التزام غير مسدد بالكامل',detail:`${c.title}: متبقي ${fmt(remaining)} ${String(c.currency||'EGP').toUpperCase()} خلال ${formatYMArabic(ym)}`});
    }
    for(const op of state.cardOps||[]){
      if(op.deletedAt)continue;
      const card=(state.cards||[]).find(c=>String(c.id)===String(op.cardId));
      const currency=String(op.currency||card?.currency||'EGP').toUpperCase();
      if(op.type==='swipe'){
        const dueYM=op.dueDate?String(op.dueDate).slice(0,7):addMonthsYM(op.purchaseMonth||monthKey(op.date),1);
        if(dueYM===ym){
          const remaining=round2(Math.max(0,(Number(op.amount)||0)-(Number(op.paid)||0)));
          if(remaining>0.009)alerts.push({type:'card-swipe-unpaid',title:'مشتريات بطاقة غير مسددة بالكامل',detail:`${op.title||card?.name||'بطاقة'}: متبقي ${fmt(remaining)} ${currency} خلال ${formatYMArabic(ym)}`});
        }
      }else if(op.type==='installment'){
        const schedule=(op.schedules||[]).find(x=>String(x.month)===ym);
        if(schedule){
          const remaining=round2(Math.max(0,(Number(schedule.amount)||0)-(Number(schedule.paid)||0)));
          if(remaining>0.009)alerts.push({type:'card-installment-unpaid',title:'قسط بطاقة غير مسدد بالكامل',detail:`${op.title||card?.name||'بطاقة'}: متبقي ${fmt(remaining)} ${currency} خلال ${formatYMArabic(ym)}`});
        }
        if(String(op.feeMonth||'')===ym){
          const remaining=round2(Math.max(0,(Number(op.feeDue)||0)-(Number(op.feePaid)||0)));
          if(remaining>0.009)alerts.push({type:'card-fee-unpaid',title:'رسوم بطاقة غير مسددة بالكامل',detail:`${op.title||card?.name||'بطاقة'}: متبقي ${fmt(remaining)} ${currency} خلال ${formatYMArabic(ym)}`});
        }
      }
    }
  }
  if(financialAlertRule('negative-balance').enabled!==false)for(const a of state.accounts||[]){const balance=accountBalance(a);if(balance<0)alerts.push({type:'negative-balance',title:'رصيد حساب سالب',detail:`${a.name}: ${fmt(balance)} ${a.currency||'EGP'}`});}
  return alerts;
}
function editRecurringRuleUI(id){
  const r=state.recurringRules.find(x=>String(x.id)===String(id));if(!r)return;
  const accountOptions=(state.accounts||[]).map(a=>`<option value="${esc(a.id)}" ${String(a.id)===String(r.accountId)?'selected':''}>${esc(a.name)}</option>`).join('');
  const html=`<div class="c-list"><div class="c-row"><label>النوع</label><select id="editRecType"><option value="expense" ${r.type==='expense'?'selected':''}>مصروف</option><option value="income" ${r.type==='income'?'selected':''}>دخل</option></select></div><div class="c-row"><label>المبلغ</label><input id="editRecAmount" type="number" min=".01" step=".01" value="${Number(r.amount)||0}"></div><div class="c-row"><label>القسم</label><input id="editRecCat" value="${esc(r.category||'')}"></div><div class="c-row"><label>يوم التنفيذ</label><input id="editRecDay" type="number" min="1" max="31" value="${Number(r.day)||1}"></div><div class="c-row"><label>الحساب</label><select id="editRecAccount">${accountOptions}</select></div><div class="c-row"><label>الوصف</label><input id="editRecNote" value="${esc(r.note||'')}"></div><div class="c-row"><label>من شهر</label><input id="editRecStart" type="month" value="${esc(r.startMonth||selected())}"></div><div class="c-row"><label>حتى شهر (اختياري)</label><input id="editRecEnd" type="month" value="${esc(r.endMonth||'')}"></div></div>`;
  showAppCustomForm('تعديل المعاملة المتكررة',html,()=>{try{updateRecurringRule(id,{type:val('editRecType'),amount:num('editRecAmount'),category:val('editRecCat'),day:num('editRecDay'),accountId:val('editRecAccount'),currency:'EGP',note:val('editRecNote'),startMonth:val('editRecStart'),endMonth:val('editRecEnd')});renderManagementHub();toast('تم تحديث قاعدة التكرار ✓');return true;}catch(e){toast(e.message||'تعذر التعديل');return false;}},true);
}
function editBudgetUI(id){
  const b=state.budgets.find(x=>String(x.id)===String(id));if(!b)return;
  const html=`<div class="c-list"><div class="c-row"><label>القسم</label><input id="editBudgetCat" value="${esc(b.category||'')}"></div><div class="c-row"><label>الشهر</label><input id="editBudgetMonth" type="month" value="${esc(b.month)}"></div><div class="c-row"><label>الحد</label><input id="editBudgetLimit" type="number" min=".01" step=".01" value="${Number(b.limit)||0}"></div></div>`;
  showAppCustomForm('تعديل الميزانية',html,()=>{try{saveBudget({...b,category:val('editBudgetCat'),month:val('editBudgetMonth'),limit:num('editBudgetLimit'),currency:'EGP'});renderManagementHub();toast('تم تحديث الميزانية ✓');return true;}catch(e){toast(e.message||'تعذر التعديل');return false;}},true);
}
function editGoalUI(id){
  const g=state.goals.find(x=>String(x.id)===String(id));if(!g)return;
  const hasMovements=goalHasMovementHistory(g.id);
  const currencyControl='';
  const html=`<div class="c-list"><div class="c-row"><label>اسم الهدف</label><input id="editGoalName" value="${esc(g.name)}"></div><div class="c-row"><label>المبلغ المستهدف</label><input id="editGoalTarget" type="number" min=".01" step=".01" value="${Number(g.target)||0}"></div><div class="c-row"><label>تاريخ مستهدف</label><input id="editGoalDeadline" type="date" value="${esc(g.deadline||'')}"></div>${currencyControl}</div>`;
  showAppCustomForm('تعديل الهدف المالي',html,()=>{try{saveGoal({...g,name:val('editGoalName'),target:num('editGoalTarget'),deadline:val('editGoalDeadline'),currency:'EGP'});renderManagementHub();toast('تم تحديث الهدف ✓');return true;}catch(e){toast(e.message||'تعذر التعديل');return false;}},true);
}
function forecastCashFlowSummaryHtml(monthCount=3){
  const result=forecastCashFlow(monthCount);
  return result.months.map(m=>{
    if(m.closing===null||m.opening===null){
      const missing=[...new Set((m.conversionErrors||[]).map(e=>e.currency))].join('، ')||'سعر صرف غير متاح';
      return `<div class="c-row"><span>${esc(m.month)}</span><b style="color:var(--red)">تعذر حساب التوقع · ${esc(missing)}</b></div>`;
    }
    return `<div class="c-row"><span>${esc(m.month)} · افتتاحي ${fmt(m.opening)}</span><b>${fmt(m.closing)} EGP</b></div>`;
  }).join('');
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

function downloadEncryptedBackup(){
  showAppPrompt('تشفير النسخة الاحتياطية','كلمة مرور قوية (10 أحرف على الأقل)','',async pass=>{
    try{const blobText=await createEncryptedBackupDocument(state,pass);const blob=new Blob([blobText],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='x-wallet-encrypted-'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('تم إنشاء نسخة مشفرة ✓');}catch(e){toast(e.message||'تعذر إنشاء النسخة المشفرة');}
  },false,'password');
}
function chooseEncryptedBackupRestore(){
  const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
  input.onchange=()=>{const file=input.files?.[0];if(!file)return;showAppPrompt('استعادة نسخة مشفرة','أدخل كلمة مرور النسخة','',async pass=>{try{const parsed=await parseEncryptedBackupDocument(await file.text(),pass);await applyImportedBackupState(parsed,'ملف مشفر',true);}catch(e){toast(e.message||'تعذرت الاستعادة');}},false,'password');};input.click();
}
