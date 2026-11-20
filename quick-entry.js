
function closeQmRecurMenu(){
  document.getElementById('qmRecurMonthsMenu')?.classList.remove('open');
}
function syncQmRecurringUI(){
  const wrap = document.getElementById('qmRecurWrap');
  const btn = document.getElementById('qmRecurringBtn');
  const badge = document.getElementById('qmRecurBadge');
  if(!btn) return;
  const allow = (qmState.type !== 'transfer');
  if(wrap) wrap.style.display = allow ? 'inline-block' : 'none';
  if(!allow){ qmState.recurringMonthly = false; closeQmRecurMenu(); }
  btn.classList.toggle('active', !!qmState.recurringMonthly);
  const mVal = Number(qmState.recurringMonths || 0);
  if(badge){
    badge.style.display = (qmState.recurringMonthly && mVal > 0) ? 'inline' : 'none';
    badge.textContent = mVal > 0 ? String(mVal) : '';
  }
}
function toggleQmRecurringMonthly(ev){
  if(ev) ev.stopPropagation();
  if(qmState.type === 'transfer') return;
  const menu = document.getElementById('qmRecurMonthsMenu');
  if(qmState.recurringMonthly){
    if(menu && menu.classList.contains('open')){
      closeQmRecurMenu();
    } else {
      qmState.recurringMonthly = false;
      qmState.recurringMonths = 0;
      setv('qmRecurMonths', '0');
      closeQmRecurMenu();
      syncQmRecurringUI();
      toast('تم إلغاء التكرار الشهري');
    }
  } else {
    qmState.recurringMonthly = true;
    syncQmRecurringUI();
    if(menu) menu.classList.add('open');
  }
}
function selectQmRecurMonths(mVal){
  const n = Math.max(0, Math.min(24, Number(mVal) || 0));
  qmState.recurringMonthly = true;
  qmState.recurringMonths = n;
  setv('qmRecurMonths', String(n));
  document.querySelectorAll('#qmRecurMonthsMenu .imm-opt').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.rm) === n);
  });
  closeQmRecurMenu();
  syncQmRecurringUI();
  toast(n > 0 ? `تم تفعيل التكرار الشهري لمدة ${n} شهر ✓` : 'تم تفعيل التكرار الشهري (مفتوح) ✓');
}
function getQmAccViewMode(){
  return (state.prefs && state.prefs.qmAccViewMode === 'list') ? 'list' : 'grid';
}
function toggleQmAccViewMode(){
  state.prefs = state.prefs || {};
  state.prefs.qmAccViewMode = getQmAccViewMode() === 'list' ? 'grid' : 'list';
  try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(_){}
  renderQuickPickers();
}
function selectQmAccListGroup(grp){
  qmState.accListGroup = (grp === 'cards') ? 'cards' : 'accounts';
  renderQuickPickers();
}
function openCategoriesFromQuickEntry(){
  if(typeof settingsCatMode !== 'undefined'){
    settingsCatMode = qmState.type === 'income' ? 'income' : 'expense';
  }
  if(typeof openCategoriesManagerModal === 'function'){
    openCategoriesManagerModal();
  }
}
function upsertRecurringMonthlyCommitment(txObj){
  if(!txObj || !qmState.recurringMonthly || txObj.type === 'transfer') return;
  state.commitments = Array.isArray(state.commitments) ? state.commitments : [];
  const startYM = String(txObj.date || today()).slice(0, 7);
  const dayNum = Number(String(txObj.date || today()).slice(8, 10)) || 1;
  const title = String(txObj.title || txObj.subCategory || txObj.category || 'التزام شهري').trim();
  const comId = 'com-rec-' + String(txObj.id);
  const existing = state.commitments.find(c => c.id === comId || c.sourceTxId === txObj.id);
  const payload = {
    id: existing ? existing.id : comId,
    sourceTxId: txObj.id,
    recurringMonthly: true,
    title,
    type: 'شهري',
    freq: 'monthly',
    amount: round2(Number(txObj.amount) || 0),
    currency: 'EGP',
    start: startYM,
    durationMonths: Number(qmState.recurringMonths||0) || undefined,
    end: Number(qmState.recurringMonths||0) > 0 ? addMonthsYM(startYM, Number(qmState.recurringMonths) - 1) : '',
    day: dayNum,
    category: txObj.category || '',
    subCategory: txObj.subCategory || '',
    accountId: txObj.accountId || null,
    txType: txObj.type || 'expense',
    note: txObj.description || txObj.title || '',
    createdAt: Date.now()
  };
  if(existing) Object.assign(existing, payload);
  else state.commitments.push(payload);
}

/* =========================================================
   #1. QUICK TRANSACTION ENTRY MODAL (#quickModal)
   - 1.1 Compact upper section
   - 1.2 Fixed-size lower dock (never collapses or resizes)
   - 1.3 Clear divider line
   - 2.2 Direct Edit with Copy & Delete buttons inside modal
   ========================================================= */
let qmState = { type:'expense', accountId:'', toAccountId:'', category:'', subCategory:'', isCard:false, cardMode:'swipe', editId:null, editKind:'tx', dock:'acc', calcTarget:'qmAmount', calcExpr:'', recurringMonthly:false, accListGroup:'accounts' };

function formatDateDMY(iso){
  const s = String(iso || today()).slice(0, 10);
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)){
    return `${s.slice(8,10)}-${s.slice(5,7)}-${s.slice(0,4)}`;
  }
  return s;
}

function syncQmDateDisplay(){
  const raw = val('qmDate') || today();
  const disp = document.getElementById('qmDateDisplay');
  if(disp) disp.textContent = formatDateDMY(raw);
  updateQuickTransferPreview();
}

function openQmNativeDatePicker(){
  const inp = document.getElementById('qmDate');
  if(!inp) return;
  try{
    if(typeof inp.showPicker === 'function') inp.showPicker();
    else inp.focus();
  }catch(_){ inp.focus(); }
}

document.getElementById('qmDesc')?.addEventListener('input', autoResizeQmDesc);
function onQmDescFocus(){
  document.getElementById('quickModal')?.classList.add('hide-bottom-dock');
}
function onQmDescBlur(){
  autoResizeQmDesc();
  setTimeout(()=>{
    if(document.activeElement?.id !== 'qmDesc'){
      document.getElementById('quickModal')?.classList.remove('hide-bottom-dock');
    }
  }, 120);
}
function onQmTextInputFocus(hideDock){
  if(!hideDock) document.getElementById('quickModal')?.classList.remove('hide-bottom-dock');
}

function getActiveCatTree(){
  syncCategoryTrees();
  return qmState.type === 'income' ? state.categoryTree.income : state.categoryTree.expense;
}

function evaluateCalcExpression(expr){
  const source=String(expr||'').replace(/×/g,'*').replace(/÷/g,'/').replace(/−/g,'-').trim();
  if(!source || /[^0-9.+\-*\/()\s]/.test(source)) return 0;
  let i=0;
  const skip=()=>{while(/\s/.test(source[i]||''))i++;};
  function primary(){
    skip();
    if(source[i]==='('){i++;const v=addSub();skip();if(source[i]!==')')throw new Error('parenthesis');i++;return v;}
    const m=source.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if(!m)throw new Error('number');i+=m[0].length;const n=Number(m[0]);if(!Number.isFinite(n))throw new Error('finite');return n;
  }
  function unary(){skip();if(source[i]==='+'){i++;return unary();}if(source[i]==='-'){i++;return -unary();}return primary();}
  function mulDiv(){let v=unary();while(true){skip();const op=source[i];if(op!=='*'&&op!=='/')break;i++;const r=unary();if(op==='/'&&r===0)throw new Error('division by zero');v=op==='*'?v*r:v/r;if(!Number.isFinite(v))throw new Error('overflow');}return v;}
  function addSub(){let v=mulDiv();while(true){skip();const op=source[i];if(op!=='+'&&op!=='-')break;i++;const r=mulDiv();v=op==='+'?v+r:v-r;if(!Number.isFinite(v))throw new Error('overflow');}return v;}
  try{const result=addSub();skip();if(i!==source.length) return 0;return Math.max(0,round2(result));}catch(_){return 0;}
}

function updateQmCalcDisplay(commitResult){
  const targetId = qmState.calcTarget || 'qmAmount';
  const titleEl = document.getElementById('qmCalcTargetTitle');
  if(titleEl) titleEl.textContent = targetId === 'qmFee' ? 'الرسوم' : 'المبلغ';
  const prevEl = document.getElementById('qmCalcExprPreview');
  const expr = String(qmState.calcExpr || '');
  const hasOp = /[+\-×÷]/.test(expr.slice(1));
  if(prevEl){
    prevEl.textContent = expr || '0';
  }
  if(commitResult || !hasOp){
    const valNum = evaluateCalcExpression(expr);
    setv(targetId, valNum > 0 ? String(valNum) : '');
    updateQuickTransferPreview();
  }
}

function qmCalcPress(key){
  let expr = String(qmState.calcExpr || '');
  if(key === 'C'){
    expr = '';
  } else if(key === '⌫'){
    expr = expr.slice(0, -1);
  } else if(key === '='){
    const valNum = evaluateCalcExpression(expr);
    expr = valNum > 0 ? String(valNum) : '';
    qmState.calcExpr = expr;
    updateQmCalcDisplay(true);
    toast('تم إدراج الناتج ✓');
    return;
  } else if(['+','-','×','÷'].includes(key)){
    if(!expr) expr = '0';
    if(['+','-','×','÷'].includes(expr.slice(-1))){
      expr = expr.slice(0, -1) + key;
    } else {
      expr += key;
    }
  } else if(key === '.'){
    const parts = expr.split(/[+\-×÷]/);
    const curPart = parts[parts.length - 1] || '';
    if(!curPart.includes('.')){
      expr += (curPart ? '.' : '0.');
    }
  } else {
    if(expr === '0') expr = key === '00' ? '0' : key;
    else expr += key;
  }
  qmState.calcExpr = expr;
  updateQmCalcDisplay();
}

function autoResizeQmDesc(){
  const ta = document.getElementById('qmDesc');
  if(!ta) return;
  if(!ta.value){
    ta.style.setProperty('height', '30px', 'important');
    return;
  }
  ta.style.setProperty('height', 'auto', 'important');
  const h = Math.max(30, ta.scrollHeight + 4);
  ta.style.setProperty('height', h + 'px', 'important');
}

function setQmDockMode(mode, calcFieldId){
  if(mode === ''){
    qmState.dock = '';
    document.getElementById('quickModal')?.classList.add('hide-bottom-dock');
    ['qmAccTrigger','qmToAccTrigger','qmCatTrigger'].forEach(id=>{
      document.getElementById(id)?.classList.remove('focused-field');
    });
    return;
  }
  document.getElementById('quickModal')?.classList.remove('hide-bottom-dock');
  if(document.activeElement && (document.activeElement.id === 'qmDesc' || document.activeElement.id === 'qmNote')){
    document.activeElement.blur();
  }
  const effectiveMode = (mode === 'acc' || mode === 'toAcc' || mode === 'cat' || mode === 'calc')
    ? mode
    : (qmState.type === 'transfer' ? 'toAcc' : 'cat');
  qmState.dock = effectiveMode;
  if(effectiveMode === 'calc'){
    const prevTgt = qmState.calcTarget;
    const tgt = calcFieldId || qmState.calcTarget || 'qmAmount';
    qmState.calcTarget = tgt;
    const curVal = val(tgt);
    if(prevTgt !== tgt){
      if(tgt === 'qmFee' && (!curVal || Number(curVal) <= 0)){
        const learned = suggestSmartTransferFee();
        qmState.calcExpr = learned > 0 ? String(learned) : '';
      } else {
        qmState.calcExpr = curVal && Number(curVal) > 0 ? String(curVal) : '';
      }
    } else if(!qmState.calcExpr){
      qmState.calcExpr = curVal && Number(curVal) > 0 ? String(curVal) : '';
    }
    updateQmCalcDisplay();
  }

  const dAcc = document.getElementById('qmDockAcc');
  const dToAcc = document.getElementById('qmDockToAcc');
  const dCat = document.getElementById('qmDockCat');
  const dCalc = document.getElementById('qmDockCalc');
  const tAcc = document.getElementById('qmAccTrigger');
  const tToAcc = document.getElementById('qmToAccTrigger');
  const tCat = document.getElementById('qmCatTrigger');

  [tAcc, tToAcc, tCat].forEach(el=>{
    if(el){ el.classList.remove('focused-field'); el.closest('.c-row')?.classList.remove('focused-row'); }
  });

  if(dAcc) dAcc.style.display = effectiveMode === 'acc' ? 'flex' : 'none';
  if(dToAcc) dToAcc.style.display = effectiveMode === 'toAcc' ? 'flex' : 'none';
  if(dCat) dCat.style.display = effectiveMode === 'cat' ? 'flex' : 'none';
  if(dCalc) dCalc.style.display = effectiveMode === 'calc' ? 'flex' : 'none';

  if(effectiveMode === 'acc' && tAcc){ tAcc.classList.add('focused-field'); tAcc.closest('.c-row')?.classList.add('focused-row'); }
  if(effectiveMode === 'toAcc' && tToAcc){ tToAcc.classList.add('focused-field'); tToAcc.closest('.c-row')?.classList.add('focused-row'); }
  if(effectiveMode === 'cat' && tCat){ tCat.classList.add('focused-field'); tCat.closest('.c-row')?.classList.add('focused-row'); }
}

function updateQmEditActionButtons(){
  const hasEdit = !!qmState.editId;
  const btnCopy = document.getElementById('qmBtnCopyExisting');
  const btnDel = document.getElementById('qmBtnDeleteExisting');
  if(btnCopy) btnCopy.style.display = hasEdit ? 'inline-block' : 'none';
  if(btnDel) btnDel.style.display = hasEdit ? 'inline-block' : 'none';
}

function toggleQuickTransferFeeRow(){
  const row = document.getElementById('qmFeeRow');
  const btn = document.getElementById('qmFeeToggleBtn');
  if(!row) return;
  const show = row.style.display === 'none';
  row.style.display = show ? 'flex' : 'none';
  if(btn) btn.classList.toggle('active', show);
  if(show){ qmState.calcExpr=''; setQmDockMode('calc','qmFee'); }
  else setv('qmFee', '');
}

function swapQuickTransferAccounts(){
  if(!qmState.accountId && !qmState.toAccountId) return;
  const tmp = qmState.accountId;
  qmState.accountId = qmState.toAccountId;
  qmState.toAccountId = tmp;
  renderQuickPickers();
  toast('تم عكس اتجاه التحويل ⇅');
}

function openQuickAddModal(defaultType){
  const tree = defaultType === 'income' ? state.categoryTree.income : state.categoryTree.expense;
  const firstMain = Object.keys(tree)[0] || 'أخرى';
  qmState = {
    type: defaultType || 'expense',
    accountId: state.prefs?.defaultAccount || (state.accounts[0]?.id || ''),
    toAccountId: state.accounts[1]?.id || (state.accounts[0]?.id || ''),
    category: firstMain,
    subCategory: '',
    isCard: false,
    cardMode: 'swipe',
    editId: null,
    editKind: 'tx',
    dock: 'acc',
    recurringMonthly: false,
    accListGroup: 'accounts'
  };
  document.getElementById('qmHeaderTitle').textContent = 'إضافة معاملة';
  qmState.calcExpr = '';
  setv('qmDate', today());
  syncQmDateDisplay();
  setv('qmAmount', '');
  setv('qmFee', '');
  setv('qmNote', '');
  setv('qmDesc', '');
  
  updateQmEditActionButtons();
  syncQmRecurringUI();
  setQuickTxType(qmState.type);
  renderQuickPickers();
  setQmDockMode('acc');
  document.getElementById('quickModal').classList.add('show');
  setTimeout(autoResizeQmDesc, 35);
}

function openEditQuickTx(id){
  const t = state.transactions.find(x=>String(x.id)===String(id));
  if(!t) return;
  if(t.linkedCardOpId||t.linkedCommitmentPaymentId||t.linkedCardPaymentRecordId||t.source==='card-payment'||t.source==='commitment-payment'){
    return toast('تعديل مبلغ السداد من شاشة المعاملات قد يفصل المبلغ عن جدول البطاقة أو الالتزام. ألغِ حركة السداد ثم أعد تسجيلها بالقيمة الصحيحة.');
  }
  const isCardTx = isCardPurchaseTx(t);
  let cardId = '';
  let cardMode = 'swipe';
  if(isCardTx){
    const opId = String(t.source||'').replace('card-purchase:','');
    const op = state.cardOps.find(o=>o.id===opId);
    if(op){
      cardId = op.cardId;
      cardMode = op.type || 'swipe';
      if(op.months) syncQmCardMonthsPills(op.months);
    }
  }
  qmState = {
    type: t.type === 'income' ? 'income' : 'expense',
    accountId: isCardTx ? (cardId || state.cards[0]?.id || '') : (t.accountId || ''),
    toAccountId: '',
    category: t.category || 'أخرى',
    subCategory: t.subCategory || '',
    isCard: isCardTx,
    cardMode: cardMode,
    editId: t.id,
    editKind: 'tx',
    dock: ''
  };
  document.getElementById('qmHeaderTitle').textContent = 'تعديل معاملة';
  qmState.calcExpr = String(t.amount || '');
  setv('qmDate', t.date || today());
  syncQmDateDisplay();
  setv('qmAmount', t.amount || '');
  setv('qmFee', '');
  setv('qmNote', String(t.title||'').replace(/^شراء بالبطاقة\s*-\s*/,''));
  setv('qmDesc', t.description || '');
  updateQmEditActionButtons();
  syncQmRecurringUI();
  setQuickTxType(qmState.type);
  renderQuickPickers();
  setQmDockMode('');
  document.getElementById('quickModal').classList.add('show');
  setTimeout(autoResizeQmDesc, 35);
  setTimeout(autoResizeQmDesc, 35);
}

function findLinkedTransferFeeTransaction(ledger){
  if(!ledger)return null;
  return (state.transactions||[]).find(t=>String(t.id)===String(ledger.feeTransactionId||'')||String(t.linkedTransferLedgerId||'')===String(ledger.id))||null;
}
function saveLinkedTransferFeeTransaction(ledger,amount,date,accountId,currency,note,createdAt=Date.now()){
  if(!ledger)return null;
  const value=Math.max(0,Number(amount)||0);
  let tx=findLinkedTransferFeeTransaction(ledger);
  if(value<=0){
    if(tx&&!tx.deletedAt){tx.deletedAt=new Date().toISOString();tx.deletedReason='transfer-fee-removed';}
    ledger.feeTransactionId=tx?.id||null;
    return tx;
  }
  syncCategoryTrees();
  if(!state.categoryTree.expense['رسوم'])state.categoryTree.expense['رسوم']=['رسوم تحويل'];
  if(!state.categories.includes('رسوم'))state.categories.push('رسوم');
  const isNew=!tx;
  if(!tx)tx={id:uid('tx-fee')};
  Object.assign(tx,{
    type:'expense',category:'رسوم',subCategory:'رسوم تحويل',
    title:note?('رسوم تحويل - '+note):'رسوم تحويل',description:'',amount:value,date,
    accountId,source:'transfer-fee',linkedTransferLedgerId:String(ledger.id),
    ...quickCurrencySnapshot(value,currency,date),createdAt:isNew?createdAt:(tx.createdAt||createdAt)
  });
  delete tx.deletedAt;delete tx.deletedReason;
  if(isNew)state.transactions.push(tx);
  ledger.feeTransactionId=tx.id;
  return tx;
}

function openEditLedgerModal(l){
  qmState = {
    type: 'transfer',
    accountId: l.from || '',
    toAccountId: l.to || '',
    category: '',
    subCategory: '',
    isCard: false,
    cardMode: 'swipe',
    editId: l.id,
    editKind: 'ledger',
    dock: ''
  };
  document.getElementById('qmHeaderTitle').textContent = 'تعديل معاملة';
  qmState.calcExpr = String(l.amount || '');
  setv('qmDate', l.date || today());
  syncQmDateDisplay();
  setv('qmAmount', l.amount || '');
  const existingFee=findLinkedTransferFeeTransaction(l);
  setv('qmFee', existingFee&&!existingFee.deletedAt?existingFee.amount:(l.fee||''));
  setv('qmNote', (l.note && l.note !== 'تحويل بين الحسابات') ? l.note : '');
  setv('qmDesc', l.description || '');
  autoResizeQmDesc();
  updateQmEditActionButtons();
  setQuickTxType('transfer');

  renderQuickPickers();
  setQmDockMode('');
  document.getElementById('quickModal').classList.add('show');
  setTimeout(autoResizeQmDesc, 35);
  setTimeout(autoResizeQmDesc, 35);
}

function closeQuickModal(){
  closeQmMonthsMenu();
  document.getElementById('quickModal').classList.remove('show');
}

function setQuickTxType(t){
  qmState.type = t;
  document.getElementById('qmTabInc').classList.toggle('active', t==='income');
  document.getElementById('qmTabExp').classList.toggle('active', t==='expense');
  document.getElementById('qmTabTrn').classList.toggle('active', t==='transfer');

  const isTrn = (t === 'transfer');
  document.getElementById('qmAccRow')?.classList.toggle('is-transfer-from', isTrn);
  document.getElementById('qmToAccRow').style.display = isTrn ? 'flex' : 'none';
  document.getElementById('qmSwapAccRow').style.display = isTrn ? 'flex' : 'none';
  document.getElementById('qmCatRow').style.display = isTrn ? 'none' : 'flex';
  document.getElementById('qmAccLabelTitle').textContent = isTrn ? 'من حساب' : 'الحساب';

  const feeInp = document.getElementById('qmFee');
  if(feeInp) feeInp.style.display = isTrn ? 'block' : 'none';
  if(!isTrn) setv('qmFee', '');

  if(t !== 'expense'){
    qmState.isCard = false;
    const cmw = document.getElementById('qmCardModeWrap');
    if(cmw) cmw.style.display = 'none';
    closeQmMonthsMenu();
  }
  if(!isTrn){
    const tree = getActiveCatTree();
    if(!tree[qmState.category]){
      qmState.category = Object.keys(tree)[0] || 'أخرى';
      qmState.subCategory = '';
    }
  }
  syncQmRecurringUI();
  renderQuickPickers();
  setQmDockMode(qmState.editId ? '' : 'acc');
}

function openQmCardMonthsPicker(){
  const cur = String(val('qmCardMonths') || '12');
  const opts = [3, 6, 9, 12, 15, 18, 24];
  const html = `<div class="cs-opt-list">` + opts.map(m => `
    <button type="button" class="cs-opt-btn ${String(m)===cur?'selected':''}" onclick="syncQmCardMonthsPills(${m});closeAppDialog()">
      <span>${m} شهر</span><span>${String(m)===cur?'●':'○'}</span>
    </button>
  `).join('') + `</div>`;
  showAppCustomForm('عدد شهور التقسيط', html, null, true);
}
function closeQmMonthsMenu(){
  const menu = document.getElementById('qmCardMonthsMenu');
  if(menu) menu.classList.remove('open');
}
function toggleQmMonthsMenu(ev){
  if(ev) ev.stopPropagation();
  if(!qmState.isCard || qmState.type !== 'expense') return;
  const menu = document.getElementById('qmCardMonthsMenu');
  if(menu) menu.classList.toggle('open');
}
function selectQmCardMonth(mVal){
  syncQmCardMonthsPills(mVal);
  if(qmState.isCard && qmState.type === 'expense'){
    setQmCardMode('installment');
    const descEl = document.getElementById('qmDesc');
    if(descEl){
      const instLine = `تم تقسيط هذه المعاملة على ${mVal} شهور`;
      const cur = String(descEl.value || '').replace(/تم تقسيط هذه المعاملة على \d+ شهور\n?/g, '').trim();
      descEl.value = cur ? (instLine + '\n' + cur) : instLine;
      autoResizeQmDesc();
    }
  }
  closeQmMonthsMenu();
}
function syncQmCardMonthsPills(mVal){
  const target = String(mVal || 12);
  setv('qmCardMonths', target);
  document.querySelectorAll('#qmCardMonthsMenu .imm-opt').forEach(b=>{
    b.classList.toggle('active', String(b.dataset.m) === target);
  });
}
function toggleQmCardInstallment(ev){
  if(ev) ev.stopPropagation();
  if(!qmState.isCard || qmState.type !== 'expense') return;
  const menu = document.getElementById('qmCardMonthsMenu');
  if(qmState.cardMode === 'installment'){
    if(menu && menu.classList.contains('open')){
      closeQmMonthsMenu();
    } else {
      setQmCardMode('swipe');
      closeQmMonthsMenu();
      const descEl = document.getElementById('qmDesc');
      if(descEl){
        descEl.value = String(descEl.value || '').replace(/تم تقسيط هذه المعاملة على \d+ شهور\n?/g, '').trim();
        autoResizeQmDesc();
      }
    }
  } else {
    setQmCardMode('installment');
    if(menu) menu.classList.add('open');
  }
}
function setQmCardMode(mode){
  qmState.cardMode = (mode === 'installment') ? 'installment' : 'swipe';
  const wrap = document.getElementById('qmCardModeWrap');
  const btn = document.getElementById('qmCardModeRow');
  const isCardExp = !!(qmState.isCard && qmState.type === 'expense');
  const isInst = isCardExp && qmState.cardMode === 'installment';
  if(wrap){
    wrap.style.display = isCardExp ? 'inline-block' : 'none';
  }
  if(btn){
    btn.classList.toggle('active', isInst);
  }
  if(!isCardExp) closeQmMonthsMenu();
}

function updateQmCatLabel(){
  const label = qmState.subCategory ? `${qmState.category} / ${qmState.subCategory}` : (qmState.category || 'اختر القسم');
  document.getElementById('qmCatSelectedText').textContent = label;
}

function getQuickSelectedCurrency(){return 'EGP';}

function updateQuickCurrencyLabel(){
  const el=document.getElementById('qmCurrencyLabel');
  if(el)el.textContent=getQuickSelectedCurrency();
}
function quickCurrencySnapshot(amount,currency,date){
  if(typeof transactionCurrencySnapshot==='function')return transactionCurrencySnapshot(amount,currency,date);
  return {currency:String(currency||'EGP').toUpperCase()};
}
function updateQuickTransferPreview(){const el=document.getElementById('qmTransferPreview');if(el)el.style.display='none';}

function renderQuickPickers(){
  let accItems = state.accounts.map(a=>({id:a.id, name:a.name, isCard:false}));
  if(qmState.type === 'expense'){
    state.cards.forEach(c=>accItems.push({id:c.id, name:'💳 ' + c.name, isCard:true}));
  }
  const selAcc = accItems.find(x=>x.id===qmState.accountId) || accItems[0];
  if(selAcc){
    qmState.accountId = selAcc.id;
    qmState.isCard = (qmState.type === 'expense') && !!selAcc.isCard;
    document.getElementById('qmAccSelectedText').textContent = selAcc.name;
    setQmCardMode(qmState.cardMode);
  } else {
    document.getElementById('qmAccSelectedText').textContent = 'كاش';
  }
  updateQuickCurrencyLabel();
  updateQuickTransferPreview();
  const viewMode = getQmAccViewMode();
  const vBtn = document.getElementById('qmAccViewToggleBtn');
  if(vBtn) vBtn.innerHTML = viewMode === 'list'
    ? '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>'
    : '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>';
  const gridEl = document.getElementById('qmAccGrid');
  const splitEl = document.getElementById('qmAccListSplit');
  const accOnly = accItems.filter(x => !x.isCard);
  const cardOnly = accItems.filter(x => x.isCard);
  const renderBtn = a => `<button type="button" class="qg-item ${a.id===qmState.accountId?'selected':''}"
      onpointerdown="startQuickAccLongPress(event, '${escJs(a.id)}', ${a.isCard})"
      onpointerup="cancelQuickAccLongPress()"
      onpointermove="moveQuickAccLongPress(event)"
      onpointercancel="cancelQuickAccLongPress()"
      oncontextmenu="event.preventDefault()"
      onclick="if(_qmLongPressFired){_qmLongPressFired=false;return;}selectQuickAcc('${escJs(a.id)}', ${a.isCard})">${esc(a.name)}</button>`;

  if(viewMode === 'list' && splitEl){
    if(gridEl) gridEl.style.display = 'none';
    splitEl.style.display = 'grid';
    if(!cardOnly.length) qmState.accListGroup = 'accounts';
    const curGrp = (qmState.accListGroup === 'cards' && cardOnly.length) ? 'cards' : 'accounts';
    const grpEl = document.getElementById('qmAccListGroups');
    const itmEl = document.getElementById('qmAccListItems');
    if(grpEl){
      grpEl.innerHTML = `<button type="button" class="mm-cat-item ${curGrp==='accounts'?'active':''}" onclick="selectQmAccListGroup('accounts')"><span>الحسابات</span><small style="opacity:.7">${accOnly.length}</small></button>` +
        (cardOnly.length ? `<button type="button" class="mm-cat-item ${curGrp==='cards'?'active':''}" onclick="selectQmAccListGroup('cards')"><span>البطاقات</span><small style="opacity:.7">${cardOnly.length}</small></button>` : '');
    }
    if(itmEl){
      const activeArr = curGrp === 'cards' ? cardOnly : accOnly;
      itmEl.innerHTML = activeArr.length ? activeArr.map(a => `<button type="button" class="mm-cat-item ${a.id===qmState.accountId?'active':''}"
        onpointerdown="startQuickAccLongPress(event, '${escJs(a.id)}', ${a.isCard})"
        onpointerup="cancelQuickAccLongPress()"
        onpointermove="moveQuickAccLongPress(event)"
        onpointercancel="cancelQuickAccLongPress()"
        oncontextmenu="event.preventDefault()"
        onclick="if(_qmLongPressFired){_qmLongPressFired=false;return;}selectQuickAcc('${escJs(a.id)}', ${a.isCard})"><span>${esc(a.name)}</span></button>`).join('')
        : '<div class="empty" style="padding:14px 6px;font-size:.7rem">لا توجد عناصر</div>';
    }
  } else {
    if(splitEl) splitEl.style.display = 'none';
    if(gridEl){
      gridEl.style.display = 'block';
      let gHtml = '';
      if(accOnly.length){
        gHtml += `<div class="qm-acc-group-lbl">الحسابات</div><div class="quick-grid qm-sub-grid">${accOnly.map(renderBtn).join('')}</div>`;
      }
      if(cardOnly.length){
        gHtml += `<div class="qm-acc-group-lbl cards">البطاقات</div><div class="quick-grid qm-sub-grid">${cardOnly.map(renderBtn).join('')}</div>`;
      }
      gridEl.innerHTML = gHtml || '<div class="empty">لا توجد حسابات</div>';
    }
  }

  const toAcc = state.accounts.find(a=>a.id===qmState.toAccountId) || state.accounts.find(a=>a.id!==qmState.accountId) || state.accounts[0];
  if(toAcc){
    qmState.toAccountId = toAcc.id;
    document.getElementById('qmToAccSelectedText').textContent = toAcc.name;
  }
  document.getElementById('qmToAccGrid').innerHTML = state.accounts.map(a=>`
    <button type="button" class="qg-item ${a.id===qmState.toAccountId?'selected':''}"
      onpointerdown="startQuickAccLongPress(event, '${escJs(a.id)}', false)"
      onpointerup="cancelQuickAccLongPress()"
      onpointermove="moveQuickAccLongPress(event)"
      onpointercancel="cancelQuickAccLongPress()"
      oncontextmenu="event.preventDefault()"
      onclick="if(_qmLongPressFired){_qmLongPressFired=false;return;}selectQuickToAcc('${escJs(a.id)}')">${esc(a.name)}</button>
  `).join('');

  const tree = getActiveCatTree();
  const mainCats = Object.keys(tree);
  if(!mainCats.length){
    qmState.category = '';
    qmState.subCategory = '';
    document.getElementById('qmCatSelectedText').textContent = 'لا توجد أقسام';
  } else {
    if(!qmState.category || !tree[qmState.category]){
      qmState.category = mainCats[0];
      qmState.subCategory = '';
    }
    updateQmCatLabel();
  }

  const mainColEl = document.getElementById('qmMainCatList');
  const subColEl = document.getElementById('qmSubCatList');
  if(mainColEl && subColEl){
    if(!mainCats.length){
      mainColEl.innerHTML = '<div class="empty" style="padding:14px 4px;font-size:.68rem">اضغط «＋ رئيسي» للإضافة</div>';
      subColEl.innerHTML = '<div class="empty" style="padding:14px 4px;font-size:.68rem">—</div>';
    } else {
      mainColEl.innerHTML = mainCats.map(mc=>{
        const subsCount = (tree[mc]||[]).length;
        return `<button type="button" class="mm-cat-item ${mc===qmState.category?'active':''}" onclick="selectQuickMainCat('${escJs(mc)}')">
          <span>${esc(mc)}</span>
          ${subsCount ? `<small style="opacity:.7">›</small>` : ''}
        </button>`;
      }).join('');

      const subs = tree[qmState.category] || [];
      if(!subs.length){
        subColEl.innerHTML = '<div class="empty" style="padding:14px 6px;font-size:.68rem">بدون أقسام فرعية</div>';
      } else {
        subColEl.innerHTML = subs.map(sc=>`
          <button type="button" class="mm-cat-item ${sc===qmState.subCategory?'active':''}" onclick="selectQuickSubCat('${escJs(sc)}')"><span>${esc(sc)}</span></button>
        `).join('');
      }
    }
  }
}

function selectQuickAcc(id, isCard){
  qmState.accountId = id;
  qmState.isCard = !!isCard;
  renderQuickPickers();
  if(qmState.type === 'transfer'){
    setQmDockMode('toAcc');
  } else {
    setQmDockMode('cat');
  }
}
function selectQuickToAcc(id){
  qmState.toAccountId = id;
  renderQuickPickers();
  setQmDockMode('calc','qmAmount');
}
function selectQuickMainCat(mc){
  qmState.category = mc;
  qmState.subCategory = '';
  renderQuickPickers();
  const subs = getActiveCatTree()[mc] || [];
  if(!subs.length){
    setQmDockMode('calc','qmAmount');
  }
}
function selectQuickSubCat(sc){
  qmState.subCategory = (qmState.subCategory === sc) ? '' : sc;
  renderQuickPickers();
  setQmDockMode('calc','qmAmount');
}
function openEditQuickCatPrompt(isSub){
  const isInc = qmState.type === 'income';
  const tree = isInc ? state.categoryTree.income : state.categoryTree.expense;
  if(isSub){
    const oldSub = qmState.subCategory;
    const parent = qmState.category;
    if(!oldSub || !parent) return toast('اختر قسماً فرعياً أولاً لتعديله');
    showAppPrompt(`تعديل القسم الفرعي «${oldSub}»`, 'الاسم الجديد...', oldSub, (n)=>{
      const clean = String(n||'').trim();
      if(!clean || clean === oldSub) return;
      tree[parent] = (tree[parent]||[]).map(s => s === oldSub ? clean : s);
      state.transactions.forEach(t=>{ if(t.category===parent && t.subCategory===oldSub) t.subCategory=clean; });
      qmState.subCategory = clean;
      persist();
      renderQuickPickers();
      toast('تم تعديل القسم الفرعي ✓');
    });
  } else {
    const oldMain = qmState.category;
    if(!oldMain) return toast('اختر قسماً رئيسياً أولاً لتعديله');
    showAppPrompt(`تعديل القسم الرئيسي «${oldMain}»`, 'الاسم الجديد...', oldMain, (n)=>{
      const clean = String(n||'').trim();
      if(!clean || clean === oldMain) return;
      const subs = tree[oldMain] || [];
      const keys = Object.keys(tree);
      const rebuilt = {};
      keys.forEach(k => { rebuilt[k === oldMain ? clean : k] = (k === oldMain ? subs : tree[k]); });
      if(isInc){
        state.categoryTree.income = rebuilt;
        state.incomeCategories = Object.keys(rebuilt);
      } else {
        state.categoryTree.expense = rebuilt;
        state.categories = Object.keys(rebuilt);
      }
      state.transactions.forEach(t=>{ if(t.category===oldMain) t.category=clean; });
      qmState.category = clean;
      persist();
      renderQuickPickers();
      toast('تم تعديل القسم الرئيسي ✓');
    });
  }
}

function openAddQuickCatPrompt(isSub){
  const label = isSub ? `إضافة قسم فرعي داخل «${qmState.category}»` : 'إضافة قسم رئيسي جديد';
  showAppPrompt(label, 'اكتب الاسم هنا...', '', (name)=>{
    if(!name || !name.trim()) return;
    const clean = name.trim();
    const isInc = qmState.type === 'income';
    const tree = isInc ? state.categoryTree.income : state.categoryTree.expense;
    if(isSub){
      const parent = qmState.category || Object.keys(tree)[0] || 'أخرى';
      tree[parent] = [...new Set([...(tree[parent]||[]), clean])];
      qmState.subCategory = clean;
    } else {
      if(!tree[clean]) tree[clean] = [];
      if(isInc) state.incomeCategories = [...new Set([...(state.incomeCategories||[]), clean])];
      else state.categories = [...new Set([...(state.categories||[]), clean])];
      qmState.category = clean;
      qmState.subCategory = '';
    }
    persist();
    renderQuickPickers();
    toast('تمت الإضافة ✓');
  });
}

function saveQuickModal(){
  if(qmState.dock === 'calc' && qmState.calcExpr && /[+\-×÷]/.test(String(qmState.calcExpr).slice(1))){ return toast('اضغط = لحساب الناتج وإدراجه في المبلغ أولاً'); }
  const amount = num('qmAmount');
  const fee = num('qmFee');
  const date = val('qmDate') || today();
  const note = val('qmNote').trim();
  const description = val('qmDesc').trim();
  const nowTs = Date.now();
  if(amount <= 0) return toast('أدخل المبلغ بشكل صحيح');

  if(qmState.type === 'transfer'){
    if(!qmState.accountId || !qmState.toAccountId || qmState.accountId === qmState.toAccountId){
      return toast('اختر حسابين مختلفين للتحويل');
    }
    let transferValidation;
    try{transferValidation=validateTransferCurrencies(qmState.accountId,qmState.toAccountId,date);}
    catch(err){return toast(err.message);}
    const transferFromCurrency=transferValidation.fromCurrency;
    const transferToCurrency=transferValidation.toCurrency;
    const transferFromRate=transferValidation.fromRate;
    const transferToRate=transferValidation.toRate;
    const receivedAmount=convertCurrencyAmount(amount,transferFromCurrency,transferToCurrency,date,transferFromRate,transferToRate);
    const cleanFee = Math.max(0, fee);
    if(qmState.editId && qmState.editKind === 'ledger'){
      const l = state.ledger.find(x=>String(x.id)===String(qmState.editId));
      if(!l)return toast('التحويل المراد تعديله لم يعد موجوداً');
      {
        l.from = qmState.accountId;
        l.to = qmState.toAccountId;
        l.amount = amount; // legacy-compatible source-side amount
        l.fromAmount = amount;
        l.toAmount = receivedAmount;
        l.fee = 0;
        l.currency = transferFromCurrency;
        l.fromCurrency = transferFromCurrency;
        l.toCurrency = transferToCurrency;
        l.fromExchangeRateAtCreation = transferFromRate;
        l.toExchangeRateAtCreation = transferToRate;
        l.exchangeRateAtCreation = transferFromRate;
        l.note = note;
        l.description = description;
        l.date = date;
      }
      saveLinkedTransferFeeTransaction(l,cleanFee,date,qmState.accountId,transferFromCurrency,note,nowTs+1);
      persist(); refreshSecondaryFeeds(); closeQuickModal(); toast('تم تعديل التحويل ✓');
      return;
    }
    const newLedger={
      id: uid('ledger'),
      type: 'transfer',
      feeTransactionId:null,
      from: qmState.accountId,
      to: qmState.toAccountId,
      amount, // legacy-compatible source-side amount
      fromAmount:amount,
      toAmount:receivedAmount,
      fee: 0,
      currency:transferFromCurrency,
      fromCurrency:transferFromCurrency,
      toCurrency:transferToCurrency,
      fromExchangeRateAtCreation:transferFromRate,
      toExchangeRateAtCreation:transferToRate,
      exchangeRateAtCreation:transferFromRate,
      note: note,
      description,
      date,
      createdAt: nowTs
    };
    state.ledger.push(newLedger);
    if(cleanFee>0)saveLinkedTransferFeeTransaction(newLedger,cleanFee,date,qmState.accountId,transferFromCurrency,note,nowTs+1);
    persist(); refreshSecondaryFeeds(); closeQuickModal(); toast(cleanFee > 0 ? 'تم تسجيل التحويل والرسوم في معاملة مستقلة ✓' : 'تم تسجيل التحويل ✓');
    return;
  }

  const transactionCurrency=getQuickSelectedCurrency();
  let currencySnapshot;
  try{currencySnapshot=quickCurrencySnapshot(amount,transactionCurrency,date);}
  catch(err){return toast(err.message);}

  if(qmState.editId){
    const t = state.transactions.find(x=>String(x.id)===String(qmState.editId));
    if(t){
      const cardOp=isCardPurchaseTx(t)?state.cardOps.find(o=>String(o.id)===String(String(t.source||'').replace('card-purchase:',''))):null;
      if(cardOp&&typeof canEditCardOperationFinancials==='function'&&!canEditCardOperationFinancials(cardOp,amount,date))return toast('لا يمكن تعديل مبلغ أو تاريخ عملية بطاقة بعد تسجيل سداد عليها. ألغِ السداد المرتبط أولاً ثم عدّل العملية.');
      t.description = description;
      if(isCardPurchaseTx(t)){
        const opId = String(t.source||'').replace('card-purchase:','');
        const op = state.cardOps.find(o=>String(o.id)===String(opId));
        const financialTermsChanged=op&&cardOperationFinancialTermsChanged(op,amount,date);
        const title = note || qmState.subCategory || qmState.category || 'شراء بالبطاقة';
        t.category = qmState.category || 'مشتريات بطاقة';
        t.subCategory = qmState.subCategory || '';
        t.title = 'شراء بالبطاقة - ' + title;
        t.amount = amount;
        t.date = date;
        Object.assign(t,currencySnapshot);
        if(op){
          op.title = title;
          op.amount = amount;
          op.date = date;
          Object.assign(op,currencySnapshot);
          const card = state.cards.find(c=>c.id===op.cardId);
          if(card)op.dueDate=dueDateFor(card,date);
          if(op.type === 'installment' && card && financialTermsChanged){
            op.purchaseMonth=date.slice(0,7);
            if(typeof recalculateInstallmentOpWithTerms==='function')recalculateInstallmentOpWithTerms(op,card);
            else {
              const nums=computeCardInstallmentNumbers(card,amount,Number(op.months)||12);
              const built=buildInstallmentSchedulesForCard(card,date.slice(0,7),Number(op.months)||12,nums.base,nums.fee,nums.principalAndInterest);
              op.interest=nums.interest;op.adminFee=nums.fee;op.installment=nums.base;op.total=nums.total;op.feeMonth=built.feeYM;op.feeDue=nums.fee;op.schedules=built.schedules;
            }
            syncCardInstallmentsToCommitments();
          }
        }
      } else {
        t.type = qmState.type;
        t.category = qmState.category;
        t.subCategory = qmState.subCategory || '';
        t.title = note;
        t.amount = amount;
        t.date = date;
        t.accountId = qmState.accountId || null;
        Object.assign(t,currencySnapshot);
      }
    }
    persist(); refreshSecondaryFeeds(); closeQuickModal(); toast('تم تعديل الحركة ✓');
    return;
  }

  if(qmState.isCard && qmState.type === 'expense'){
    const card = state.cards.find(c=>c.id===qmState.accountId);
    if(!card) return toast('اختر البطاقة');
    const title = note || qmState.subCategory || qmState.category || 'شراء بالبطاقة';
    const opType = qmState.cardMode;
    let op = {id:uid('op'), cardId:card.id, type:opType, title, amount, date, ...currencySnapshot, paid:0, dueDate:dueDateFor(card,date), createdAt:nowTs};
    if(opType === 'installment'){
      const months = num('qmCardMonths') || 12;
      const nums = computeCardInstallmentNumbers(card, amount, months);
      const purchaseYM = date.slice(0,7);
      const built = buildInstallmentSchedulesForCard(card, purchaseYM, months, nums.base, nums.fee, nums.principalAndInterest);
      op.purchaseMonth = purchaseYM; op.months = months; op.interest = nums.interest;
      op.adminFee = nums.fee; op.installment = nums.base; op.total = nums.total;
      op.feeMonth = built.feeYM; op.feeDue = nums.fee; op.feePaid = 0;
      op.schedules = built.schedules;
    }
    state.cardOps.push(op);
    const _rTotC = Number(qmState.recurringMonths||0);
    const cardTx = {id:'card-purchase-'+op.id, type:'card_purchase', title:'شراء بالبطاقة - '+title, description, category:qmState.category||'مشتريات بطاقة', subCategory:qmState.subCategory||'', amount, date, ...currencySnapshot, accountId:null, source:'card-purchase:'+op.id, recurringMonthly:!!qmState.recurringMonthly, repeatIndex:(qmState.recurringMonthly && _rTotC > 1)?1:undefined, repeatTotal:(qmState.recurringMonthly && _rTotC > 1)?_rTotC:undefined, createdAt:nowTs};
    state.transactions.push(cardTx);
    if(qmState.recurringMonthly) upsertRecurringMonthlyCommitment(cardTx);
    if(opType === 'installment') syncCardInstallmentsToCommitments();
    persist(); refreshSecondaryFeeds(); closeQuickModal(); toast(opType==='installment'?'تم تسجيل التقسيط وإضافة أقساطه ✓':'تم تسجيل الشراء على البطاقة ✓');
    return;
  }

  const createdTx = {
    id: uid('tx'),
    type: qmState.type,
    category: qmState.category,
    subCategory: qmState.subCategory || '',
    title: note,
    description,
    amount,
    date,
    ...currencySnapshot,
    accountId: qmState.accountId || null,
    recurringMonthly: !!qmState.recurringMonthly,
    repeatIndex: (qmState.recurringMonthly && Number(qmState.recurringMonths||0) > 1) ? 1 : undefined,
    repeatTotal: (qmState.recurringMonthly && Number(qmState.recurringMonths||0) > 1) ? Number(qmState.recurringMonths) : undefined,
    createdAt: nowTs
  };
  state.transactions.push(createdTx);
  if(qmState.recurringMonthly) upsertRecurringMonthlyCommitment(createdTx);
  persist(); refreshSecondaryFeeds(); closeQuickModal(); toast('تم الحفظ ✓');
}




let _qmLpTimer = null;
let _qmLongPressFired = false;
let _qmLpStartX = 0;
let _qmLpStartY = 0;
function startQuickAccLongPress(ev, id, isCard){
  cancelQuickAccLongPress();
  _qmLongPressFired = false;
  _qmLpStartX = ev ? ev.clientX : 0;
  _qmLpStartY = ev ? ev.clientY : 0;
  _qmLpTimer = setTimeout(()=>{
    _qmLongPressFired = true;
    if(isCard && typeof openEditCardModal === 'function'){
      openEditCardModal(id);
    } else if(!isCard && typeof openEditAccountModal === 'function'){
      openEditAccountModal(id);
    }
  }, 480);
}
function moveQuickAccLongPress(ev){
  if(!_qmLpTimer || !ev) return;
  if(Math.abs(ev.clientX - _qmLpStartX) > 14 || Math.abs(ev.clientY - _qmLpStartY) > 14){
    cancelQuickAccLongPress();
  }
}
function cancelQuickAccLongPress(){
  if(_qmLpTimer){ clearTimeout(_qmLpTimer); _qmLpTimer = null; }
}

document.addEventListener('click', e => { const rw = document.getElementById('qmRecurWrap'); if(rw && !rw.contains(e.target)) closeQmRecurMenu(); });
