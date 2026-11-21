/* X-Wallet V14.0 module: financial-engine.js | Extracted from V13.40 app.js */

/* ---- Original app.js lines 1459-1576 ---- */
/* Accounting Core */
function isCardPurchaseTx(t){
  return t.type==='card_purchase' || String(t.source||'').startsWith('card-purchase:');
}
function monthTx(m){return state.transactions.filter(t=>!t.deletedAt&&monthKey(t.date)===m)}
function isActualExpenseTx(t){
  if(!t || t.deletedAt || t.type !== 'expense') return false;
  if(isCardPurchaseTx(t)) return false;
  if(t.source === 'card-payment') return false;
  return true;
}
function amountForBaseCurrency(transaction){
  if(typeof transactionBaseAmount==='function')return transactionBaseAmount(transaction);
  return Number(transaction?.amount)||0;
}
function totals(m){
  const a=monthTx(m);
  const inc=round2(a.filter(t=>t.type==='income').reduce((s,t)=>s+amountForBaseCurrency(t),0));
  const exp=round2(a.filter(t=>isActualExpenseTx(t)).reduce((s,t)=>s+amountForBaseCurrency(t),0));
  return{a,inc,exp,net:round2(inc-exp)};
}
function totalsForYear(year){
  const prefix=String(year);
  const a=(state.transactions||[]).filter(t=>t&&!t.deletedAt&&String(t.date||'').startsWith(prefix));
  const inc=round2(a.filter(t=>t.type==='income').reduce((sum,t)=>sum+amountForBaseCurrency(t),0));
  const exp=round2(a.filter(t=>isActualExpenseTx(t)).reduce((sum,t)=>sum+amountForBaseCurrency(t),0));
  return {a,inc,exp,net:round2(inc-exp)};
}
function amountInAccountCurrency(amount,sourceCurrency,targetCurrency,date,lockedSourceRate){
  if(typeof convertCurrencyAmount==='function')return convertCurrencyAmount(Number(amount)||0,sourceCurrency,targetCurrency,date,lockedSourceRate);
  return Number(amount)||0;
}
function accountBalance(a,wallet=state){
  if(!a)return 0;
  const currency=String(a.currency||'EGP').toUpperCase();
  let n=Number(a.opening)||0;
  for(const t of wallet.transactions||[]){
    if(t.deletedAt||String(t.accountId)!==String(a.id))continue;
    const amount=amountInAccountCurrency(t.amount,t.currency||currency,currency,t.date||(typeof today==='function'?today():new Date().toISOString().slice(0,10)),t.exchangeRateAtCreation??t.currencyRate);
    if(t.type==='income'||t.type==='fund')n+=amount;
    else if(t.type==='expense'||t.type==='credit_payment')n-=amount;
  }
  for(const l of wallet.ledger||[]){
    if(l.deletedAt)continue;
    if(l.type==='adjust'){
      if(String(l.from)===String(a.id))n+=amountInAccountCurrency(l.delta??l.amount,l.currency||currency,currency,l.date||(typeof today==='function'?today():new Date().toISOString().slice(0,10)),l.exchangeRateAtCreation);
      continue;
    }
    if(String(l.from)===String(a.id)){
      const fromAmount=l.fromAmount??l.amount;
      const hasLinkedFee=(wallet.transactions||[]).some(t=>!t.deletedAt&&(String(t.id)===String(l.feeTransactionId||'')||String(t.linkedTransferLedgerId||'')===String(l.id)));
      const fee=hasLinkedFee?0:(Number(l.fee)||0);
      n-=amountInAccountCurrency(fromAmount,l.fromCurrency||l.currency||currency,currency,l.date||(typeof today==='function'?today():new Date().toISOString().slice(0,10)),l.fromExchangeRateAtCreation??l.exchangeRateAtCreation);
      if(fee)n-=amountInAccountCurrency(fee,l.feeCurrency||l.fromCurrency||l.currency||currency,currency,l.date||(typeof today==='function'?today():new Date().toISOString().slice(0,10)),l.feeExchangeRateAtCreation);
    }
    if(String(l.to)===String(a.id)){
      const toAmount=l.toAmount??l.amount;
      n+=amountInAccountCurrency(toAmount,l.toCurrency||l.currency||currency,currency,l.date||(typeof today==='function'?today():new Date().toISOString().slice(0,10)),l.toExchangeRateAtCreation??l.exchangeRateAtCreation);
    }
  }
  return round2(n);
}
function allAccountsAvailable(){
  return round2((state.accounts||[]).filter(a=>a.type!=='credit').reduce((sum,a)=>{
    const balance=accountBalance(a),currency=String(a.currency||'EGP').toUpperCase();
    return sum+(typeof amountToBase==='function'?amountToBase(balance,currency):balance);
  },0));
}
function opOutstanding(op){
  return op.type==='installment'
    ? (op.schedules||[]).reduce((s,x)=>s+Math.max(0,(Number(x.amount)||0)-(Number(x.paid)||0)),0)+Math.max(0,(Number(op.feeDue)||0)-(Number(op.feePaid)||0))
    : Math.max(0,(Number(op.amount)||0)-(Number(op.paid)||0));
}
function cardOpsOutstandingFor(cardId,wallet=state){
  return (wallet.cardOps||[]).filter(o=>!o.deletedAt&&String(o.cardId)===String(cardId)).reduce((s,o)=>s+opOutstanding(o),0);
}
function cardTotalOutstanding(card,wallet=state){
  return round2(Math.max(0,Number(card.balance)||0) + cardOpsOutstandingFor(card.id,wallet));
}
function cardCurrentAvailable(card){
  const lim=Number(card.limit)||0;
  if(lim<=0) return 0;
  return round2(Math.max(0, lim - cardTotalOutstanding(card)));
}
function allCardsOutstanding(){
  // Card limits and operations are stored in each card's native currency;
  // aggregate liabilities must be converted to the app base currency (EGP).
  return round2((state.cards||[]).reduce((sum,card)=>{
    const currency=String(card.currency||'EGP').toUpperCase();
    const outstanding=cardTotalOutstanding(card);
    return sum+(typeof amountToBase==='function'?amountToBase(outstanding,currency):outstanding);
  },0));
}
function commitmentDue(c,month){
  const st = String(c.start||'0000-01');
  const en = String(c.end||'');
  return month >= st && (!en || month <= en);
}

function isSuezCanalBankCard(card){
  const nm = String(card?.name||'').toLowerCase();
  return nm.includes('قناة السويس') || nm.includes('قناه السويس') || nm.includes('suez');
}
function computeCardInstallmentNumbers(card, amount, months, customIrDec, customFeeDec){
  const isSuez = isSuezCanalBankCard(card);
  const t = (card?.terms || {})[months] || {monthlyRate:0, adminRate:0};
  const mRate = (customIrDec !== undefined && customIrDec !== null) ? customIrDec : (Number(t.monthlyRate)||0);
  const aRate = (customFeeDec !== undefined && customFeeDec !== null) ? customFeeDec : (Number(t.adminRate)||0);
  if(isSuez){
    // Suez Canal Bank: Installment is strictly (amount / months) e.g. 6000 / 6 = 1000! Admin fee is paid in month 1.
    const effAdminRate = aRate > 0 ? aRate : (mRate * months);
    const fee = round2(amount * effAdminRate);
    const base = round2(amount / months);
    return { isSuez: true, interest: 0, fee, base, principalAndInterest:round2(amount), total: round2(amount + fee) };
  }
  const interest = round2(amount * mRate * months);
  const fee = round2(amount * aRate);
  const base = round2((amount + interest) / months);
  return { isSuez: false, interest, fee, base, principalAndInterest:round2(amount + interest), total: round2(amount + interest + fee) };
}

function buildInstallmentSchedulesForCard(card, purchaseYM, months, baseInstallment, fee, principalAndInterestTotal){
  const isSuez = isSuezCanalBankCard(card);
  const feeYM = addMonthsYM(purchaseYM, 1);
  const firstInstOffset = isSuez ? 2 : 1;
  const count=Math.max(1,Math.floor(Number(months)||1));
  const base=round2(Number(baseInstallment)||0);
  const target=Number.isFinite(Number(principalAndInterestTotal))?round2(Number(principalAndInterestTotal)):round2(base*count);
  let [py, pm] = purchaseYM.split('-').map(Number);
  const schedules = Array.from({length: count}, (_, i) => {
    const dt = new Date(py, (pm - 1) + firstInstOffset + i, 1);
    const mk = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0');
    const installmentAmount=i===count-1?round2(target-base*(count-1)):base;
    return { month: mk, amount: installmentAmount, principalAndInterest: installmentAmount, fee: 0, paid: 0 };
  });
  return { feeYM, firstInstYM: schedules[0]?.month || feeYM, schedules };
}

// Auto-heal any existing Suez Canal Bank installment ops so 6000 / 6 is 1000
function healSuezCanalBankOps(){
  for(const op of (state.cardOps || [])){
    if(op.type !== 'installment') continue;
    const card = (state.cards || []).find(c => c.id === op.cardId);
    if(card && isSuezCanalBankCard(card)){
      const m = Number(op.months) || 12;
      const amt = Number(op.amount) || 0;
      const expectedBase = round2(amt / m);
      const oldSchedules=Array.isArray(op.schedules)?op.schedules:[];
      const scheduledTotal=round2(oldSchedules.reduce((sum,sc)=>sum+(Number(sc.amount)||0),0));
      const scheduleMismatch=oldSchedules.length!==m||Math.abs(scheduledTotal-amt)>0.009;
      const installmentMismatch=Math.abs((Number(op.installment)||0)-expectedBase)>0.009;
      if(amt > 0 && (installmentMismatch||scheduleMismatch)){
        const nums = computeCardInstallmentNumbers(card, amt, m);
        if((Number(op.feeDue)||0) <= 0 && nums.fee > 0) op.feeDue = nums.fee;
        op.adminFee = op.feeDue || nums.fee;
        op.interest = 0;
        op.installment = expectedBase;
        op.total = round2(amt + (Number(op.feeDue)||0));
        const purchaseYM=op.purchaseMonth||String(op.date||today()).slice(0,7);
        const paidByMonth=new Map(oldSchedules.map(sc=>[String(sc.month),Number(sc.paid)||0]));
        const built=buildInstallmentSchedulesForCard(card,purchaseYM,m,expectedBase,op.feeDue||nums.fee,amt);
        op.purchaseMonth=purchaseYM;
        op.feeMonth=op.feeMonth||built.feeYM;
        op.feeDue=Number(op.feeDue)||nums.fee;
        op.schedules=built.schedules.map(sc=>({...sc,paid:Math.min(sc.amount,paidByMonth.get(String(sc.month))||0)}));
      }
    }
  }
}
healSuezCanalBankOps();

