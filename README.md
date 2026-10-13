# AdHub — Quản lý & tự động hoá quảng cáo đa kênh

Một nơi để quản lý **Facebook Ads, TikTok Ads và Google Ads**: kết nối tài khoản, xem báo cáo hợp nhất, tạo chiến dịch một lần cho nhiều kênh và tự động tối ưu bằng rule.

## Tính năng (MVP)

| Tính năng | Mô tả |
|---|---|
| Kết nối nền tảng | Connect/Disconnect từng nền tảng; nền tảng đã ngắt kết nối bị ẩn khỏi báo cáo và không thể thao tác ghi |
| Dashboard hợp nhất | KPI tổng (Chi tiêu, Click, CTR, Chuyển đổi, CPA, ROAS), biểu đồ chi tiêu theo ngày, bảng so sánh nền tảng |
| Chiến dịch | Danh sách hợp nhất, lọc theo nền tảng/trạng thái, bật/tắt và sửa ngân sách ngay trên bảng; chọn nhiều dòng (chọn tất cả, Shift+bấm, chọn nhanh đang chạy/tạm dừng) để bật hoặc tạm dừng hàng loạt |
| Tạo đa kênh | Nhập một lần → chia ngân sách theo % → tạo trên từng kênh ở trạng thái **PAUSED**; mỗi kênh thành công/thất bại độc lập. Nền tảng đã kết nối được chọn sẵn và chia đều; sửa % một kênh thì các kênh còn lại tự cân để tổng luôn 100% |
| Tự động hoá | Rule `NẾU CPA/ROAS/Chi tiêu/CTR > / < ngưỡng trong N ngày THÌ tạm dừng / bật / ±% ngân sách`; chạy mỗi phút hoặc “Chạy ngay”; giới hạn an toàn ±50%/lần, trần 50 triệu/ngày. Có mẫu rule dựng sẵn, tên rule tự đặt nếu để trống |
| Nhật ký | Ghi lại mọi thay đổi (ai, lúc nào, làm gì) của thành viên, rule và hệ thống |
| Đăng nhập & phân quyền | 3 cấp vai trò, phiên đăng nhập lưu trong MongoDB, mỗi vai trò có dashboard và menu riêng |
| Thông tin cá nhân | Mọi thành viên (kể cả Chủ sở hữu) tự sửa tên, email (cần mật khẩu hiện tại) và đổi mật khẩu; đổi mật khẩu sẽ đăng xuất các thiết bị khác |

## Vai trò (actor)

Ba cấp, xếp từ cao xuống thấp. Mỗi cấp có **toàn bộ quyền của cấp dưới** và thêm phần riêng của mình:

| Cấp | Vai trò | Thêm quyền so với cấp dưới | Trọng tâm trên Dashboard |
|---|---|---|---|
| 3 | Chủ sở hữu (Owner) | Kết nối/ngắt nền tảng; thêm, đổi vai trò, khoá mọi thành viên (kể cả Owner khác); đặt hạn mức ngân sách Media Buyer; duyệt ngân sách vượt hạn mức và rule tăng ngân sách | Toàn cảnh workspace (ngân sách đang chạy, dự kiến 30 ngày, cơ cấu đội) và vận hành (kết nối, rule, tài khoản bị khoá, hoạt động gần nhất) |
| 2 | Media Buyer | Xem chiến dịch, rule, kết nối, nhật ký; bật/tắt/sửa ngân sách, tạo chiến dịch đa kênh; tạo và chạy rule | Việc cần xử lý: chiến dịch ROAS thấp, số đang chạy/tạm dừng |
| 1 | Khách hàng (Client) | Xem báo cáo hiệu quả (dashboard) | Báo cáo chung |
| — | Rule / Hệ thống | Tác nhân tự động, được ghi riêng trong nhật ký | — |

**Hạn mức ngân sách của Media Buyer:** mặc định **không giới hạn**. Owner có thể đặt mức tối đa (VND/ngày cho một chiến dịch) hoặc tắt lại tại trang *Người dùng và phân quyền*; mỗi lần đổi đều được ghi nhật ký. Khi đang có hạn mức:
- Ngân sách vượt mức phải do Owner đặt; khi tạo đa kênh, hạn mức tính trên ngân sách của từng kênh.
- Media Buyer không được bật hoặc chạy rule *tăng ngân sách* (automation có thể đẩy ngân sách vượt hạn mức), nhưng vẫn tạo được rule ở trạng thái tắt để Owner duyệt.

Quyền được kiểm tra ở server (`server/src/domain/permissions.ts`); client chỉ ẩn/hiện giao diện theo danh sách quyền và hạn mức server trả về trong `/api/auth/me`. Các vai trò cũ đã bị bỏ và được tự chuyển khi server khởi động: "Người xem" (Viewer) → Khách hàng, "Quản trị viên" (Admin) → Chủ sở hữu. Biến `SEED_PASSWORD_ADMIN` không còn được dùng.

**Tài khoản demo** (mật khẩu chung `adhub@123`): `owner@adhub.vn`, `buyer@adhub.vn`, `client@adhub.vn`.

## Công nghệ

- **Backend**: Node.js, Express, TypeScript, Zod, MongoDB (driver chính thức), node-cron
- **Frontend**: ReactJS 18, Vite, TanStack Query, React Router, Tailwind CSS, Recharts

## Chạy dự án

Yêu cầu: Node.js 20+ và Docker (hoặc một MongoDB bất kỳ).

```bash
docker compose up -d            # MongoDB tại localhost:27017
cp server/.env.example server/.env
npm install
npm run dev                     # API: http://localhost:4000 · Web: http://localhost:5173
```

Lần chạy đầu, nếu database trống thì dữ liệu demo và tài khoản demo sẽ được seed tự động (database cũ chưa có tài khoản cũng được bổ sung, giữ nguyên dữ liệu chiến dịch). Muốn reset dữ liệu: `npm run seed -w server`.

### Xem dữ liệu bằng MongoDB Compass

Server ghi log `MongoDB connected: mongodb://localhost:27017 (database "adhub")` khi khởi động. Để thấy connection trong Compass:

1. Mở Compass → **Connect** → **Import connections** → chọn file [`docs/compass-connections.json`](docs/compass-connections.json) (tạo sẵn connection "AdHub (local Docker)"), hoặc
2. **Add new connection** và dán `mongodb://localhost:27017/adhub?directConnection=true`.

Database `adhub` có các collection: `integrations`, `campaigns`, `metrics`, `rules`, `activities`, `users`, `sessions`. Kết nối của server hiện với tên `adhub-server` (tab Performance / `db.currentOp()`). Nếu Compass không kết nối được, kiểm tra container: `docker compose ps` (cột STATUS phải là `healthy`).

| Lệnh | Mục đích |
|---|---|
| `npm test` | Unit test (chia ngân sách, rule engine, phân quyền, mật khẩu, client) và test tích hợp API trên MongoDB thật (tự bỏ qua nếu MongoDB không chạy; dùng database tạm và tự xoá) |
| `npm run typecheck` | Kiểm tra kiểu cho server và client |
| `npm run build` | Build production |

## Kiến trúc

```
server/src/
  domain/        Logic nghiệp vụ thuần: types, chia ngân sách, rule, KPI (không phụ thuộc framework/DB)
  adapters/      IAdPlatformAdapter + PlatformRegistry; mock adapter cho từng nền tảng
  db/            Kết nối MongoDB, khai báo collection, index
  repositories/  Truy cập MongoDB (chỉ tầng này chạm vào database)
  services/      Use case: auth, user, integration, campaign, dashboard, unified-campaign, rule-engine, sync, activity
  middleware/    Xác thực phiên (Bearer token), kiểm tra quyền theo vai trò, xử lý lỗi
  routes/        HTTP mỏng: validate bằng Zod rồi gọi service
  jobs/          Scheduler: đồng bộ số liệu → chạy rule mỗi phút
  container.ts   Composition root (dependency injection thủ công)
client/src/
  features/      Mỗi màn hình một thư mục: auth, dashboard, campaigns, create-campaign, rules, integrations, activity, users
  components/    UI dùng chung, route guard · lib/ API client, auth context, types, format, query keys, URL state
```

**Mở rộng:**
- **Thêm nền tảng** (Zalo, Shopee…): viết một class implement `IAdPlatformAdapter` rồi đăng ký trong `container.ts`. Service không phải sửa.
- **Dùng API thật**: thay `MockAdPlatformAdapter` bằng adapter gọi Meta Marketing API, TikTok Business API và Google Ads API. Các adapter này cần được nền tảng duyệt quyền truy cập trước.
- **Dữ liệu** được lưu trong MongoDB. Hiện tại số liệu quảng cáo là dữ liệu mẫu (seed), và job sync lấy số liệu hằng ngày từ adapter.
