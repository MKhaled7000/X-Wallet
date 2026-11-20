/* X-Wallet V15.1.4 — one-time, rollback-safe normalization to EGP only. */
function singleCurrencyRate(sourceState, code, date, lockedRate, value, baseValue){
  const currency=String(code||'EGP').toUpperCase();
  if(currency==='EGP')return 1;
  const locked=Number(lockedRate);
  if(lockedRate!==undefined&&lockedRate!==null&&lockedRate!==''&&Number.isFinite(locked)&&locked>0)return locked;
  const amount=Number(value),base=Number(baseValue);
  if(baseValue!==undefined&&baseValue!==null&&baseValue!==''&&Number.isFinite(base)&&Number.isFinite(amount)&&Math.abs(amount)>1e-9){
    const inferred=base/amount;if(Number.isFinite(inferred)&&inferred>0)return inferred;
  }
  const day=String(date||today()).slice(0,10);
  const entries=(sourceState.currencyRates||[]).filter(x=>String(x.code||'').toUpperCase()===currency&&String(x.effectiveDate||'')<=day).sort((a,b)=>String(b.effectiveDate||'').localeCompare(String(a.effectiveDate||'')));
  const historical=Number(entries[0]?.rate);if(Number.isFinite(historical)&&historical>0)return historical;
  const current=(sourceState.currencies||[]).find(x=>String(x.code||'').toUpperCase()===currency);
  const currentRate=Number(current?.rate),currentDate=String(current?.updatedAt||'');
  if(currentDate&&currentDate>day)throw new Error(`لا يوجد سعر صرف تاريخي صالح للعملة ${currency} بتاريخ ${day}`);
  if(Number.isFinite(currentRate)&&currentRate>0)return currentRate;
  throw new Error(`تعذر توحيد العملة ${currency}: لا يوجد سعر صرف موثوق بتاريخ ${day}. لم يتم تغيير البيانات.`);
}
function singleCurrencyConvertField(obj, field, currencyField='currency', rateField='exchangeRateAtCreation', baseField=null, dateField='date'){
  if(!obj||typeof obj!=='object'||obj[field]===undefined||obj[field]===null||obj[field]==='')return 0;
  const value=Number(obj[field]);if(!Number.isFinite(value))throw new Error(`قيمة مالية غير صالحة في الحقل ${field}`);
  const currency=String(obj[currencyField]||'EGP').toUpperCase();
  if(Math.abs(value)<1e-12){obj[field]=0;if(baseField)obj[baseField]=0;return 0;}
  const date=obj[dateField]||obj.createdAt||today();
  const hasTrustedBase=!!(baseField&&obj[baseField]!==undefined&&obj[baseField]!==null&&obj[baseField]!==''&&Number.isFinite(Number(obj[baseField])));
  // A previously locked EGP/base amount is already the historical result; do not
  // require a second FX lookup or convert it again.
  const rate=hasTrustedBase?1:singleCurrencyRate(singleCurrencySourceState,currency,date,obj[rateField],value,undefined);
  const converted=round2(hasTrustedBase?Number(obj[baseField]):value*rate);
  obj[field]=converted;
  if(baseField)obj[baseField]=converted;
  return currency==='EGP'?0:1;
}
let singleCurrencySourceState=null;
function singleCurrencyNormalizeTransaction(tx){
  if(!tx||typeof tx!=='object')return 0;let count=0;
  tx.feeCurrency=tx.feeCurrency||tx.currency||'EGP';tx.settledCurrency=tx.settledCurrency||tx.currency||'EGP';tx.accountCurrency=tx.accountCurrency||tx.currency||'EGP';
  count+=singleCurrencyConvertField(tx,'amount','currency','exchangeRateAtCreation','baseAmount');
  count+=singleCurrencyConvertField(tx,'fee','feeCurrency','feeExchangeRateAtCreation','feeBaseAmount');
  count+=singleCurrencyConvertField(tx,'settledAmount','settledCurrency','settledExchangeRateAtCreation','settledBaseAmount');
  count+=singleCurrencyConvertField(tx,'accountAmount','accountCurrency','accountExchangeRateAtCreation','accountBaseAmount');
  tx.currency='EGP';tx.feeCurrency='EGP';tx.settledCurrency='EGP';tx.accountCurrency='EGP';
  tx.exchangeRateAtCreation=1;tx.feeExchangeRateAtCreation=1;tx.settledExchangeRateAtCreation=1;tx.accountExchangeRateAtCreation=1;
  return count;
}
function singleCurrencyNormalizeLedger(row){
  if(!row||typeof row!=='object')return 0;let count=0;
  row.currency=row.currency||row.fromCurrency||'EGP';row.feeCurrency=row.feeCurrency||row.fromCurrency||row.currency;
  count+=singleCurrencyConvertField(row,'fromAmount','fromCurrency','fromExchangeRateAtCreation','fromBaseAmount');
  count+=singleCurrencyConvertField(row,'toAmount','toCurrency','toExchangeRateAtCreation','toBaseAmount');
  const defaultCur=row.fromCurrency||row.currency||'EGP';
  count+=singleCurrencyConvertField(row,'amount','currency','exchangeRateAtCreation','baseAmount');
  if(row.delta!==undefined&&row.delta!==null){
    const temp={amount:row.delta,currency:row.currency||defaultCur,exchangeRateAtCreation:row.exchangeRateAtCreation,date:row.date};
    count+=singleCurrencyConvertField(temp,'amount');row.delta=temp.amount;
  }
  count+=singleCurrencyConvertField(row,'fee','feeCurrency','feeExchangeRateAtCreation','feeBaseAmount');
  row.currency='EGP';row.fromCurrency='EGP';row.toCurrency='EGP';row.feeCurrency='EGP';
  row.exchangeRateAtCreation=1;row.fromExchangeRateAtCreation=1;row.toExchangeRateAtCreation=1;row.feeExchangeRateAtCreation=1;
  return count;
}
function singleCurrencyNormalizeCardOp(op, cardCurrency='EGP'){
  if(!op||typeof op!=='object')return 0;let count=0;
  if(!op.currency)op.currency=cardCurrency;op.feeCurrency=op.feeCurrency||op.currency;
  count+=singleCurrencyConvertField(op,'amount','currency','exchangeRateAtCreation','baseAmount');
  for(const f of ['paid','feeDue','feePaid','adminFee','interest','installment','principalAndInterest','total','base','principal']){
    const isFee=['feeDue','feePaid','adminFee'].includes(f);
    const currencyField=isFee?'feeCurrency':'currency';
    const rateField=isFee?'feeExchangeRateAtCreation':'exchangeRateAtCreation';
    const baseField=f==='feeDue'?'feeBaseAmount':f==='feePaid'?'feePaidBaseAmount':f==='adminFee'?'adminFeeBaseAmount':null;
    count+=singleCurrencyConvertField(op,f,currencyField,rateField,baseField);
  }
  for(const sc of (Array.isArray(op.schedules)?op.schedules:[])){
    sc.currency=sc.currency||op.currency;
    for(const f of ['amount','principalAndInterest','fee','paid','principal','interest'])count+=singleCurrencyConvertField(sc,f,'currency','exchangeRateAtCreation');
    sc.currency='EGP';sc.exchangeRateAtCreation=1;
  }
  op.currency='EGP';op.exchangeRateAtCreation=1;op.feeCurrency='EGP';op.feeExchangeRateAtCreation=1;
  return count;
}
function singleCurrencyNormalizePayment(p, fallbackCurrency='EGP'){
  if(!p||typeof p!=='object')return 0;let count=0;
  p.currency=p.currency||fallbackCurrency;
  count+=singleCurrencyConvertField(p,'amount','currency','exchangeRateAtCreation','baseAmount');
  count+=singleCurrencyConvertField(p,'settledAmount','settledCurrency','settledExchangeRateAtCreation','settledBaseAmount');
  count+=singleCurrencyConvertField(p,'accountAmount','accountCurrency','accountExchangeRateAtCreation','accountBaseAmount');
  p.currency='EGP';p.settledCurrency='EGP';p.accountCurrency='EGP';p.exchangeRateAtCreation=1;p.settledExchangeRateAtCreation=1;p.accountExchangeRateAtCreation=1;
  return count;
}
function singleCurrencyNormalizeSnapshotTree(node, seen=new Set()){
  if(!node||typeof node!=='object'||seen.has(node))return 0;
  seen.add(node);let count=0;
  if(Array.isArray(node)){for(const item of node)count+=singleCurrencyNormalizeSnapshotTree(item,seen);return count;}
  // Audit-log snapshots and archived before/after objects may be restored later.
  if(Object.prototype.hasOwnProperty.call(node,'amount')&&node.currency){
    count+=singleCurrencyConvertField(node,'amount','currency','exchangeRateAtCreation','baseAmount');
    if(node.fee!==undefined){node.feeCurrency=node.feeCurrency||node.currency;count+=singleCurrencyConvertField(node,'fee','feeCurrency','feeExchangeRateAtCreation','feeBaseAmount');node.feeCurrency='EGP';node.feeExchangeRateAtCreation=1;}
    if(node.settledAmount!==undefined){node.settledCurrency=node.settledCurrency||node.currency;count+=singleCurrencyConvertField(node,'settledAmount','settledCurrency','settledExchangeRateAtCreation','settledBaseAmount');node.settledCurrency='EGP';node.settledExchangeRateAtCreation=1;}
    if(node.accountAmount!==undefined){node.accountCurrency=node.accountCurrency||node.currency;count+=singleCurrencyConvertField(node,'accountAmount','accountCurrency','accountExchangeRateAtCreation','accountBaseAmount');node.accountCurrency='EGP';node.accountExchangeRateAtCreation=1;}
    node.currency='EGP';node.exchangeRateAtCreation=1;
  }
  if(Object.prototype.hasOwnProperty.call(node,'opening')&&node.currency){
    count+=singleCurrencyConvertField(node,'opening','currency','openingExchangeRateAtCreation','openingBaseAmount','openingDate');node.currency='EGP';
  }
  if((Object.prototype.hasOwnProperty.call(node,'limit')||Object.prototype.hasOwnProperty.call(node,'balance'))&&node.currency){
    for(const f of ['limit','balance'])count+=singleCurrencyConvertField(node,f,'currency','exchangeRateAtCreation',f==='limit'?'baseLimit':'baseBalance','createdAt');
    node.currency='EGP';node.exchangeRateAtCreation=1;
  }
  for(const [key,value] of Object.entries(node)){
    if(key==='data'||key==='payload'||key==='base64'||key==='dataUrl')continue;
    if(value&&typeof value==='object')count+=singleCurrencyNormalizeSnapshotTree(value,seen);
  }
  return count;
}

function buildSingleCurrencyState(source){
  const next=JSON.parse(JSON.stringify(source||{}));
  singleCurrencySourceState=source||{};
  let convertedRecordCount=0;const seenCurrencies=new Set();
  const noteCurrency=c=>{const x=String(c||'EGP').toUpperCase();if(x!=='EGP')seenCurrencies.add(x);};
  const convertEntity=(obj,fields,defaultCurrency='EGP')=>{
    if(!obj||typeof obj!=='object')return;
    obj.currency=obj.currency||defaultCurrency;noteCurrency(obj.currency);
    for(const [field,curField,rateField,baseField] of fields){noteCurrency(obj[curField]||obj.currency);convertedRecordCount+=singleCurrencyConvertField(obj,field,curField||'currency',rateField||'exchangeRateAtCreation',baseField||null);}
    for(const k of ['currency','feeCurrency','settledCurrency','accountCurrency','fromCurrency','toCurrency'])if(k in obj)obj[k]='EGP';
    for(const k of ['exchangeRateAtCreation','currencyRate','feeExchangeRateAtCreation','settledExchangeRateAtCreation','accountExchangeRateAtCreation','fromExchangeRateAtCreation','toExchangeRateAtCreation'])if(k in obj)obj[k]=1;
  };
  const originalCardCurrency=new Map((next.cards||[]).map(c=>[String(c.id),String(c.currency||'EGP')]));
  const originalCardOpCurrency=new Map((next.cardOps||[]).map(o=>[String(o.id),String(o.currency||originalCardCurrency.get(String(o.cardId))||'EGP')]));
  const originalCommitmentCurrency=new Map((next.commitments||[]).map(c=>[String(c.id),String(c.currency||'EGP')]));
  // Accounts: opening balances are in the account's own historic currency.
  for(const a of next.accounts||[]){noteCurrency(a.currency);convertedRecordCount+=singleCurrencyConvertField(a,'opening','currency','openingExchangeRateAtCreation','openingBaseAmount','openingDate');a.currency='EGP';}
  for(const c of next.cards||[]){noteCurrency(c.currency);for(const f of ['limit','balance'])convertedRecordCount+=singleCurrencyConvertField(c,f,'currency','exchangeRateAtCreation',f==='limit'?'baseLimit':'baseBalance','createdAt');c.currency='EGP';c.exchangeRateAtCreation=1;}
  for(const t of next.transactions||[]){noteCurrency(t.currency);noteCurrency(t.feeCurrency);noteCurrency(t.settledCurrency);convertedRecordCount+=singleCurrencyNormalizeTransaction(t);}
  for(const l of next.ledger||[])convertedRecordCount+=singleCurrencyNormalizeLedger(l);
  for(const o of next.cardOps||[]){const fallback=originalCardOpCurrency.get(String(o.id))||originalCardCurrency.get(String(o.cardId))||o.currency||'EGP';noteCurrency(o.currency||fallback);noteCurrency(o.feeCurrency);convertedRecordCount+=singleCurrencyNormalizeCardOp(o,fallback);}
  for(const p of next.cardPayments||[]){const fallback=originalCardOpCurrency.get(String(p.cardOpId))||originalCardCurrency.get(String(p.cardId))||'EGP';noteCurrency(p.currency||fallback);convertedRecordCount+=singleCurrencyNormalizePayment(p,fallback);}
  for(const c of next.commitments||[]){noteCurrency(c.currency);c.feeCurrency=c.feeCurrency||c.currency||'EGP';convertEntity(c,[['amount','currency','exchangeRateAtCreation','baseAmount'],['paid','currency','exchangeRateAtCreation','paidBaseAmount'],['fee','feeCurrency','feeExchangeRateAtCreation','feeBaseAmount']]);}
  for(const p of next.commitmentPayments||[]){const fallback=originalCommitmentCurrency.get(String(p.commitmentId))||'EGP';noteCurrency(p.currency||fallback);convertedRecordCount+=singleCurrencyNormalizePayment(p,fallback);}
  for(const b of next.budgets||[])convertEntity(b,[['limit','currency','exchangeRateAtCreation','baseLimit']]);
  for(const g of next.goals||[])convertEntity(g,[['target','currency','exchangeRateAtCreation','baseTarget'],['saved','currency','exchangeRateAtCreation','baseSaved']]);
  for(const m of next.goalMovements||[])convertEntity(m,[['amount','currency','exchangeRateAtCreation','baseAmount']]);
  for(const r of next.recurringRules||[])convertEntity(r,[['amount','currency','exchangeRateAtCreation','baseAmount']]);
  for(const a of next.annualPlanItems||[])convertEntity(a,[['amount','currency','exchangeRateAtCreation','baseAmount'],['paid','currency','exchangeRateAtCreation','paidBaseAmount'],['monthlyAmount','currency','exchangeRateAtCreation','monthlyBaseAmount']]);
  // Keep the cancellable transaction and related financial snapshots in EGP too,
  // otherwise restoring one later could reintroduce a foreign-currency record.
  for(const archive of next.cancelledTransactions||[]){
    if(archive?.transaction)convertedRecordCount+=singleCurrencyNormalizeTransaction(archive.transaction);
    else convertedRecordCount+=singleCurrencyNormalizeTransaction(archive);
    const rel=archive?.related||{};
    if(rel.cardPurchaseOp){const op=rel.cardPurchaseOp;const card=(next.cards||[]).find(c=>String(c.id)===String(op.cardId));convertedRecordCount+=singleCurrencyNormalizeCardOp(op,card?.currency||op.currency||'EGP');}
    if(rel.cardPayment)convertedRecordCount+=singleCurrencyNormalizePayment(rel.cardPayment,'EGP');
    if(rel.commitmentPayment){const fallback=originalCommitmentCurrency.get(String(rel.commitmentPayment.commitmentId))||'EGP';convertedRecordCount+=singleCurrencyNormalizePayment(rel.commitmentPayment,fallback);}
  }
  convertedRecordCount+=singleCurrencyNormalizeSnapshotTree(next.auditLog||[]);
  next.prefs=next.prefs||{};next.prefs.defaultCurrency='EGP';
  next.currencies=[{code:'EGP',name:'جنيه مصري',rate:1,updatedAt:today()}];
  next.currencyRates=[];
  next.singleCurrencySchemaVersion=1;
  next.singleCurrencyMigration={version:1,at:new Date().toISOString(),sourceCurrencies:[...seenCurrencies].sort(),convertedRecordCount};
  return next;
}
async function migrateWalletToEGP(){
  if(Number(state?.singleCurrencySchemaVersion)>=1){
    state.prefs=state.prefs||{};state.prefs.defaultCurrency='EGP';
    state.currencies=[{code:'EGP',name:'جنيه مصري',rate:1,updatedAt:today()}];state.currencyRates=[];
    return false;
  }
  const previous=JSON.parse(JSON.stringify(state));
  // Fully build/validate the candidate first; any missing FX aborts without touching state.
  const candidate=buildSingleCurrencyState(previous);
  if(!candidate.singleCurrencyMigration)throw new Error('لم يتم إنشاء سجل توحيد العملات');
  // A verified, independent restore point is mandatory before changing any historical amount.
  await createPreRestoreSnapshot('قبل توحيد جميع العملات إلى الجنيه المصري');
  state=candidate;
  try{
    await commitCriticalWalletState(previous,_autoSnapshotsMemory||[],'توحيد العملات إلى EGP');
    return true;
  }catch(err){state=previous;throw err;}
}
