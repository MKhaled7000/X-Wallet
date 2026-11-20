/* X-Wallet V14.0 module: installments.js | Extracted from V13.40 app.js */

/* ---- Original app.js lines 3292-3375 ---- */
function selectOpMonthsPill(mVal, btn){
  setv('opMonths', mVal);
  document.querySelectorAll('#opMonthsPills .m-pill').forEach(b=>b.classList.toggle('active', b===btn));
  showCreditQuote();
}
function setCardOpType(t){
  setv('opType', t);
  document.getElementById('segOpSwipe')?.classList.toggle('active', t==='swipe');
  document.getElementById('segOpInst')?.classList.toggle('active', t==='installment');
  document.querySelectorAll('.installment-only').forEach(e=>e.style.display = t==='installment' ? 'flex' : 'none');
  showCreditQuote();
}

function openCardOpPurchasePicker(){
  openCompactYMPicker('opPurchase', false, ()=>{
    showCreditQuote();
  });
}

function showCreditQuote(){
  const el = document.getElementById('creditQuote'); if(!el) return;
  const card = state.cards.find(c=>c.id===val('opCard')), amount = num('opAmount'), months = num('opMonths')||12;
  if(!card || !amount || val('opType')!=='installment'){
    el.innerHTML='<div class="empty" style="padding:10px">أدخل المبلغ لعرض جدول الفائدة/الرسوم وأول قسط.</div>';
    return;
  }
  const nums = computeCardInstallmentNumbers(card, amount, months);
  const { isSuez, interest, fee, base } = nums;
  const purchaseYM = val('opPurchaseVal') || selected();
  const built = buildInstallmentSchedulesForCard(card, purchaseYM, months, base, fee, nums.principalAndInterest);

  const firstRowLabel = isSuez ? 'رسوم إدارية' : 'فائدة';
  const firstRowAmt = isSuez ? fee : round2(interest / months);
  const firstRowMonth = isSuez ? formatYMArabic(built.feeYM) : formatYMArabic(built.firstInstYM);
  const instRowAmt = base;

  el.innerHTML = `
    <table class="com-all-table" style="font-size:.74rem">
      <thead>
        <tr>
          <th>البند</th>
          <th>المبلغ</th>
          <th>شهر الاستحقاق</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><b>${firstRowLabel}</b></td>
          <td dir="ltr" class="orange"><b>${fmtNum(firstRowAmt)}</b></td>
          <td>${esc(firstRowMonth)}</td>
        </tr>
        <tr>
          <td><b>أول قسط</b></td>
          <td dir="ltr" class="mint"><b>${fmtNum(instRowAmt)}</b></td>
          <td>${esc(formatYMArabic(built.firstInstYM))}</td>
        </tr>
      </tbody>
    </table>
  `;
}

function addCardOperation(){
  let card=state.cards.find(c=>c.id===val('opCard')), type=val('opType')||'installment', amount=num('opAmount'), title=val('opTitle').trim();
  const purchaseYM = val('opPurchaseVal') || selected();
  const date = purchaseYM + '-01';
  if(!card||!amount||!title) return toast('أكمل بيانات البطاقة والوصف والمبلغ');
  const nowTs = Date.now();
  let op={id:uid('op'), cardId:card.id, type, title, amount, date, purchaseMonth:purchaseYM, paid:0, dueDate:dueDateFor(card,date), createdAt:nowTs};
  if(type==='installment'){
    const months = num('opMonths')||12;
    const nums = computeCardInstallmentNumbers(card, amount, months);
    const built = buildInstallmentSchedulesForCard(card, purchaseYM, months, nums.base, nums.fee, nums.principalAndInterest);
    op.months=months; op.interest=nums.interest; op.adminFee=nums.fee; op.installment=nums.base; op.total=nums.total;
    op.feeMonth=built.feeYM; op.feeDue=nums.fee; op.feePaid=0;
    op.schedules=built.schedules;
  }
  op.currency=String(card.currency||'EGP').toUpperCase();
  const currencyFields=transactionCurrencySnapshot(amount,op.currency,date);
  Object.assign(op,currencyFields);
  state.cardOps.push(op);
  state.transactions.push({id:'card-purchase-'+op.id, type:'card_purchase', title:'شراء بالبطاقة - '+title, category:'مشتريات بطاقة', amount, date, ...currencyFields, accountId:null, source:'card-purchase:'+op.id, createdAt:nowTs});
  if(type==='installment') syncCardInstallmentsToCommitments();
  persist(); setv('opTitle',''); setv('opAmount','');
  document.getElementById('addCommitmentFold')?.removeAttribute('open');
  toast('تم تسجيل عملية البطاقة وإدراجها في المستحقات ✓');
}


/* ---- Original app.js lines 3430-3452 ---- */
function syncCardInstallmentsToCommitments(){
  const validOpIds = new Set((state.cardOps||[]).filter(o=>o.type==='installment').map(o=>o.id));
  state.commitments = (state.commitments||[]).filter(c => !c.cardOpId || validOpIds.has(c.cardOpId));
  for(const op of (state.cardOps||[])){
    if(op.type !== 'installment') continue;
    const cName = state.cards.find(c=>c.id===op.cardId)?.name || 'بطاقة';
    const comId = 'com-cardop-' + op.id;
    const firstM = op.schedules?.[0]?.month || op.feeMonth || String(op.date||'').slice(0,7);
    const lastM = op.schedules?.[op.schedules.length-1]?.month || firstM;
    const existing = state.commitments.find(c=>c.id===comId);
    if(!existing){
      state.commitments.push({id:comId, cardOpId:op.id, title:`${op.title} (${cName})`, type:'معاملات بالبطاقة', freq:'monthly', durationMonths:Number(op.months)||12, amount:round2(Number(op.installment)||0), currency:String(op.currency||state.cards.find(c=>c.id===op.cardId)?.currency||'EGP').toUpperCase(), start:firstM, end:lastM, day:3, createdAt:op.createdAt||Date.now()});
    } else {
      existing.title = `${op.title} (${cName})`;
      existing.type = 'معاملات بالبطاقة';
      existing.durationMonths = Number(op.months)||12;
      existing.amount = round2(Number(op.installment)||0);
      existing.currency = String(op.currency||state.cards.find(c=>c.id===op.cardId)?.currency||'EGP').toUpperCase();
      existing.start = firstM;
      existing.end = lastM;
    }
  }
}

