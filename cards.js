
let walletToolbarMode = '';
function toggleWalletToolbarMode(mode){
  walletToolbarMode = (walletToolbarMode === mode) ? '' : mode;
  const wEl = document.getElementById('wallet');
  if(wEl){
    wEl.classList.toggle('wallet-mode-edit', walletToolbarMode === 'edit');
    wEl.classList.toggle('wallet-mode-reorder', walletToolbarMode === 'reorder');
    wEl.classList.toggle('wallet-mode-hide', walletToolbarMode === 'hide');
    wEl.classList.toggle('wallet-mode-delete', walletToolbarMode === 'delete');
  }
  document.getElementById('wtBtnEdit')?.classList.toggle('active', walletToolbarMode === 'edit');
  document.getElementById('wtBtnReorder')?.classList.toggle('active', walletToolbarMode === 'reorder');
  document.getElementById('wtBtnHide')?.classList.toggle('active', walletToolbarMode === 'hide');
  document.getElementById('wtBtnDelete')?.classList.toggle('active', walletToolbarMode === 'delete');
  renderAccountsAndCards();
}
function toggleWalletSectionCollapse(cardId){
  document.getElementById(cardId)?.classList.toggle('collapsed');
}
function openWalletAddChoiceModal(){
  const html = `<div style="display:flex;flex-direction:column;gap:8px">
    <button type="button" class="primary" onclick="closeAppDialog();openAddAccountFullModal()">🏦 إضافة حساب جديد</button>
    <button type="button" class="secondary" style="border-color:var(--mint);color:var(--mint)" onclick="closeAppDialog();openAddCardFullModal()">💳 إضافة بطاقة ائتمان</button>
  </div>`;
  showAppCustomForm('إضافة إلى المحفظة', html, null, true);
}
function toggleWalletItemHidden(kind, id){
  const list = kind === 'card' ? (state.cards||[]) : (state.accounts||[]);
  const obj = list.find(x=>String(x.id)===String(id));
  if(!obj) return;
  obj.hidden = !obj.hidden;
  persist();
  toast(obj.hidden ? 'تم إخفاء البند من المحفظة' : 'تم إظهار البند ✓');
}

let walletReorderMode = { account: false, card: false };

/* X-Wallet V14.0 module: cards.js | Extracted from V13.40 app.js */

/* ---- Original app.js lines 2983-3291 ---- */
function reorderWalletItems(entityType,orderedIds){
  const key=entityType==='account'?'accounts':'cards';
  const current=Array.isArray(state[key])?state[key]:[];
  const byId=new Map(current.map(x=>[String(x.id),x]));
  const selectedIds=new Set((orderedIds||[]).map(String));
  const reordered=[];const seen=new Set();
  (orderedIds||[]).forEach(id=>{const item=byId.get(String(id));if(item&&!seen.has(String(id))){reordered.push(item);seen.add(String(id));}});
  let cursor=0;
  state[key]=current.map(item=>selectedIds.has(String(item.id))&&cursor<reordered.length?reordered[cursor++]:item);
  persist();toast(entityType==='account'?'تم حفظ ترتيب الحسابات ✓':'تم حفظ ترتيب البطاقات ✓');
}
function renderAccountsAndCards(){
  const showHidden = (walletToolbarMode === 'hide');
  const allAccounts = (state.accounts || []);
  const allCards = (state.cards || []);
  const visibleAccounts = showHidden ? allAccounts : allAccounts.filter(a => !a.hidden);
  const visibleCards = showHidden ? allCards : allCards.filter(c => !c.hidden);

  // Money Manager exact summary math (57492.jpg):
  // الأصول (Assets) = sum of POSITIVE balances of active included accounts
  // المديونيات (Liabilities) = sum of card debts + abs(NEGATIVE balances of active included accounts)
  // الصافي (Net) = الأصول - المديونيات
  let assetsPos = 0, accNegDebt = 0, accountsNet = 0;
  for(const a of allAccounts){
    if(a.hidden || a.includeInTotals === false) continue;
    const b = accountBalance(a);
    accountsNet = round2(accountsNet + b);
    if(b >= 0) assetsPos = round2(assetsPos + b);
    else accNegDebt = round2(accNegDebt + Math.abs(b));
  }
  let cardsDebtSum = 0, cardsAvailSum = 0;
  for(const c of allCards){
    if(c.hidden || c.includeInTotals === false) continue;
    cardsDebtSum = round2(cardsDebtSum + cardTotalOutstanding(c));
    cardsAvailSum = round2(cardsAvailSum + cardCurrentAvailable(c));
  }
  const liabilitiesTotal = round2(cardsDebtSum + accNegDebt);
  const netTotal = round2(assetsPos - liabilitiesTotal);

  const wsAcc = document.getElementById('walletSumAccounts');
  const wsCard = document.getElementById('walletSumCards');
  const wsNet = document.getElementById('walletSumNet');
  if(wsAcc) wsAcc.textContent = maskable(fmtNum(assetsPos));
  if(wsCard) wsCard.textContent = maskable(fmtNum(liabilitiesTotal));
  if(wsNet){ wsNet.textContent = maskable(fmtNum(netTotal)); wsNet.className = netTotal >= 0 ? 'mint' : 'red'; }

  const accountsTotalEl = document.getElementById('accountsTotal');
  if(accountsTotalEl){
    accountsTotalEl.textContent = maskable(fmtNum(accountsNet));
    accountsTotalEl.className = 'wth-right-total ' + (accountsNet >= 0 ? 'blue' : 'red');
  }
  const cardAvailEl = document.getElementById('cardAvailTotal');
  if(cardAvailEl) cardAvailEl.textContent = maskable(fmtNum(cardsAvailSum));
  const cardTotalEl = document.getElementById('cardDebtTotal');
  if(cardTotalEl) cardTotalEl.textContent = maskable(fmtNum(cardsDebtSum));

  const renderAccountRow = a => {
    const b = accountBalance(a);
    const balCls = b < 0 ? 'red' : (b > 0 ? 'blue' : '');
    return `<div class="listitem wallet-order-row ${a.hidden?'is-hidden-item':''}" data-cat-name="${esc(a.id)}" onclick="${walletToolbarMode==='edit' ? `openEditAccountModal('${escJs(a.id)}')` : `openAccountStatement('${escJs(a.id)}')`}">
      <button type="button" class="cat-drag-handle wallet-order-handle wallet-left-drag" onclick="event.stopPropagation()" title="اسحب لإعادة الترتيب">☰</button>
      <div class="info"><b>${esc(a.name)}</b></div>
      <strong class="${balCls}">${maskable(fmtNum(b))}</strong>
      <button type="button" class="wallet-row-mode-btn wallet-row-hide-btn" onclick="event.stopPropagation();toggleWalletItemHidden('account','${escJs(a.id)}')" title="${a.hidden?'إظهار':'إخفاء'}">${a.hidden?'🙈':'👁'}</button>
      <button type="button" class="wallet-row-mode-btn wallet-row-del-btn" onclick="event.stopPropagation();deleteAccount('${escJs(a.id)}')" title="حذف">🗑</button>
    </div>`;
  };

  const accList = document.getElementById('accountsList');
  if(accList){
    accList.innerHTML = visibleAccounts.length
      ? `<div id="accountsNativeReorder">${visibleAccounts.map(renderAccountRow).join('')}</div>`
      : '<div class="empty">لا توجد حسابات مسجلة.</div>';
    if(typeof initDragReorderContainer === 'function'){
      initDragReorderContainer(document.getElementById('accountsNativeReorder'), '.wallet-order-row', '.wallet-order-handle', ids => reorderWalletItems('account', ids));
    }
  }

  const renderCardRow = c => {
    const d = cardTotalOutstanding(c), av = cardCurrentAvailable(c);
    return `<div class="listitem wallet-order-row wallet-card-two-col ${c.hidden?'is-hidden-item':''}" data-cat-name="${esc(c.id)}" onclick="${walletToolbarMode==='edit' ? `openEditCardModal('${escJs(c.id)}')` : `openCardStatement('${escJs(c.id)}')`}">
      <button type="button" class="cat-drag-handle wallet-order-handle wallet-left-drag" onclick="event.stopPropagation()" title="اسحب لإعادة الترتيب">☰</button>
      <div class="info"><b>${esc(c.name)}</b></div>
      <div class="wallet-card-cols" dir="ltr">
        <span class="wc-avail ${av>0?'mint':''}">${maskable(fmtNum(av))}</span>
        <span class="wc-debt ${d>0?'red':''}">${maskable(fmtNum(d))}</span>
      </div>
      <button type="button" class="wallet-row-mode-btn wallet-row-hide-btn" onclick="event.stopPropagation();toggleWalletItemHidden('card','${escJs(c.id)}')" title="${c.hidden?'إظهار':'إخفاء'}">${c.hidden?'🙈':'👁'}</button>
      <button type="button" class="wallet-row-mode-btn wallet-row-del-btn" onclick="event.stopPropagation();deleteCard('${escJs(c.id)}')" title="حذف">🗑</button>
    </div>`;
  };

  const cardList = document.getElementById('cardsList');
  if(cardList){
    cardList.innerHTML = visibleCards.length
      ? `<div id="cardsNativeReorder">${visibleCards.map(renderCardRow).join('')}</div>`
      : '<div class="empty">لا توجد بطاقات مسجلة.</div>';
    if(typeof initDragReorderContainer === 'function'){
      initDragReorderContainer(document.getElementById('cardsNativeReorder'), '.wallet-order-row', '.wallet-order-handle', ids => reorderWalletItems('card', ids));
    }
  }
}


function cardOperationHasPayments(op){
  if(!op)return false;
  const fieldsPaid=Number(op.paid||0)>0 || Number(op.feePaid||0)>0 || (op.schedules||[]).some(sc=>Number(sc.paid||0)>0);
  const linkedPayment=(state.transactions||[]).some(t=>!t.deletedAt&&String(t.linkedCardOpId||'')===String(op.id)&&Number(t.settledAmount??t.amount)>0);
  const linkedPaymentRecord=(state.cardPayments||[]).some(p=>String(p.cardOpId||'')===String(op.id)&&Number(p.amount)>0);
  return fieldsPaid||linkedPayment||linkedPaymentRecord;
}
function cardOperationFinancialTermsChanged(op,nextAmount,nextDate){
  if(!op)return false;
  const amountChanged=Math.abs((Number(op.amount)||0)-(Number(nextAmount)||0))>0.000001;
  const dateChanged=String(op.date||'').slice(0,10)!==String(nextDate||'').slice(0,10);
  return amountChanged||dateChanged;
}
function canEditCardOperationFinancials(op,nextAmount,nextDate){
  return !cardOperationHasPayments(op)||!cardOperationFinancialTermsChanged(op,nextAmount,nextDate);
}
function canEditCardOperationTerms(op,next={}){
  if(!cardOperationHasPayments(op))return true;
  if(cardOperationFinancialTermsChanged(op,next.amount,next.date))return false;
  if(op.type==='installment'){
    if(next.months!==undefined&&Number(next.months)!==Number(op.months||12))return false;
    if(next.monthlyRate!==undefined&&Math.abs(Number(next.monthlyRate)-Number(next.currentMonthlyRate))>0.000001)return false;
    if(next.adminRate!==undefined&&Math.abs(Number(next.adminRate)-Number(next.currentAdminRate))>0.000001)return false;
  }
  return true;
}

function recalculateInstallmentOpWithTerms(op, card, monthlyRateDecimal, adminRateDecimal){
  if(op.type !== 'installment') return;
  const amount = Number(op.amount)||0;
  const months = Number(op.months)||12;
  const nums = computeCardInstallmentNumbers(card, amount, months, monthlyRateDecimal, adminRateDecimal);
  const { interest, fee, base } = nums;
  const purchaseYM = op.purchaseMonth || String(op.date||today()).slice(0,7);
  const oldPaidByMonth = {};
  (op.schedules||[]).forEach(sc=>{ oldPaidByMonth[sc.month] = Number(sc.paid)||0; });
  const built = buildInstallmentSchedulesForCard(card, purchaseYM, months, base, fee, nums.principalAndInterest);
  op.purchaseMonth = purchaseYM;
  op.interest = interest;
  op.adminFee = fee;
  op.installment = base;
  op.total = round2(amount + interest + fee);
  op.feeMonth = built.feeYM;
  op.feeDue = fee;
  op.schedules = built.schedules.map(sc=>({
    ...sc,
    paid: Math.min(sc.amount, oldPaidByMonth[sc.month]||0)
  }));
}

function openEditCardModal(cardId){ if(typeof openEditCardFullModal==='function'){ openEditCardFullModal(cardId); return; }
  const card = state.cards.find(c=>c.id===cardId);
  if(!card) return;
  const curAvail = cardCurrentAvailable(card);
  const terms = card.terms || {};
  const termMonths = [3,6,9,12,15,18,24];
  const termsRowsHtml = termMonths.map(m=>{
    const t = terms[m] || {monthlyRate:0, adminRate:0};
    const irPct = round2((Number(t.monthlyRate)||0) * 100);
    const feePct = round2((Number(t.adminRate)||0) * 100);
    return `<div class="c-row" style="min-height:38px;padding:4px 8px">
      <label>${m} شهر</label>
      <div style="display:flex;gap:6px;width:62%">
        <input id="edIr${m}" type="number" step="0.01" value="${irPct}" placeholder="فائدة %" style="width:50%">
        <input id="edFee${m}" type="number" step="0.01" value="${feePct}" placeholder="رسوم %" style="width:50%">
      </div>
    </div>`;
  }).join('');

  const formHtml = `
    <div class="c-list">
      <div class="c-row"><label>اسم البطاقة</label><input id="edCardName" value="${esc(card.name)}"></div>
      <input type="hidden" id="edCardCurrency" value="EGP">
      <div class="c-row"><label>الحد الائتماني (EGP)</label><input id="edCardLimit" type="number" step="0.01" value="${Number(card.limit)||0}"></div>
      <div class="c-row"><label>الرصيد المتاح (EGP)</label><input id="edCardAvail" type="number" step="0.01" value="${curAvail}"></div>
      <div class="c-row"><label>يوم السداد</label><input id="edCardPayDay" type="number" min="1" max="28" value="${card.payDay||3}"></div>
    </div>
    <div style="margin-top:8px"><button type="button" class="smallbtn" style="width:100%;height:34px;border-color:var(--blue);color:var(--blue)" onclick="openConvertCardToAccountModal('${card.id}')">🏦 تحويل هذه البطاقة إلى حساب عادي</button></div>
    <details class="fold" style="margin-top:8px" open>
      <summary><span class="ic-txt"><i>%</i><span>تعديل نظام التقسيط للبطاقة</span></span><span>▼</span></summary>
      <div class="fold-body">
        <div style="display:grid;grid-template-columns:38% 31% 31%;padding:4px 8px 8px;font-size:.68rem;color:var(--mint);border-bottom:1px solid var(--line);margin-bottom:6px">
          <span>المدة</span>
          <span style="text-align:center">الفائدة الشهرية %</span>
          <span style="text-align:center">الرسوم الإدارية %</span>
        </div>
        <div class="c-list">${termsRowsHtml}</div>
      </div>
    </details>
  `;

  showAppCustomForm('تعديل البطاقة: ' + card.name, formHtml, ()=>{
    const nm = val('edCardName').trim();
    const lim = num('edCardLimit');
    const av = num('edCardAvail');
    if(!nm || lim <= 0){ toast('أكمل اسم البطاقة والحد الائتماني'); return false; }
    const requestedCurrency='EGP';

    const newTerms = {...(card.terms||{})};
    let termsChanged = false;
    termMonths.forEach(m=>{
      const oldT = (card.terms||{})[m] || {monthlyRate:0, adminRate:0};
      const newIr = round2(num('edIr'+m)/100);
      const newFee = round2(num('edFee'+m)/100);
      if(Math.abs(newIr - (oldT.monthlyRate||0)) > 0.00001 || Math.abs(newFee - (oldT.adminRate||0)) > 0.00001){
        termsChanged = true;
      }
      newTerms[m] = { monthlyRate: newIr, adminRate: newFee };
    });

    const hasExistingInstOps = state.cardOps.some(o=>o.cardId===card.id && o.type==='installment');
    card.name = nm;
    card.currency = requestedCurrency;
    card.limit = lim;
    card.payDay = num('edCardPayDay') || 3;
    const opsOut = cardOpsOutstandingFor(card.id);
    card.balance = round2(Math.max(0, lim - av - opsOut));
    card.terms = newTerms;

    if(termsChanged && hasExistingInstOps){
      setTimeout(()=>{
        const askHtml = `
          <p class="hint" style="margin:0 0 12px;font-size:.8rem;color:var(--text)">تم تغيير نظام التقسيط للبطاقة. هل تريد تطبيق التعديل على:</p>
          <div style="display:flex;flex-direction:column;gap:8px">
            <button type="button" class="primary" onclick="applyCardTermsScope('${card.id}', 'new_only')">المعاملات الجديدة فقط</button>
            <button type="button" class="secondary" style="border-color:var(--mint);color:var(--mint)" onclick="applyCardTermsScope('${card.id}', 'all')">الجديدة والحالية غير المسددة فقط</button>
            <small class="hint">لن يعاد احتساب أي عملية عليها سداد سابق؛ حفاظاً على سجل المبالغ المسددة.</small>
          </div>
        `;
        showAppCustomForm('نطاق تطبيق نظام التقسيط', askHtml, null, true);
      }, 80);
      return true;
    }

    syncCardInstallmentsToCommitments();
    persist();
    toast('تم تعديل البطاقة ✓');
    return true;
  });
}

function applyCardTermsScope(cardId, scope){
  const card = state.cards.find(c=>String(c.id)===String(cardId));
  let recalculated=0,skippedPaid=0;
  if(card && scope === 'all'){
    state.cardOps.filter(o=>String(o.cardId)===String(cardId) && o.type==='installment').forEach(op=>{
      if(cardOperationHasPayments(op)){skippedPaid++;return;}
      const m = Number(op.months)||12;
      const trm = (card.terms||{})[m] || {monthlyRate:0, adminRate:0};
      recalculateInstallmentOpWithTerms(op, card, trm.monthlyRate||0, trm.adminRate||0);
      recalculated++;
    });
  }
  syncCardInstallmentsToCommitments();
  closeAppDialog();
  persist();
  if(scope==='all')toast(`تم تحديث ${recalculated} عملية غير مسددة وتجاهل ${skippedPaid} عملية لها سداد سابق ✓`);
  else toast('تم حفظ النظام للمعاملات الجديدة فقط ✓');
}

function deleteCard(cardId){
  const card=(state.cards||[]).find(c=>String(c.id)===String(cardId));
  if(!card)return;
  showAppConfirm('حذف البطاقة', 'يمكن حذف البطاقة فقط إذا لم تكن لها عمليات أو أرصدة أو سجلات سداد. هل تريد المتابعة؟', ()=>{
    const hasOps=(state.cardOps||[]).some(o=>String(o.cardId)===String(cardId));
    const hasPayments=(state.cardPayments||[]).some(p=>String(p.cardId)===String(cardId));
    const hasLinkedTransactions=(state.transactions||[]).some(t=>String(t.linkedCardOpId||'')!=='' && (state.cardOps||[]).some(o=>String(o.id)===String(t.linkedCardOpId)&&String(o.cardId)===String(cardId))) || (state.transactions||[]).some(t=>String(t.source||'').startsWith('card-purchase:')&&(state.cardOps||[]).some(o=>String(o.id)===String(t.source).slice('card-purchase:'.length)&&String(o.cardId)===String(cardId)));
    const hasArchivedReferences=(state.cancelledTransactions||[]).some(x=>String(x.related?.cardPurchaseOp?.cardId||x.related?.cardOp?.cardId||'')===String(cardId)) || (state.auditLog||[]).some(e=>e.action==='حذف'&&e.before&&['عملية بطاقة','سداد بطاقة'].includes(e.entity)&&String(e.before.cardId||'')===String(cardId));
    if(hasOps||hasPayments||hasLinkedTransactions||hasArchivedReferences||Math.abs(Number(card.balance)||0)>0.000001){
      setTimeout(() => {
        showAppConfirm(
          'تأكيد الحذف النهائي للبطاقة',
          `البطاقة «${card.name}» مرتبطة بعمليات أو سجلات سداد.\n\nهل تريد حذف البطاقة نهائياً مع جميع عملياتها وسداداتها؟`,
          () => {
            const opIds = new Set((state.cardOps||[]).filter(o=>String(o.cardId)===String(cardId)).map(o=>String(o.id)));
            const payIds = new Set((state.cardPayments||[]).filter(p=>String(p.cardId)===String(cardId)).map(p=>String(p.id)));
            const cNameLow = String(card.name||'').trim().toLowerCase();
            state.cardOps = (state.cardOps||[]).filter(o=>String(o.cardId)!==String(cardId));
            state.cardPayments = (state.cardPayments||[]).filter(p=>String(p.cardId)!==String(cardId));
            state.transactions = (state.transactions||[]).filter(t=>{
              if(t.linkedCardOpId && opIds.has(String(t.linkedCardOpId))) return false;
              if(t.linkedCardPaymentRecordId && payIds.has(String(t.linkedCardPaymentRecordId))) return false;
              if(t.source && String(t.source).startsWith('card-purchase:') && opIds.has(String(t.source).slice('card-purchase:'.length))) return false;
              if(t.source === 'card-payment' && cNameLow && String(t.title||'').toLowerCase().includes(cNameLow)) return false;
              return true;
            });
            state.cards = (state.cards||[]).filter(c=>String(c.id)!==String(cardId));
            if(typeof syncCardInstallmentsToCommitments === 'function') syncCardInstallmentsToCommitments();
            persist();
            if(typeof renderActiveScreenOnly === 'function') renderActiveScreenOnly();
            toast('تم حذف البطاقة وجميع عملياتها ✓');
          },
          true
        );
      }, 60);
      return;
    }
    if(typeof auditRecord==='function')auditRecord('حذف','بطاقة',card.id,card,null);
    state.cards = state.cards.filter(c=>String(c.id)!==String(cardId));
    persist();
    toast('تم حذف البطاقة الفارغة ✓');
  }, true);
}

function openEditCardOpModal(opId){
  const op = state.cardOps.find(o=>o.id===opId);
  if(!op) return;
  const card = state.cards.find(c=>c.id===op.cardId);
  const isInst = op.type === 'installment';
  const curMonths = Number(op.months)||12;
  const curTerm = (card?.terms||{})[curMonths] || {monthlyRate:0, adminRate:0};
  const curIrPct = op.amount && curMonths ? round2(((Number(op.interest)||0) / (Number(op.amount) * curMonths)) * 100) : round2((curTerm.monthlyRate||0)*100);
  const curFeePct = op.amount ? round2(((Number(op.adminFee)||0) / Number(op.amount)) * 100) : round2((curTerm.adminRate||0)*100);

  const formHtml = `
    <div class="c-list">
      <div class="c-row"><label>وصف العملية</label><input id="edOpTitle" value="${esc(op.title)}"></div>
      <div class="c-row"><label>المبلغ الأصلي</label><input id="edOpAmount" type="number" step="0.01" value="${Number(op.amount)||0}"></div>
      <div class="c-row"><label>شهر الشراء</label><input id="edOpPurchaseYM" type="month" value="${esc(op.purchaseMonth || monthKey(op.date) || selected())}"></div>
      ${isInst ? `
        <div class="c-row"><label>مدة التقسيط</label>
          <select id="edOpMonths">
            ${[3,6,9,12,15,18,24,36].map(m=>`<option value="${m}" ${curMonths===m?'selected':''}>${m} شهر</option>`).join('')}
          </select>
        </div>
        <div class="c-row"><label>الفائدة الشهرية %</label><input id="edOpIrPct" type="number" step="0.01" value="${curIrPct}"></div>
        <div class="c-row"><label>الرسوم الإدارية %</label><input id="edOpFeePct" type="number" step="0.01" value="${curFeePct}"></div>
      ` : ''}
    </div>
    <p class="hint">التعديل هنا يقتصر على هذه المعاملة فقط.</p>
  `;
  showAppCustomForm('تعديل معاملة البطاقة', formHtml, ()=>{
    const title = val('edOpTitle').trim();
    const amount = num('edOpAmount');
    const pYM = val('edOpPurchaseYM') || op.purchaseMonth || selected();
    if(!title || amount <= 0){ toast('أدخل الوصف والمبلغ بشكل صحيح'); return false; }
    const nextDate = pYM + '-' + (String(op.date||'01').slice(8,10) || '01');
    const nextTerms = {amount,date:nextDate};
    if(isInst){
      nextTerms.months=num('edOpMonths')||12;
      nextTerms.monthlyRate=round2(num('edOpIrPct')/100);
      nextTerms.adminRate=round2(num('edOpFeePct')/100);
      nextTerms.currentMonthlyRate=curIrPct/100;
      nextTerms.currentAdminRate=curFeePct/100;
    }
    if(!canEditCardOperationTerms(op,nextTerms)){
      toast('لا يمكن تغيير مبلغ أو تاريخ أو شروط التقسيط بعد تسجيل سداد؛ ألغِ سجلات السداد أولاً');
      return false;
    }
    let operationCurrencySnapshot;
    try{
      const currency=String(op.currency||card?.currency||'EGP').toUpperCase();
      operationCurrencySnapshot=transactionCurrencySnapshot(amount,currency,nextDate);
    }catch(error){toast(error?.message||'تعذر تثبيت سعر صرف عملية البطاقة');return false;}

    op.title = title;
    op.amount = amount;
    op.purchaseMonth = pYM;
    op.date = nextDate;
    Object.assign(op,operationCurrencySnapshot);
    op.dueDate = card ? dueDateFor(card, op.date) : op.dueDate;

    if(isInst){
      const months = num('edOpMonths') || 12;
      const irDec = round2(num('edOpIrPct') / 100);
      const feeDec = round2(num('edOpFeePct') / 100);
      op.months = months;
      recalculateInstallmentOpWithTerms(op, card, irDec, feeDec);
    }

    const linkedTx = state.transactions.find(tx=>tx.source==='card-purchase:'+op.id);
    if(linkedTx){
      linkedTx.title = 'شراء بالبطاقة - ' + title;
      linkedTx.amount = amount;
      linkedTx.date = op.date;
      Object.assign(linkedTx,operationCurrencySnapshot);
    }
    syncCardInstallmentsToCommitments();
    persist();
    refreshSecondaryFeeds();
    toast('تم تعديل المعاملة ✓');
    return true;
  });
}

function deleteCardOp(opId){
  showAppConfirm('حذف عملية البطاقة', 'سيتم حذف العملية وأقساطها المرتبطة مع الاحتفاظ بنسخة قابلة للاستعادة. هل تريد المتابعة؟', ()=>{
    const op=(state.cardOps||[]).find(o=>String(o.id)===String(opId));
    if(!op)return;
    if(cardOperationHasPayments(op)){
      toast('لا يمكن حذف عملية البطاقة قبل إلغاء سجلات السداد المرتبطة بها. ألغِ السداد أولاً حتى لا تبقى دفعات بلا عملية أصلية.');
      return;
    }
    const tx=(state.transactions||[]).find(t=>t.source==='card-purchase:'+opId);
    if(tx && typeof archiveCardPurchaseDeletion==='function')archiveCardPurchaseDeletion(tx,op);
    state.cardOps = state.cardOps.filter(o=>String(o.id)!==String(opId));
    state.transactions = state.transactions.filter(t=>t.source!=='card-purchase:'+opId);
    syncCardInstallmentsToCommitments();
    persist();
    refreshSecondaryFeeds();
    toast(tx?'تم حذف العملية والاحتفاظ بنسخة للاستعادة ✓':'تم حذف العملية ✓');
  }, true);
}

function dueDateFor(card,date){
  let d=new Date(date+'T12:00:00'), y=d.getFullYear(), m=d.getMonth()+1, day=card.payDay||3;
  let due=new Date(y,m,day);
  return due.getFullYear()+'-'+String(due.getMonth()+1).padStart(2,'0')+'-'+String(due.getDate()).padStart(2,'0');
}


/* =========================================================
   #6: COMMITMENTS PAGE (الالتزامات)
   - 6.1 & 6.2 جميع المستحقات: Add Amount column (المبلغ) & change "التزامات شهرية" to "شهري"
   ========================================================= */
function refreshCommitmentCurrencyPickers(){
  const preferred=String(state.prefs?.defaultCurrency||'EGP').toUpperCase();
  for(const id of ['defCurrency','monCurrency']){
    const el=document.getElementById(id);if(!el||typeof managementCurrencyOptions!=='function')continue;
    const current=String(el.value||preferred).toUpperCase();
    el.innerHTML=managementCurrencyOptions(current);
    if(!Array.from(el.options||[]).some(o=>String(o.value).toUpperCase()===current))el.value=preferred;
  }
}


function recalcMonthlyCommitmentEnd(){
  const startYM = val('comStartVal') || selected();
  const dur = Math.max(1, Math.round(num('monDuration') || 12));
  const endYM = addMonthsYM(startYM, dur - 1);
  setv('comEndVal', endYM);
  setv('comEndAutoLabel', formatYMArabic(endYM));
}


/* ---- Original app.js lines 3376-3429 ---- */


/* ---- Original app.js lines 3453-3768 ---- */
function getUnifiedMonthlyDues(m){
  syncCardInstallmentsToCommitments();
  const items = [];
  let totalDue = 0;
  const conversionErrors = [];
  const addDueItem = (item, amount, currency, date) => {
    const code=String(currency||'EGP').toUpperCase();
    const dueDate=String(date||`${m}-01`).slice(0,10);
    const currentDate=typeof today==='function'?String(today()).slice(0,10):new Date().toISOString().slice(0,10);
    // Current/future obligations use the latest available quote; historical months use the due-date quote.
    const conversionDate=String(m)>=currentDate.slice(0,7)?currentDate:dueDate;
    const normalized={...item,currency:code,fxRateDate:conversionDate};
    items.push(normalized);
    try{
      const base=typeof amountToBase==='function'?amountToBase(amount,code,undefined,conversionDate):Number(amount)||0;
      totalDue=round2(totalDue+base);
      normalized.baseAmount=base;
    }catch(error){
      conversionErrors.push({currency:code,date:conversionDate,message:error?.message||'سعر الصرف غير متاح'});
      normalized.baseAmount=null;
    }
  };

  const deferredList = (state.commitments||[]).filter(c => c.freq === 'once' && ((c.dueDate && String(c.dueDate).slice(0,7) === m) || (!c.dueDate && c.start === m)));
  for(const c of deferredList){
    const amt = round2(Number(c.amount)||0);
    const paid = round2((state.commitmentPayments||[]).filter(p=>p.commitmentId===c.id).reduce((s,p)=>s+(Number(p.amount)||0),0));
    const rem = round2(Math.max(0, amt - paid));
    addDueItem({
      uid: c.id, kind: 'commitment', categoryType: 'مستحق', title: c.title,
      sub: c.dueDate ? `استحقاق: ${formatYMArabic(String(c.dueDate).slice(0,7))}` : 'مرة واحدة',
      amount: amt, paid, remaining: rem
    },amt,c.currency||'EGP',c.dueDate||`${m}-01`);
  }

  const monthlyList = (state.commitments||[]).filter(c => (c.freq||'monthly') === 'monthly' && !c.cardOpId && commitmentDue(c, m));
  for(const c of monthlyList){
    const amt = round2(Number(c.amount)||0);
    const paid = round2((state.commitmentPayments||[]).filter(p=>p.commitmentId===c.id && p.month===m).reduce((s,p)=>s+(Number(p.amount)||0),0));
    const rem = round2(Math.max(0, amt - paid));
    addDueItem({
      uid: c.id, kind: 'commitment', categoryType: 'شهري', title: c.title,
      sub: `${formatYMArabic(c.start)} ← ${formatYMArabic(c.end)}`,
      amount: amt, paid, remaining: rem
    },amt,c.currency||'EGP',`${m}-01`);
  }

  for(const op of (state.cardOps||[])){
    const card = state.cards.find(x=>x.id===op.cardId);
    const cName = card?.name || 'بطاقة';
    const currency=String(op.currency||card?.currency||'EGP').toUpperCase();
    if(op.type === 'swipe'){
      const dueYM = op.dueDate ? op.dueDate.slice(0,7) : addMonthsYM(op.purchaseMonth || monthKey(op.date), 1);
      if(dueYM === m){
        const amt = round2(Number(op.amount)||0);
        const paid = round2(Number(op.paid)||0);
        const rem = round2(Math.max(0, amt - paid));
        addDueItem({uid:op.id,kind:'card_swipe',opId:op.id,categoryType:cName,title:op.title,sub:'شراء كامل',amount:amt,paid,remaining:rem},amt,currency,`${m}-01`);
      }
    } else if(op.type === 'installment'){
      if(op.feeMonth === m && (Number(op.feeDue)||0) > 0){
        const amt = round2(Number(op.feeDue)||0);
        const paid = round2(Number(op.feePaid)||0);
        const rem = round2(Math.max(0, amt - paid));
        addDueItem({uid:op.id+':fee',kind:'card_fee',opId:op.id,categoryType:'رسوم '+cName,title:`رسوم: ${op.title}`,sub:`تقسيط ${op.months} شهر`,amount:amt,paid,remaining:rem},amt,currency,`${m}-01`);
      }
      (op.schedules||[]).forEach((sc,idx)=>{
        if(sc.month === m){
          const amt = round2(Number(sc.amount)||0);
          const paid = round2(Number(sc.paid)||0);
          const rem = round2(Math.max(0, amt - paid));
          addDueItem({uid:`${op.id}:inst:${m}`,kind:'card_inst',opId:op.id,month:m,categoryType:'قسط '+cName,title:op.title,sub:`قسط ${idx+1} من ${op.months}`,amount:amt,paid,remaining:rem},amt,currency,`${m}-01`);
        }
      });
    }
  }

  return {items,totalDue:conversionErrors.length?null:round2(totalDue),conversionErrors};
}

function duePaymentTargetCurrency(kind,uid,opId){
  if(kind==='commitment')return String((state.commitments||[]).find(x=>String(x.id)===String(uid))?.currency||'EGP').toUpperCase();
  return String((state.cards||[]).find(c=>String(c.id)===String((state.cardOps||[]).find(o=>String(o.id)===String(opId))?.cardId))?.currency||'EGP').toUpperCase();
}
function duePaymentRemaining(kind,entityId,opId,month){
  if(kind==='commitment'){
    const commitment=(state.commitments||[]).find(x=>String(x.id)===String(entityId));
    if(!commitment)return 0;
    const paid=(state.commitmentPayments||[]).filter(p=>String(p.commitmentId)===String(entityId)&&((commitment.freq==='once')||String(p.month||'')===String(month||''))).reduce((sum,p)=>sum+(Number(p.amount)||0),0);
    return round2(Math.max(0,(Number(commitment.amount)||0)-paid));
  }
  const op=(state.cardOps||[]).find(x=>String(x.id)===String(opId));
  if(!op)return 0;
  if(kind==='card_swipe')return round2(Math.max(0,(Number(op.amount)||0)-(Number(op.paid)||0)));
  if(kind==='card_fee')return round2(Math.max(0,(Number(op.feeDue)||0)-(Number(op.feePaid)||0)));
  if(kind==='card_inst'){
    const schedule=(op.schedules||[]).find(x=>String(x.month)===String(month));
    return schedule?round2(Math.max(0,(Number(schedule.amount)||0)-(Number(schedule.paid)||0))):0;
  }
  return 0;
}
function updateDuePaymentFxPreview(kind,uid,opId){
  const preview=document.getElementById('payDueFxPreview');if(!preview)return;
  const sourceId=val('payDueAccSel');
  const source=state.accounts.find(a=>String(a.id)===String(sourceId));
  if(!source){preview.style.display='none';return;}
  const sourceCurrency=String(source.currency||'EGP').toUpperCase();
  const targetCurrency=duePaymentTargetCurrency(kind,uid,opId);
  if(sourceCurrency===targetCurrency){preview.style.display='none';return;}
  const amount=num('payDueAmtInp');
  const payDate=val('payDueDateInp')||today();
  try{
    const debit=convertCurrencyAmount(amount,targetCurrency,sourceCurrency,payDate);
    preview.textContent=amount>0?`سيُخصم من الحساب: ${fmt(debit)} ${sourceCurrency} مقابل ${fmt(amount)} ${targetCurrency}`:`سيتم التحويل من ${targetCurrency} إلى ${sourceCurrency} بسعر الصرف المسجل`;
    preview.style.color='var(--muted)';
  }catch(err){preview.textContent=err.message;preview.style.color='var(--red)';}
  preview.style.display='block';
}
function openPayDueDialog(kind, entityId, opId, month, defaultAmt, itemTitle){
  const m = month || selected();
  defaultAmt=duePaymentRemaining(kind,entityId,opId,m);
  if(defaultAmt <= 0){
    toast('مسدد بالكامل ✓ (احذف معاملة السداد من المعاملات اليومية لإلغاء السداد)');
    return;
  }
  const targetCurrency='EGP';
  const defAcc = state.prefs?.defaultAccount || state.accounts[0]?.id || '';
  const accOpts = state.accounts.map(a=>`<option value="${a.id}" ${a.id===defAcc?'selected':''}>${esc(a.name)} (${fmt(accountBalance(a))} ${esc(a.currency||'EGP')})</option>`).join('') || '<option value="">كاش</option>';

  const formHtml = `
    <div class="c-list">
      <div class="c-row"><label>البند</label><input value="${esc(itemTitle)}" readonly style="color:var(--mint)"></div>
      <div class="c-row"><label>السداد من حساب</label><select id="payDueAccSel">${accOpts}</select></div>
      <div class="c-row" onclick="openNativeInputPicker('payDueDateInp')"><label>تاريخ السداد</label><div class="picker-trigger"><b id="payDueDateDisp" dir="ltr">${formatDateDMY(today())}</b><input id="payDueDateInp" type="hidden" value="${today()}" onchange="document.getElementById('payDueDateDisp').textContent=formatDateDMY(this.value)"></div></div>
      <div class="c-row"><label>المبلغ المسدد (${esc(targetCurrency)})</label><input id="payDueAmtInp" type="number" step="0.01" value="${defaultAmt}"></div>
    </div>
    <p class="hint">كل مبالغ المحفظة بالجنيه المصري؛ المبلغ المدخل هو نفسه الذي سيُخصم من الحساب.</p>
  `;

  showAppCustomForm('تسجيل سداد مستحق', formHtml, ()=>{
    const accId = val('payDueAccSel') || null;
    const payDate = val('payDueDateInp') || today();
    const payAmt = round2(num('payDueAmtInp'));
    if(payAmt <= 0){ toast('أدخل مبلغ السداد بشكل صحيح'); return false; }
    const remainingNow=duePaymentRemaining(kind,entityId,opId,m);
    if(payAmt>remainingNow+0.000001){toast(`المبلغ أكبر من المتبقي المستحق (${fmt(remainingNow)} ${targetCurrency})`);return false;}
    const sourceAccount=state.accounts.find(a=>String(a.id)===String(accId));
    if(!sourceAccount){toast('اختر حساب السداد');return false;}
    const sourceCurrency='EGP';
    let sourceAmount,paymentSnapshot;
    try{
      sourceAmount=convertCurrencyAmount(payAmt,targetCurrency,sourceCurrency,payDate);
      paymentSnapshot={...transactionCurrencySnapshot(sourceAmount,sourceCurrency,payDate),baseAmount:amountToBase(payAmt,targetCurrency,payDate)};
    }catch(err){toast(err.message);return false;}
    const nowTs = Date.now();

    if(kind === 'commitment'){
      const c = state.commitments.find(x=>x.id===entityId);
      if(!c) return false;
      const payRecId = uid('cmp');
      state.commitmentPayments.push({
        id: payRecId,
        commitmentId: c.id,
        month: m,
        amount: payAmt,
        currency:targetCurrency,
        accountAmount:sourceAmount,
        accountCurrency:sourceCurrency,
        date: payDate,
        accountId: accId
      });
      state.transactions.push({
        id: uid('com-pay'),
        type: 'expense',
        title: 'سداد ' + c.title,
        category: c.type || 'التزامات',
        amount: sourceAmount,
        date: payDate,
        currency:sourceCurrency,
        ...paymentSnapshot,
        settledAmount:payAmt,
        settledCurrency:targetCurrency,
        accountId: accId,
        source: 'commitment-payment',
        linkedCommitmentPaymentId: payRecId,
        createdAt: nowTs
      });
      persist();
      toast('تم تسجيل السداد وخصمه من الحساب ✓');
      return true;
    }

    const op = state.cardOps.find(o=>o.id===opId);
    if(!op) return false;
    const card = state.cards.find(c=>c.id===op.cardId);
    const cName = card?.name || 'بطاقة';
    let payTitle = '';
    if(kind === 'card_swipe'){
      op.paid = round2((Number(op.paid)||0) + payAmt);
      payTitle = cName;
    } else if(kind === 'card_fee'){
      op.feePaid = round2((Number(op.feePaid)||0) + payAmt);
      payTitle = `سداد رسوم بطاقة (${cName}) - ${op.title}`;
    } else if(kind === 'card_inst'){
      const sc = (op.schedules||[]).find(s=>s.month===m);
      if(sc) sc.paid = round2((Number(sc.paid)||0) + payAmt);
      payTitle = cName;
    }
    const cardPayRecId = uid('cp');
    state.cardPayments.push({id:cardPayRecId, cardId:op.cardId, cardOpId:op.id, paymentKind:kind, paymentMonth:m, amount:payAmt, currency:targetCurrency, accountAmount:sourceAmount, accountCurrency:sourceCurrency, date:payDate, accountId:accId});
    state.transactions.push({
      id: uid('cardpay'),
      type: 'credit_payment',
      title: payTitle,
      category: 'سداد بطاقة',
      amount: sourceAmount,
      date: payDate,
      currency:sourceCurrency,
      ...paymentSnapshot,
      settledAmount:payAmt,
      settledCurrency:targetCurrency,
      accountId: accId,
      source: 'card-payment',
      linkedCardOpId: op.id,
      linkedCardPayKind: kind,
      linkedCardPayMonth: m,
      linkedCardPaymentRecordId: cardPayRecId,
      createdAt: nowTs
    });
    persist();
    toast('تم تسجيل سداد البطاقة ✓');
    return true;
  });
  updateDuePaymentFxPreview(kind,entityId,opId);
}

function openEditCommitmentModal(id){
  const c = state.commitments.find(x=>x.id===id);
  if(!c) return;
  if(c.cardOpId){
    openEditCardOpModal(c.cardOpId);
    return;
  }
  const isOnce = c.freq === 'once';
  const curDueYM = c.start || (c.dueDate ? String(c.dueDate).slice(0,7) : selected());
  const currentCurrency='EGP';
  const formHtml = `
    <div class="c-list">
      <div class="c-row"><label>اسم العملية</label><input id="edComTitle" value="${esc(c.title)}"></div>
      <div class="c-row"><label>المبلغ</label><input id="edComAmount" type="number" step="0.01" value="${Number(c.amount)||0}"></div>
      ${isOnce
        ? `<div class="c-row"><label>شهر الاستحقاق</label><button type="button" class="picker-trigger" onclick="openCompactYMPicker('edComDue', false)"><b id="edComDueLabel">${esc(formatYMArabic(curDueYM))}</b></button><input type="hidden" id="edComDueVal" value="${esc(curDueYM)}"></div>`
        : `<div class="c-row"><label>تاريخ البدء</label><input id="edComStartYM" type="month" value="${esc(c.start||selected())}"></div>
           <div class="c-row"><label>الفترة بالأشهر</label><input id="edComDur" type="number" min="1" max="360" value="${Number(c.durationMonths)||12}"></div>`
      }
      <div class="c-row"><label>ملاحظة</label><input id="edComNote" value="${esc(c.note||'')}"></div>
    </div>
  `;
  showAppCustomForm('تعديل: ' + c.title, formHtml, ()=>{
    const title = val('edComTitle').trim();
    const amount = num('edComAmount');
    const nextCurrency='EGP';
    if(!title || amount <= 0){ toast('أدخل الاسم والمبلغ بشكل صحيح'); return false; }
    c.title = title;
    c.amount = amount;
    c.currency=nextCurrency;
    if(isOnce){
      const ddYM = val('edComDueVal') || curDueYM || selected();
      c.dueDate = ddYM + '-01';
      c.start = ddYM;
      c.end = ddYM;
    } else {
      const st = val('edComStartYM') || c.start || selected();
      const dur = Math.max(1, Math.round(num('edComDur')||12));
      c.start = st;
      c.durationMonths = dur;
      c.end = addMonthsYM(st, dur - 1);
    }
    c.note = val('edComNote').trim();
    persist();
    toast('تم تعديل الالتزام ✓');
    return true;
  });
}
function deleteCommitment(id){
  const commitment=(state.commitments||[]).find(x=>String(x.id)===String(id));
  if(!commitment)return;
  showAppConfirm('حذف الالتزام', 'يمكن حذف الالتزام فقط إذا لم تكن له سجلات سداد أو ارتباط بعملية بطاقة. هل تريد المتابعة؟', ()=>{
    const hasPayments=(state.commitmentPayments||[]).some(p=>String(p.commitmentId)===String(id));
    const hasLinkedTx=(state.transactions||[]).some(t=>String(t.linkedCommitmentPaymentId||'')!==''&&(state.commitmentPayments||[]).some(p=>String(p.id)===String(t.linkedCommitmentPaymentId)&&String(p.commitmentId)===String(id)));
    const hasArchivedPayments=(state.cancelledTransactions||[]).some(x=>String(x.related?.commitmentPayment?.commitmentId||'')===String(id)) || (state.auditLog||[]).some(e=>e.action==='حذف'&&e.entity==='سداد التزام'&&String(e.before?.commitmentId||'')===String(id));
    if(commitment.cardOpId||hasPayments||hasLinkedTx||hasArchivedPayments){
      toast('لا يمكن حذف التزام مرتبط بعملية بطاقة أو له سجلات سداد. ألغِ السداد المرتبط أو عالج عملية البطاقة أولاً.');
      return;
    }
    if(typeof auditRecord==='function')auditRecord('حذف','التزام',commitment.id,commitment,null);
    state.commitments = state.commitments.filter(x=>String(x.id)!==String(id));
    persist(); toast('تم حذف الالتزام ✓');
  }, true);
}

function openMonthlyDueActionsModal(kind, uidStr, opId, month, leftAmt, titleStr){
  const isCardItem = kind !== 'commitment';
  const html = `
    <div style="display:flex;flex-direction:column;gap:8px">
      <button type="button" class="primary" onclick="closeAppDialog();openPayDueDialog('${escJs(kind)}','${escJs(uidStr)}','${escJs(opId)}','${escJs(month)}',${leftAmt},'${escJs(titleStr)}')">${leftAmt > 0 ? '💳 تسجيل سداد المستحق' : '✓ مسدد بالكامل'}</button>
      <button type="button" class="secondary" style="border-color:var(--blue);color:var(--blue)" onclick="closeAppDialog();${isCardItem ? `openEditCardOpModal('${escJs(opId)}')` : `openEditCommitmentModal('${escJs(uidStr)}')`}">✎ تعديل البيانات</button>
      <button type="button" class="smallbtn danger" style="padding:10px;border-radius:12px" onclick="closeAppDialog();${isCardItem ? `deleteCardOp('${escJs(opId)}')` : `deleteCommitment('${escJs(uidStr)}')`}">🗑 حذف</button>
    </div>
  `;
  showAppCustomForm(titleStr, html, null, true);
}

function renderPlanScreen(){
  refreshCommitmentCurrencyPickers();
  const m = selected();
  const { items, totalDue, conversionErrors=[] } = getUnifiedMonthlyDues(m);
  const heroMonthEl = document.getElementById('comHeroMonthLabel');
  if(heroMonthEl) heroMonthEl.textContent = formatYMArabic(m);
  const missingCurrencies=[...new Set(conversionErrors.map(x=>x.currency))];
  const dueText = totalDue===null ? `تعذر احتساب الإجمالي بالجنيه؛ راجع أسعار: ${missingCurrencies.join('، ')}` : maskable(egpSmart(totalDue));
  const heroTotalEl = document.getElementById('comHeroTotal');
  if(heroTotalEl) heroTotalEl.textContent = dueText;
  const sumTotalEl = document.getElementById('comSummaryTotal');
  if(sumTotalEl) sumTotalEl.textContent = dueText;
  const comMonthEl = document.getElementById('comMonthLabel');
  if(comMonthEl) comMonthEl.textContent = formatYMArabic(m);

  const comQ = (document.getElementById('comSearch')?.value || '').trim().toLowerCase();
  const clrComBtn = document.getElementById('btnClearComSearch');
  if(clrComBtn) clrComBtn.style.display = comQ ? 'block' : 'none';
  const filteredItems = comQ ? items.filter(it => [it.title, it.categoryType, it.sub, String(it.amount||'')].some(s => String(s||'').toLowerCase().includes(comQ))) : items;
  const listEl = document.getElementById('commitmentsList');
  if(!filteredItems.length){
    listEl.innerHTML = comQ ? '<div class="empty">لا توجد التزامات مطابقة للبحث.</div>' : '<div class="empty">لا توجد مبالغ مستحقة في هذا الشهر.</div>';
  } else {
    // 4.5 Unified Horizontal-Scroll Table for Monthly Dues matching All Commitments with full details
    listEl.innerHTML = `
      <table class="com-all-table">
        <thead>
          <tr>
            <th>المعاملة</th>
            <th>النوع</th>
            <th>التفاصيل</th>
            <th style="text-align:right">المبلغ</th>
            <th style="text-align:right">المسدد</th>
            <th style="text-align:right">المتبقي</th>
            <th>الحالة</th>
          </tr>
        </thead>
        <tbody>
          ${filteredItems.map(it=>{
            const left = it.remaining;
            const actCall = `openMonthlyDueActionsModal('${escJs(it.kind)}','${escJs(it.uid)}','${escJs(it.opId||'')}','${m}',${left},'${escJs(it.title)}')`;
            return `
              <tr style="cursor:pointer" onclick="${actCall}">
                <td><b>${esc(it.title)}</b></td>
                <td>${esc(it.categoryType)}</td>
                <td><small style="color:var(--muted)">${esc(it.sub)}</small></td>
                <td style="text-align:right;direction:ltr"><b>${maskable(fmtNum(it.amount))} ${esc(it.currency||'EGP')}</b></td>
                <td style="text-align:right;direction:ltr" class="mint">${maskable(fmtNum(it.paid))} ${esc(it.currency||'EGP')}</td>
                <td style="text-align:right;direction:ltr" class="${left>0?'orange':'mint'}"><b>${maskable(fmtNum(left))} ${esc(it.currency||'EGP')}</b></td>
                <td><span class="tag" style="color:${left>0?'var(--orange)':'var(--mint)'}">${left>0?'سداد':'مسدد'}</span></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  renderAllCommitmentsMasterTable();
  renderYearlyExcelReport();
}



function openConvertCardToAccountModal(cardId){
  const card = (state.cards||[]).find(c=>String(c.id)===String(cardId));
  if(!card) return;
  closeAppDialog();
  const outBal = cardTotalOutstanding(card);
  const html = `
    <div class="c-list">
      <div class="c-row"><label>اسم الحساب</label><input id="convAccName" value="${esc(card.name)}"></div>
      <div class="c-row"><label>نوع الحساب</label>
        <select id="convAccType">
          <option value="bank">حساب بنكي</option>
          <option value="cash">كاش</option>
          <option value="wallet">محفظة إلكترونية</option>
          <option value="prepaid">بطاقة مسبقة الدفع</option>
        </select>
      </div>
      <div class="c-row"><label>الرصيد الافتتاحي (EGP)</label><input id="convAccOpening" type="number" step="0.01" value="${outBal > 0 ? -outBal : 0}"></div>
    </div>
    <p class="hint">سيتم تحويل البطاقة إلى حساب عادي مع الحفاظ على سجل معاملاتها السابقة.</p>
  `;
  showAppCustomForm('تحويل البطاقة إلى حساب', html, ()=>{
    const name = val('convAccName').trim();
    const type = val('convAccType') || 'bank';
    const opening = num('convAccOpening');
    if(!name){ toast('أدخل اسم الحساب'); return false; }
    const newAcc = { id: uid('acc'), name, type, currency: 'EGP', opening };
    state.accounts = state.accounts || [];
    state.accounts.push(newAcc);
    state.cards = (state.cards || []).filter(c => String(c.id) !== String(card.id));
    if(state.walletPlacement?.cards) delete state.walletPlacement.cards[String(card.id)];
    persist();
    toast('تم تحويل البطاقة إلى حساب ✓');
    return true;
  });
}
