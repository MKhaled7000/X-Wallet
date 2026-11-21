/* X-Wallet V14.0 module: migration.js | Extracted from V13.40 app.js */

/* ---- Original app.js lines 2200-2566 ---- */
let mmPending = null;
function mmDefaultType(name, currency, isCardGroup){
  if(isCardGroup) return 'card';
  if(/credit|valu|value|contact|sympl|souhoola|بطاق|فيزا|ماستر/i.test(String(name||''))) return 'card';
  if(/cash|كاش/i.test(String(name||''))) return 'cash';
  if(/vodafone|wallet|wechat|alipay|instapay|محفظ/i.test(String(name||''))) return 'wallet';
  return 'bank';
}
function mmTypeSelect(i, selected){
  const opts=[['cash','كاش'],['bank','بنك / Debit'],['wallet','محفظة إلكترونية'],['prepaid','بطاقة مسبقة'],['card','بطاقة ائتمان'],['skip','استبعاد']];
  return `<select class="mmtype" data-index="${i}" style="width:100%;background:var(--surface);color:var(--text);border:1px solid var(--line2);border-radius:9px;padding:6px;margin-top:4px">${opts.map(([v,l])=>`<option value="${v}" ${selected===v?'selected':''}>${l}</option>`).join('')}</select>`;
}
function resolveMmbakCard(asset, name, outstandingEgp, existingCards, newCards, sourceFingerprint=''){
  const sourceId = String(asset && asset[0] != null ? asset[0] : '').trim();
  const fingerprint = String(sourceFingerprint || '');
  const matchesSource = x => x.importSource === 'mmbak' && String(x.importSourceId) === sourceId && (!fingerprint || String(x.importSourceFingerprint || '') === fingerprint);
  const imported = existingCards.find(matchesSource) || newCards.find(matchesSource);
  if(imported) return { card: imported, isNew: false };
  const byName = existingCards.find(x => String(x.name || '').trim().toLowerCase() === name.toLowerCase());
  if(byName) return { card: byName, isNew: false };
  const card = {
    id: 'mm-card-' + (fingerprint ? fingerprint.slice(0, 8) + '-' : '') + sourceId,
    name,
    currency: 'EGP',
    payDay: Number(asset?.[5]) || 3,
    limit: Math.max(round2(Math.abs(Number(outstandingEgp) || 0)), Number(asset?.[6]) || 0),
    balance: round2(Math.abs(Number(outstandingEgp) || 0)),
    terms: {},
    importSource: 'mmbak',
    importSourceId: sourceId,
    importSourceFingerprint: fingerprint
  };
  newCards.push(card);
  return { card, isNew: true };
}

function detectCurrencyCodeAndRate(rawCurUid, currencyMap){
  const key = String(rawCurUid||'').trim();
  if(!key) return { code:'EGP', rate:1, supported:true };
  if(currencyMap[key]) return currencyMap[key];
  const up = key.toUpperCase();
  if(up.includes('EGP')) return { code:'EGP', rate:1, supported:true };
  if(up.includes('USD')) return currencyMap['__ISO_USD__'] || { code:'USD', rate:0, supported:false };
  if(up.includes('CNY') || up.includes('RMB')) return currencyMap['__ISO_CNY__'] || { code:'CNY', rate:0, supported:false };
  return { code:up, rate:1, supported:false };
}

function resolveMmbakTransactionCurrency(rawTransactionCurrency, currencyMap, assetCurrencyInfo){
  const raw=String(rawTransactionCurrency??'').trim();
  const asset=assetCurrencyInfo&&typeof assetCurrencyInfo==='object'?assetCurrencyInfo:{code:'EGP',rate:1,supported:true};
  if(!raw) return asset;
  const transaction=detectCurrencyCodeAndRate(raw,currencyMap||{});
  if(transaction.supported) return transaction;
  // Reuse the asset's verified rate only when the explicitly named transaction
  // currency is the same currency. Never reinterpret an unsupported foreign
  // transaction as EGP merely because its account is denominated in EGP.
  if(String(transaction.code||'').toUpperCase()===String(asset.code||'').toUpperCase()&&asset.supported) return asset;
  return transaction;
}



function resolveMmbakAccount(asset, name, type, openingEgp, existingAccounts, newAccounts, sourceFingerprint=''){
  const sourceId = String(asset && asset[0] != null ? asset[0] : '').trim();
  if(!sourceId) throw new Error('معرّف حساب Money Manager غير موجود');

  const fingerprint=String(sourceFingerprint||'');
  const matchesSource=x=>x.importSource==='mmbak'&&String(x.importSourceId)===sourceId&&(!fingerprint||String(x.importSourceFingerprint||'')===fingerprint);
  const imported = existingAccounts.find(matchesSource) || newAccounts.find(matchesSource);
  if(imported) return { account: imported, isNew: false };

  const baseId = 'mm-' + (fingerprint ? fingerprint.slice(0,12)+'-' : '') + sourceId;
  const usedIds = new Set([...existingAccounts, ...newAccounts].map(x => String(x.id)));
  let id = baseId, suffix = 2;
  while(usedIds.has(id)){ id = `${baseId}-${suffix++}`; }

  const cleanName = String(name || 'حساب مستورد').trim() || 'حساب مستورد';
  const usedNames = new Set([...existingAccounts, ...newAccounts].map(x => String(x.name || '').trim().toLowerCase()));
  let displayName = cleanName;
  if(usedNames.has(displayName.toLowerCase())){
    displayName = cleanName;
    let nameSuffix = 2;
    while(usedNames.has(displayName.toLowerCase())) displayName = `${cleanName} ${nameSuffix++}`;
  }

  const account = {
    id, name: displayName, type, opening: openingEgp, currency: 'EGP',
    importSource: 'mmbak', importSourceId: sourceId,
    ...(fingerprint?{importSourceFingerprint:fingerprint}:{})
  };
  newAccounts.push(account);
  return { account, isNew: true };
}

async function mmbakSourceFingerprint(arrayBuffer){
  if(!window.crypto?.subtle) throw new Error('التشفير الآمن غير متاح لحساب بصمة ملف Money Manager');
  const digest=await window.crypto.subtle.digest('SHA-256',new Uint8Array(arrayBuffer));
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function readMmbak(ev){
  let file = ev.target.files && ev.target.files[0]; if(!file) return;
  const dtBox = document.getElementById('mmDateRangeBox'); if(dtBox) dtBox.style.display = 'flex';
  let out = document.getElementById('mmbakPreview'); out.textContent = 'جارٍ قراءة النسخة والعملات والأقسام…';
  if(!window.initSqlJs){ out.textContent = 'مكتبة قراءة النسخة غير متاحة. تحقق من اتصال الإنترنت ثم أعد تحميل التطبيق.'; return; }
  if(!Number.isFinite(Number(file.size))||file.size<16||file.size>150*1024*1024){out.textContent='حجم ملف Money Manager غير صالح أو أكبر من 150 ميجابايت.';return;}
  let reader = new FileReader();
  reader.onload = async e => {
    let db=null;
    try{
      const buffer=e.target.result;
      const header=new TextDecoder().decode(new Uint8Array(buffer,0,16));
      if(header!=='SQLite format 3\u0000') throw new Error('الملف ليس قاعدة SQLite صالحة بصيغة Money Manager');
      const sourceFingerprint=await mmbakSourceFingerprint(buffer);
      let SQL = await initSqlJs({locateFile:f=>'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/'+f});
      db = new SQL.Database(new Uint8Array(buffer));

      let currencyMap = {};
      let fxSummary = [];
      try{
        const tables = (db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values||[]).map(x=>String(x[0]));
        const curTable = tables.find(tn=>/^CURRENCY$/i.test(tn)) || tables.find(tn=>/currency/i.test(tn));
        if(curTable){
          const pragma = db.exec(`PRAGMA table_info("${curTable}")`)[0]?.values || [];
          const cols = pragma.map(x=>String(x[1]));
          const uidCol = cols.find(c=>/^uid$/i.test(c)) || cols.find(c=>/id/i.test(c)) || cols[0];
          const isoCol = cols.find(c=>/^(ISO|CODE|SYMBOL|NAME)$/i.test(c)) || cols.find(c=>/iso|code|name/i.test(c)) || uidCol;
          const nameCol = cols.find(c=>/^NAME$/i.test(c)) || isoCol;
          const rateCol = cols.find(c=>/^RATE$/i.test(c)) || cols.find(c=>/rate|exch/i.test(c));

          const qCur = `SELECT "${uidCol}", "${isoCol}", "${nameCol}", ${rateCol?`"${rateCol}"`:'NULL'} FROM "${curTable}"`;
          const cRows = db.exec(qCur)[0]?.values || [];
          for(const r of cRows){
            const u = String(r[0]??'').trim();
            const iso = String(r[1]??'').trim().toUpperCase();
            const nm = String(r[2]??'').trim().toUpperCase();
            const rawRate = Number(r[3]);
            const rateValid = Number.isFinite(rawRate) && rawRate > 0;
            let rt = rateValid ? rawRate : 0;
            const combinedStr = `${u} ${iso} ${nm}`.toUpperCase();
            let code = (iso && iso.length <= 5 ? iso : (u.split('_')[0] || 'OTHER')).toUpperCase();
            let supported = false;
            if(combinedStr.includes('EGP')){ code = 'EGP'; rt = 1; supported = true; }
            else if(combinedStr.includes('USD')){ code = 'USD'; supported = rateValid; }
            else if(combinedStr.includes('CNY') || combinedStr.includes('RMB') || combinedStr.includes('YUAN')){ code = 'CNY'; supported = rateValid; }
            else if(rateValid){ supported = true; }

            const info = { code, rate: rt, supported };
            if(u) currencyMap[u] = info;
            if(iso) currencyMap[iso] = info;
            if(supported && code !== 'EGP'){
              currencyMap['__ISO_' + code + '__'] = info;
              fxSummary.push(`${code} = ${fmt(rt)} EGP`);
            }
          }
        }
      }catch(err){ console.warn('MM CURRENCY parse:', err); }

      let cardGroupIds = new Set();
      try{
        const tables = (db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values||[]).map(x=>String(x[0]));
        const grpTable = tables.find(tn=>/^ASSETGROUP$/i.test(tn)) || tables.find(tn=>/asset_?group/i.test(tn));
        if(grpTable){
          const gPragma = db.exec(`PRAGMA table_info("${grpTable}")`)[0]?.values || [];
          const gCols = gPragma.map(x=>String(x[1]));
          const gIdCol = gCols.find(c=>/^(uid|ACC_GROUP_UID|ID)$/i.test(c)) || gCols[0];
          const gNameCol = gCols.find(c=>/^(ACC_GROUP_NAME|NAME|GROUP_NAME)$/i.test(c)) || gCols.find(c=>/name/i.test(c));
          const gTypeCol = gCols.find(c=>/^(TYPE|GROUP_TYPE|IS_CARD)$/i.test(c));
          const gRows = db.exec(`SELECT "${gIdCol}", ${gNameCol?`"${gNameCol}"`:"''"}, ${gTypeCol?`"${gTypeCol}"`:'0'} FROM "${grpTable}"`)[0]?.values || [];
          for(const gr of gRows){
            const gid = String(gr[0]??'').trim();
            const gnm = String(gr[1]??'').toLowerCase();
            const gtp = Number(gr[2]);
            if(gid && (gtp === 2 || /card|credit|بطاق/i.test(gnm))) cardGroupIds.add(gid);
          }
        }
      }catch(_){}

      let assets = [];
      try{
        const aCols = (db.exec('PRAGMA table_info("ASSETS")')[0]?.values||[]).map(x=>String(x[1]));
        const balCol = aCols.find(c=>/^(BALANCE|ZMONEY|AMOUNT)$/i.test(c));
        const grpCol = aCols.find(c=>/^(GROUP_UID|ACC_GROUP_UID|GROUP_ID)$/i.test(c));
        const isCardCol = aCols.find(c=>/^(IS_CARD|CARD_FLAG|A_UTYPE)$/i.test(c));
        const payDayCol = aCols.find(c=>/^(CARD_DAY_PAY|PAY_DAY)$/i.test(c));
        const limCol = aCols.find(c=>/^(LIMIT_MONEY|CARD_LIMIT)$/i.test(c));
        const zdataCol = aCols.find(c=>/^ZDATA$/i.test(c));
        const zdata1Col = aCols.find(c=>/^ZDATA1$/i.test(c));
        const delAssetCol = aCols.find(c=>/^(IS_DEL|A_IS_DEL|DELETED)$/i.test(c));
        const ordCol = aCols.find(c=>/^ORDERSEQ$/i.test(c));
        const whereParts = [];
        if(zdataCol) whereParts.push(`CAST(COALESCE("${zdataCol}",'0') AS TEXT)='0'`);
        if(delAssetCol) whereParts.push(`COALESCE("${delAssetCol}",0)=0`);
        const whereSql = whereParts.length ? (' WHERE ' + whereParts.join(' AND ')) : '';
        const ordSql = ordCol ? ` ORDER BY COALESCE("${ordCol}",0) ASC` : '';
        const qA = `SELECT uid,NIC_NAME,currencyUid,${balCol?`IFNULL("${balCol}",0)`:'0'},${grpCol?`"${grpCol}"`:"''"},${isCardCol?`IFNULL("${isCardCol}",0)`:'0'},${payDayCol?`IFNULL("${payDayCol}",3)`:'3'},${limCol?`IFNULL("${limCol}",0)`:'0'},${zdata1Col?`COALESCE("${zdata1Col}",'')`:"''"} FROM ASSETS${whereSql}${ordSql}`;
        const rawAssets = db.exec(qA)[0]?.values || [];
        assets = rawAssets.map(r => {
          const isCardGrp = cardGroupIds.has(String(r[4]??'').trim()) || Number(r[5]) === 1 || Number(r[5]) === 2;
          let parsedLim = Number(r[7]) || 0;
          if(!parsedLim && r[8]){
            const lm = String(r[8]).match(/limit\s*=\s*([\d,]+(?:\.\d+)?)/i);
            if(lm) parsedLim = Number(lm[1].replace(/,/g,'')) || 0;
          }
          return [r[0], String(r[1]||'').trim(), r[2], Number(r[3])||0, isCardGrp, Number(r[6])||3, parsedLim];
        });
      }catch(_){
        assets = (db.exec("SELECT uid,NIC_NAME,currencyUid FROM ASSETS")[0]?.values||[]).map(r=>[r[0],r[1],r[2],0,false,3,0]);
      }

      let catInfoMap = {};
      let expTree = {};
      let incTree = {};
      try{
        const tables = (db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values||[]).map(x=>String(x[0]));
        const catTable = tables.find(tn=>/^ZCATEGORY$/i.test(tn)) || tables.find(tn=>/^(CATEGORY|CTG)$/i.test(tn));
        if(catTable){
          const pragma = db.exec(`PRAGMA table_info("${catTable}")`)[0]?.values || [];
          const cols = pragma.map(x=>String(x[1]));
          const idCol = cols.find(c=>/^ID$/i.test(c)) || cols.find(c=>/id/i.test(c));
          const uidCol = cols.find(c=>/^uid$/i.test(c)) || idCol;
          const nameCol = cols.find(c=>/^NAME$/i.test(c)) || cols.find(c=>/name/i.test(c));
          const typeCol = cols.find(c=>/^TYPE$/i.test(c)) || cols.find(c=>/type/i.test(c));
          const pUidCol = cols.find(c=>/^pUid$/i.test(c)) || cols.find(c=>/p_?uid|parent/i.test(c));
          const delCol = cols.find(c=>/^C_IS_DEL$/i.test(c)) || cols.find(c=>/is_del/i.test(c));
          const statusCol = cols.find(c=>/^STATUS$/i.test(c));
          const ordCol = cols.find(c=>/^ORDERSEQ$/i.test(c)) || cols.find(c=>/order|seq/i.test(c));

          const qSql = `SELECT ${idCol?`"${idCol}"`:'0'}, "${uidCol}", "${nameCol}", ${typeCol?`"${typeCol}"`:'1'}, ${pUidCol?`"${pUidCol}"`:"'0'"}, ${delCol?`COALESCE("${delCol}",0)`:'0'}, ${statusCol?`COALESCE("${statusCol}",0)`:'0'} FROM "${catTable}" ORDER BY ${ordCol?`COALESCE("${ordCol}",0) ASC, `:''}${idCol?`"${idCol}"`:'1'} ASC`;
          const rows = db.exec(qSql)[0]?.values || [];
          const byKey = {};
          const allObjs = [];
          for(const r of rows){
            const rawId = String(r[0]??'').trim();
            const rawUid = String(r[1]??'').trim();
            const nm = String(r[2]??'').trim();
            const tp = Number(r[3]);
            const rawP = String(r[4]??'').trim();
            const pu = (!rawP || rawP === '0' || rawP === '-1' || /^null$/i.test(rawP)) ? '' : rawP;
            const isDel = Number(r[5]) === 1;
            const st = Number(r[6]) || 0;
            if(!nm) continue;
            const obj = {id:rawId, uid:rawUid||rawId, name:nm, type:tp, pUid:pu, isDel, status:st};
            allObjs.push(obj);
            if(rawUid) byKey[rawUid] = obj;
            if(rawId && !byKey[rawId]) byKey[rawId] = obj;
          }
          for(const obj of allObjs){
            let parent = (obj.pUid && obj.pUid !== obj.uid && obj.pUid !== obj.id) ? byKey[obj.pUid] : null;
            if(parent && parent.pUid && parent.pUid !== parent.uid && parent.pUid !== parent.id && byKey[parent.pUid]){
              parent = byKey[parent.pUid];
            }
            const effType = parent ? parent.type : obj.type;
            const info = {
              name: obj.name,
              parentName: parent ? parent.name : '',
              doType: String(effType)
            };
            if(obj.uid) catInfoMap[obj.uid] = info;
            if(obj.id && !catInfoMap[obj.id]) catInfoMap[obj.id] = info;

            if(!obj.isDel){
              const tTree = effType === 0 ? incTree : expTree;
              if(parent){
                if(!parent.isDel){
                  tTree[parent.name] = tTree[parent.name] || [];
                  if(!tTree[parent.name].includes(obj.name)) tTree[parent.name].push(obj.name);
                }
              } else {
                tTree[obj.name] = tTree[obj.name] || [];
              }
            }
          }
        }
      }catch(err){ console.warn('MM ZCATEGORY parse:', err); }

      const ioCols = (db.exec(`PRAGMA table_info("INOUTCOME")`)[0]?.values||[]).map(x=>String(x[1]));
      const subCol = ioCols.find(c=>/^(sub_?ctg|sub_?cat|zsub|subctg)/i.test(c));
      const catNameCol = ioCols.find(c=>/^(ctg_?name|cat_?name|category_?name)/i.test(c));
      const allDescCols = ioCols.filter(c=>/^(Z?DESC(RIPTION)?|Z?MEMO|Z?DETAIL|REMARK|Z?NOTE|SUB_?CONTENT|ZDATA|MEMO_TEXT)$/i.test(c));
      const descExpr = allDescCols.length
        ? allDescCols.map(c => `COALESCE("${c}",'')`).join(" || char(10) || ")
        : "''";
      const tagCol = ioCols.find(c=>/^(U?TAG|TAGS)$/i.test(c));
      const extraSel = [
        subCol ? `"${subCol}"` : "''",
        catNameCol ? `"${catNameCol}"` : "''",
        descExpr,
        tagCol ? `"${tagCol}"` : "''"
      ].join(',');

      let tx = db.exec(`SELECT uid,assetUid,toAssetUid,ZDATE,DO_TYPE,ZMONEY,ZCONTENT,ctgUid,currencyUid,WDATE,txUidTrans,${extraSel} FROM INOUTCOME WHERE COALESCE(IS_DEL,0)=0 ORDER BY CASE WHEN DO_TYPE='3' THEN 0 ELSE 1 END`)[0]?.values || [];
      // Compute real balance per active asset from INOUTCOME (including DO_TYPE 0,1,3,4,7,8)
      const assetNetRaw = {};
      try{
        const hasAmtAcc = ioCols.some(c=>/^AMOUNT_ACCOUNT$/i.test(c));
        const hasCdm = ioCols.some(c=>/^CARDDIVIDMONTH$/i.test(c));
        const cardUidSet = new Set(assets.filter(a=>!!a[4]).map(a=>String(a[0])));
        const balRows = db.exec(`SELECT assetUid, DO_TYPE, ZMONEY, ${hasAmtAcc?'AMOUNT_ACCOUNT':'ZMONEY'}, ${hasCdm?"COALESCE(CARDDIVIDMONTH,'')":"''"} FROM INOUTCOME WHERE COALESCE(IS_DEL,0)=0`)[0]?.values || [];
        for(const br of balRows){
          const aUid = br[0]; if(!aUid) continue;
          if(cardUidSet.has(String(aUid)) && String(br[4]||'') === '10001') continue;
          const k = String(br[1]);
          const rawV = Number(br[3] !== null && br[3] !== '' ? br[3] : br[2]) || 0;
          if(k === '0') assetNetRaw[aUid] = (assetNetRaw[aUid]||0) + rawV;
          else if(k === '4' || k === '7') assetNetRaw[aUid] = (assetNetRaw[aUid]||0) + Math.abs(rawV);
          else if(k === '1' || k === '3' || k === '8') assetNetRaw[aUid] = (assetNetRaw[aUid]||0) - Math.abs(rawV);
        }
      }catch(_){}
      assets = assets.map(a => {
        const computedBal = round2((Number(a[3])||0) + (assetNetRaw[a[0]]||0));
        return [a[0], a[1], a[2], computedBal, a[4], a[5], a[6]];
      });
      mmPending = {assets, tx, catInfoMap, expTree, incTree, currencyMap,sourceFingerprint,fileName:String(file.name||'Money Manager backup').slice(0,160)};

      const totalCats = Object.keys(expTree).length + Object.keys(incTree).length;
      const totalSubs = Object.values(expTree).reduce((s,a)=>s+a.length,0) + Object.values(incTree).reduce((s,a)=>s+a.length,0);
      const fxNote = fxSummary.length ? `<div class="hint" style="color:var(--blue)">أسعار الصرف المسجلة: <b>${esc(fxSummary.join(' | '))}</b></div>` : '';
      const accListHtml = assets.map((a,i)=>{
          const cInfo = detectCurrencyCodeAndRate(a[2], currencyMap);
          return `<div style="display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)"><input type="checkbox" class="mmasset" value="${i}" ${cInfo.supported?'checked':''}><div><b style="font-size:.78rem">${esc(a[1]||'حساب')}</b><small style="display:block;color:var(--muted);font-size:.66rem">${esc(cInfo.code)} · رصيد: ${esc(String(a[3]??0))}</small>${mmTypeSelect(i, cInfo.supported ? mmDefaultType(a[1],a[2],!!a[4]) : 'skip')}</div></div>`;
        }).join('');

      out.innerHTML = `<p class="hint">تم العثور على <b>${assets.length}</b> حساب وبطاقة، <b>${tx.length}</b> حركة، <b>${totalCats}</b> قسم رئيسي، و<b>${totalSubs}</b> قسم فرعي</p>` +
        fxNote +
        `<label style="display:flex;align-items:center;gap:8px;font-size:.75rem;color:var(--mint);margin:8px 0;cursor:pointer;direction:rtl;text-align:right"><input type="checkbox" id="mmReplaceCatsChk"><span>مطابقة واستبدال الأقسام بأقسام ماني مانجر وتحديث المعاملات</span></label>` +
        `<details class="fold" style="margin:8px 0"><summary><span class="ic-txt"><i>☑</i><span>تحديد الحسابات (${assets.length})</span></span><span class="fold-arrow">▼</span></summary><div class="fold-body" style="padding:4px 10px">${accListHtml}</div></details>` +
        `<button type="button" class="mm-import-outline-btn" onclick="commitMmbakDirect()">استيراد</button>`;
    }catch(err){ out.textContent = 'تعذر قراءة الملف: ' + (err?.message||err); mmPending=null; }
    finally{try{db?.close();}catch(_){}}
  };
  reader.onerror=()=>{out.textContent='تعذرت قراءة ملف Money Manager من الجهاز.';};
  reader.readAsArrayBuffer(file);
}

async function commitMmbakDirect(){
  if(!mmPending) return;
  const currentPending=mmPending;
  let chosen=[...document.querySelectorAll('.mmasset:checked')].map(x=>Number(x.value));
  if(!chosen.length) return toast('اختر حسابًا واحدًا على الأقل');
  chosen=chosen.filter(i=>{
    const a=currentPending.assets[i];if(!a)return false;
    const cInfo=detectCurrencyCodeAndRate(a[2],currentPending.currencyMap||{});
    const selectedType=document.querySelector(`.mmtype[data-index="${i}"]`)?.value||mmDefaultType(a[1],a[2],!!a[4]);
    return cInfo.supported&&selectedType!=='skip';
  });
  if(!chosen.length) return toast('لا توجد حسابات قابلة للاستيراد. راجع العملة وسعر الصرف ونوع الحساب.');
  const from=val('mmFrom')||'0000-01-01',dateTo=val('mmTo')||'9999-12-31';
  if(from>dateTo) return toast('فترة الاستيراد غير صالحة: تاريخ البداية بعد تاريخ النهاية');
  const replaceCats=!!document.getElementById('mmReplaceCatsChk')?.checked;
  const fingerprint=String(currentPending.sourceFingerprint||'');
  const importKey=[fingerprint||'unfingerprinted',chosen.map(i=>String(currentPending.assets[i]?.[0]??'')).sort().join(','),from,dateTo,replaceCats?'replace-cats':'merge-cats'].join('|');
  state.importBatches=Array.isArray(state.importBatches)?state.importBatches:[];
  if(state.importBatches.some(x=>x.importKey===importKey)) return toast('تم استيراد هذا الملف بنفس الحسابات والفترة والإعدادات من قبل؛ لم تتم إضافة بيانات مكررة');
  let previousState;
  try{
    if(typeof flushLiveDatabaseWrites==='function') await flushLiveDatabaseWrites();
    previousState=JSON.parse(JSON.stringify(state));
    if(typeof createPreRestoreSnapshot==='function') await createPreRestoreSnapshot('قبل الاستيراد من Money Manager');
    const rollbackSnapshots=Array.isArray(_autoSnapshotsMemory)?JSON.parse(JSON.stringify(_autoSnapshotsMemory)):[];
    state=JSON.parse(JSON.stringify(previousState));
    state.importBatches=Array.isArray(state.importBatches)?state.importBatches:[];

    if(replaceCats&&(Object.keys(currentPending.expTree||{}).length||Object.keys(currentPending.incTree||{}).length)){
      state.categoryTree={expense:JSON.parse(JSON.stringify(currentPending.expTree||{})),income:JSON.parse(JSON.stringify(currentPending.incTree||{}))};
      state.categories=Object.keys(state.categoryTree.expense);
      state.incomeCategories=Object.keys(state.categoryTree.income);
    }else{
      syncCategoryTrees();
      for(const [main,subs] of Object.entries(currentPending.expTree||{})){
        state.categoryTree.expense[main]=[...new Set([...(state.categoryTree.expense[main]||[]),...subs])];
        if(!state.categories.includes(main))state.categories.push(main);
      }
      for(const [main,subs] of Object.entries(currentPending.incTree||{})){
        state.categoryTree.income[main]=[...new Set([...(state.categoryTree.income[main]||[]),...subs])];
        if(!state.incomeCategories.includes(main))state.incomeCategories.push(main);
      }
    }

    const map=new Map(),cardMap=new Map(),assetCurMap=new Map(),newAccounts=[],newCards=[];
    for(const i of chosen){
      const a=currentPending.assets[i],name=String(a[1]||'حساب').trim(),currency=String(a[2]||'EGP_EGP');
      const cInfo=detectCurrencyCodeAndRate(currency,currentPending.currencyMap||{});if(!cInfo.supported)continue;
      const type=document.querySelector(`.mmtype[data-index="${i}"]`)?.value||mmDefaultType(name,currency,!!a[4]);if(type==='skip')continue;
      const openingEgp=round2((Number(a[3])||0)*cInfo.rate);
      if(type==='card'){
        const resolvedC=resolveMmbakCard(a,name,openingEgp,state.cards,newCards,fingerprint);
        cardMap.set(a[0],resolvedC.card);
        assetCurMap.set(a[0],cInfo);
      } else {
        const resolved=resolveMmbakAccount(a,name,type,openingEgp,state.accounts,newAccounts,fingerprint);
        map.set(a[0],resolved.account.id);assetCurMap.set(a[0],cInfo);
      }
    }
    const txs=[],seenTransferKeys=new Set();
    const existingTxById=new Map(state.transactions.map(x=>[String(x.id),x]));
    const seen=new Set([...state.transactions,...state.ledger].map(x=>String(x.id)));
    let fxConvertedCount=0,duplicateCount=0,unsupportedCount=0;
    for(const r of currentPending.tx){
      const [uid,asset,to,date,kind,money,content,cat,currency,wdate,txUidTrans,subCtgRaw,catNameRaw,descRaw,tagRaw]=r;
      const isFromCard=cardMap.has(asset);const isToCard=cardMap.has(to);if(!map.has(asset)&&!isFromCard)continue;
      const rawMoney=Math.abs(Number(money)||0);if(!rawMoney)continue;
      const assetCurInfo=assetCurMap.get(asset)||{code:'EGP',rate:1,supported:true};
      const effCur=resolveMmbakTransactionCurrency(currency,currentPending.currencyMap||{},assetCurInfo);
      if(!effCur.supported){unsupportedCount++;continue;}
      const n=round2(rawMoney*effCur.rate);
      if(effCur.code!=='EGP')fxConvertedCount++;
      let ds=String(wdate||'').slice(0,10);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(ds)){
        const raw=Number(date);ds=Number.isFinite(raw)&&raw>100000000000?localDateISO(new Date(raw)):String(date).slice(0,10);
      }
      if(!/^\d{4}-\d{2}-\d{2}$/.test(ds)||ds<from||ds>dateTo)continue;
      const t=String(kind)==='1'?'expense':String(kind)==='0'?'income':(String(kind)==='3'||String(kind)==='4')?'transfer':(String(kind)==='7'||String(kind)==='8')?'adjust':null;
      if(!t)continue;
      const transferKey=t==='transfer'?String(txUidTrans||uid):'';
      if(t==='transfer'&&seenTransferKeys.has(transferKey))continue;
      if(t==='transfer')seenTransferKeys.add(transferKey);
      if(t==='transfer'&&!map.has(to)&&!isToCard)continue;
      const rawCatKey=String(cat??'').trim(),rawSubKey=String(subCtgRaw??'').trim(),rawCatName=String(catNameRaw??'').trim();
      const catObj=rawCatKey?currentPending.catInfoMap[rawCatKey]:null;
      const subObj=rawSubKey?currentPending.catInfoMap[rawSubKey]:null;
      const nameObj=rawCatName?currentPending.catInfoMap[rawCatName]:null;
      const cleanMemo=String(content??'').trim(),isMemoUuid=/^[0-9a-f-]{16,}$/i.test(cleanMemo);
      let usableMemo=(cleanMemo&&!isMemoUuid)?cleanMemo:'';
      const cleanDesc=String(descRaw??'').trim(),cleanTag=String(tagRaw??'').trim(),descParts=[];
      if(cleanDesc&&!/^[0-9a-f-]{16,}$/i.test(cleanDesc))descParts.push(cleanDesc);
      if(cleanTag&&!/^[0-9a-f-]{16,}$/i.test(cleanTag))descParts.push('#'+cleanTag);
      if(effCur.code==='USD'||effCur.code==='CNY'){
        const fxTag=`[${fmt(rawMoney)} ${effCur.code}]`;
        usableMemo=usableMemo?`${usableMemo} ${fxTag}`:fxTag;
        descParts.push(`العملة الأصلية: ${fmt(rawMoney)} ${effCur.code}`);
      }
      let mainCat='',subCat='';
      if(subObj){mainCat=subObj.parentName||(catObj?(catObj.parentName||catObj.name):subObj.name);subCat=(subObj.name&&subObj.name!==mainCat)?subObj.name:'';}
      else if(catObj){mainCat=catObj.parentName||catObj.name;subCat=catObj.parentName?catObj.name:'';}
      else if(nameObj){mainCat=nameObj.parentName||nameObj.name;subCat=nameObj.parentName?nameObj.name:'';}
      else if(rawCatName&&!/^\d+$/.test(rawCatName)&&!/^[0-9a-f-]{16,}$/i.test(rawCatName))mainCat=rawCatName;
      else if(rawCatKey&&!/^\d+$/.test(rawCatKey)&&!/^[0-9a-f-]{16,}$/i.test(rawCatKey))mainCat=rawCatKey;
      else mainCat='أخرى';
      const targetTree=t==='income'?state.categoryTree.income:state.categoryTree.expense;
      const targetList=t==='income'?state.incomeCategories:state.categories;
      if((t==='expense'||t==='income')&&mainCat){if(!targetTree[mainCat])targetTree[mainCat]=[];if(!targetList.includes(mainCat))targetList.push(mainCat);if(subCat&&!targetTree[mainCat].includes(subCat))targetTree[mainCat].push(subCat);}
      const sourceUid=t==='transfer'?transferKey:String(uid);
      const id='mm-'+(fingerprint?fingerprint.slice(0,12)+'-':'')+sourceUid;
      if(seen.has(id)){
        duplicateCount++;
        // Re-import never overwrites user edits to an already imported transaction.
        continue;
      }
      seen.add(id);
      if(isFromCard && t==='expense'){
        const cObj = cardMap.get(asset);
        txs.push({id,type:'card_purchase',title:usableMemo||('شراء بالبطاقة - '+mainCat),description:descParts.join('\n'),category:mainCat,subCategory:subCat,amount:n,currency:'EGP',exchangeRateAtCreation:1,date:ds,accountId:null,accountLabel:cObj.name,source:'card-purchase:mm-'+String(uid),importSource:'mmbak',importSourceFingerprint:fingerprint||undefined,importSourceId:String(uid)});
      } else if(t==='transfer' && isToCard && map.has(asset)){
        const cObj = cardMap.get(to);
        txs.push({id,type:'credit_payment',title:usableMemo||('سداد بطاقة ('+cObj.name+')'),description:descParts.join('\n'),category:'سداد بطاقة',subCategory:'',amount:n,currency:'EGP',exchangeRateAtCreation:1,date:ds,accountId:map.get(asset),accountLabel:cObj.name,source:'card-payment',importSource:'mmbak',importSourceFingerprint:fingerprint||undefined,importSourceId:String(uid)});
      } else if(!isFromCard && t==='adjust'){
        const signedDelta = String(kind)==='7' ? n : -n;
        state.ledger.push({id,type:'adjust',from:map.get(asset),delta:signedDelta,amount:n,date:ds,note:usableMemo||'تسوية رصيد',description:descParts.join('\n'),currency:'EGP',importSource:'mmbak',importSourceFingerprint:fingerprint||undefined});
      } else if(!isFromCard){
        txs.push({id,type:t,title:usableMemo,description:descParts.join('\n'),category:mainCat,subCategory:subCat,amount:n,currency:'EGP',exchangeRateAtCreation:1,date:ds,accountId:map.get(asset),toAccountId:t==='transfer'?map.get(to):null,importSource:'mmbak',importSourceFingerprint:fingerprint||undefined,importSourceId:String(uid)});
      }
    }
    const targetBalancesByAccId = new Map();
    for(const a of newAccounts){ targetBalancesByAccId.set(String(a.id), round2(Number(a.opening)||0)); a.opening = 0; }
    state.accounts.push(...newAccounts);
    if(newCards.length){ state.cards = state.cards || []; state.cards.push(...newCards); }
    state.transactions.push(...txs.filter(x=>x.type!=='transfer'));
    state.ledger.push(...txs.filter(x=>x.type==='transfer').map(x=>({id:x.id,type:'transfer',from:x.accountId,to:x.toAccountId,amount:x.amount,fee:0,date:x.date,note:x.title,description:x.description||'',currency:'EGP',importSource:'mmbak',importSourceFingerprint:fingerprint||undefined})));
    // Exact mathematical calibration so accountBalance(a) matches Money Manager to the exact piaster!
    for(const a of newAccounts){
      const targetBal = targetBalancesByAccId.get(String(a.id)) || 0;
      const computedFromHistory = typeof accountBalance === 'function' ? accountBalance(a) : 0;
      a.opening = round2(targetBal - computedFromHistory);
    }
    const batch={id:uid('import-batch'),source:'mmbak',fileName:currentPending.fileName||'Money Manager backup',sourceFingerprint:fingerprint,importKey,importedAt:new Date().toISOString(),accountCount:newAccounts.length,transactionCount:txs.length,duplicateCount,unsupportedCount,dateFrom:from,dateTo,selectedSourceAccountIds:chosen.map(i=>String(currentPending.assets[i][0])),categoriesReplaced:replaceCats};
    state.importBatches.unshift(batch);state.importBatches=state.importBatches.slice(0,100);
    if(typeof auditRecord==='function')auditRecord('استيراد','Money Manager',batch.id,null,{fileName:batch.fileName,accountCount:batch.accountCount,transactionCount:batch.transactionCount,duplicateCount,unsupportedCount,sourceFingerprint:fingerprint});
    if(typeof commitCriticalWalletState==='function') await commitCriticalWalletState(previousState,rollbackSnapshots,'استيراد Money Manager');
    else if(typeof persist==='function') persist();
    mmPending=null;
    if(typeof applyPreferences==='function')applyPreferences();if(typeof renderAll==='function')renderAll();
    const preview=document.getElementById('mmbakPreview');
    if(preview)preview.innerHTML=`<div class="hint" style="color:var(--mint)">✓ تم استيراد <b>${newAccounts.length}</b> حساب و<b>${newCards.length}</b> بطاقة و<b>${txs.length}</b> حركة، وتجاوز <b>${duplicateCount}</b> حركة مكررة، مع <b>${fxConvertedCount}</b> حركة محولة من USD/CNY إلى EGP.</div>`;
    toast('تم الاستيراد وحفظه والتحقق منه محلياً ✓');
  }catch(err){
    if(previousState){if(typeof restoreWalletStateAfterCriticalFailure==='function')restoreWalletStateAfterCriticalFailure(previousState);else state=previousState;}
    try{applyPreferences?.();renderAll?.();}catch(_){}
    toast(err?.message||'فشل استيراد Money Manager؛ تم الحفاظ على البيانات السابقة');
  }
}


/* =========================================================
   #4.1 FULL STATEMENT MODAL FOR ACCOUNTS & CARDS
   (Daily Transactions Style + Month Filter + Income / Expenses / Net Summary Boxes!)
   ========================================================= */
