/* =========================================================
   X-Wallet V13.6 — Analytics & Charts Module (analytics.js)
   ========================================================= */

/* =========================================================
   #3. REPORTS PAGE ("تحليل المعاملات")
   - 3.1 Keep Month/Period Filter at Top inside Category Drill-Down (#catDetailModal)
   - 3.2 Clicking a Subcategory in Table 1 Filters the Line Chart & Daily Report below!
   ========================================================= */
let activeReportTab = 'exp';
let reportPeriodMode = 'monthly';
let reportYear = new Date().getFullYear();
let mainRepChartOpen = false;
let catDrillChartOpen = false;

function openNativeInputPicker(id){
  const el = document.getElementById(id);
  if(!el) return;
  try{
    if(typeof el.showPicker === 'function') el.showPicker();
    else el.focus();
  }catch(_){ el.focus(); }
}

function syncRepInlineDateDisplays(){
  const df = val('repCustomFrom') || (selected() + '-01');
  const dt = val('repCustomTo') || today();
  const fDisp = document.getElementById('repFromDisp');
  const tDisp = document.getElementById('repToDisp');
  if(fDisp) fDisp.textContent = formatDateDMY(df);
  if(tDisp) tDisp.textContent = formatDateDMY(dt);
}

function onRepInlineDateChange(){
  syncRepInlineDateDisplays();
  renderReportsScreen();
  if(activeCatDrillState) renderCategoryDrillDownContent();
}

function toggleUnifiedReportChart(){
  if(activeCatDrillState){
    catDrillChartOpen = !catDrillChartOpen;
    document.getElementById('btnToggleMainRepChart')?.classList.toggle('active', catDrillChartOpen);
    renderCategoryDrillDownContent();
  } else {
    mainRepChartOpen = !mainRepChartOpen;
    const pnl = document.getElementById('repChartPanel');
    const btn = document.getElementById('btnToggleMainRepChart');
    if(pnl) pnl.style.display = mainRepChartOpen ? 'flex' : 'none';
    if(btn) btn.classList.toggle('active', mainRepChartOpen);
  }
}
function toggleMainReportChart(){ toggleUnifiedReportChart(); }
function toggleCatDrillChart(){ toggleUnifiedReportChart(); }
const CHART_COLORS = ['#ff6b6b','#ff9f43','#feca57','#1dd1a1','#48dbfb','#54a0ff','#5f27cd','#ff9ff3','#00d2d3','#c8d6e5','#ee5253','#10ac84'];

function switchReportTab(tab){
  activeReportTab = (tab === 'inc') ? 'inc' : 'exp';
  if(activeCatDrillState){
    closeCatDetailModal();
  }
  document.getElementById('repTabInc')?.classList.toggle('active', activeReportTab==='inc');
  document.getElementById('repTabExp')?.classList.toggle('active', activeReportTab==='exp');
  renderReportsScreen();
}

const REP_MODE_CYCLE = [
  { val:'monthly', label:'شهري' },
  { val:'yearly', label:'سنوي' },
  { val:'all', label:'الكل' },
  { val:'custom', label:'فترة محددة' }
];
function cycleReportPeriodMode(){
  const idx = REP_MODE_CYCLE.findIndex(x => x.val === reportPeriodMode);
  const next = REP_MODE_CYCLE[(idx + 1) % REP_MODE_CYCLE.length];
  setv('repPeriodMode', next.val);
  const btn = document.getElementById('repPeriodCycleBtn');
  if(btn) btn.textContent = next.label;
  onReportPeriodModeChange(next.val);
}

function onReportPeriodModeChange(mode){
  reportPeriodMode = mode || 'monthly';
  const stepBox = document.getElementById('repStepperBox');
  const inlineDates = document.getElementById('repInlineDatesBox');
  const isDateBoxes = (reportPeriodMode === 'all' || reportPeriodMode === 'custom');
  if(stepBox) stepBox.style.display = isDateBoxes ? 'none' : 'inline-flex';
  if(inlineDates){
    inlineDates.style.display = isDateBoxes ? 'grid' : 'none';
    if(reportPeriodMode === 'all'){
      const allDates = (state.transactions||[]).map(t=>String(t.date||'').slice(0,10)).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
      setv('repCustomFrom', allDates[0] || (String(activeYear)+'-01-01'));
      setv('repCustomTo', allDates[allDates.length-1] || today());
    } else if(reportPeriodMode === 'custom'){
      if(!val('repCustomFrom')) setv('repCustomFrom', selected() + '-01');
      if(!val('repCustomTo')) setv('repCustomTo', today());
    }
    syncRepInlineDateDisplays();
  }
  renderReportsScreen();
  if(activeCatDrillState) renderCategoryDrillDownContent();
}

function shiftReportPeriod(delta){
  if(reportPeriodMode === 'yearly'){
    reportYear += delta;
    renderReportsScreen();
  } else {
    shiftActiveMonth(delta);
  }
  if(activeCatDrillState) renderCategoryDrillDownContent();
}

function openReportPeriodPicker(){
  if(reportPeriodMode === 'yearly') return;
  openHomePeriodPicker();
}

function getReportFilteredTransactions(isInc){
  const allMatchingType = (state.transactions||[]).filter(t => isInc ? t.type==='income' : isActualExpenseTx(t));
  if(reportPeriodMode === 'monthly'){
    const curYM = selected();
    return {
      periodLabel: formatYMArabic(curYM),
      yearForChart: activeYear,
      list: allMatchingType.filter(t => monthKey(t.date) === curYM)
    };
  }
  if(reportPeriodMode === 'yearly'){
    const yStr = String(reportYear);
    return {
      periodLabel: `سنة ${yStr}`,
      yearForChart: reportYear,
      list: allMatchingType.filter(t => String(t.date||'').startsWith(yStr))
    };
  }
  if(reportPeriodMode === 'custom'){
    const dFrom = val('repCustomFrom') || '0000-01-01';
    const dTo = val('repCustomTo') || '9999-12-31';
    return {
      periodLabel: `${dFrom} ← ${dTo}`,
      yearForChart: Number(dTo.slice(0,4)) || activeYear,
      list: allMatchingType.filter(t => {
        const d = String(t.date||'').slice(0,10);
        return d >= dFrom && d <= dTo;
      })
    };
  }
  const dFromAll = val('repCustomFrom') || '0000-01-01';
  const dToAll = val('repCustomTo') || '9999-12-31';
  return {
    periodLabel: 'كل الفترات',
    yearForChart: activeYear,
    list: allMatchingType.filter(t => {
      const d = String(t.date||'').slice(0,10);
      return (!val('repCustomFrom') || d >= dFromAll) && (!val('repCustomTo') || d <= dToAll);
    })
  };
}

function renderReportsScreen(){
  const isInc = (activeReportTab === 'inc');
  document.getElementById('repTabInc')?.classList.toggle('active', isInc);
  document.getElementById('repTabExp')?.classList.toggle('active', !isInc);
  document.getElementById('repCardTotalInc')?.classList.toggle('active-inc', isInc);
  document.getElementById('repCardTotalExp')?.classList.toggle('active-exp', !isInc);

  const incData = getReportFilteredTransactions(true);
  const expData = getReportFilteredTransactions(false);
  const totIncPeriod = round2(incData.list.reduce((s,t)=>s+(Number(t.amount)||0), 0));
  const totExpPeriod = round2(expData.list.reduce((s,t)=>s+(Number(t.amount)||0), 0));
  const totNetPeriod = round2(totIncPeriod - totExpPeriod);
  const boxInc = document.getElementById('repBoxTotalInc');
  const boxExp = document.getElementById('repBoxTotalExp');
  if(boxInc) boxInc.textContent = maskable(egpSmart(totIncPeriod));
  if(boxExp) boxExp.textContent = maskable(egpSmart(totExpPeriod));

  const sInc = document.getElementById('repStatsInc');
  const sExp = document.getElementById('repStatsExp');
  const sNet = document.getElementById('repStatsNet');
  if(sInc) sInc.textContent = maskable(fmtNum(totIncPeriod));
  if(sExp) sExp.textContent = maskable(fmtNum(totExpPeriod));
  if(sNet){
    sNet.textContent = maskable(fmtNum(totNetPeriod));
    sNet.className = totNetPeriod >= 0 ? 'mint' : 'red';
  }

  const { periodLabel, list } = isInc ? incData : expData;
  const repLblEl = document.getElementById('repPeriodLabel');
  if(repLblEl) repLblEl.textContent = (reportPeriodMode === 'yearly') ? String(reportYear) : formatYMArabic(selected());

  const byMain = {};
  let grandTotal = 0;
  for(const t of list){
    const amt = Number(t.amount)||0;
    if(amt <= 0) continue;
    const cat = String(t.category||'أخرى').trim() || 'أخرى';
    byMain[cat] = round2((byMain[cat]||0) + amt);
    grandTotal = round2(grandTotal + amt);
  }

  const entries = Object.entries(byMain).sort((a,b)=>b[1]-a[1]);
  const donutWrap = document.getElementById('repDonutWrap');
  const chipsWrap = document.getElementById('repLegendChips');
  const listEl = document.getElementById('repCatBreakdownList');

  if(!entries.length || grandTotal <= 0){
    donutWrap.innerHTML = '<div class="empty">لا توجد بيانات</div>';
    chipsWrap.innerHTML = '';
    listEl.innerHTML = `<div class="empty">لا توجد ${isInc?'إيرادات':'مصروفات'} مسجلة في (${esc(periodLabel)}).</div>`;
    return;
  }

  let accPct = 0;
  const stops = [];
  entries.forEach(([cat, amt], idx)=>{
    const color = CHART_COLORS[idx % CHART_COLORS.length];
    const pct = (amt / grandTotal) * 100;
    stops.push(`${color} ${accPct.toFixed(2)}% ${(accPct + pct).toFixed(2)}%`);
    accPct += pct;
  });
  donutWrap.innerHTML = `
    <div style="width:162px;height:162px;border-radius:50%;background:conic-gradient(${stops.join(',')});display:grid;place-items:center;box-shadow:0 6px 20px #0004">
      <div style="width:96px;height:96px;border-radius:50%;background:var(--panel);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:4px">
        <small style="font-size:.6rem;color:var(--muted)">${isInc?'الدخل':'المصروفات'}</small>
        <b style="font-size:.76rem;direction:ltr">${maskable(fmtInt(grandTotal))}</b>
      </div>
    </div>
  `;

  const repTypeStr = isInc ? 'income' : 'expense';
  chipsWrap.innerHTML = entries.slice(0, 6).map(([cat, amt], idx)=>{
    const color = CHART_COLORS[idx % CHART_COLORS.length];
    const pct = Math.round((amt / grandTotal) * 100);
    return `<span class="tag" style="display:inline-flex;align-items:center;gap:5px;cursor:pointer" onclick="openCategoryDrillDown(${JSON.stringify(cat).replace(/"/g,'&quot;')}, '${repTypeStr}')"><i style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block"></i>${esc(cat)} ${pct}%</span>`;
  }).join('');

  listEl.innerHTML = entries.map(([cat, amt], idx)=>{
    const color = CHART_COLORS[idx % CHART_COLORS.length];
    const pct = Math.max(1, Math.round((amt / grandTotal) * 100));
    return `
      <div class="listitem" style="cursor:pointer;align-items:center;padding:11px 6px" onclick="openCategoryDrillDown(${JSON.stringify(cat).replace(/"/g,'&quot;')}, '${repTypeStr}')" title="اضغط لتحليل تفاصيل البند">
        <span style="background:${color};color:#08121e;font-weight:400;font-size:.72rem;padding:3px 8px;border-radius:8px;min-width:44px;text-align:center">${pct}%</span>
        <div class="info" style="padding:0 6px">
          <b>${esc(cat)}</b>
        </div>
        <strong style="direction:ltr;font-size:.86rem">${maskable(egp(amt))} ›</strong>
      </div>
    `;
  }).join('');
}

function buildSvgLineChartWithYAxis(monthTotals, isInc){
  const maxVal = Math.max(...monthTotals, 100);
  const niceMax = Math.ceil(maxVal / 100) * 100;
  const w = 360, h = 165;
  const padL = 48, padR = 14, padT = 16, padB = 26;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const strokeColor = isInc ? '#73a7ff' : '#43d6b2';

  const ticks = [0, Math.round(niceMax * 0.33), Math.round(niceMax * 0.66), niceMax];
  const gridHtml = ticks.map(tv => {
    const y = padT + plotH - ((tv / niceMax) * plotH);
    return `
      <line x1="${padL}" y1="${y.toFixed(1)}" x2="${w - padR}" y2="${y.toFixed(1)}" stroke="var(--line)" stroke-dasharray="3,3" stroke-width="1"/>
      <text x="${padL - 6}" y="${(y + 3).toFixed(1)}" fill="var(--muted)" font-size="9" text-anchor="end">${fmtInt(tv)}</text>
    `;
  }).join('');

  const axesHtml = `
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="var(--line2)" stroke-width="1.5"/>
    <line x1="${padL}" y1="${padT + plotH}" x2="${w - padR}" y2="${padT + plotH}" stroke="var(--line2)" stroke-width="1.5"/>
  `;

  const pts = monthTotals.map((val, idx)=>{
    const x = padL + (idx * (plotW / 11));
    const y = padT + plotH - ((val / niceMax) * plotH);
    return { x, y, val, m: idx + 1 };
  });

  const polyPoints = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPoints = `${pts[0].x.toFixed(1)},${(padT+plotH).toFixed(1)} ${polyPoints} ${pts[11].x.toFixed(1)},${(padT+plotH).toFixed(1)}`;

  const dotsAndLabelsHtml = pts.map(p => `
    <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.4" fill="${strokeColor}" stroke="var(--panel)" stroke-width="1.5"/>
    ${p.val > 0 ? `<text x="${p.x.toFixed(1)}" y="${Math.max(10, p.y - 6).toFixed(1)}" fill="var(--text)" font-size="8.5" text-anchor="middle">${fmtInt(p.val)}</text>` : ''}
    <text x="${p.x.toFixed(1)}" y="${h - 7}" fill="var(--muted)" font-size="9" text-anchor="middle">${p.m}</text>
  `).join('');

  return `
    <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block;overflow:visible">
      <defs>
        <linearGradient id="lineAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.32"/>
          <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
      ${gridHtml}
      ${axesHtml}
      <polygon points="${areaPoints}" fill="url(#lineAreaGrad)"/>
      <polyline fill="none" stroke="${strokeColor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" points="${polyPoints}"/>
      ${dotsAndLabelsHtml}
    </svg>
  `;
}

function openCategoryDrillDown(catName, txType){
  activeCatDrillState = { catName, txType, subFilter: '' };
  catDrillChartOpen = false;
  document.getElementById('repModeSelectWrap').style.display = 'none';
  document.getElementById('repSelectedCatBtn').style.display = 'flex';
  document.getElementById('repMainContentWrap').style.display = 'none';
  document.getElementById('catDetailInlineWrap').style.display = 'block';
  document.getElementById('btnToggleMainRepChart')?.classList.toggle('active', false);
  renderCategoryDrillDownContent();
}

function selectSubcategoryInDrillDown(subName){
  if(!activeCatDrillState) return;
  activeCatDrillState.subFilter = (activeCatDrillState.subFilter === subName) ? '' : subName;
  renderCategoryDrillDownContent();
}

function shiftCatDrillPeriod(delta){
  shiftReportPeriod(delta);
}

function openCatDrillPeriodPicker(){
  openReportPeriodPicker();
}

function renderCategoryDrillDownContent(){
  if(!activeCatDrillState) return;
  const { catName, txType, subFilter } = activeCatDrillState;
  const isInc = (txType === 'income');
  const incData = getReportFilteredTransactions(true);
  const expData = getReportFilteredTransactions(false);
  const { periodLabel, yearForChart, list } = isInc ? incData : expData;

  document.getElementById('catDetailTitle').textContent = subFilter ? `${catName} / ${subFilter}` : catName;
  document.getElementById('btnToggleMainRepChart')?.classList.toggle('active', catDrillChartOpen);

  const allMainCatTxs = list
    .filter(t => (String(t.category||'أخرى').trim() || 'أخرى') === catName)
    .map((x, idx)=>({...x, _kind:'tx', _order: getItemTimestampOrder(x, idx)}))
    .sort((a,b)=>{
      const dc = String(b.date||'').localeCompare(String(a.date||''));
      if(dc !== 0) return dc;
      return (b._order||0) - (a._order||0);
    });
  const totalCatAmt = round2(allMainCatTxs.reduce((s,t)=>s+(Number(t.amount)||0), 0));

  // 1) Subcategory Breakdown Table (Clickable rows to filter Chart & Daily Report! 3.2)
  const bySub = {};
  for(const t of allMainCatTxs){
    const sub = String(t.subCategory||'').trim() || catName;
    bySub[sub] = round2((bySub[sub]||0) + (Number(t.amount)||0));
  }
  const subEntries = Object.entries(bySub).sort((a,b)=>b[1]-a[1]);
  const subRowsHtml = subEntries.map(([sub, amt])=>{
    const pct = totalCatAmt > 0 ? Math.round((amt / totalCatAmt) * 100) : 0;
    const isSel = (subFilter === sub);
    return `
      <tr class="${isSel?'selected-sub':''}" onclick="selectSubcategoryInDrillDown(${JSON.stringify(sub).replace(/"/g,'&quot;')})">
        <td><b>${esc(sub)}</b></td>
        <td>${pct}%</td>
        <td class="num ${isInc?'blue':'red'}"><b>${maskable(fmtNum(amt))}</b></td>
      </tr>
    `;
  }).join('');

  const subTableHtml = `
    <table class="subcat-table">
      <thead>
        <tr>
          <th>الصنف (اضغط للفلترة)</th>
          <th>النسبة</th>
          <th class="num">المبلغ</th>
        </tr>
      </thead>
      <tbody>
        <tr class="total-row ${!subFilter?'selected-sub':''}" onclick="selectSubcategoryInDrillDown('')">
          <td><b>الإجمالي</b></td>
          <td><b>100%</b></td>
          <td class="num"><b>${maskable(fmtNum(totalCatAmt))}</b></td>
        </tr>
        ${subRowsHtml}
      </tbody>
    </table>
  `;

  // 2) Line Chart with Vertical Y-Axis (Filtered by subFilter if a subcategory is selected!)
  const allYearMatching = (state.transactions||[]).filter(t => {
    if(isInc ? t.type!=='income' : !isActualExpenseTx(t)) return false;
    if((String(t.category||'أخرى').trim()||'أخرى') !== catName) return false;
    if(subFilter){
      const tSub = String(t.subCategory||'').trim() || catName;
      if(tSub !== subFilter) return false;
    }
    return String(t.date||'').startsWith(String(yearForChart));
  });
  const monthTotals = Array(12).fill(0);
  for(const t of allYearMatching){
    const mn = Number(String(t.date||'').slice(5,7));
    if(mn >= 1 && mn <= 12) monthTotals[mn-1] = round2(monthTotals[mn-1] + (Number(t.amount)||0));
  }
  const lineChartHtml = buildSvgLineChartWithYAxis(monthTotals, isInc);

  // 3) Daily Transactions Report (Filtered by subFilter if a subcategory is selected!)
  const displayedTxs = subFilter
    ? allMainCatTxs.filter(t => (String(t.subCategory||'').trim() || catName) === subFilter)
    : allMainCatTxs;
  const dailyFeedHtml = buildDailyGroupedFeedHtml(displayedTxs, 'لا توجد معاملات مسجلة لهذا البند في هذه الفترة.');

  document.getElementById('catDetailBody').innerHTML = `
    <div class="panel" style="padding:0;overflow:hidden;margin-bottom:4px">${subTableHtml}</div>
    <div class="panel" id="catDrillChartPanel" style="display:${catDrillChartOpen?'block':'none'};padding:12px 10px;margin-top:8px;margin-bottom:4px">${lineChartHtml}</div>
    <div class="green-line-divider"><span>التقرير التفصيلي</span></div>
    <div>${dailyFeedHtml}</div>
  `;
}

function closeCatDetailModal(){
  document.getElementById('catDetailModal')?.classList.remove('show');
  activeCatDrillState = null;
  const modeWrap = document.getElementById('repModeSelectWrap');
  const catBtn = document.getElementById('repSelectedCatBtn');
  const mainWrap = document.getElementById('repMainContentWrap');
  const drillWrap = document.getElementById('catDetailInlineWrap');
  if(modeWrap) modeWrap.style.display = 'block';
  if(catBtn) catBtn.style.display = 'none';
  if(mainWrap) mainWrap.style.display = 'block';
  if(drillWrap) drillWrap.style.display = 'none';
  document.getElementById('btnToggleMainRepChart')?.classList.toggle('active', mainRepChartOpen);
}


