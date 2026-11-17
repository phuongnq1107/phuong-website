# Đồng bộ đăng ký sang Google Sheets

Mỗi đăng ký mới được ghi thêm một dòng vào Google Sheet. Khi quản trị viên đổi trạng thái hoặc ghi chú trên dashboard, dòng đó được cập nhật theo. MySQL vẫn là dữ liệu gốc, Sheet là bản sao để đội sales tiện làm việc.

## Cài đặt (10 phút)

1. Tạo Google Sheet mới, đặt tên ví dụ **EFJ - Đăng ký Kết nối cộng đồng**.
2. **Tiện ích mở rộng → Apps Script**. Xoá code mẫu, dán toàn bộ file `google-apps-script/Code.gs`. Lưu.
3. Bánh răng **Project Settings → Script properties → Add script property**:
   - Property: `TOKEN`
   - Value: một chuỗi bí mật, tạo bằng `openssl rand -hex 24`
4. **Deploy → New deployment** → loại **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**

   Bấm Deploy, cấp quyền khi Google hỏi, rồi copy **Web app URL** (dạng `https://script.google.com/macros/s/.../exec`).
5. Trên Hostinger, đặt biến môi trường:
   - `SHEETS_WEBHOOK_URL` = Web app URL
   - `SHEETS_WEBHOOK_TOKEN` = đúng chuỗi `TOKEN` ở bước 3

   Rồi bấm **Redeploy**.
6. Gửi thử một đăng ký trên trang. Sheet **Đăng ký** sẽ tự tạo tiêu đề và thêm dòng mới.

## Lưu ý

- Ai có Web app URL mà không có `TOKEN` thì không ghi được vào Sheet.
- Sửa `Code.gs` xong phải **Deploy → Manage deployments → Edit → New version** thì mới có hiệu lực.
- Chia sẻ Sheet chỉ cho nhân viên cần thiết, vì Sheet chứa số điện thoại và email của khách.
- Nếu Google tạm lỗi, server thử gửi lại 3 lần. Đăng ký vẫn luôn được lưu trong MySQL và tải được bằng nút **Tải danh sách (CSV)** trên dashboard.
