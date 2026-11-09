# CardioEnglish

Web app học **tiếng Anh chuyên ngành tim mạch** bằng chính cuốn *Case-based Comprehensive Cardiology* (Yeo & Poh, Springer 2026).

## Tính năng

| Phần | Nội dung |
|---|---|
| **Phần 1 – Sách gốc** | Hiển thị nguyên trang PDF (chữ, hình, ECG, siêu âm), không chỉnh sửa. Bấm vào một từ để tra. Bôi đen một đoạn để phân tích. |
| **Phần 2 – Học** | **Từ vựng:** IPA UK/US, nút phát âm UK/US, giọng thật (nếu có), nghĩa theo ngữ cảnh, ví dụ, cụm từ, họ từ, liên kết Cambridge. **Đoạn văn:** dịch sát nghĩa, dịch thoát ý, ý nghĩa lâm sàng, phân tích ngữ pháp, mẫu câu, từ vựng. **Bài học:** ghi chú lâm sàng soạn sẵn (Ch.1, Ch.7) và AI soạn bài cho mọi case. **Hỏi AI:** trò chuyện theo trang đang đọc. **Sổ từ.** |
| **Phụ lục (☰)** | 28 chương, khoảng 400 case. Bấm vào case nào thì sách nhảy đúng trang case đó. |
| **Ôn tập** | Thẻ ghi nhớ lặp lại ngắt quãng (Leitner); trắc nghiệm từ vựng 4 dạng (Anh→Việt, Việt→Anh, nghe chọn từ, điền từ); trắc nghiệm lâm sàng (64 câu soạn sẵn + câu AI tạo); AI tạo đề từ đúng các trang của case; theo dõi tiến độ. |

### Mới trong bản 2

| Tính năng | Mô tả |
|---|---|
| **Hôm nay** (tab đầu của Ôn tập) | Chuỗi ngày học liên tiếp 🔥; mục tiêu mỗi ngày (từ mới, thẻ ôn, case, luyện nói) có thể chỉnh trong Cài đặt; nút đọc tiếp trang đang dở; số thẻ đến hạn; 3 case gợi ý tiếp theo theo lộ trình ưu tiên siêu âm (Ch.7→8→9→10→12…); biểu đồ 14 ngày; câu mẫu của ngày. |
| **Tìm trong toàn bộ sách** (☰ → 🔎, hoặc phím `/`) | Tìm một từ hay cụm từ trong cả 859 trang, có trích đoạn và vị trí (chương, case). Bấm vào kết quả để nhảy tới trang, chỗ khớp được tô màu cam. Lần đầu lập chỉ mục mất khoảng 1 phút; từ lần sau dùng ngay. |
| **Từ vựng chuyên ngành của case** (tab Bài học) | Tự quét các trang của case, liệt kê thuật ngữ tim mạch xuất hiện kèm số lần. Bấm một từ để xem thẻ từ với câu ngữ cảnh trong sách. Có nút lưu tất cả vào sổ từ. |
| **Gạch chân từ đã học** | Từ có trong sổ từ được gạch chân chấm đỏ ngay trên trang sách. Bật/tắt trong Cài đặt. |
| **Giao tiếp** (chế độ mới) | **Mẫu câu lâm sàng:** 6 nhóm (trình bày case, mô tả ECG, báo cáo siêu âm, nhận định–kế hoạch, giao ban ICU, nói chuyện với bệnh nhân), mỗi câu có ghi chú ngữ pháp. **Viết kết luận ECG:** chọn nhịp, trục, PR, QRS, ST… để app ghép thành đoạn mô tả tiếng Anh chuẩn kèm bản dịch. **Viết báo cáo siêu âm:** theo cấu trúc ASE. **Luyện nói có chấm điểm** (nhận dạng giọng nói, tô đỏ từ đọc sai, bấm vào từ để nghe riêng). **Nghe – chép** (chấm từng từ). **Lịch sử luyện.** |
| **Từ điển tích hợp** | Mở rộng lên **185 thuật ngữ**: ECG, mạch vành, cơ tim, màng ngoài tim, bẩm sinh, van nhân tạo, thiết bị cấy… |
| **Xuất Anki** | Xuất sổ từ ra file .csv để nhập vào Anki (Sổ từ → Xuất Anki). |
| **Cài như ứng dụng (PWA)** | Trên điện thoại: mở link → menu trình duyệt → *Thêm vào màn hình chính*. Giao diện dùng được khi mạng yếu. |
| **Phím tắt** | `←` `→` lật trang · `/` tìm trong sách · `T` mở phụ lục · `Esc` đóng. |

> Luyện nói cần Chrome hoặc Edge (máy tính, Android). Safari trên iPhone có thể không hỗ trợ; Nghe – chép vẫn dùng được.

- **Không có AI app vẫn chạy.** Đọc sách, phụ lục, từ điển tim mạch tích hợp (khoảng 130 thuật ngữ có IPA), phát âm, sổ từ, ôn tập và trắc nghiệm soạn sẵn đều dùng được.
- **Nội dung sách không được tải lên web.** Bạn tự mở file PDF của mình. File chỉ lưu trong trình duyệt (IndexedDB).

## Triển khai lên Vercel

### Cách 1 – Qua GitHub (khuyến nghị)

1. Vào github.com, chọn **New repository**, đặt tên `cardioenglish` (chọn *Private*), rồi **Create**.
2. Bấm **uploading an existing file**. Kéo thả **toàn bộ nội dung** thư mục `cardioenglish` vào, tức là các mục `index.html`, `api/`, `js/`, `css/`, `data/`, `lib/`, `vercel.json`, `package.json`… Không kéo cả thư mục cha. Sau đó bấm **Commit changes**.
3. Vào vercel.com, chọn **Add New… → Project**, rồi **Import** repo `cardioenglish`.
   - Framework Preset: **Other**. Build Command: để trống. Output Directory: để trống.
   - Bấm **Deploy**. Bạn sẽ có địa chỉ dạng `https://cardioenglish-xxx.vercel.app`.
4. Mở địa chỉ đó, bấm **Chọn file PDF**, chọn cuốn sách. Từ lần sau app tự mở lại.

### Cách 2 – Vercel CLI

```bash
npm i -g vercel
cd cardioenglish
vercel          # lần đầu: đăng nhập và tạo project
vercel --prod
```

## Bật AI (làm sau, khi bạn sẵn sàng)

1. Lấy API key **trả phí**:
   - Anthropic: console.anthropic.com → **API Keys** → nạp credit (khuyến nghị).
   - Hoặc Google Gemini (phải bật billing).
2. Trên Vercel: **Project → Settings → Environment Variables**, thêm các biến sau:

| Biến | Giá trị | Bắt buộc |
|---|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Có (hoặc dùng Gemini) |
| `APP_ACCESS_CODE` | Mật khẩu tự đặt, ví dụ `tim2026` | **Nên có**, để người lạ có link không dùng hết tiền API |
| `AI_MODEL` | Mặc định `claude-sonnet-5-5` | Không |
| `AI_FALLBACK_MODEL` | Mặc định `claude-haiku-5-5` | Không |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Nhà cung cấp dự phòng | Không |

3. Vào **Deployments**, chọn bản mới nhất, bấm **⋯ → Redeploy**.
4. Trong app: **Cài đặt → Mã truy cập**, nhập mã ở bước 2, rồi bấm **Lưu & kiểm tra**. Thấy ✅ là AI đã hoạt động.

### Cơ chế chống lỗi "AI quá tải / hết lượt"

- Key trả phí không có giới hạn kiểu "free tier".
- Máy chủ tự thử lại tối đa 3 lần với thời gian chờ tăng dần khi gặp lỗi 429/529/5xx. Nếu vẫn lỗi, máy chủ chuyển sang model dự phòng, rồi sang nhà cung cấp dự phòng (nếu đã cấu hình).
- Trình duyệt chỉ gửi tối đa 2 yêu cầu cùng lúc, tự thử lại khi mất mạng, và **lưu đệm** mọi câu trả lời. Tra lại cùng một từ hay đoạn văn thì kết quả hiện ngay, không tốn lượt gọi.

**Chi phí ước tính:** mỗi lần tra từ khoảng 1–2 nghìn token. Với Sonnet, 1.000 lần tra tốn vài USD; Haiku rẻ hơn khoảng 10 lần.

## Chạy thử trên máy

```bash
node dev/server.mjs              # http://localhost:3000 (AI thật nếu có ANTHROPIC_API_KEY trong môi trường)
MOCK=1 node dev/server.mjs       # AI giả lập để thử giao diện
```

## Cấu trúc

```
index.html          giao diện
css/app.css
js/app.js           điều phối, phụ lục, bài học, chat, cài đặt
js/pdfview.js       trình xem PDF (pdf.js), lớp chữ, bấm từ / bôi đen
js/dict.js          tra từ, phát âm, phân tích đoạn văn, sổ từ
js/review.js        thẻ ghi nhớ, trắc nghiệm, AI tạo đề, tiến độ
js/ai.js, store.js  gọi AI (lưu đệm, xếp hàng, thử lại), lưu trữ
api/ai.js           Vercel Function – cổng AI
data/toc.js         phụ lục: trang bắt đầu từng chương / case (theo file PDF 859 trang)
data/glossary.js    từ điển tim mạch tích hợp
data/notes.js       ghi chú lâm sàng & câu hỏi soạn sẵn (Ch.1, Ch.7)
lib/pdfjs/          pdf.js 3.11.174
```

## Lưu ý

- Sổ từ và tiến độ lưu trong trình duyệt đang dùng. Muốn chuyển sang máy khác, dùng **Cài đặt → Sao lưu / Khôi phục**.
- Phát âm UK/US dùng giọng đọc có sẵn của máy (Chrome và Edge có giọng tốt nhất). Nút "Cambridge" mở trang Cambridge để nghe giọng chuẩn của từ điển.
