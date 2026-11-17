/**
 * EFJ - Kết nối cộng đồng: nhận đăng ký từ website và ghi vào Google Sheet.
 *
 * Cài đặt (xem docs/GOOGLE-SHEETS.md):
 * 1. Tạo Google Sheet mới, vào Tiện ích mở rộng → Apps Script, dán toàn bộ file này.
 * 2. Project Settings → Script properties → thêm TOKEN = (chuỗi bí mật, giống SHEETS_WEBHOOK_TOKEN).
 * 3. Deploy → New deployment → Web app; Execute as: Me; Who has access: Anyone.
 * 4. Copy Web app URL vào biến SHEETS_WEBHOOK_URL trên Hostinger.
 */
var SHEET_NAME = 'Đăng ký';
var HEADERS = ['ID', 'Thời gian (giờ Nhật)', 'Mã quán', 'Tên quán', 'Dịch vụ', 'Họ tên', 'Điện thoại', 'Email',
  'Khu vực', 'Ngân sách', 'Công việc hiện tại', 'Công việc mong muốn', 'Tiếng Nhật', 'Khu vực làm việc',
  'Thời điểm', 'Ghi chú của khách', 'Trạng thái', 'Ghi chú nội bộ', 'Cập nhật lần cuối'];
var SERVICE = { buy: 'Mua nhà', sell: 'Bán nhà', rent: 'Thuê nhà', job: 'Tìm việc' };
var STATUS = { 'new': 'Chưa liên hệ', working: 'Đang tư vấn', signed: 'Đã ký hợp đồng', done: 'Hoàn tất', cancel: 'Huỷ' };

function doPost(e) {
  var body = JSON.parse(e.postData.contents || '{}');
  var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!token || body.token !== token) return json({ ok: false, error: 'unauthorized' });

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet();
    var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
    if (body.action === 'create') {
      var l = body.lead, d = l.details || {};
      if (findRow(sh, l.id)) return json({ ok: true, duplicate: true });
      sh.appendRow([l.id, Utilities.formatDate(new Date(l.createdAt), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm'),
        l.shop_code || 'DIRECT', l.shop_name, SERVICE[l.service] || l.service, l.name, "'" + l.phone, l.email,
        l.address, d.budget || '', d.jobNow || '', d.jobWant || '', d.jp || '', d.area || '', d.when || '',
        l.note, STATUS[l.status] || l.status, '', now]);
    } else if (body.action === 'update') {
      var row = findRow(sh, body.id);
      if (row) {
        sh.getRange(row, 17).setValue(STATUS[body.status] || body.status);
        sh.getRange(row, 18).setValue(body.staffNote || '');
        sh.getRange(row, 19).setValue(now);
      }
    }
    return json({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function sheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#1B2050').setFontColor('#FFFFFF');
  }
  return sh;
}

function findRow(sh, id) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]) === String(id)) return i + 2;
  return 0;
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
