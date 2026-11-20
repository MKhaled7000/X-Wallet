/* X-Wallet V14.0 module: reports.js | Extracted from V13.40 app.js */

/* ---- Original app.js lines 3769-4060 ---- */
/* 6.1 & 6.2 جميع المستحقات: Columns = المعاملة | النوع (شهري / مستحقات / بطاقة) | المبلغ | المدة | البدء | الانتهاء */
function openCommitmentDetailsModal(title, typeLbl, amtStr, durLbl, startLbl, endLbl){
  const html = `
    <div class="c-list">
      <div class="c-row"><label>النوع</label><b style="color:var(--mint)">${esc(typeLbl)}</b></div>
      <div class="c-row"><label>القيمة</label><b dir="ltr" class="orange">${esc(amtStr)}</b></div>
      <div class="c-row"><label>المدة</label><b>${esc(durLbl)}</b></div>
      <div class="c-row"><label>البدء</label><b>${esc(startLbl)}</b></div>
      <div class="c-row"><label>الانتهاء</label><b>${esc(endLbl)}</b></div>
    </div>
  `;
  showAppCustomForm(title, html, null, true);
}

function renderAllCommitmentsMasterTable(){
  const wrap = document.getElementById('allCommitmentsTableWrap');
  if(!wrap) return;
  syncCardInstallmentsToCommitments();

  const allRows = [];
  (state.commitments||[]).filter(c => !c.cardOpId).forEach((c, idx)=>{
    const isOnce = (c.freq === 'once');
    const startYM = isOnce ? (c.dueDate ? c.dueDate.slice(0,7) : c.start) : c.start;
    const endYM = isOnce ? '' : c.end;
    let durNum = Number(c.durationMonths) || 0;
    if(!isOnce && !durNum && startYM && endYM){
      const [sy, sm] = startYM.split('-').map(Number);
      const [ey, em] = endYM.split('-').map(Number);
      durNum = Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
    }
    allRows.push({
      id: c.id,
      isCard: false,
      title: c.title,
      typeLabel: isOnce ? 'مستحق' : 'شهري',
      amountVal: Number(c.amount)||0,
      currency: String(c.currency||'EGP').toUpperCase(),
      durLabel: isOnce ? 'مرة' : (durNum ? `${durNum} ش` : 'شهري'),
      startLabel: formatYMArabic(startYM),
      endLabel: isOnce ? '—' : formatYMArabic(endYM),
      order: getItemTimestampOrder(c, idx)
    });
  });

  (state.cardOps||[]).forEach((op, idx)=>{
    const isInst = (op.type === 'installment');
    const firstM = isInst ? (op.schedules?.[0]?.month || op.feeMonth || op.purchaseMonth) : (op.dueDate ? op.dueDate.slice(0,7) : op.purchaseMonth);
    const lastM = isInst ? (op.schedules?.[op.schedules.length-1]?.month || firstM) : '';
    allRows.push({
      id: op.id,
      isCard: true,
      title: op.title,
      typeLabel: 'بطاقة',
      amountVal: isInst ? (Number(op.installment)||0) : (Number(op.amount)||0),
      currency: String(op.currency||state.cards.find(card=>String(card.id)===String(op.cardId))?.currency||'EGP').toUpperCase(),
      durLabel: isInst ? `${op.months} ش` : 'مرة',
      startLabel: formatYMArabic(firstM),
      endLabel: isInst ? formatYMArabic(lastM) : '—',
      order: getItemTimestampOrder(op, 50000 + idx)
    });
  });

  allRows.sort((a,b) => (b.order||0) - (a.order||0));

  if(!allRows.length){
    wrap.innerHTML = '<div class="empty">لا توجد مستحقات أو التزامات مسجلة بعد.</div>';
    return;
  }

  wrap.innerHTML = allRows.map(r=>{
    const editCall = r.isCard ? `openEditCardOpModal('${escJs(r.id)}')` : `openEditCommitmentModal('${escJs(r.id)}')`;
    const delCall = r.isCard ? `deleteCardOp('${escJs(r.id)}')` : `deleteCommitment('${escJs(r.id)}')`;
    const detCall = `openCommitmentDetailsModal('${escJs(r.title)}','${escJs(r.typeLabel)}','${maskable(fmtNum(r.amountVal))} ${escJs(r.currency||'EGP')}','${escJs(r.durLabel)}','${escJs(r.startLabel)}','${escJs(r.endLabel)}')`;
    return `
      <div class="listitem" onclick="toggleItemActions(this,event)">
        <div class="info">
          <b>${esc(r.title)}</b>
          <small>${esc(r.typeLabel)}</small>
        </div>
        <strong class="orange">${maskable(fmtNum(r.amountVal))} ${esc(r.currency||'EGP')}</strong>
        <div class="tap-actions">
          <button type="button" class="smallbtn" style="border-color:var(--mint);color:var(--mint)" onclick="${detCall}">تفاصيل</button>
          <button type="button" class="smallbtn" style="border-color:var(--blue);color:var(--blue)" onclick="${editCall}">تعديل</button>
          <button type="button" class="smallbtn danger" onclick="${delCall}">حذف</button>
        </div>
      </div>
    `;
  }).join('');
}


/* =========================================================
   #7. MANUAL YEARLY FINANCIAL REPORT + COLLAPSIBLE LIST OF ADDED ITEMS ("تعديل البنود المضافة")
   ========================================================= */
function setAnnualPlanItemType(t){
  setv('annItemType', t);
  document.getElementById('annTypeIncBtn')?.classList.toggle('active', t==='income');
  document.getElementById('annTypeExpBtn')?.classList.toggle('active', t==='expense');
}

function recalcAnnualPlanItemEnd(){
  const startYM = val('annStartVal') || (String(forecastYear) + '-01');
  const dur = Math.max(1, Math.round(num('annItemDuration') || 12));
  const endYM = addMonthsYM(startYM, dur - 1);
  setv('annEndVal', endYM);
  setv('annEndAutoLabel', formatYMArabic(endYM));
}

function saveAnnualPlanItem(){
  const type = val('annItemType') || 'income';
  const title = val('annItemTitle').trim();
  const amount = num('annItemAmount');
  const dur = Math.max(1, Math.round(num('annItemDuration') || 12));
  const startYM = val('annStartVal') || (String(forecastYear) + '-01');
  const endYM = addMonthsYM(startYM, dur - 1);
  if(!title || amount <= 0) return toast('أدخل اسم البند والمبلغ الشهري');

  state.annualPlanItems = state.annualPlanItems || [];
  state.annualPlanItems.push({
    id: uid('ann'),
    type,
    title,
    amount: round2(amount),
    durationMonths: dur,
    start: startYM,
    end: endYM
  });
  setv('annItemTitle', '');
  setv('annItemAmount', '');
  document.getElementById('addManualAnnualFold')?.removeAttribute('open');
  persist();
  toast('تمت إضافة البند للتقرير السنوي ✓');
}

function openEditAnnualPlanItem(id){
  const item = (state.annualPlanItems||[]).find(x=>x.id===id);
  if(!item) return;
  const formHtml = `
    <div class="c-list">
      <div class="c-row"><label>نوع البند</label>
        <select id="edAnnType">
          <option value="income" ${item.type==='income'?'selected':''}>بند دخل</option>
          <option value="expense" ${item.type==='expense'?'selected':''}>بند صرف / التزام</option>
        </select>
      </div>
      <div class="c-row"><label>اسم البند</label><input id="edAnnTitle" value="${esc(item.title)}"></div>
      <div class="c-row"><label>المبلغ الشهري</label><input id="edAnnAmt" type="number" step="0.01" value="${Number(item.amount)||0}"></div>
      <div class="c-row"><label>تاريخ البدء</label><input id="edAnnStart" type="month" value="${esc(item.start)}"></div>
      <div class="c-row"><label>المدة بالأشهر</label><input id="edAnnDur" type="number" min="1" max="120" value="${Number(item.durationMonths)||12}"></div>
    </div>
    <div style="margin-top:10px">
      <button type="button" class="smallbtn danger" style="width:100%;padding:8px" onclick="deleteAnnualPlanItem('${item.id}')">حذف هذا البند من الجدول السنوي</button>
    </div>
  `;
  showAppCustomForm('تعديل بند التقرير السنوي', formHtml, ()=>{
    const t = val('edAnnTitle').trim();
    const a = num('edAnnAmt');
    const st = val('edAnnStart') || item.start;
    const dur = Math.max(1, Math.round(num('edAnnDur')||12));
    if(!t || a <= 0){ toast('أكمل الاسم والمبلغ'); return false; }
    item.type = val('edAnnType') || item.type;
    item.title = t;
    item.amount = round2(a);
    item.start = st;
    item.durationMonths = dur;
    item.end = addMonthsYM(st, dur - 1);
    persist();
    toast('تم تحديث البند ✓');
    return true;
  });
}

function deleteAnnualPlanItem(id){
  state.annualPlanItems = (state.annualPlanItems||[]).filter(x=>x.id!==id);
  closeAppDialog();
  persist();
  toast('تم حذف البند من الجدول السنوي');
}

function renderYearlyExcelReport(){
  const headEl = document.getElementById('yearlyExcelHead');
  const bodyEl = document.getElementById('yearlyBreakdownBody');
  const listContainer = document.getElementById('annualPlanItemsListContainer');
  if(!headEl || !bodyEl) return;

  const curYM = selected();
  const y = String(forecastYear);
  document.getElementById('forecastYearLabel').textContent = y;

  const items = state.annualPlanItems || [];
  // 7.1 Render added items inside the collapsible "تعديل البنود المضافة" fold
  if(listContainer){
    if(!items.length){
      listContainer.innerHTML = '<div class="empty" style="padding:12px">لا توجد بنود مضافة بعد. افتح «إضافة بند للتقرير السنوي» بالأعلى لإضافة بنود الدخل أو المصروفات.</div>';
    } else {
      listContainer.innerHTML = items.map(it=>`
        <div class="listitem" style="padding:9px 4px;cursor:pointer" onclick="openEditAnnualPlanItem('${it.id}')">
          <div class="info">
            <b>${esc(it.title)} <span class="tag" style="color:${it.type==='income'?'var(--blue)':'var(--orange)'}">${it.type==='income'?'دخل':'صرف'}</span></b>
            <small>${formatYMArabic(it.start)} ← ${formatYMArabic(it.end)} (${it.durationMonths||12} شهر)</small>
          </div>
          <strong class="${it.type==='income'?'blue':'orange'}">${maskable(egpSmart(it.amount))} ✎</strong>
        </div>
      `).join('');
    }
  }

  const incItems = items.filter(x=>x.type==='income');
  const expItems = items.filter(x=>x.type==='expense');
  const incCols = [...new Set(incItems.map(x=>x.title))];
  const expCols = [...new Set(expItems.map(x=>x.title))];

  const monthData = [];
  for(let m=1; m<=12; m++){
    const mk = y + '-' + String(m).padStart(2,'0');
    const incByCol = {};
    const expByCol = {};
    let totInc = 0, totExp = 0;

    incCols.forEach(col => {
      const valSum = incItems
        .filter(it => it.title === col && mk >= it.start && mk <= it.end)
        .reduce((s, it) => s + (Number(it.amount)||0), 0);
      incByCol[col] = round2(valSum);
      totInc = round2(totInc + valSum);
    });

    expCols.forEach(col => {
      const valSum = expItems
        .filter(it => it.title === col && mk >= it.start && mk <= it.end)
        .reduce((s, it) => s + (Number(it.amount)||0), 0);
      expByCol[col] = round2(valSum);
      totExp = round2(totExp + valSum);
    });

    const net = round2(totInc - totExp);
    monthData.push({ m, mk, incByCol, expByCol, totInc, totExp, net });
  }

  headEl.innerHTML = `
    <tr>
      <th class="sticky-col">الشهر</th>
      ${incCols.map(c=>`<th style="color:var(--blue)">${esc(c)}</th>`).join('')}
      ${expCols.map(c=>`<th style="color:var(--orange)">${esc(c)}</th>`).join('')}
      <th style="color:var(--blue);background:var(--surface)">إجمالي الدخل</th>
      <th style="color:var(--red);background:var(--surface)">إجمالي المصروفات</th>
      <th style="color:var(--mint);background:var(--surface)">الصافي</th>
    </tr>
  `;

  const colSums = {
    inc: Object.fromEntries(incCols.map(c=>[c,0])),
    exp: Object.fromEntries(expCols.map(c=>[c,0])),
    totInc: 0, totExp: 0, net: 0
  };

  let rowsHtml = '';
  for(const md of monthData){
    incCols.forEach(c => { colSums.inc[c] = round2(colSums.inc[c] + (md.incByCol[c]||0)); });
    expCols.forEach(c => { colSums.exp[c] = round2(colSums.exp[c] + (md.expByCol[c]||0)); });
    colSums.totInc = round2(colSums.totInc + md.totInc);
    colSums.totExp = round2(colSums.totExp + md.totExp);
    colSums.net = round2(colSums.net + md.net);

    rowsHtml += `
      <tr class="${md.mk===curYM?'cur-row':''}">
        <td class="sticky-col"><b>${monthNamesAr[md.m-1]}</b></td>
        ${incCols.map(c=>`<td>${maskable(fmtInt(md.incByCol[c]||0))}</td>`).join('')}
        ${expCols.map(c=>`<td>${maskable(fmtInt(md.expByCol[c]||0))}</td>`).join('')}
        <td class="blue"><b>${maskable(fmtInt(md.totInc))}</b></td>
        <td class="red"><b>${maskable(fmtInt(md.totExp))}</b></td>
        <td class="${md.net>=0?'mint':'red'}"><b>${maskable((md.net>0?'+':'')+fmtInt(md.net))}</b></td>
      </tr>
    `;
  }

  rowsHtml += `
    <tr class="sum-row">
      <td class="sticky-col"><b>الإجمالي</b></td>
      ${incCols.map(c=>`<td class="blue"><b>${maskable(fmtInt(colSums.inc[c]||0))}</b></td>`).join('')}
      ${expCols.map(c=>`<td class="orange"><b>${maskable(fmtInt(colSums.exp[c]||0))}</b></td>`).join('')}
      <td class="blue"><b>${maskable(fmtInt(colSums.totInc))}</b></td>
      <td class="red"><b>${maskable(fmtInt(colSums.totExp))}</b></td>
      <td class="${colSums.net>=0?'mint':'red'}"><b>${maskable((colSums.net>0?'+':'')+fmtInt(colSums.net))}</b></td>
    </tr>
    <tr class="yr-spacer-row"><td colspan="${incCols.length + expCols.length + 4}"></td></tr>
  `;
  bodyEl.innerHTML = rowsHtml;
}


/* =========================================================
   SALARY CALCULATOR (Inside More / Settings)
   ========================================================= */
