/* X-Wallet 15.3.6: focused RTL tools. No financial account movement is implied by goal tracking. */
const FINANCIAL_TOOL_LABELS={goals:'الأهداف',budgets:'الميزانيات',recurringRules:'القواعد المتكررة'};
let _financialToolTab='goals';
function financialToolsPanel(){return document.getElementById('financialToolsModal');}
function openFinancialTools(tab='home'){
  ensureManagementState();
  _financialToolTab=Object.hasOwn(FINANCIAL_TOOL_LABELS,tab)?tab:'home';
  financialToolsPanel()?.classList.add('show');renderFinancialTools();
}
function backFinancialTools(){if(_financialToolTab==='home')closeFinancialTools();else openFinancialTools('home');}
function launchFinancialToolWindow(kind){
  const id=kind==='salary'?'salaryModal':'annualReportModal';
  document.getElementById(id)?.classList.add('financial-tool-child');
  if(kind==='salary')openSalaryModal();else openAnnualReportModal();
}
function closeFinancialTools(){financialToolsPanel()?.classList.remove('show');}
function ftAmount(value){return Number(value||0).toLocaleString('ar-EG',{maximumFractionDigits:2})+' ج.م';}
function ftMonth(){return today().slice(0,7);}
function ftBudgetSpent(b){
  return round2((state.transactions||[]).filter(t=>!t.deletedAt&&isActualExpenseTx(t)&&String(t.date||'').slice(0,7)===String(b.month||ftMonth())&&(!b.category||t.category===b.category)).reduce((s,t)=>s+transactionBaseAmount(t),0));
}
function renderFinancialTools(){
  const body=document.getElementById('financialToolsBody');if(!body)return;
  ensureManagementState();
  const kind=_financialToolTab;
  const home=kind==='home';
  const tabs=document.querySelector('#financialToolsModal .ft-tabs');if(tabs)tabs.hidden=home;
  const title=document.getElementById('financialToolsTitle');if(title)title.textContent=home?'أدوات مالية':FINANCIAL_TOOL_LABELS[kind];
  if(home){
    body.innerHTML='<div class="ft-home-list">'+[
      ['🎯','الأهداف','تابع أهداف الادخار',"openFinancialTools('goals')"],
      ['📋','الميزانيات','حدود الإنفاق الشهرية',"openFinancialTools('budgets')"],
      ['🔁','القواعد المتكررة','إدارة الدخل والمصروف المتكرر',"openFinancialTools('recurringRules')"],
      ['💼','حاسبة المرتب','حساب المرتب وتفاصيله',"launchFinancialToolWindow('salary')"],
      ['📊','التقرير السنوي','عرض تقرير السنة',"launchFinancialToolWindow('yearly')"]
    ].map(([icon,label,detail,action])=>'<button type="button" class="more-menu-row" onclick="'+action+'"><span class="more-menu-icon" aria-hidden="true">'+icon+'</span><span><span class="more-menu-name">'+label+'</span><small>'+detail+'</small></span></button>').join('')+'</div>';return;
  }
  document.querySelectorAll('[data-ft-tab]').forEach(btn=>{const on=btn.dataset.ftTab===kind;btn.classList.toggle('active',on);btn.setAttribute('aria-selected',String(on));});
  const notes={goals:'تابع تقدم ادخارك. تسجيل مبلغ لهدف لا يحرك رصيد أي حساب ولا ينشئ معاملة.',budgets:'حدود إنفاق شهرية بالجنيه. المصروف المحسوب يستبعد المشتريات المسجلة على البطاقات وسدادها، مثل إجمالي مصروفات السجل.',recurringRules:'قواعد شهرية للدخل والمصروف فقط. تُنشأ معاملات الشهر المستحقة عند فتح التطبيق، مرة واحدة لكل قاعدة. لا تُنشأ أشهر فائتة تلقائياً.'};
  body.innerHTML=`<p class="hint ft-intro">${notes[kind]}</p><button type="button" class="primary ft-add" onclick="editFinancialTool('${kind}')">＋ إضافة ${kind==='goals'?'هدف':kind==='budgets'?'ميزانية':'قاعدة شهرية'}</button>`+
    (state[kind].length?state[kind].map((item,index)=>{
      let detail='',ratio=null,extra='';
      if(kind==='goals'){
        const saved=Number(item.saved)||0,target=Number(item.target)||0;ratio=target>0?Math.min(100,Math.max(0,saved/target*100)):0;
        detail=`<b class="ft-value">${esc(ftAmount(saved))} <span class="hint">من ${esc(ftAmount(target))}</span></b><small class="hint">${item.deadline?'الموعد: '+esc(item.deadline):'بدون موعد محدد'}</small>`;
        extra=`<button type="button" class="smallbtn" onclick="moveFinancialGoal(${index})">تسجيل ادخار / سحب</button>`;
      }else if(kind==='budgets'){
        const spent=ftBudgetSpent(item),limit=Number(item.limit)||0;ratio=limit>0?Math.min(100,Math.max(0,spent/limit*100)):0;
        detail=`<b class="ft-value ${spent>limit?'red':''}">${esc(ftAmount(spent))} <span class="hint">من ${esc(ftAmount(limit))}</span></b><small class="hint">${esc(item.month||ftMonth())} · ${esc(item.category||'كل الأقسام')}</small>`;
      }else{
        const acc=(state.accounts||[]).find(a=>String(a.id)===String(item.accountId));
        detail=`<b class="ft-value ${item.type==='income'?'blue':'red'}">${esc(ftAmount(item.amount))} · ${item.type==='income'?'دخل':'مصروف'}</b><small class="hint">${item.active?'نشطة':'متوقفة'} · يوم ${esc(item.day||1)} · ${esc(acc?.name||'حساب غير موجود')}</small><small class="hint">${esc(item.startMonth||'من البداية')}${item.endMonth?' إلى '+esc(item.endMonth):''} · ${esc(item.category||'بدون قسم')}</small>`;
        if(item.frequency&&item.frequency!=='monthly')detail+='<small class="red">تكرار قديم غير شهري، متوقف عن التنفيذ. يمكن إيقافه أو حذفه فقط.</small>';
        extra=`<button type="button" class="smallbtn" onclick="toggleFinancialRule(${index})">${item.active?'إيقاف':'تفعيل'}</button>`;
      }
      return `<article class="ft-card"><h3>${esc(item.name||item.title||item.note||FINANCIAL_TOOL_LABELS[kind])}</h3>${detail}${ratio!==null?`<progress max="100" value="${ratio}" aria-label="نسبة التقدم"></progress>`:''}<div class="ft-actions">${extra}<button type="button" class="smallbtn" onclick="editFinancialTool('${kind}',${index})">تعديل</button><button type="button" class="smallbtn red" onclick="deleteFinancialTool('${kind}',${index})">حذف</button></div></article>`;
    }).join(''):'<div class="empty">لا توجد عناصر بعد. ابدأ بالإضافة من الزر أعلاه.</div>');
}
function ftField(id,label,type,value,attrs=''){
  return `<label class="ft-field" for="${id}"><span>${label}</span><input id="${id}" type="${type}" value="${esc(value??'')}" ${attrs}></label>`;
}
function ftInput(id){return String(document.getElementById(id)?.value||'').trim();}
function ftPositive(value,label){const n=Number(value);if(!value||!Number.isFinite(n)||n<=0)throw new Error(label+' يجب أن يكون أكبر من صفر');return round2(n);}
function ftValidMonth(value){return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);}
function ftFindOriginal(kind,index){
  if(!Object.hasOwn(FINANCIAL_TOOL_LABELS,kind))throw new Error('نوع أداة غير صالح');
  return index===undefined?null:state[kind]?.[index];
}
async function ftCommit(kind,original,mutate,label){
  const fingerprint=original?JSON.stringify(original):null;
  const ok=await runCriticalWalletAction(label,()=>{
    const current=original?state[kind].find(x=>x===original&&JSON.stringify(x)===fingerprint):null;
    if(original&&!current)throw new Error('تغيرت البيانات. أغلق النافذة وافتحها من جديد');
    const before=current?JSON.parse(JSON.stringify(current)):null;
    mutate(current);
    if(typeof auditRecord==='function')auditRecord(label,FINANCIAL_TOOL_LABELS[kind],current?.id||kind,before,current?(state[kind].includes(current)?current:null):state[kind].at(-1)||null);
  });
  if(ok){renderFinancialTools();toast('تم الحفظ والتحقق منه ✓');}
  return ok;
}
function editFinancialTool(kind,index){
  if(!Object.hasOwn(FINANCIAL_TOOL_LABELS,kind))return;
  const original=ftFindOriginal(kind,index);if(index!==undefined&&!original)return;
  const item=original||{};
  if(kind==='recurringRules'&&original&&((item.frequency&&item.frequency!=='monthly')||!['income','expense'].includes(item.type))){toast('هذه قاعدة بتكرار غير مدعوم. أوقفها وأنشئ قاعدة شهرية بدلاً منها');return;}
  let html='<div class="ft-form" dir="rtl">';
  html+=ftField('ftName','الاسم','text',item.name||item.title||'', 'maxlength="100"');
  if(kind==='goals'){
    html+=ftField('ftTarget','قيمة الهدف بالجنيه','number',item.target,'min="0.01" step="0.01" inputmode="decimal"');
    if(!original)html+=ftField('ftSaved','المدخر حالياً بالجنيه','number',0,'min="0" step="0.01" inputmode="decimal"');
    html+=ftField('ftDeadline','الموعد المستهدف (اختياري)','date',item.deadline||'');
    html+='<p class="hint">تعديل المدخر لهدف موجود من زر تسجيل ادخار / سحب. الأرقام للتتبع فقط، ولا تغير أرصدة الحسابات.</p>';
  }else if(kind==='budgets'){
    html+=ftField('ftLimit','الحد الشهري بالجنيه','number',item.limit,'min="0.01" step="0.01" inputmode="decimal"');
    html+=ftField('ftMonth','الشهر','month',item.month||ftMonth());
    html+=ftField('ftCategory','القسم كما يظهر في المعاملات (فارغ = الكل)','text',item.category||'', 'maxlength="100" list="ftCategoryOptions"');
  }else{
    html+=`<label class="ft-field"><span>النوع</span><select data-no-custom="1" id="ftType"><option value="expense" ${item.type!=='income'?'selected':''}>مصروف</option><option value="income" ${item.type==='income'?'selected':''}>دخل</option></select></label>`;
    html+=ftField('ftAmount','المبلغ بالجنيه','number',item.amount,'min="0.01" step="0.01" inputmode="decimal"');
    const accounts=(state.accounts||[]).filter(a=>a.type!=='credit'&&!a.deletedAt);
    html+=`<label class="ft-field"><span>الحساب</span><select data-no-custom="1" id="ftAccount"><option value="">اختر حساباً</option>${accounts.map(a=>`<option value="${esc(a.id)}" ${String(a.id)===String(item.accountId)?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label>`;
    html+=ftField('ftCategory','القسم','text',item.category||'','maxlength="100" list="ftCategoryOptions"');
    html+=ftField('ftSubCategory','القسم الفرعي (اختياري)','text',item.subCategory||'','maxlength="100"');
    html+=ftField('ftDay','يوم الشهر (1 إلى 31)','number',item.day||1,'min="1" max="31" step="1" inputmode="numeric"');
    html+=ftField('ftStart','شهر البداية','month',item.startMonth||ftMonth());
    html+=ftField('ftEnd','شهر النهاية (اختياري)','month',item.endMonth||'');
    html+=ftField('ftNote','ملاحظة (اختياري)','text',item.note||'','maxlength="300"');
    html+=`<label class="ft-check"><input id="ftActive" type="checkbox" ${(original?!!item.active:true)?'checked':''}> قاعدة نشطة</label>`;
    html+='<p class="hint">عند قِصر الشهر يُستخدم آخر يوم فيه. إذا كان يوم الاستحقاق قد فات، تُنشأ معاملة هذا الشهر عند الفتح التالي. الإيقاف والحذف لا يمسحان المعاملات السابقة.</p>';
  }
  const categoryNames=[...new Set([...(state.transactions||[]).map(t=>t.category),...(state.categories||[]).map(c=>typeof c==='string'?c:c.name),...(state.incomeCategories||[]).map(c=>typeof c==='string'?c:c.name)].filter(Boolean))];
  html+=`<datalist id="ftCategoryOptions">${categoryNames.map(c=>`<option value="${esc(c)}"></option>`).join('')}</datalist></div>`;
  showAppCustomForm((original?'تعديل ':'إضافة ')+FINANCIAL_TOOL_LABELS[kind],html,()=>{
    try{
      const name=ftInput('ftName');if(!name)throw new Error('أدخل اسم العنصر');
      const patch={name,currency:'EGP'};
      if(kind==='goals'){
        patch.target=ftPositive(ftInput('ftTarget'),'قيمة الهدف');patch.deadline=ftInput('ftDeadline');patch.baseTarget=patch.target;
        if(!original){const saved=ftInput('ftSaved');patch.saved=round2(Number(saved));if(!Number.isFinite(patch.saved)||patch.saved<0)throw new Error('المدخر يجب ألا يقل عن صفر');patch.baseSaved=patch.saved;}
      }else if(kind==='budgets'){
        patch.limit=ftPositive(ftInput('ftLimit'),'حد الميزانية');patch.baseLimit=patch.limit;patch.month=ftInput('ftMonth');patch.category=ftInput('ftCategory');
        if(!ftValidMonth(patch.month))throw new Error('اختر شهراً صالحاً');
      }else{
        patch.type=ftInput('ftType');if(!['income','expense'].includes(patch.type))throw new Error('نوع المعاملة غير مدعوم');
        patch.amount=ftPositive(ftInput('ftAmount'),'المبلغ');patch.baseAmount=patch.amount;patch.exchangeRateAtCreation=1;
        patch.accountId=ftInput('ftAccount');
        if(!(state.accounts||[]).some(a=>String(a.id)===patch.accountId&&a.type!=='credit'&&!a.deletedAt))throw new Error('اختر حساباً موجوداً، وليس بطاقة ائتمان');
        patch.category=ftInput('ftCategory');patch.subCategory=ftInput('ftSubCategory');
        if(!patch.category)throw new Error('أدخل القسم');
        patch.day=Number(ftInput('ftDay'));if(!Number.isInteger(patch.day)||patch.day<1||patch.day>31)throw new Error('يوم الشهر من 1 إلى 31');
        patch.startMonth=ftInput('ftStart');patch.endMonth=ftInput('ftEnd');patch.frequency='monthly';
        if(!ftValidMonth(patch.startMonth)||(patch.endMonth&&(!ftValidMonth(patch.endMonth)||patch.endMonth<patch.startMonth)))throw new Error('راجع شهري البداية والنهاية');
        patch.note=ftInput('ftNote');patch.active=!!document.getElementById('ftActive')?.checked;
      }
      closeAppDialog();
      void ftCommit(kind,original,current=>{
        if(current){Object.assign(current,patch);if(!current.id)current.id=uid(kind);}
        else state[kind].push({...patch,id:uid(kind),createdAt:new Date().toISOString()});
      },'قبل حفظ '+FINANCIAL_TOOL_LABELS[kind]);
      return false;
    }catch(err){toast(err.message);return false;}
  });
}
function deleteFinancialTool(kind,index){
  const original=ftFindOriginal(kind,index);if(!original)return;
  if(kind==='goals'&&(!original.id||state.goals.filter(g=>String(g.id)===String(original.id)).length!==1)){toast('معرّف الهدف مفقود أو مكرر. عدّله لإضافة معرّف مفقود، وراجع المعرف المكرر قبل الحذف');return;}
  const detail=kind==='recurringRules'?'لن تُحذف المعاملات التي أُنشئت بالفعل.':kind==='goals'?'سيُحذف سجل ادخار هذا الهدف أيضاً. لن تتغير الحسابات.':'لن تُحذف أي معاملة.';
  showAppConfirm('حذف '+FINANCIAL_TOOL_LABELS[kind],`حذف ${original.name||original.title||'العنصر'}؟ ${detail} تُحفظ نقطة استعادة محلية أولاً.`,()=>{
    void ftCommit(kind,original,current=>{
      state[kind]=state[kind].filter(x=>x!==current);
      if(kind==='goals')state.goalMovements=state.goalMovements.filter(m=>String(m.goalId)!==String(current.id));
    },'قبل حذف '+FINANCIAL_TOOL_LABELS[kind]);
  },true);
}
function toggleFinancialRule(index){
  const original=state.recurringRules[index];if(!original)return;
  if(!original.active&&original.frequency&&original.frequency!=='monthly'){toast('التفعيل متاح للقواعد الشهرية فقط');return;}
  showAppConfirm(original.active?'إيقاف القاعدة':'تفعيل القاعدة','يتغير تنفيذ القاعدة في الفتح التالي فقط. المعاملات السابقة تبقى كما هي.',()=>{
    void ftCommit('recurringRules',original,current=>{
      if(!current.active&&!(state.accounts||[]).some(a=>String(a.id)===String(current.accountId)&&a.type!=='credit'&&!a.deletedAt))throw new Error('حساب القاعدة غير موجود؛ عدّلها أولاً');
      if(!current.active){
        if(!['income','expense'].includes(current.type)||!Number.isFinite(Number(current.amount))||Number(current.amount)<=0)throw new Error('نوع القاعدة أو مبلغها غير صالح؛ عدّلها أولاً');
        const day=Number(current.day||1);
        if(!Number.isInteger(day)||day<1||day>31||(current.startMonth&&!ftValidMonth(current.startMonth))||(current.endMonth&&(!ftValidMonth(current.endMonth)||(current.startMonth&&current.endMonth<current.startMonth))))throw new Error('راجع يوم القاعدة وشهري البداية والنهاية أولاً');
      }
      current.active=!current.active;
    },'قبل تغيير حالة قاعدة متكررة');
  },false);
}
function moveFinancialGoal(index){
  const original=state.goals[index];if(!original)return;
  if(!original.id||state.goals.filter(g=>String(g.id)===String(original.id)).length!==1){toast('الهدف بلا معرّف فريد؛ راجع بياناته قبل تسجيل حركة');return;}
  const html=`<div class="ft-form" dir="rtl"><p class="hint">تتبع فقط، دون تحويل أموال بين الحسابات. المدخر الحالي: ${esc(ftAmount(original.saved))}</p><label class="ft-field"><span>الحركة</span><select data-no-custom="1" id="ftMoveType"><option value="add">إضافة ادخار</option><option value="withdraw">سحب من الادخار</option></select></label>${ftField('ftMoveAmount','المبلغ بالجنيه','number','','min="0.01" step="0.01" inputmode="decimal"')}${ftField('ftMoveNote','ملاحظة (اختياري)','text','','maxlength="300"')}</div>`;
  showAppCustomForm('تسجيل ادخار / سحب',html,()=>{
    try{
      const amount=ftPositive(ftInput('ftMoveAmount'),'المبلغ'),withdraw=ftInput('ftMoveType')==='withdraw',delta=withdraw?-amount:amount,note=ftInput('ftMoveNote');
      if((Number(original.saved)||0)+delta<0)throw new Error('لا يمكن سحب أكثر من المدخر');
      closeAppDialog();void ftCommit('goals',original,current=>{
        current.saved=round2((Number(current.saved)||0)+delta);current.baseSaved=current.saved;
        state.goalMovements.push({id:uid('goalMove'),goalId:current.id,amount:delta,baseAmount:delta,currency:'EGP',date:today(),note,createdAt:new Date().toISOString()});
      },'قبل تسجيل حركة هدف');return false;
    }catch(err){toast(err.message);return false;}
  });
}
