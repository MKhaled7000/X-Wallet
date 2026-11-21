/* X-Wallet V14.0 module: installments.js | Extracted from V13.40 app.js */

/* ---- Original app.js lines 3292-3375 ---- */





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

