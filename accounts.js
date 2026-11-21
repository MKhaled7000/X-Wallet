/* X-Wallet V14.0 module: accounts.js | Extracted from V13.40 app.js */

function accountStatementLedgerImpact(item,accountId,accountCurrency='EGP'){
  if(!item)return {income:0,expense:0};
  const toAccountAmount=(amount,currency,lockedRate)=>{
    const value=Number(amount)||0;
    if(typeof convertCurrencyAmount==='function')return convertCurrencyAmount(value,currency||accountCurrency,accountCurrency,item.date||today(),lockedRate);
    return value;
  };
  if(item.type==='transfer'){
    if(String(item.toAccountId)===String(accountId))return {income:toAccountAmount(item.amount,item.currency,item.exchangeRateAtCreation),expense:0};
    if(String(item.accountId)===String(accountId)){
      let fee=0;
      if(!item.hasLinkedFee&&(Number(item.fee)||0)>0){
        fee=typeof convertCurrencyAmount==='function'
          ? convertCurrencyAmount(Number(item.fee)||0,item.feeCurrency||item.currency||accountCurrency,accountCurrency,item.date||today(),item.feeExchangeRateAtCreation)
          : Number(item.fee)||0;
      }
      return {income:0,expense:round2(toAccountAmount(item.amount,item.currency,item.exchangeRateAtCreation)+fee)};
    }
    return {income:0,expense:0};
  }
  if(item.type==='adjust'){
    const delta=toAccountAmount(Number(item.amount)||0,item.currency,item.exchangeRateAtCreation);
    return delta>=0?{income:round2(delta),expense:0}:{income:0,expense:round2(Math.abs(delta))};
  }
  return {income:0,expense:0};
}
function activeStatementItems(items){
  return (Array.isArray(items) ? items : []).filter(item => item && !item.deletedAt);
}

function buildCardPurchaseStatementItem(op,card){
  const currency=String(op?.currency||card?.currency||'EGP').toUpperCase();
  return {
    id:'card-purchase-'+op.id,type:'card_purchase',title:op.title,
    category:op.type==='installment'?`تقسيط ${op.months} شهر`:'مشتريات بطاقة',
    subCategory:'',amount:Number(op.amount)||0,date:op.date||(op.purchaseMonth?op.purchaseMonth+'-01':today()),
    currency,exchangeRateAtCreation:op.exchangeRateAtCreation??op.currencyRate,baseAmount:op.baseAmount,
    accountId:null,accountLabel:card?.name||'بطاقة',source:'card-purchase:'+op.id,createdAt:op.createdAt||Date.now()
  };
}

function normalizeCardStatementItem(item,card,index){
  const isPayment=item?.source==='card-payment'||!!item?.linkedCardPaymentRecordId;
  const currency=isPayment
    ? String(item.settledCurrency||card?.currency||'EGP').toUpperCase()
    : String(item.currency||card?.currency||'EGP').toUpperCase();
  return {
    ...item,
    type:isPayment?'income':'expense',
    amount:isPayment?Number(item.settledAmount??item.amount)||0:Number(item.amount)||0,
    currency,
    accountLabel:card?.name||'بطاقة',
    _kind:'tx',
    _order:getItemTimestampOrder(item,index)
  };
}

/* ---- Original app.js lines 2567-2982 ---- */

/* Account removal plans are built on a clone. No live mutation before confirmation. */
function accountDeletionFingerprint(wallet){
  const keys=['accounts','transactions','ledger','cardPayments','cardOps','cards','commitmentPayments','commitments','cancelledTransactions','recurringRules'];
  return JSON.stringify([keys.map(k=>wallet[k]||[]),wallet.prefs?.defaultAccount||'']);
}
function buildAccountDeletionPlan(wallet,accountId){
  const id=String(accountId),same=v=>v!==undefined&&v!==null&&String(v)===id;
  const account=(wallet.accounts||[]).find(a=>same(a.id));
  if(!account)throw new Error('الحساب لم يعد موجوداً');
  const next=JSON.parse(JSON.stringify(wallet));
  const ledger=(wallet.ledger||[]).filter(l=>same(l.from)||same(l.to));
  const ledgerIds=new Set(ledger.map(l=>String(l.id)));
  const feeIds=new Set(ledger.map(l=>String(l.feeTransactionId||'')).filter(Boolean));
  const directTx=t=>same(t.accountId)||same(t.toAccountId)||ledgerIds.has(String(t.linkedTransferLedgerId||''))||feeIds.has(String(t.id));
  const initialTx=(wallet.transactions||[]).filter(directTx);
  const cardPayIds=new Set(initialTx.map(t=>String(t.linkedCardPaymentRecordId||'')).filter(Boolean));
  const comPayIds=new Set(initialTx.map(t=>String(t.linkedCommitmentPaymentId||'')).filter(Boolean));
  const cardPayments=(wallet.cardPayments||[]).filter(p=>same(p.accountId)||cardPayIds.has(String(p.id)));
  const commitmentPayments=(wallet.commitmentPayments||[]).filter(p=>same(p.accountId)||comPayIds.has(String(p.id)));
  cardPayments.forEach(p=>cardPayIds.add(String(p.id)));
  commitmentPayments.forEach(p=>comPayIds.add(String(p.id)));
  const tx=(wallet.transactions||[]).filter(t=>directTx(t)||cardPayIds.has(String(t.linkedCardPaymentRecordId||''))||comPayIds.has(String(t.linkedCommitmentPaymentId||'')));
  const txIds=new Set(tx.map(t=>String(t.id)));
  const fail=()=>{throw new Error('ارتباط سداد أو تحويل قديم غير مكتمل أو متعارض. لم تُحذف بيانات؛ يلزم مراجعة السجل المرتبط أولاً');};
  for(const t of tx){
    if(t.accountId&&!same(t.accountId)){
      const feeLedger=ledger.find(l=>String(l.feeTransactionId||'')===String(t.id)||String(t.linkedTransferLedgerId||'')===String(l.id));
      if(t.source!=='transfer-fee'||!feeLedger||String(feeLedger.from)!==String(t.accountId))fail();
    }
    if(isCardPurchaseTx(t))fail(); // A purchase belongs to a card, never erase it as an account payment.
    if(t.type==='transfer')fail(); // Legacy transfers with no stable ledger cannot be safely paired.
    if(t.source==='transfer-fee'&&!ledgerIds.has(String(t.linkedTransferLedgerId||''))&&!feeIds.has(String(t.id)))fail();
    if(t.source==='card-payment'||t.linkedCardOpId||t.linkedCardPaymentRecordId||t.linkedCardPayKind){
      const p=cardPayments.find(p=>String(p.id)===String(t.linkedCardPaymentRecordId||''));
      if(!p||!t.linkedCardPaymentRecordId)fail();
      if(t.linkedCardOpId&&String(t.linkedCardOpId)!==String(p.cardOpId||p.opId))fail();
      if(t.linkedCardPayKind&&t.linkedCardPayKind!==p.paymentKind)fail();
      if(t.linkedCardPayMonth&&p.paymentMonth&&t.linkedCardPayMonth!==p.paymentMonth)fail();
      const settled=Number(t.settledAmount??t.amount);
      if(!Number.isFinite(settled)||Math.abs(settled-Number(p.amount))>.005)fail();
      if(tx.filter(x=>String(x.linkedCardPaymentRecordId||'')===String(p.id)).length!==1)fail();
    }
    if(t.source==='commitment-payment'||t.linkedCommitmentPaymentId){
      const p=commitmentPayments.find(p=>String(p.id)===String(t.linkedCommitmentPaymentId||''));
      if(!p||!t.linkedCommitmentPaymentId)fail();
      if(!Number.isFinite(Number(t.settledAmount??t.amount))||Math.abs(Number(t.settledAmount??t.amount)-Number(p.amount))>.005)fail();
      if(tx.filter(x=>String(x.linkedCommitmentPaymentId||'')===String(p.id)).length!==1)fail();
    }
  }
  for(const key of ['accounts','transactions','ledger','cardPayments','cardOps','cards','commitmentPayments','commitments']){
    const list=wallet[key]||[],ids=list.map(x=>String(x.id||''));if(ids.some(x=>!x)||new Set(ids).size!==ids.length)fail();
  }
  const reversalTargets=new Set();
  for(const p of cardPayments){
    if(p.accountId&&!same(p.accountId))fail();
    const op=(next.cardOps||[]).find(o=>String(o.id)===String(p.cardOpId||p.opId||''));
    if(!op||op.deletedAt||!p.cardId||String(op.cardId)!==String(p.cardId)||!(next.cards||[]).some(c=>String(c.id)===String(op.cardId)))fail();
    let target,field;
    if(p.paymentKind==='card_swipe'){target=op;field='paid';}
    else if(p.paymentKind==='card_fee'){target=op;field='feePaid';}
    else if(p.paymentKind==='card_inst'){target=(op.schedules||[]).find(s=>String(s.month)===String(p.paymentMonth));field='paid';}
    else fail();
    const amount=Number(p.amount);if(!target||!Number.isFinite(amount)||amount<=0||(Number(target[field])||0)+.005<amount)fail();
    target[field]=round2(Math.max(0,(Number(target[field])||0)-amount));
    reversalTargets.add(String(op.cardId));
  }
  for(const p of commitmentPayments){
    if(p.accountId&&!same(p.accountId))fail();
    if(!(next.commitments||[]).some(c=>String(c.id)===String(p.commitmentId))||!Number.isFinite(Number(p.amount))||Number(p.amount)<=0)fail();
  }
  for(const l of ledger){
    if(!l.id||!['transfer','adjust'].includes(l.type))fail();
    if(l.type==='transfer'){
      if(!l.from||!l.to||same(l.from)&&same(l.to))fail();
      if(!(wallet.accounts||[]).some(a=>String(a.id)===String(l.from))||!(wallet.accounts||[]).some(a=>String(a.id)===String(l.to)))fail();
    }
  }
  next.transactions=(next.transactions||[]).filter(t=>!txIds.has(String(t.id)));
  next.ledger=(next.ledger||[]).filter(l=>!ledgerIds.has(String(l.id)));
  next.cardPayments=(next.cardPayments||[]).filter(p=>!cardPayIds.has(String(p.id)));
  next.commitmentPayments=(next.commitmentPayments||[]).filter(p=>!comPayIds.has(String(p.id)));
  const archiveMatches=x=>{const t=x.transaction||x;return directTx(t)||txIds.has(String(t.id))||cardPayIds.has(String(t.linkedCardPaymentRecordId||''))||comPayIds.has(String(t.linkedCommitmentPaymentId||''))||ledgerIds.has(String(x.related?.transferLedgerId||''));};
  const archived=(next.cancelledTransactions||[]).filter(archiveMatches);
  next.cancelledTransactions=(next.cancelledTransactions||[]).filter(x=>!archiveMatches(x));
  const rules=(next.recurringRules||[]).filter(r=>same(r.accountId));
  next.recurringRules=(next.recurringRules||[]).filter(r=>!same(r.accountId));
  next.accounts=next.accounts.filter(a=>!same(a.id));
  next.prefs=next.prefs||{};
  const defaultCleared=same(next.prefs.defaultAccount);if(defaultCleared)next.prefs.defaultAccount='';
  const accountImpacts=(wallet.accounts||[]).filter(a=>!same(a.id)).map(a=>({name:a.name,currency:a.currency||'EGP',before:accountBalance(a,wallet),after:accountBalance(a,next)})).filter(x=>Math.abs(x.before-x.after)>.005);
  const cardImpacts=(wallet.cards||[]).filter(c=>reversalTargets.has(String(c.id))).map(c=>({name:c.name,currency:c.currency||'EGP',before:cardTotalOutstanding(c,wallet),after:cardTotalOutstanding(c,next)}));
  const commitmentImpacts=commitmentPayments.map(p=>({name:(wallet.commitments||[]).find(c=>String(c.id)===String(p.commitmentId))?.title||'التزام',month:p.month,amount:Number(p.amount),currency:p.currency||'EGP'}));
  return {id,account,next,fingerprint:accountDeletionFingerprint(wallet),counts:{transactions:tx.length,ledger:ledger.length,cardPayments:cardPayments.length,commitmentPayments:commitmentPayments.length,archived:archived.length,rules:rules.length},accountImpacts,cardImpacts,commitmentImpacts,defaultCleared};
}
function deleteAccount(id){
  let plan;try{plan=buildAccountDeletionPlan(state,id);}catch(error){toast(error.message);return;}
  const countRows=[['معاملات',plan.counts.transactions],['تحويلات / تسويات',plan.counts.ledger],['سجلات سداد بطاقات',plan.counts.cardPayments],['سجلات سداد التزامات',plan.counts.commitmentPayments],['سجل محذوفات مرتبط',plan.counts.archived],['قواعد متكررة',plan.counts.rules]].map(([label,value])=>`<div class="account-delete-count"><span>${label}</span><b>${value}</b></div>`).join('');
  const money=n=>esc(fmtNum(n));
  const impacts=[...plan.accountImpacts.map(x=>`رصيد ${esc(x.name)}: قبل ${money(x.before)}، بعد ${money(x.after)} ${esc(x.currency)}`),...plan.cardImpacts.map(x=>`مستحق ${esc(x.name)}: قبل ${money(x.before)}، بعد ${money(x.after)} ${esc(x.currency)}`),...plan.commitmentImpacts.map(x=>`يعود مستحقاً على ${esc(x.name)} لشهر ${esc(x.month||'غير محدد')}: ${money(x.amount)} ${esc(x.currency)}`)];
  const html=`<div class="account-delete-preview" dir="rtl"><p>حذف «${esc(plan.account.name)}» من المحفظة وسجلاته المحددة بالمعرّفات.</p><p>الرصيد الحالي: <b>${money(accountBalance(plan.account))} ${esc(plan.account.currency||'EGP')}</b></p>${countRows}<h4>الأثر على بقية المحفظة</h4>${impacts.length?`<ul>${impacts.map(s=>`<li>${s}</li>`).join('')}</ul>`:'<p>لا تغيير في أرصدة الحسابات الأخرى أو مستحقات البطاقات والالتزامات.</p>'}${plan.defaultCleared?'<p>سيُلغى اختيار هذا الحساب كحساب افتراضي. اختر حساباً آخر من الإعدادات عند الحاجة.</p>':''}<p>حذف التحويل يلغي أثره على الحساب الآخر. حذف السداد يعيد المبلغ مستحقاً، ولا يحذف البطاقة أو الالتزام.</p><p>تُحفظ نقطة استعادة محلية كاملة قبل المسح. تظل النسخ السابقة وسجل المراجعة محفوظة؛ هذا ليس مسحاً لكل نسخ البيانات. الاستعادة من المزيد ← النسخ الاحتياطي ← المحلي ← استيراد ← النسخ التلقائية.</p><div class="actions"><button type="button" class="secondary" onclick="closeAppDialog()">إلغاء</button><button type="button" class="secondary account-delete-continue" id="accountDeleteContinue">متابعة الحذف</button></div></div>`;
  showAppCustomForm('مراجعة حذف الحساب',html,null,true);
  document.getElementById('accountDeleteContinue').onclick=()=>{
    if(accountDeletionFingerprint(state)!==plan.fingerprint){toast('تغيرت البيانات. راجع أثر الحذف من جديد');closeAppDialog();return;}
    showAppConfirm('تأكيد الحذف النهائي من المحفظة',`هل تؤكد حذف «${plan.account.name}» وسجلاته والأثر المعروض على بقية المحفظة؟ لن يبدأ المسح دون حفظ نقطة الاستعادة والتحقق منها.`,async()=>{
      const success=await runCriticalWalletAction('قبل حذف الحساب وسجلاته',()=>{
        if(accountDeletionFingerprint(state)!==plan.fingerprint)throw new Error('تغيرت البيانات. راجع أثر الحذف من جديد');
        const current=buildAccountDeletionPlan(state,id);
        for(const key of ['accounts','transactions','ledger','cardPayments','cardOps','commitmentPayments','cancelledTransactions','recurringRules'])state[key]=current.next[key];
        state.prefs.defaultAccount=current.next.prefs.defaultAccount;
        if(typeof auditRecord==='function')auditRecord('حذف','حساب',id,plan.account,{counts:plan.counts});
      });
      if(success){
        if(typeof _auditFingerprint==='function')_auditSnapshot=_auditFingerprint();
        document.getElementById('accountModal')?.classList.remove('show');
        if(typeof activeStatementState!=='undefined'&&activeStatementState?.kind==='account'&&String(activeStatementState.id)===String(id))document.getElementById('statementFullModal')?.classList.remove('show');
        toast('تم حذف الحساب وسجلاته من المحفظة مع نقطة استعادة محلية ✓');
      }
    },true);
  };
}

function closeAccountModal(){ if(document.getElementById('quickModal')?.classList.contains('show') && typeof renderQuickPickers==='function') setTimeout(renderQuickPickers, 30);
  document.getElementById('accountModal').classList.remove('show');
}

function openCategoriesManagerModal(){
  renderSettingsCategories();
  document.getElementById('catsManagerModal')?.classList.add('show');
}
function closeCategoriesManagerModal(){
  document.getElementById('catsManagerModal')?.classList.remove('show');
  if(document.getElementById('quickModal')?.classList.contains('show') && typeof renderQuickPickers === 'function'){
    renderQuickPickers();
  }
}

let stmtAdvFilter = { dateFrom:'', dateTo:'', amountFrom:'', amountTo:'', type:'', cat:'' };


function updateStmtFilterUI(){
  const hasD = !!(stmtAdvFilter.dateFrom || stmtAdvFilter.dateTo);
  document.getElementById('stmtFCardDate')?.classList.toggle('active', hasD);
  const dEl = document.getElementById('stmtFValDate');
  if(dEl) dEl.textContent = hasD ? `${formatDateDMY(stmtAdvFilter.dateFrom||stmtAdvFilter.dateTo).slice(0,5)} ✕` : '';

  const hasA = !!(stmtAdvFilter.amountFrom || stmtAdvFilter.amountTo);
  document.getElementById('stmtFCardAmt')?.classList.toggle('active', hasA);
  const aEl = document.getElementById('stmtFValAmt');
  if(aEl) aEl.textContent = hasA ? `${stmtAdvFilter.amountFrom||stmtAdvFilter.amountTo} ✕` : '';

  document.getElementById('stmtFCardType')?.classList.toggle('active', !!stmtAdvFilter.type);
  const tEl = document.getElementById('stmtFValType');
  if(tEl) tEl.textContent = stmtAdvFilter.type ? `${stmtAdvFilter.type === 'income' ? 'دخل' : (stmtAdvFilter.type === 'transfer' ? 'تحويل' : 'مصروف')} ✕` : '';

  document.getElementById('stmtFCardCat')?.classList.toggle('active', !!stmtAdvFilter.cat);
  const cEl = document.getElementById('stmtFValCat');
  if(cEl) cEl.textContent = stmtAdvFilter.cat ? `${stmtAdvFilter.cat} ✕` : '';
}


function openAccountStatement(id){
  const acc = (state.accounts||[]).find(a=>String(a.id)===String(id));
  if(!acc) return;
  activeStatementState = { kind:'account', id:acc.id, year:activeYear, month:activeMonth, mode:'monthly' };
  stmtAdvFilter = { dateFrom:'', dateTo:'', amountFrom:'', amountTo:'', type:'', cat:'' };
  try{ updateStmtFilterUI(); }catch(_){}
  setv('stmtSearchInp', '');
  document.getElementById('statementFullModal')?.classList.add('show');
  try{ renderFullStatementModalContent(); }catch(e){ console.warn(e); }
}

function openCardStatement(cardId){
  const card = (state.cards||[]).find(c=>String(c.id)===String(cardId));
  if(!card) return;
  activeStatementState = { kind:'card', id:card.id, year:activeYear, month:activeMonth, mode:'monthly' };
  stmtAdvFilter = { dateFrom:'', dateTo:'', amountFrom:'', amountTo:'', type:'', cat:'' };
  try{ updateStmtFilterUI(); }catch(_){}
  setv('stmtSearchInp', '');
  document.getElementById('statementFullModal')?.classList.add('show');
  try{ renderFullStatementModalContent(); }catch(e){ console.warn(e); }
}

function closeFullStatementModal(){
  document.getElementById('statementFullModal')?.classList.remove('show');
  activeStatementState = null;
}

function shiftStatementMonth(delta){
  if(!activeStatementState) return;
  if(activeStatementState.mode === 'yearly'){
    activeStatementState.year += delta;
  } else {
    activeStatementState.mode = 'monthly';
    let m = activeStatementState.month + delta;
    let y = activeStatementState.year;
    if(m < 1){ m = 12; y -= 1; }
    else if(m > 12){ m = 1; y += 1; }
    activeStatementState.month = m;
    activeStatementState.year = y;
  }
  renderFullStatementModalContent();
}

function openStatementPeriodModeDialog(){
  if(!activeStatementState) return;
  openCompactYMPicker(
    null,
    false,
    (chosenYM)=>{
      const [y,m] = chosenYM.split('-').map(Number);
      activeStatementState.year = y;
      activeStatementState.month = m;
      activeStatementState.mode = 'monthly';
      renderFullStatementModalContent();
    },
    (chosenYear)=>{
      activeStatementState.year = chosenYear;
      activeStatementState.mode = 'yearly';
      renderFullStatementModalContent();
    }
  );
  ymPickerState.year = activeStatementState.year;
  ymPickerState.month = activeStatementState.month;
  renderCompactYMPicker();
}



function renderFullStatementModalContent(){
  if(!activeStatementState) return;
  const { kind, id, year, month, mode } = activeStatementState;
  const isYearly = (mode === 'yearly');
  const isEn = (state.prefs?.lang === 'en');
  const ym = String(year) + '-' + String(month).padStart(2,'0');
  const yStr = String(year);
  document.getElementById('stmtPeriodLabel').textContent = isYearly ? yStr : formatYMArabic(ym);

  let combined = [];
  let acc = null;
  const topTitleEl = document.getElementById('stmtTopTabTitle');
  if(topTitleEl) topTitleEl.textContent = (kind === 'card') ? 'البطاقات' : 'الحسابات';
  const stmtQ = (document.getElementById('stmtSearchInp')?.value || '').trim().toLowerCase();

  if(kind === 'account'){
    acc = (state.accounts||[]).find(a=>String(a.id)===String(id)) || null;
    document.getElementById('stmtModalTitle').textContent = acc ? acc.name : 'الحساب';

    const txItems = activeStatementItems(state.transactions)
      .filter(t => txMatchesAccount(t, id) && (isYearly ? String(t.date||'').startsWith(yStr) : monthKey(t.date)===ym))
      .map((x, idx)=>({...x, _kind:'tx', _order:getItemTimestampOrder(x, idx)}));

    const ledItems = activeStatementItems(state.ledger)
      .filter(l => (String(l.from)===String(id) || String(l.to)===String(id)) && (isYearly ? String(l.date||'').startsWith(yStr) : monthKey(l.date)===ym))
      .map((l, idx)=>{
        const fromA = state.accounts.find(a=>a.id===l.from)?.name || (isEn?'Cash':'كاش');
        const toA = state.accounts.find(a=>a.id===l.to)?.name || (isEn?'Cash':'كاش');
        const isFrom=String(l.from)===String(id);
      const ledgerCurrency=String(isFrom?(l.fromCurrency||l.currency||acc?.currency||'EGP'):(l.toCurrency||l.currency||acc?.currency||'EGP')).toUpperCase();
      const ledgerAmount=l.type==='transfer'?(isFrom?(l.fromAmount??l.amount):(l.toAmount??l.amount)):Number(l.delta??l.amount)||0;
      const hasLinkedFee=isFrom&&(state.transactions||[]).some(t=>!t.deletedAt&&(String(t.id)===String(l.feeTransactionId||'')||String(t.linkedTransferLedgerId||'')===String(l.id)));
      const feeCurrency=String(l.feeCurrency||l.fromCurrency||l.currency||acc?.currency||'EGP').toUpperCase();
      const feeTxt = isFrom&&(Number(l.fee)||0)>0&&!hasLinkedFee ? ` (${isEn?'Fee':'رسوم'}: ${fmt(l.fee)} ${feeCurrency})` : '';
        return {
          id: l.id,
          type: l.type,
          category: l.type==='transfer' ? (isEn?'Transfer':'تحويل') : (isEn?'Adjustment':'تسوية'),
          subCategory: '',
          title: (l.note && l.note !== 'تحويل بين الحسابات') ? (l.note + feeTxt) : feeTxt.trim(),
          note: l.note || '',
          accountLabel: l.type==='transfer' ? `${fromA} → ${toA}` : fromA,
          accountId: l.from,
          toAccountId: l.to,
          amount: ledgerAmount,
          fee: Number(l.fee)||0,
          feeCurrency,
          feeExchangeRateAtCreation:l.feeExchangeRateAtCreation,
          hasLinkedFee,
          currency: ledgerCurrency,
          exchangeRateAtCreation:isFrom?(l.fromExchangeRateAtCreation??l.exchangeRateAtCreation):(l.toExchangeRateAtCreation??l.exchangeRateAtCreation),
          date: l.date,
          _kind: 'ledger',
          _order: getItemTimestampOrder(l, 100000 + idx)
        };
      });

    combined = [...txItems, ...ledItems];
  } else {
    const card = (state.cards||[]).find(c=>String(c.id)===String(id)) || null;
    const cName = card ? card.name : 'بطاقة';
    const cNameLow = cName.trim().toLowerCase();
    const cardCurrency=String(card?.currency||'EGP').toUpperCase();
    document.getElementById('stmtModalTitle').textContent = cName;

    const cardOpIds = new Set((state.cardOps||[]).filter(o=>String(o.cardId)===String(id)).map(o=>o.id));
    const cardPayIds = new Set((state.cardPayments||[]).filter(p=>String(p.cardId)===String(id)).map(p=>p.id));

    // Synthesize missing transaction rows for cardOps if needed
    const existingCardTxs = (state.transactions||[]).filter(t=>t&&!t.deletedAt&&t.source&&String(t.source).startsWith('card-purchase:'));
    const coveredOpIds = new Set(existingCardTxs.map(t=>String(t.source).replace('card-purchase:','')));
    const syntheticCardTxs=[];
    for(const o of (state.cardOps||[]).filter(op=>op.cardId===id)){
      if(!coveredOpIds.has(o.id))syntheticCardTxs.push(buildCardPurchaseStatementItem(o,card));
    }
    const cardStatementTransactions=[...activeStatementItems(state.transactions),...syntheticCardTxs];

    combined = cardStatementTransactions.filter(t=>{
      if(isYearly ? !String(t.date||'').startsWith(yStr) : monthKey(t.date) !== ym) return false;
      if(t.source && String(t.source).startsWith('card-purchase:')){
        const opId = String(t.source).replace('card-purchase:','');
        if(cardOpIds.has(opId)) return true;
      }
      if(t.linkedCardOpId && cardOpIds.has(t.linkedCardOpId)) return true;
      if(t.linkedCardPaymentRecordId && cardPayIds.has(t.linkedCardPaymentRecordId)) return true;
      if(t.source === 'card-payment' && String(t.title||'').includes(cName)) return true;
      if(cNameLow && String(t.accountLabel||'').trim().toLowerCase() === cNameLow) return true;
      return false;
    }).map((x, idx)=>normalizeCardStatementItem(x,card,idx));
  }

  if(stmtQ || stmtAdvFilter.dateFrom || stmtAdvFilter.dateTo || stmtAdvFilter.amountFrom || stmtAdvFilter.amountTo || stmtAdvFilter.type || stmtAdvFilter.cat){
    combined = combined.filter(it => {
      const ds = String(it.date||'').slice(0,10);
      if(stmtAdvFilter.dateFrom && ds < stmtAdvFilter.dateFrom) return false;
      if(stmtAdvFilter.dateTo && ds > stmtAdvFilter.dateTo) return false;
      if(stmtAdvFilter.type && it.type !== stmtAdvFilter.type) return false;
      if(stmtAdvFilter.cat && String(it.category||'').trim() !== stmtAdvFilter.cat) return false;
      if(stmtAdvFilter.amountFrom || stmtAdvFilter.amountTo){
        const amt = Math.abs(Number(it.amount)||0);
        const hasF = stmtAdvFilter.amountFrom !== '' && Number.isFinite(Number(stmtAdvFilter.amountFrom));
        const hasT = stmtAdvFilter.amountTo !== '' && Number.isFinite(Number(stmtAdvFilter.amountTo));
        if(hasF && !hasT && Math.abs(amt - Number(stmtAdvFilter.amountFrom)) > 0.009) return false;
        if(!hasF && hasT && Math.abs(amt - Number(stmtAdvFilter.amountTo)) > 0.009) return false;
        if(hasF && hasT){
          const mn = Math.min(Number(stmtAdvFilter.amountFrom), Number(stmtAdvFilter.amountTo));
          const mx = Math.max(Number(stmtAdvFilter.amountFrom), Number(stmtAdvFilter.amountTo));
          if(amt < mn - 0.009 || amt > mx + 0.009) return false;
        }
      }
      if(stmtQ){
        const hay = [it.title, it.note, it.description, it.category, it.subCategory, String(it.amount||'')].map(x=>String(x||'').toLowerCase()).join(' ');
        if(!hay.includes(stmtQ)) return false;
      }
      return true;
    });
  }
  combined.sort((a,b)=>{
    const dc = String(b.date||'').localeCompare(String(a.date||''));
    if(dc !== 0) return dc;
    return (b._order||0) - (a._order||0);
  });

  // Calculate Income, Expenses, and Net for the statement period (4.1)
  let stmtInc = 0, stmtExp = 0;
  for(const it of combined){
    if(kind === 'account'){
      if(it._kind === 'ledger'){
        const impact=accountStatementLedgerImpact(it,id,acc?.currency||'EGP');
        stmtInc+=impact.income;
        stmtExp+=impact.expense;
      } else {
        const statementAmount=typeof convertCurrencyAmount==='function'
          ? convertCurrencyAmount(Number(it.amount)||0,it.currency||acc?.currency||'EGP',acc?.currency||'EGP',it.date||today(),it.exchangeRateAtCreation??it.currencyRate)
          : (Number(it.amount)||0);
        if(it.type === 'income' || it.type === 'fund') stmtInc += statementAmount;
        else if(isActualExpenseTx(it) || it.type === 'credit_payment') stmtExp += statementAmount;
      }
    } else {
      if(it.type === 'income') stmtInc += Number(it.amount)||0;
      else stmtExp += Number(it.amount)||0;
    }
  }
  stmtInc = round2(stmtInc);
  stmtExp = round2(stmtExp);
  const stmtNet = round2(stmtInc - stmtExp);

  document.getElementById('stmtIncomeHero').textContent = maskable(fmtNum(stmtInc));
  document.getElementById('stmtExpenseHero').textContent = maskable(fmtNum(stmtExp));
  const netEl = document.getElementById('stmtNetHero');
  netEl.textContent = maskable(fmtNum(stmtNet));
  netEl.className = stmtNet >= 0 ? 'mint' : 'red';

  document.getElementById('stmtTransactionsFeed').innerHTML = buildDailyGroupedFeedHtml(
    combined,
    `لا توجد معاملات مسجلة في (${isYearly ? yStr : formatYMArabic(ym)}).`
  );
}


function editCurrentStatementEntity(){
  if(!activeStatementState) return;
  const { kind, id } = activeStatementState;
  if(kind === 'card') openEditCardModal(id);
  else openEditAccountModal(id);
}

let _fpAccState = { mode:'add', entityKind:'account', id:null };

function openAddAccountFullModal(){
  _fpAccState = { mode:'add', entityKind:'account', id:null };
  renderFullAccountCardForm();
  document.getElementById('accountModal').classList.add('show');
}
function openAddCardFullModal(){
  _fpAccState = { mode:'add', entityKind:'card', id:null };
  renderFullAccountCardForm();
  document.getElementById('accountModal').classList.add('show');
}
function openEditAccountModal(id){
  const a = (state.accounts||[]).find(x=>String(x.id)===String(id));
  if(!a) return;
  _fpAccState = { mode:'edit', entityKind:'account', id:a.id, origKind:'account' };
  renderFullAccountCardForm();
  document.getElementById('accountModal').classList.add('show');
}
function openEditCardFullModal(cardId){
  const c = (state.cards||[]).find(x=>String(x.id)===String(cardId));
  if(!c) return;
  _fpAccState = { mode:'edit', entityKind:'card', id:c.id, origKind:'card' };
  renderFullAccountCardForm();
  document.getElementById('accountModal').classList.add('show');
}
function switchFullFormGroup(newKind){
  _fpAccState.entityKind = (newKind === 'card') ? 'card' : 'account';
  renderFullAccountCardForm(true);
}

function renderFullAccountCardForm(preserveName){
  const isCard = (_fpAccState.entityKind === 'card');
  const isEdit = (_fpAccState.mode === 'edit');
  const existingAcc = isEdit && _fpAccState.origKind === 'account' ? state.accounts.find(a=>String(a.id)===String(_fpAccState.id)) : null;
  const existingCard = isEdit && _fpAccState.origKind === 'card' ? state.cards.find(c=>String(c.id)===String(_fpAccState.id)) : null;
  const srcObj = existingAcc || existingCard || {};

  const prevName = preserveName ? (document.getElementById('fpEntName')?.value || '') : (srcObj.name || '');
  const titleTxt = isEdit ? (isCard ? 'تعديل البطاقة' : 'تعديل الحساب') : (isCard ? 'إضافة بطاقة' : 'إضافة حساب');
  const ttlEl = document.getElementById('accModalTitle');
  if(ttlEl) ttlEl.textContent = titleTxt;

  const delBtn = document.getElementById('accModalDelBtn');
  if(delBtn){
    delBtn.style.display = isEdit ? 'grid' : 'none';
    delBtn.onclick = () => {
      closeAccountModal();
      if(_fpAccState.origKind === 'card') deleteCard(_fpAccState.id);
      else deleteAccount(_fpAccState.id);
    };
  }

  const incTotals = srcObj.includeInTotals !== false;
  const isHidden = !!srcObj.hidden;
  const curBal = existingAcc ? accountBalance(existingAcc) : (existingCard ? -cardTotalOutstanding(existingCard) : 0);
  const curLimit = existingCard ? (Number(existingCard.limit)||0) : 0;
  const curAvail = existingCard ? cardCurrentAvailable(existingCard) : 0;
  const curPayDay = existingCard ? (existingCard.payDay||3) : 3;
  const curCloseDay = existingCard ? (existingCard.statementDay||1) : 1;
  const terms = existingCard?.terms || {};
  const termMonths = [3,6,9,12,18,24];

  const cardTermsHtml = termMonths.map(m => {
    const t = terms[m] || {monthlyRate:0, adminRate:0};
    return `<div class="c-row" style="min-height:38px;padding:4px 10px">
      <label>${m} شهور</label>
      <div style="display:flex;gap:6px;width:54%">
        <input id="fpIr${m}" type="number" step="0.01" value="${round2((Number(t.monthlyRate)||0)*100)}" placeholder="فائدة %" style="width:50%">
        <input id="fpFee${m}" type="number" step="0.01" value="${round2((Number(t.adminRate)||0)*100)}" placeholder="رسوم %" style="width:50%">
      </div>
    </div>`;
  }).join('');

  document.getElementById('accModalBody').innerHTML = `
    <div class="c-list">
      <div class="c-row">
        <label>المجموعة</label>
        <select id="fpEntGroup" onchange="switchFullFormGroup(this.value)">
          <option value="account" ${!isCard?'selected':''}>حساب</option>
          <option value="card" ${isCard?'selected':''}>بطاقة</option>
        </select>
      </div>
      <div class="c-row">
        <label>${isCard ? 'اسم البطاقة' : 'اسم الحساب'}</label>
        <input id="fpEntName" value="${esc(prevName)}" placeholder="">
      </div>
      ${!isCard ? `
        <div class="c-row">
          <label>نوع الحساب</label>
          <select id="fpAccType">
            <option value="cash" ${(existingAcc?.type||'bank')==='cash'?'selected':''}>كاش</option>
            <option value="bank" ${(existingAcc?.type||'bank')==='bank'?'selected':''}>حساب بنكي</option>
            <option value="wallet" ${existingAcc?.type==='wallet'?'selected':''}>محفظة إلكترونية</option>
            <option value="prepaid" ${existingAcc?.type==='prepaid'?'selected':''}>بطاقة مسبقة الدفع</option>
          </select>
        </div>
        <div class="c-row">
          <label>${isEdit && existingAcc ? 'الرصيد الحالي' : 'الرصيد الافتتاحي'}</label>
          <input id="fpAccBal" type="number" step="0.01" inputmode="decimal" value="${curBal}">
        </div>
      ` : `
        <div class="c-row">
          <label>الحد الائتماني</label>
          <input id="fpCardLimit" type="number" step="0.01" inputmode="decimal" value="${curLimit || ''}" placeholder="">
        </div>
        <div class="c-row">
          <label>الرصيد المتاح</label>
          <input id="fpCardAvail" type="number" step="0.01" inputmode="decimal" value="${existingCard ? curAvail : ''}" placeholder="">
        </div>
        <div class="c-row">
          <label>يوم إغلاق الكشف</label>
          <input id="fpCardCloseDay" type="number" min="1" max="31" value="${curCloseDay}">
        </div>
        <div class="c-row">
          <label>يوم السداد</label>
          <input id="fpCardPayDay" type="number" min="1" max="31" value="${curPayDay}">
        </div>
      `}
    </div>

    ${isCard ? `
      <details class="fold" style="margin-top:4px">
        <summary><span class="ic-txt"><i>%</i><span>نظام التقسيط للبطاقة</span></span><span class="fold-arrow">▼</span></summary>
        <div class="fold-body">
          <div style="display:grid;grid-template-columns:46% 27% 27%;padding:4px 8px 8px;font-size:.68rem;color:var(--mint);border-bottom:1px solid var(--line);margin-bottom:6px">
            <span>المدة</span><span style="text-align:center">فائدة %</span><span style="text-align:center">رسوم %</span>
          </div>
          <div class="c-list">${cardTermsHtml}</div>
        </div>
      </details>
    ` : ''}

    <div class="c-list">
      <div class="c-row">
        <label>تضمين في الإجماليات</label>
        <label class="xw-switch"><input type="checkbox" id="fpIncludeTotals" ${incTotals?'checked':''}><span class="xw-slider"></span></label>
      </div>
      <div class="c-row">
        <label>إخفاء من المحفظة</label>
        <label class="xw-switch"><input type="checkbox" id="fpHiddenItem" ${isHidden?'checked':''}><span class="xw-slider"></span></label>
      </div>
    </div>

    <button type="button" class="primary acc-fp-save-btn" onclick="saveFullAccountCardForm()">حفظ</button>
  `;
  syncCustomSelectTriggers();
}

function saveFullAccountCardForm(){
  const isCard = (_fpAccState.entityKind === 'card');
  const isEdit = (_fpAccState.mode === 'edit');
  const name = val('fpEntName').trim();
  if(!name) return toast('اكتب الاسم أولاً');
  const includeInTotals = !!document.getElementById('fpIncludeTotals')?.checked;
  const hidden = !!document.getElementById('fpHiddenItem')?.checked;

  if(!isCard){
    const accType = val('fpAccType') || 'bank';
    const targetBal = num('fpAccBal');
    if(isEdit && _fpAccState.origKind === 'account'){
      const acc = state.accounts.find(a=>String(a.id)===String(_fpAccState.id));
      if(!acc) return;
      const oldBal = accountBalance(acc);
      const diff = round2(targetBal - oldBal);
      acc.name = name; acc.type = accType; acc.currency = 'EGP';
      acc.includeInTotals = includeInTotals; acc.hidden = hidden;
      if(Math.abs(diff) >= 0.01){
        state.ledger.push({id:uid('adj'),type:'adjust',from:acc.id,delta:diff,amount:Math.abs(diff),currency:'EGP',note:'تسوية رصيد الحساب',date:today()});
      }
      closeAccountModal(); persist(); try{refreshSecondaryFeeds();}catch(_){} toast('تم حفظ التعديلات ✓');
      return;
    }
    // New Account OR converted from Card -> Account
    const newAcc = { id:uid('acc'), name, type:accType, currency:'EGP', opening:targetBal, includeInTotals, hidden };
    state.accounts.push(newAcc);
    if(isEdit && _fpAccState.origKind === 'card'){
      state.cards = (state.cards||[]).filter(c=>String(c.id)!==String(_fpAccState.id));
      closeFullStatementModal();
    }
    closeAccountModal(); persist(); toast(isEdit ? 'تم التحويل إلى حساب ✓' : 'تمت إضافة الحساب ✓');
    return;
  }

  // Card
  const limit = num('fpCardLimit');
  const avail = num('fpCardAvail');
  const payDay = num('fpCardPayDay') || 3;
  const statementDay = num('fpCardCloseDay') || 1;
  if(limit <= 0) return toast('أدخل الحد الائتماني');
  const newTerms = {};
  [3,6,9,12,18,24].forEach(m => {
    newTerms[m] = { monthlyRate: round2(num('fpIr'+m)/100), adminRate: round2(num('fpFee'+m)/100) };
  });

  if(isEdit && _fpAccState.origKind === 'card'){
    const card = state.cards.find(c=>String(c.id)===String(_fpAccState.id));
    if(!card) return;
    card.name = name; card.limit = limit; card.payDay = payDay; card.statementDay = statementDay;
    card.includeInTotals = includeInTotals; card.hidden = hidden;
    const opsOut = cardOpsOutstandingFor(card.id);
    card.balance = round2(Math.max(0, limit - avail - opsOut));
    card.terms = { ...(card.terms||{}), ...newTerms };
    syncCardInstallmentsToCommitments();
    closeAccountModal(); persist(); try{refreshSecondaryFeeds();}catch(_){} toast('تم حفظ تعديلات البطاقة ✓');
    return;
  }

  // New Card OR converted from Account -> Card
  const newCard = {
    id: uid('card'), name, currency:'EGP', limit, payDay, statementDay,
    balance: round2(Math.max(0, limit - avail)),
    terms: newTerms, includeInTotals, hidden
  };
  state.cards.push(newCard);
  if(isEdit && _fpAccState.origKind === 'account'){
    const oldAcc = state.accounts.find(a=>String(a.id)===String(_fpAccState.id));
    (state.transactions||[]).forEach(t=>{ if(String(t.accountId)===String(_fpAccState.id) && !t.accountLabel && oldAcc) t.accountLabel = oldAcc.name; });
    state.accounts = (state.accounts||[]).filter(a=>String(a.id)!==String(_fpAccState.id));
    closeFullStatementModal();
  }
  closeAccountModal(); persist(); toast(isEdit ? 'تم التحويل إلى بطاقة ✓' : 'تمت إضافة البطاقة ✓');
}

function openStatementEntitySwitcher(){
  const curKind = activeStatementState?.kind || 'account';
  const curId = String(activeStatementState?.id || '');
  const accBtns = (state.accounts || []).filter(a=>!a.hidden).map(a => {
    const sel = (curKind === 'account' && String(a.id) === curId);
    return `<button type="button" class="cs-opt-btn ${sel?'selected':''}" onclick="closeAppDialog();openAccountStatement('${escJs(a.id)}')"><span>🏦 ${esc(a.name)}</span><span>${sel?'●':'○'}</span></button>`;
  }).join('');
  const cardBtns = (state.cards || []).filter(c=>!c.hidden).map(c => {
    const sel = (curKind === 'card' && String(c.id) === curId);
    return `<button type="button" class="cs-opt-btn ${sel?'selected':''}" onclick="closeAppDialog();openCardStatement('${escJs(c.id)}')"><span>💳 ${esc(c.name)}</span><span>${sel?'●':'○'}</span></button>`;
  }).join('');
  const html = `<div class="cs-opt-list">${accBtns}${cardBtns}</div>`;
  showAppCustomForm('اختر الحساب أو البطاقة', html, null, true);
}


/* V15.2.9: Auto-clear numeric fields on focus in Add/Edit Account & Card modal */
(function initAccountModalAutoClearNumbers(){
  const modal = document.getElementById('accountModal');
  if(!modal || modal.dataset.autoClearBound) return;
  modal.dataset.autoClearBound = '1';
  modal.addEventListener('focusin', (e) => {
    const el = e.target;
    if(el && el.tagName === 'INPUT' && el.type === 'number'){
      el.dataset.prevVal = el.value;
      el.value = '';
    }
  });
  modal.addEventListener('focusout', (e) => {
    const el = e.target;
    if(el && el.tagName === 'INPUT' && el.type === 'number'){
      if(el.value.trim() === '' && el.dataset.prevVal !== undefined){
        el.value = el.dataset.prevVal;
      }
    }
  });
})();
