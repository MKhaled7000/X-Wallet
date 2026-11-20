/* X-Wallet V14.0 module: payroll.js | Extracted from V13.40 app.js */

/* ---- Original app.js lines 4061-4141 ---- */
function initSalary(){
  let y=document.getElementById('salYear'), m=document.getElementById('salMonth'); if(!y||!m) return;
  for(let i=new Date().getFullYear()-3; i<=new Date().getFullYear()+10; i++) y.add(new Option(i,String(i)));
  monthNamesAr.forEach((n,i)=>m.add(new Option(n,String(i+1))));
  y.value = String(activeYear); m.value = String(activeMonth);
  loadSalaryConfig();
}
function loadSalaryConfig(){
  let y=val('salYear'), c=state.salaryConfig[y]||{};
  const cfg={Basic:0,Attendance:0,Years:0,WorkHours:8,WorkDays:30,AllowanceRate:1,RestRate:2,OTRate:1.5,HolidayRate:2,MealPrice:70,InsAdd1:1400,InsAdd2:800,InsuranceBaseRate:10,MedicalRate:6,MartyrsRate:0.05};
  Object.entries(cfg).forEach(([k,v])=>setv('sal'+k, c[k]??v));
  let k=y+'-'+String(Number(val('salMonth')||1)).padStart(2,'0'), d=state.salaryMonths[k]||{};
  setv('salRating',d.Rating??0); setv('salAllowanceHours',d.AllowanceHours??0); setv('salRestHours',d.RestHours??0);
  setv('salOvertime',d.Overtime??0); setv('salHoliday',d.Holiday??0); setv('salDays',d.Days??0); setv('sal12H',d.Hours12??0); setv('salOther',d.Other??0);
  updateMealPreview(); showSalaryResult();
}
function saveSalaryConfig(){
  let y=val('salYear');
  state.salaryConfig[y]={Basic:num('salBasic'),Attendance:num('salAttendance'),Years:num('salYears'),WorkHours:num('salWorkHours')||8,WorkDays:num('salWorkDays')||30,AllowanceRate:num('salAllowanceRate'),RestRate:num('salRestRate'),OTRate:num('salOTRate'),HolidayRate:num('salHolidayRate'),MealPrice:num('salMealPrice'),InsAdd1:num('salInsAdd1'),InsAdd2:num('salInsAdd2'),InsuranceBaseRate:num('salInsuranceBaseRate'),MedicalRate:num('salMedicalRate'),MartyrsRate:num('salMartyrsRate')};
  persist(); toast('تم حفظ إعدادات '+y);
}
function updateMealPreview(){
  let days=num('salDays'), h12=num('sal12H'), aH=num('salAllowanceHours'), wH=num('salWorkHours')||8;
  setv('sal8Days', round2(Math.max(0, days-(aH/wH)-h12)));
}
function calcTaxFromNovember(gross,insurance){
  // Law 7/2024: annual personal exemption EGP 20,000; annual net taxable
  // income is rounded down to the nearest EGP 10 before selecting the table.
  const annualBeforeExemption=Math.max(0,(Number(gross)||0)-(Number(insurance)||0))*12;
  const taxable=Math.floor(Math.max(0,annualBeforeExemption-20000)/10)*10;
  let annual=0;
  if(taxable<=600000){
    if(taxable<=40000) annual=0;
    else if(taxable<=55000) annual=(taxable-40000)*0.10;
    else if(taxable<=70000) annual=1500+(taxable-55000)*0.15;
    else if(taxable<=200000) annual=3750+(taxable-70000)*0.20;
    else if(taxable<=400000) annual=29750+(taxable-200000)*0.225;
    else annual=74750+(taxable-400000)*0.25;
  }else if(taxable<=700000){
    annual=78750+(taxable-400000)*0.25;
  }else if(taxable<=800000){
    annual=81500+(taxable-400000)*0.25;
  }else if(taxable<=900000){
    annual=85000+(taxable-400000)*0.25;
  }else if(taxable<=1200000){
    annual=90000+(taxable-400000)*0.25;
  }else{
    annual=300000+(taxable-1200000)*0.275;
  }
  return round2(annual/12);
}

function calcSalary(d,c){
  const B=+c.Basic||0, hourly=B/(+c.WorkDays||30)/(+c.WorkHours||8);
  const aPay=round2(hourly*(+c.AllowanceRate||0)*(+d.AllowanceHours||0));
  const rPay=round2(hourly*(+c.RestRate||0)*(+d.RestHours||0));
  const oPay=round2(hourly*(+c.OTRate||0)*(+d.Overtime||0));
  const hPay=round2(hourly*(+c.HolidayRate||0)*(+d.Holiday||0));
  const h8=round2(Math.max(0,(+d.Days||0)-((+d.AllowanceHours||0)/(+c.WorkHours||8))-(+d.Hours12||0)));
  const meal=round2(h8*(+c.MealPrice||70)+(+d.Hours12||0)*(+c.MealPrice||70)*2);
  const gross=round2(B+(+d.Rating||0)+aPay+rPay+oPay+hPay+meal+(+c.Attendance||0)+(+c.Years||0)+(+d.Other||0));
  const martyrs=round2(gross*((+c.MartyrsRate||0)/100));
  const insBase=ceilTo((B+(+c.InsAdd1||0)+(+c.InsAdd2||0))/1.3,10);
  const insurance=round2(insBase*((+c.InsuranceBaseRate||0)/100)+(B+(+c.InsAdd1||0)+(+c.InsAdd2||0))*((+c.MedicalRate||0)/100));
  const tax=calcTaxFromNovember(gross,insurance);
  return {gross, martyrs, insurance, tax, net:round2(gross-martyrs-insurance-tax)};
}
function saveSalaryMonth(){
  saveSalaryConfig();
  let y=val('salYear'), key=y+'-'+String(num('salMonth')).padStart(2,'0');
  let d={Rating:num('salRating'),AllowanceHours:num('salAllowanceHours'),RestHours:num('salRestHours'),Overtime:num('salOvertime'),Holiday:num('salHoliday'),Days:num('salDays'),Hours12:num('sal12H'),Other:num('salOther'),PayDay:num('salPayDay')||1};
  let r=calcSalary(d, state.salaryConfig[y]||{});
  state.salaryMonths[key]={...d, result:r};
  const aid = state.prefs?.defaultAccount || state.accounts[0]?.id || null;
  const date = key + '-' + String(d.PayDay).padStart(2,'0');
  let ex = state.transactions.find(t=>t.source==='salary:'+key);
  const currencyFields=transactionCurrencySnapshot(r.net,'EGP',date);
  if(ex){ Object.assign(ex,currencyFields); ex.amount=r.net; ex.date=date; }
  else { state.transactions.push({id:'salary-'+key, type:'income', title:'صافي المرتب', amount:r.net, ...currencyFields, category:'راتب', date, source:'salary:'+key, accountId:aid, createdAt:Date.now()}); }
  persist(); showSalaryResult(); toast('تم حساب وحفظ صافي المرتب ✓');
}
function showSalaryResult(){
  let y=val('salYear'), key=y+'-'+String(Number(val('salMonth')||1)).padStart(2,'0'), d=state.salaryMonths[key], el=document.getElementById('salaryResult');
  if(!el) return;
  if(!d){ el.innerHTML='<div class="empty">أدخل بيانات الشهر واضغط احسب لعرض تفاصيل المرتب.</div>'; return; }
  let r=calcSalary(d, state.salaryConfig[y]||{});
  el.innerHTML=`<div class="rowline"><span>إجمالي المرتب</span><b>${egp(r.gross)}</b></div><div class="rowline"><span>التأمينات</span><b>${egp(r.insurance)}</b></div><div class="rowline"><span>الضرائب</span><b>${egp(r.tax)}</b></div><div class="hero" style="margin-top:10px;min-height:74px"><label>صافي المرتب</label><div class="amount">${egp(r.net)}</div></div>`;
}


/* =========================================================
   SETTINGS CATEGORIES TREE MANAGER
   ========================================================= */

/* ---- Original app.js lines 4854-4872 ---- */
/* Full-Page Modals: Salary, Annual Report, Theme Grid */
function openSalaryModal(){
  document.getElementById('salaryModal')?.classList.add('show');
  loadSalaryConfig();
}
function closeSalaryModal(){
  document.getElementById('salaryModal')?.classList.remove('show');
}
function openAnnualReportModal(){
  document.getElementById('annualReportModal')?.classList.add('show');
  renderYearlyExcelReport();
}
function closeAnnualReportModal(){
  document.getElementById('annualReportModal')?.classList.remove('show');
}
function openThemeGridModal(){
  document.getElementById('themeGridModal')?.classList.add('show');
}

