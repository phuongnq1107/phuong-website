# EFJ - Kết nối cộng đồng

Landing page, hệ thống mã QR và dashboard đối tác cho chương trình EFJ - Kết nối cộng đồng của EFJ Group.
Khách ăn uống, mua sắm tại 75 quán Việt đối tác quét mã QR riêng của quán để nhận ưu đãi nhà ở (Estate Plus), nội thất (Eco-Life) và việc làm (Yoko Japan).

- Trang khách: `https://partner.efj-group.com`
- Link QR từng quán: `https://partner.efj-group.com/q/TK01`
- Dashboard: `https://partner.efj-group.com/dashboard`

## Tính năng

**Landing page** (tiếng Việt, ưu tiên điện thoại)
- Chào đúng tên quán khách vừa quét, ghi nhớ mã quán 30 ngày.
- Ba ưu đãi dạng phiếu giảm giá, form đăng ký mua, bán, thuê nhà và tìm việc.
- Kiểm tra dữ liệu ngay trên form, chống bot, đồng ý chính sách bảo mật.
- Google Analytics 4: `qr_scan`, `select_promotion`, `begin_checkout`, `generate_lead`.

**Dashboard**
- **Quản trị viên** (mật khẩu): xem toàn bộ 75 quán, toàn bộ khách (kể cả số điện thoại), đổi trạng thái tư vấn, ghi chú nội bộ, sửa thông tin quán, cấp và đổi mã truy cập, tải QR, xuất CSV.
- **Chủ quán** (mã 8 ký tự riêng): chỉ thấy quán mình, gồm lượt quét QR, lượt bấm ưu đãi, số đăng ký và tiến độ tư vấn. Tên khách chỉ hiện viết tắt, không có số điện thoại hay email.
- Cập nhật realtime: khách quét QR hoặc gửi form thì dashboard admin và dashboard của đúng quán đó cập nhật ngay.

**Lưu dữ liệu**: MySQL (dữ liệu gốc) và Google Sheets (bản sao cho đội sales).

## Cấu trúc

```
server.js                 Entry file (Hostinger: Entry file = server.js)
src/
  config.js               Đọc biến môi trường
  db.js                   MySQL, tự tạo bảng và 75 quán
  auth.js                 Mã truy cập quán, phiên đăng nhập, giới hạn tần suất
  routes-public.js        /q/:code, form đăng ký, ghi lượt bấm
  routes-dashboard.js     API dashboard, xuất CSV, ảnh QR
  realtime.js             Server-Sent Events
  sheets.js               Gửi sang Google Sheets
  qr.js                   Tạo mã QR và poster
  shops-seed.js           Danh sách 75 quán ban đầu
public/                   Landing page (HTML, CSS, JS, ảnh WebP)
dashboard/                Dashboard (HTML, CSS, JS)
qr-codes/                 75 mã QR đã tạo sẵn (PNG, poster SVG, trang in A4, CSV)
google-apps-script/       Script nhận dữ liệu cho Google Sheets
docs/                     Hướng dẫn deploy và Google Sheets
```

## Chạy trên máy

Cần Node.js 20 trở lên và MySQL hoặc MariaDB.

```bash
npm install
```

```bash
cp .env.example .env
```

Điền `.env` (DB, `ADMIN_PASSWORD`, `SESSION_SECRET`, `SHOP_CODE_SECRET`), rồi:

```bash
npm run dev
```

Mở http://localhost:3000/q/TK01 và http://localhost:3000/dashboard

## Mã QR

Thư mục `qr-codes/` đã có sẵn 75 mã trỏ về `https://partner.efj-group.com/q/<mã quán>`:

| File | Dùng để |
|---|---|
| `png/TK01.png` | Ảnh QR 1024px cho thiết kế poster riêng |
| `poster-svg/TK01.svg` | Thẻ đặt quầy in ngay (tỉ lệ A6) |
| `in-tat-ca.html` | Mở bằng trình duyệt, Ctrl+P để in cả 75 thẻ (4 thẻ mỗi trang A4) |
| `danh-sach-qr.csv` | Danh sách mã quán và link |

Mã QR chỉ chứa link nên đổi tên quán **không cần in lại**. Tạo lại khi đổi tên miền:

```bash
PUBLIC_URL=https://partner.efj-group.com npm run qr
```

**Mã truy cập dashboard** của các quán là thông tin bí mật, không nằm trong repo. Tải từ dashboard quản trị (nút **Tải mã truy cập các quán (CSV)**).

## Deploy

Xem [docs/DEPLOY-HOSTINGER.md](docs/DEPLOY-HOSTINGER.md) và [docs/GOOGLE-SHEETS.md](docs/GOOGLE-SHEETS.md).

## Thay số liệu giả định

Tên 75 quán hiện là "Quán đối tác Tokyo 01"… Sửa từng quán trong dashboard quản trị. Số quán theo tỉnh trên landing page (30, 20, 13, 12) nằm ở mục `#mang-luoi` trong `public/index.html`.
