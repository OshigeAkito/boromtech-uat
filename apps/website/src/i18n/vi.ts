import type th from './th'

export default {
  meta: {
    title: 'BoromTech · Ai cũng làm được với AI. Chúng tôi lo vận hành.',
    description:
      'Dự án tốn kém mà không dùng được, hay viết code bằng AI mà không ai bảo trì? BoromTech tiếp quản hệ thống lớn nhỏ. Kiểm định giá trọn gói, bảo hành 90 ngày.',
    ogImageAlt: 'Một căn nhà sang trọng bị bỏ dở giữa chừng, với khung bê tông trơ trụi, bể bơi chưa hoàn thiện và giàn giáo bị bỏ lại',
  },
  nav: {
    label: 'Menu chính',
    cases: 'Vấn đề chúng tôi xử lý',
    audit: 'Phạm vi kiểm tra',
    report: 'Báo cáo mẫu',
    faq: 'Hỏi đáp',
    cta: 'Yêu cầu tư vấn',
    language: 'Ngôn ngữ',
  },
  hero: {
    cta: 'Yêu cầu tư vấn',
    slides: [
      ['Ai cũng làm được với AI. Nhưng có đúng kỹ thuật không?', 'BoromTech cử chuyên gia vào kiểm tra.'],
      ['Dự án hàng triệu mà vẫn không dùng được', 'BoromTech cử chuyên gia sửa chữa và hoàn thiện.'],
      ['Làm ra bao nhiêu app, ai sẽ duy trì?', 'BoromTech cử chuyên gia bảo trì định kỳ.'],
      ['Network khó hiểu quá, cần người giải thích', 'BoromTech cử chuyên gia tư vấn và bắt tay làm.'],
      ['Thuê outsource làm một dự án, đắt quá', 'BoromTech tập hợp chuyên gia với giá hợp lý.'],
    ],
  },
  iceberg: {
    title: ['Phần ', 'không nhìn thấy'],
    aboveLabel: 'Phần nhìn thấy',
    above: ['Màn hình dùng được', 'Tính năng qua được buổi demo'],
    belowLabel: 'Phần cần có người lo',
    below: [
      'Bản sao lưu khôi phục được',
      'Chăm lo bảo mật',
      'Cảnh báo khi hệ thống sập',
      'Sửa lỗi từ xa',
      'Tài liệu dùng được thật',
      'Nâng cấp phiên bản trước khi hết hỗ trợ',
      'Người nhấc máy lúc ba giờ sáng',
    ],
    closing: 'BoromTech lo phần chìm dưới nước, để phần nổi bên trên chạy tốt mỗi ngày.',
    bug: 'Lỗi',
    fixed: 'Đã sửa',
  },
  cases: {
    title: 'Bạn đã từng gặp những vấn đề này chưa?',
    intro: 'Chọn các triệu chứng giống dự án của bạn để xem chúng tôi bắt đầu giúp từ đâu.',
    photoAlt: 'Một căn nhà sang trọng bị bỏ dở giữa chừng, với khung bê tông trơ trụi, bể bơi chưa hoàn thiện và giàn giáo bị bỏ lại',
    photoCaption:
      'Ai từng xây nhà đều biết ngân sách thường đội lên, và đôi khi nhà thầu bỏ dở giữa chừng. Phần mềm cũng có thể như vậy: đã đầu tư rất nhiều nhưng công việc vẫn dở dang vì không ai tiếp quản.',
    symptoms: [
      { symptom: 'Đã chi rất nhiều cho dự án nhưng vẫn chưa dùng được', remedy: 'Chúng tôi phẫu thuật cấu trúc hiện có, sửa chỗ hỏng và làm cho hệ thống chạy thật mà không phải đập đi làm lại từ đầu.' },
      { symptom: 'Tự làm hoặc dùng AI làm được, nhưng không ai giữ cho ổn định', remedy: 'Chúng tôi sắp xếp lại code, vá lỗ hổng bảo mật và nhận trách nhiệm bảo trì để hệ thống dùng được lâu dài.' },
      { symptom: 'Nhà cung cấp cũ bỏ ngang, không liên lạc được hoặc bàn giao thiếu', remedy: 'Chúng tôi tiếp nhận từ hệ thống đang chạy thật, đối chiếu phạm vi còn thiếu và làm tiếp đến khi xong mà không phải chờ ai.' },
      { symptom: 'Không có mã nguồn, không có tài liệu, hoặc người làm đã nghỉ', remedy: 'Khôi phục code từ máy chủ vào kho Git do bạn sở hữu, kèm tài liệu và sơ đồ mới cho toàn bộ hệ thống.' },
      { symptom: 'Hệ thống hay sập, chậm hoặc tính sai mà không tìm ra nguyên nhân', remedy: 'Cài đặt giám sát, thu thập log và truy tìm nguyên nhân gốc đến khi dứt điểm.' },
      { symptom: 'Hệ thống quá cũ hoặc không mở rộng được để phục vụ thêm khách hàng', remedy: 'Lên kế hoạch nâng cấp và cải tiến từng phần, trong khi hệ thống vẫn hoạt động liên tục.' },
      { symptom: 'Cần một đội chuyên nghiệp bảo trì hệ thống, dự án lớn hay nhỏ', remedy: 'Chúng tôi là đội kỹ thuật luôn giám sát, cập nhật và xử lý sự cố để doanh nghiệp của bạn vận hành yên tâm.' },
    ],
    verdict: 'Chúng tôi kiểm tra các vấn đề bạn gặp trong 5 ngày, rồi gửi chi tiết cách làm cùng báo giá trước khi bắt tay vào làm.',
    verdictPicked: '{n} triệu chứng · chúng tôi kiểm tra mọi điều bạn đã chọn trong 5 ngày, rồi gửi chi tiết cách làm cùng báo giá trước khi bắt tay vào làm',
    cta: 'Gửi trường hợp này cho chúng tôi',
    emailSubject: 'Đặt lịch kiểm định hệ thống',
    emailBody: 'Xin chào,\n\nHệ thống của chúng tôi có các triệu chứng sau:\n{symptoms}\n\nTên hệ thống / dự án:\nCông nghệ sử dụng (nếu biết):\nSố điện thoại:\n',
  },
  audit: {
    title: ['Kiểm tra mọi tầng ', 'của phần mềm'],
    intro: 'Chúng tôi kiểm tra toàn bộ hệ thống, từ giao diện phần mềm đến những người vận hành, trong 5 ngày làm việc, kèm bản tóm tắt kết quả, phân loại vấn đề và bắt đầu xử lý từ những rủi ro cao nhất.',
    layers: [
      { layer: 'Màn hình và tính năng', check: 'Mọi tính năng trong hợp đồng có thực sự hoạt động không?' },
      { layer: 'Code', check: 'Mã nguồn có khớp với bản đang chạy không? Cấu trúc có sửa tiếp được không?' },
      { layer: 'Cơ sở dữ liệu', check: 'Dữ liệu đúng, có sao lưu và khôi phục được thật.' },
      { layer: 'Máy chủ và đám mây', check: 'Phiên bản đã hết hỗ trợ chưa? Ai đang giữ mật khẩu?' },
      { layer: 'Bảo mật', check: 'Lỗ hổng đã biết, mật khẩu trong code và quyền truy cập mở quá mức.' },
      { layer: 'Con người và kiến thức', check: 'Ai biết gì, và điều gì chưa ai ghi lại.' },
    ],
  },
  showcase: {
    title: 'Báo cáo mẫu',
    tablist: 'Tài liệu bạn nhận được',
    note: 'Mẫu tài liệu thật bạn sẽ nhận, từ một dự án thật: hệ thống quản lý kho của một công ty phân phối.',
    mock: 'Lưu ý: toàn bộ dữ liệu là mock-up để bảo mật thông tin khách hàng.',
  },
  trusted: {
    title: 'Khách hàng tin tưởng chúng tôi',
    filter: 'Lọc theo ngành',
    all: 'Tất cả',
    count: 'Hiển thị {n} / {total}',
    industries: { retail: 'Bán lẻ', finance: 'Tài chính', logistics: 'Logistics', manufacturing: 'Sản xuất' },
  },
  faq: {
    title: 'Trước khi bắt đầu',
    lead: 'Chúng tôi làm việc thẳng thắn và giải thích rõ ràng cách làm.',
    principles: ['Bảo mật thông tin', 'Tổng hợp vấn đề đầy đủ', 'Báo giá minh bạch'],
    listTitle: 'Câu hỏi thường gặp',
    items: [
      {
        q: 'Hệ thống làm bằng AI, hoặc dự án đắt tiền bị hỏng, các bạn có nhận không?',
        a: 'Có. Dù là code do AI tạo ra không chịu nổi môi trường thật hay dự án đắt tiền mà nhà cung cấp cũ bỏ dở, chúng tôi vào kiểm định, sửa chỗ hỏng và tiếp tục bảo trì để hệ thống dùng được thật.',
      },
      {
        q: 'Các bạn nhận cả việc nhỏ lẫn việc lớn chứ?',
        a: 'Có, từ việc nhỏ đến hệ thống doanh nghiệp lớn. Chúng tôi chia công việc thành các việc nhỏ theo đúng quy mô vấn đề, nên bạn tự chọn thứ tự ưu tiên và kiểm soát ngân sách.',
      },
      {
        q: 'Không có mã nguồn, vẫn khôi phục được chứ?',
        a: 'Trong đa số trường hợp là được. Chúng tôi khôi phục từ máy chủ production hoặc các tệp đã triển khai. Nếu không khôi phục được, bạn sẽ biết ngay trong Audit Report trước khi trả bất kỳ chi phí làm hệ thống nào.',
      },
      {
        q: 'Bảo hành bao gồm những gì?',
        a: 'Mọi việc chúng tôi bàn giao đều được bảo hành 90 ngày. Nếu sự cố do phần việc của chúng tôi, chúng tôi sửa miễn phí. Không bao gồm tính năng mới và phần do người khác chỉnh sửa sau đó.',
      },
      {
        q: 'Giá được tính thế nào?',
        a: 'Phí kiểm định là giá trọn gói báo trước khi bắt đầu, và được khấu trừ toàn bộ nếu bạn tiếp tục làm hệ thống với chúng tôi. Sau đó mỗi việc đều có giá rõ ràng và bạn tự chọn thứ tự. Nếu phạm vi thay đổi, chúng tôi luôn báo giá lại trước khi làm.',
      },
      {
        q: 'Các bạn hỗ trợ công nghệ nào, và dữ liệu có an toàn không?',
        a: 'Chúng tôi làm với PHP, Laravel, WordPress, Java, .NET, Node.js, Python, React, Angular và mọi cơ sở dữ liệu phổ biến. Chúng tôi luôn ký NDA trước khi bắt đầu, và toàn bộ code thuộc quyền sở hữu của bạn 100%.',
      },
    ],
  },
  contact: {
    title: 'Gửi hệ thống cho chúng tôi xem',
    body: 'Dù dự án đang vướng ở đâu, hay bạn đang tìm đội tiếp quản, hãy kể ngắn gọn các triệu chứng. Chúng tôi trả lời trong một ngày làm việc và hẹn ngày kiểm định.',
    cta: 'Viết cho chúng tôi',
    emailSubject: 'Đặt lịch kiểm định hệ thống',
    photoAlt: 'Tủ máy chủ cũ với dây mạng được đi lại gọn gàng',
  },
  footer: {
    copyright: '© 2026 BoromTech',
    credits: 'Một số hình minh họa được tạo bằng AI · Ảnh chụp từ Wikimedia Commons:',
    by: 'của',
    video: 'video',
  },
} satisfies typeof th
