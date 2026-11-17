# Deploy lên Hostinger (gói Business, Node.js Web App)

Thời gian làm lần đầu: khoảng 30 phút. Sau đó mỗi lần `git push` lên nhánh `main`, Hostinger tự build và cập nhật trang.

> Giao diện hPanel có thể đổi tên mục theo thời gian. Nếu không thấy đúng tên, tìm mục có ý nghĩa tương tự.

## Bước 1. Tạo database MySQL

1. hPanel → **Websites** → chọn website bất kỳ của gói Business → **Databases → MySQL Databases**.
2. Tạo database mới, ví dụ:
   - Database name: `u123456789_efjpartner`
   - Username: `u123456789_efj`
   - Password: tạo mật khẩu mạnh, **lưu lại**.
3. Ghi lại: tên database, username, password, và **MySQL host** (thường là `localhost`, hPanel hiển thị ngay trong trang này).

Không cần import file SQL: app tự tạo bảng và 75 quán ở lần chạy đầu tiên.

## Bước 2. Tạo các chuỗi bí mật

Trên máy tính (Mac/Linux, hoặc Git Bash trên Windows), chạy 2 lần để có 2 chuỗi khác nhau:

```bash
openssl rand -hex 32
```

- Chuỗi 1 → `SESSION_SECRET`
- Chuỗi 2 → `SHOP_CODE_SECRET` (mã truy cập của 75 quán được sinh từ chuỗi này. **Không đổi** sau khi đã phát mã cho quán.)

Đặt thêm `ADMIN_PASSWORD`: mật khẩu quản trị dashboard, ít nhất 10 ký tự.

## Bước 3. Tạo Node.js Web App từ GitHub

1. hPanel → **Websites → Add Website** → chọn **Node.js Web App**.
2. Chọn **Import Git repository**, kết nối tài khoản GitHub, chọn repo `efj-partner`, nhánh `main`.
   (Mỗi gói Hostinger chỉ kết nối được một tài khoản GitHub.)
3. Cấu hình build (Hostinger thường tự nhận, nếu không thì chọn framework **Other / Express**):

   | Mục | Giá trị |
   |---|---|
   | Node.js version | 20 hoặc 22 |
   | Build command | `npm install` (hoặc để trống) |
   | Output directory | để trống |
   | Entry file | `server.js` |

4. **Environment variables**: thêm toàn bộ biến trong `.env.example`:

   | Biến | Giá trị |
   |---|---|
   | `NODE_ENV` | `production` |
   | `PUBLIC_URL` | `https://partner.efj-group.com` |
   | `DB_HOST` | `localhost` (hoặc host hPanel cung cấp) |
   | `DB_PORT` | `3306` |
   | `DB_NAME`, `DB_USER`, `DB_PASSWORD` | từ Bước 1 |
   | `ADMIN_PASSWORD` | từ Bước 2 |
   | `SESSION_SECRET`, `SHOP_CODE_SECRET` | từ Bước 2 |
   | `GA_MEASUREMENT_ID` | `G-XXXXXXXXXX` (Bước 6) |
   | `SHEETS_WEBHOOK_URL`, `SHEETS_WEBHOOK_TOKEN` | xem `docs/GOOGLE-SHEETS.md` |
   | `ECOLIFE_URL` | `https://ecolife123.com/` |

5. **Domain**: nhập `partner.efj-group.com`.
   - Nếu tên miền `efj-group.com` đang quản lý DNS ở Hostinger: subdomain được tạo tự động.
   - Nếu DNS ở nơi khác (Cloudflare, Onamae…): thêm bản ghi theo hướng dẫn hPanel hiển thị (thường là bản ghi `A` hoặc `CNAME` cho `partner`).
6. Bấm **Deploy**. Chờ build xong, SSL (HTTPS) được cấp tự động.

## Bước 4. Kiểm tra sau khi deploy

- `https://partner.efj-group.com/healthz` → trả về `{"ok":true}`.
- `https://partner.efj-group.com/q/TK01` → mở trang, hiện dòng "Bạn vừa quét mã tại Quán đối tác Tokyo 01".
- `https://partner.efj-group.com/dashboard` → đăng nhập tab **Quản trị viên** bằng `ADMIN_PASSWORD`.
- Gửi thử một đăng ký → dashboard tự cập nhật trong vài giây.

Nếu app không chạy: xem **Logs** của Node.js app trong hPanel. Thông báo `Thiếu biến môi trường` hoặc `không kết nối được cơ sở dữ liệu` cho biết cần sửa biến nào.

## Bước 5. Phát mã truy cập cho 75 quán

Dashboard quản trị → bảng **75 quán đối tác** → **Tải mã truy cập các quán (CSV)**.
File gồm: mã quán, link QR và mã truy cập 8 ký tự. Gửi riêng cho từng chủ quán, kèm link `https://partner.efj-group.com/dashboard`.

- Bấm vào một quán để: sửa tên, địa chỉ, người liên hệ, nhân viên phụ trách; xem và **đổi mã truy cập**; tải QR.
- Đổi mã: quán bị đăng xuất khỏi mọi thiết bị ngay lập tức.
- Bỏ chọn "Đang tham gia": mã QR của quán tạm ngưng (khách quét sẽ vào trang chung).

## Bước 6. Google Analytics 4

1. analytics.google.com → Admin → Create property → Web stream với `partner.efj-group.com`.
2. Copy **Measurement ID** (`G-...`) vào biến `GA_MEASUREMENT_ID`, redeploy.
3. Các sự kiện đã gắn sẵn:

   | Sự kiện | Khi nào | Tham số |
   |---|---|---|
   | `qr_scan` | khách vào trang qua mã QR | `shop_code`, `prefecture` |
   | `select_promotion` | bấm vào một ưu đãi | `promotion_id` (buy/rent/furn/job), `shop_code` |
   | `begin_checkout` | mở form đăng ký | `item_category`, `shop_code` |
   | `generate_lead` | gửi đăng ký thành công | `service`, `shop_code` |

   Nên đánh dấu `generate_lead` là **Key event** trong GA4 (Admin → Events).

## Cập nhật về sau

Sửa code → `git push` lên `main` → Hostinger tự build lại. Thay đổi biến môi trường cần bấm **Redeploy**.

## Giới hạn của Hostinger cần biết

- Mỗi request bị ngắt sau 120 giây và không có WebSocket. Dashboard dùng Server-Sent Events, tự kết nối lại mỗi 90 giây. Nếu proxy chặn, dashboard tự chuyển sang cập nhật 10 giây một lần (góc phải trên ghi "Tự cập nhật mỗi 10 giây").
- Gói Business giới hạn 5 Node.js app.
