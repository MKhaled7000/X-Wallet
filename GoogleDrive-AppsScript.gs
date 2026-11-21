// Set XW_SHARED_SECRET in Project Settings > Script Properties, then deploy a NEW version.
function authorized_(secret) {
  var expected = PropertiesService.getScriptProperties().getProperty('XW_SHARED_SECRET');
  return !!expected && expected.length >= 32 && typeof secret === 'string' && secret === expected;
}
function deny_() { return ContentService.createTextOutput('Unauthorized'); }
function doPost(e) {
  var request;
  try { request = JSON.parse(e.postData.contents); } catch (_) { return deny_(); }
  if (!request || typeof request !== 'object' || !authorized_(request.secret)) return deny_();
  var content = request.backup;
  var document;
  try { document = JSON.parse(content); } catch (_) { return ContentService.createTextOutput('Invalid backup'); }
  if (!document || document.format !== 'x-wallet-encrypted-backup' || document.schemaVersion !== 1 || typeof document.data !== 'string' || !document.data || !document.salt || !document.iv) return ContentService.createTextOutput('Encrypted backups only');
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var folderName = 'X-Wallet Backups';
    var folders = DriveApp.getFoldersByName(folderName);
    var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd-HHmmss');
    folder.createFile('x-wallet-encrypted-backup-' + stamp + '-' + Utilities.getUuid() + '.json', content, MimeType.PLAIN_TEXT);
    return ContentService.createTextOutput('OK');
  } finally { lock.releaseLock(); }
}
function doGet(e) {
  if (!authorized_(e && e.parameter && e.parameter.secret)) return deny_();
  if (e.parameter.action === 'status') return ContentService.createTextOutput(JSON.stringify({protocol:'x-wallet-secure-drive-v2',authenticated:true})).setMimeType(ContentService.MimeType.JSON);
  var folders = DriveApp.getFoldersByName('X-Wallet Backups');
  if (!folders.hasNext()) return ContentService.createTextOutput('{}');
  var files = folders.next().getFiles();
  var latest = null;
  while (files.hasNext()) {
    var file = files.next();
    if (file.getName().indexOf('x-wallet-encrypted-backup-') !== 0) continue;
    if (!latest || file.getLastUpdated() > latest.getLastUpdated()) latest = file;
  }
  if (!latest) return ContentService.createTextOutput('{}');
  return ContentService.createTextOutput(latest.getBlob().getDataAsString()).setMimeType(ContentService.MimeType.JSON);
}
