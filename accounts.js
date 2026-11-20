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
function addAccount(){
  const name=val('accName').trim(),opening=num('accOpening');
  if(!name)return toast('اكتب اسم الحساب');
  state.accounts.push({id:uid('acc'),name,type:val('accType'),opening,currency:'EGP'});
  persist();setv('accName','');setv('accOpening','');
  const fold=document.getElementById('addAccountFold');if(fold){fold.removeAttribute('open');fold.style.display='none';}
  toast('تمت إضافة الحساب ✓');
}

function deleteAccount(id){
  const account=(state.accounts||[]).find(a=>String(a.id)===String(id));
  if(!account)return;
  showAppConfirm('حذف الحساب', 'يمكن حذف الحساب فقط إذا لم يكن له رصيد أو سجل مالي مرتبط. هل تريد المتابعة؟', ()=>{
    const usedInTransactions=(state.transactions||[]).some(t=>String(t.accountId||'')===String(id));
    const usedInArchive=(state.cancelledTransactions||[]).some(x=>String((x.transaction||x).accountId||'')===String(id));
    const usedInLedger=(state.ledger||[]).some(l=>String(l.from||'')===String(id)||String(l.to||'')===String(id));
    const usedInPayments=(state.cardPayments||[]).some(x=>String(x.accountId||'')===String(id)) || (state.commitmentPayments||[]).some(x=>String(x.accountId||'')===String(id));
    const usedInRules=(state.recurringRules||[]).some(x=>String(x.accountId||'')===String(id));
    const referencedByAudit=(state.auditLog||[]).some(e=>e.action==='حذف'&&e.before&&(String(e.before.accountId||'')===String(id)||String(e.before.from||'')===String(id)||String(e.before.to||'')===String(id)));
    const opening=Number(account.opening)||0;
    if(usedInTransactions||usedInArchive||usedInLedger||usedInPayments||usedInRules||referencedByAudit||Math.abs(opening)>0.000001){
      toast('لا يمكن حذف الحساب لوجود رصيد أو معاملات أو تحويلات أو سجلات مرتبطة به. احتفظ بالحساب أو عالج السجلات أولاً.');
      return;
    }
    if(typeof auditRecord==='function')auditRecord('حذف','حساب',account.id,account,null);
    state.accounts = state.accounts.filter(a=>String(a.id)!==String(id));
    if(String(state.prefs?.defaultAccount||'')===String(id))state.prefs.defaultAccount=state.accounts[0]?.id||'';
    persist(); toast('تم حذف الحساب الفارغ ✓');
  }, true);
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

function toggleStmtFilterGrid(){
  const box = document.getElementById('stmtFilterBox');
  const btn = document.getElementById('btnToggleStmtFilter');
  if(!box) return;
  const open = box.style.display === 'none';
  box.style.display = open ? 'block' : 'none';
  const hasAny = !!(stmtAdvFilter.dateFrom || stmtAdvFilter.dateTo || stmtAdvFilter.amountFrom || stmtAdvFilter.amountTo || stmtAdvFilter.type || stmtAdvFilter.cat);
  btn?.classList.toggle('active', open || hasAny);
  updateStmtFilterUI();
}

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

function handleStmtFilterTap(kind){
  if(kind === 'date'){
    if(stmtAdvFilter.dateFrom || stmtAdvFilter.dateTo){
      stmtAdvFilter.dateFrom=''; stmtAdvFilter.dateTo='';
      updateStmtFilterUI(); renderFullStatementModalContent(); return;
    }
    const defS = selected() + '-01', defE = today();
    showAppCustomForm('فلترة بالتاريخ', `<div class="c-list">
      <div class="c-row" onclick="openNativeInputPicker('stFDateF')"><label>من تاريخ</label><div class="picker-trigger" style="position:relative"><b id="stFDispF" dir="ltr">${formatDateDMY(defS)}</b><input id="stFDateF" type="date" value="${esc(defS)}" onchange="document.getElementById('stFDispF').textContent=formatDateDMY(this.value)" style="position:absolute;inset:0;opacity:0;width:100%;height:100%"></div></div>
      <div class="c-row" onclick="openNativeInputPicker('stFDateT')"><label>إلى تاريخ</label><div class="picker-trigger" style="position:relative"><b id="stFDispT" dir="ltr">${formatDateDMY(defE)}</b><input id="stFDateT" type="date" value="${esc(defE)}" onchange="document.getElementById('stFDispT').textContent=formatDateDMY(this.value)" style="position:absolute;inset:0;opacity:0;width:100%;height:100%"></div></div>
    </div>`, ()=>{
      stmtAdvFilter.dateFrom = val('stFDateF')||'';
      stmtAdvFilter.dateTo = val('stFDateT')||'';
      updateStmtFilterUI(); renderFullStatementModalContent(); return true;
    });
    return;
  }
  if(kind === 'amount'){
    if(stmtAdvFilter.amountFrom || stmtAdvFilter.amountTo){
      stmtAdvFilter.amountFrom=''; stmtAdvFilter.amountTo='';
      updateStmtFilterUI(); renderFullStatementModalContent(); return;
    }
    showAppCustomForm('فلترة بالمبلغ', `<div class="c-list">
      <div class="c-row"><label>من مبلغ</label><input id="stFAmtF" type="number" step="0.01" placeholder="0"></div>
      <div class="c-row"><label>إلى مبلغ</label><input id="stFAmtT" type="number" step="0.01" placeholder="اختياري"></div>
    </div>`, ()=>{
      stmtAdvFilter.amountFrom = String(val('stFAmtF')||'').trim();
      stmtAdvFilter.amountTo = String(val('stFAmtT')||'').trim();
      updateStmtFilterUI(); renderFullStatementModalContent(); return true;
    });
    return;
  }
  if(kind === 'type'){
    if(stmtAdvFilter.type){
      stmtAdvFilter.type=''; updateStmtFilterUI(); renderFullStatementModalContent(); return;
    }
    const html = `<div class="cs-opt-list">
      <button type="button" class="cs-opt-btn" onclick="stmtAdvFilter.type='income';closeAppDialog();updateStmtFilterUI();renderFullStatementModalContent()"><span>دخل</span><span>○</span></button>
      <button type="button" class="cs-opt-btn" onclick="stmtAdvFilter.type='expense';closeAppDialog();updateStmtFilterUI();renderFullStatementModalContent()"><span>مصروف</span><span>○</span></button>
      <button type="button" class="cs-opt-btn" onclick="stmtAdvFilter.type='transfer';closeAppDialog();updateStmtFilterUI();renderFullStatementModalContent()"><span>تحويل</span><span>○</span></button>
    </div>`;
    showAppCustomForm('فلترة بالنوع', html, null, true);
    return;
  }
  if(kind === 'cat'){
    if(stmtAdvFilter.cat){
      stmtAdvFilter.cat=''; updateStmtFilterUI(); renderFullStatementModalContent(); return;
    }
    syncCategoryTrees();
    const allC = [...new Set([...Object.keys(state.categoryTree.expense||{}), ...Object.keys(state.categoryTree.income||{})])];
    const html = `<div class="cs-opt-list">` + allC.map(c=>`
      <button type="button" class="cs-opt-btn" onclick="stmtAdvFilter.cat='${escJs(c)}';closeAppDialog();updateStmtFilterUI();renderFullStatementModalContent()"><span>${esc(c)}</span><span>○</span></button>
    `).join('') + `</div>`;
    showAppCustomForm('فلترة بالقسم', html, null, true);
  }
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

function setStatementYearMode(){
  if(!activeStatementState) return;
  activeStatementState.mode = 'yearly';
  renderFullStatementModalContent();
}

function openStatementMonthPicker(){
  if(!activeStatementState) return;
  openCompactYMPicker(null, false, (chosenYM)=>{
    const [y,m] = chosenYM.split('-').map(Number);
    activeStatementState.year = y;
    activeStatementState.month = m;
    activeStatementState.mode = 'monthly';
    renderFullStatementModalContent();
  });
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
    document.getElementById('stmtModalTitle').textContent = acc ? `← ${acc.name}` : '← الحساب';

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
    document.getElementById('stmtModalTitle').textContent = `← ${cName}`;

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
function deleteCurrentStatementEntity(){
  if(!activeStatementState) return;
  const { kind, id } = activeStatementState;
  closeFullStatementModal();
  if(kind === 'card') deleteCard(id);
  else deleteAccount(id);
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
