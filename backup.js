/* X-Wallet V14.2 — Backup format, sanitization and integrity verification */
function getSanitizedStateForBackup(rawState){
  const copy = cleanWalletCopy(rawState || {});
  delete copy.autoSnapshots;
  delete copy.storageRevision; // Per-device persistence ordering is not portable backup data.
  if(copy.prefs){
    delete copy.prefs.secPin;
    delete copy.prefs.secPinHash;
    delete copy.prefs.secPinSalt;
    delete copy.prefs.bioEnabled;
    delete copy.prefs.bioCredentialId;
    delete copy.prefs.driveEmail;
    delete copy.prefs.driveWebhookUrl;
    delete copy.prefs.driveSharedSecret;
    delete copy.prefs.driveAccessToken;
    delete copy.prefs.driveClientId;
    delete copy.prefs.driveFolderId;
    delete copy.prefs.lastDriveBackupAt;
    delete copy.prefs.ghToken;
    delete copy.prefs.ghGistId;
    delete copy.prefs.syncProvider;
    delete copy.prefs.autoDriveFreq;
    delete copy.prefs.lastDriveBackup;
    delete copy.prefs.lastBackupDate;
  }
  return copy;
}

const BACKUP_FORMAT = 'x-wallet-backup';
const BACKUP_SCHEMA_VERSION = 1;
const ENCRYPTED_BACKUP_FORMAT = 'x-wallet-encrypted-backup';
const ENCRYPTED_BACKUP_SCHEMA_VERSION = 1;
const BACKUP_KDF_ITERATIONS = 250000;

function getBackupCrypto(){
  const api = window.crypto;
  if(!api?.subtle || !api?.getRandomValues) throw new Error('WebCrypto غير متاح. افتح التطبيق عبر HTTPS أو localhost.');
  return api;
}

async function backupSha256Hex(text){
  const api = getBackupCrypto();
  const bytes = new TextEncoder().encode(String(text));
  const digest = await api.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function createBackupDocument(rawState){
  const payload=getSanitizedStateForBackup(rawState || state);
  const payloadText = JSON.stringify(payload);
  const checksum = await backupSha256Hex(payloadText);
  return JSON.stringify({
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    checksumAlgorithm: 'SHA-256',
    checksum,
    payload
  });
}

async function parseBackupDocument(rawText){
  let doc;
  if(typeof rawText==='string' && rawText.length>120*1024*1024) throw new Error('حجم ملف النسخة يتجاوز الحد الآمن للاستيراد (120 ميجابايت)');
  try{doc = typeof rawText === 'string' ? JSON.parse(rawText) : rawText;}
  catch(_){throw new Error('محتوى ملف النسخة ليس JSON صالحاً');}
  if(!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('ملف النسخة غير صالح');
  if(doc.format === BACKUP_FORMAT){
    if(doc.schemaVersion !== BACKUP_SCHEMA_VERSION) throw new Error('إصدار تنسيق النسخة غير مدعوم');
    if(!doc.payload || typeof doc.payload !== 'object' || Array.isArray(doc.payload)) throw new Error('بيانات النسخة غير موجودة');
    if(!Array.isArray(doc.payload.transactions)) throw new Error('قائمة المعاملات داخل النسخة غير صالحة');
    if(doc.checksumAlgorithm !== 'SHA-256' || typeof doc.checksum !== 'string') throw new Error('بيانات التحقق من سلامة النسخة غير موجودة');
    const actual = await backupSha256Hex(JSON.stringify(doc.payload));
    if(actual !== doc.checksum) throw new Error('Backup integrity check failed');
    return { state: doc.payload, integrity: 'verified', createdAt: doc.createdAt || null, appVersion: doc.appVersion || null };
  }
  // V13.40 and earlier exports were raw state JSON without a checksum.
  if(!Array.isArray(doc.transactions)) throw new Error('ملف النسخة القديمة غير صالح');
  return { state: doc, integrity: 'legacy-unverified', createdAt: null, appVersion: null };
}

/* Password-encrypted portable backups. This does not encrypt the live local database. */
async function deriveBackupKey(passphrase, salt, iterations){
  const api = getBackupCrypto();
  const password = String(passphrase ?? '');
  if(!password) throw new Error('أدخل كلمة مرور النسخة');
  const material = await api.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return api.subtle.deriveKey(
    { name:'PBKDF2', salt, iterations:iterations || BACKUP_KDF_ITERATIONS, hash:'SHA-256' },
    material,
    { name:'AES-GCM', length:256 },
    false,
    ['encrypt','decrypt']
  );
}

function backupBytesToBase64(value){
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  const chunkSize = 0x1000; // Keep argument count safe on Android Chromium for large backups.
  for(let i=0;i<bytes.length;i+=chunkSize){
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function backupBase64ToBytes(value, fieldName){
  if(typeof value !== 'string' || !value || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)){
    throw new Error(`بيانات ${fieldName} في النسخة المشفرة غير صالحة`);
  }
  try{return Uint8Array.from(atob(value), c=>c.charCodeAt(0));}
  catch(_){throw new Error(`تعذر قراءة بيانات ${fieldName} في النسخة المشفرة`);}
}

function isEncryptedBackupDocument(rawText){
  try{
    const doc = typeof rawText === 'string' ? JSON.parse(rawText) : rawText;
    return !!doc && typeof doc === 'object' && !Array.isArray(doc) && doc.format === ENCRYPTED_BACKUP_FORMAT;
  }catch(_){return false;}
}

async function createEncryptedBackupDocument(rawState, passphrase){
  if(String(passphrase ?? '').length < 10) throw new Error('كلمة مرور النسخة يجب ألا تقل عن 10 أحرف');
  const api = getBackupCrypto();
  const salt = api.getRandomValues(new Uint8Array(16));
  const iv = api.getRandomValues(new Uint8Array(12));
  const key = await deriveBackupKey(passphrase, salt, BACKUP_KDF_ITERATIONS);
  const plainDocument = await createBackupDocument(rawState);
  const cipher = await api.subtle.encrypt({name:'AES-GCM',iv}, key, new TextEncoder().encode(plainDocument));
  return JSON.stringify({
    format: ENCRYPTED_BACKUP_FORMAT,
    schemaVersion: ENCRYPTED_BACKUP_SCHEMA_VERSION,
    kdf: 'PBKDF2-SHA256',
    iterations: BACKUP_KDF_ITERATIONS,
    cipher: 'AES-256-GCM',
    salt: backupBytesToBase64(salt),
    iv: backupBytesToBase64(iv),
    data: backupBytesToBase64(cipher)
  });
}

async function parseEncryptedBackupDocument(rawText, passphrase){
  const doc = typeof rawText === 'string' ? JSON.parse(rawText) : rawText;
  if(!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('ملف النسخة المشفرة غير صالح');
  if(doc.format !== ENCRYPTED_BACKUP_FORMAT) return parseBackupDocument(rawText);
  if(doc.schemaVersion !== ENCRYPTED_BACKUP_SCHEMA_VERSION) throw new Error('إصدار النسخة المشفرة غير مدعوم');
  if(doc.kdf !== 'PBKDF2-SHA256' || doc.iterations !== BACKUP_KDF_ITERATIONS || doc.cipher !== 'AES-256-GCM'){
    throw new Error('خوارزمية تشفير النسخة غير مدعومة أو بياناتها غير صالحة');
  }
  const salt = backupBase64ToBytes(doc.salt, 'salt');
  const iv = backupBase64ToBytes(doc.iv, 'iv');
  const encrypted = backupBase64ToBytes(doc.data, 'ciphertext');
  if(salt.length !== 16 || iv.length !== 12 || encrypted.length < 17) throw new Error('حجم بيانات النسخة المشفرة غير صالح');
  const api = getBackupCrypto();
  const key = await deriveBackupKey(passphrase, salt, doc.iterations);
  let plain;
  try{
    plain = await api.subtle.decrypt({name:'AES-GCM',iv}, key, encrypted);
  }catch(_){
    throw new Error('كلمة المرور غير صحيحة أو النسخة المشفرة تالفة');
  }
  const parsed=await parseBackupDocument(new TextDecoder().decode(plain));
  parsed.integrity='authenticated';
  return parsed;
}
