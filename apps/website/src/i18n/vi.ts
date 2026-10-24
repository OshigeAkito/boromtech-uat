import type th from './th'

export default {
  meta: {
    title: 'BoromTech · Ai cũng làm được với AI. Chúng tôi lo vận hành.',
    description:
      'Dự án tốn kém mà không dùng được, hay viết code bằng AI mà không ai bảo trì? BoromTech tiếp quản hệ thống lớn nhỏ. Kiểm định giá trọn gói, bảo hành 90 ngày.',
    ogImageAlt: 'Tòa tháp Sathorn Unique xây dở giữa các tòa nhà đã hoàn thiện ở Bangkok',
  },
  nav: {
    label: 'Menu chính',
    cases: 'Dịch vụ',
    process: 'Quy trình',
    team: 'Đội ngũ',
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
      'Bản sao lưu khôi phục được thật',
      'Bảo mật và cập nhật bản vá',
      'Giám sát và cảnh báo khi hệ thống sập',
      'Tài liệu mà người kế tiếp đọc hiểu được',
      'Nâng cấp phiên bản trước khi hết hỗ trợ',
      'Người nhấc máy lúc ba giờ sáng',
    ],
    closing: 'BoromTech lo phần chìm dưới nước, để phần nổi bên trên chạy tốt mỗi ngày.',
    bug: 'Lỗi',
    fixed: 'Đã sửa',
  },
  cases: {
    title: 'Những việc chúng tôi nhận',
    intro: 'Chọn các triệu chứng giống dự án của bạn để xem chúng tôi bắt đầu giúp từ đâu.',
    photoAlt: 'Tòa tháp Sathorn Unique xây dở, đứng giữa các tòa nhà đã hoàn thiện ở khu Sathorn, Bangkok',
    photoCaption:
      'Tháp Sathorn Unique, một dự án khổng lồ bị bỏ dở từ năm 1997. Rất nhiều phần mềm đắt tiền và dự án làm nửa chừng cũng bị bỏ lại như thế.',
    symptoms: [
      { symptom: 'Đã chi rất nhiều cho dự án nhưng vẫn chưa dùng được', remedy: 'Chúng tôi phẫu thuật cấu trúc hiện có, sửa chỗ hỏng và làm cho hệ thống chạy thật mà không phải đập đi làm lại từ đầu.' },
      { symptom: 'Tự làm hoặc dùng AI làm được, nhưng không ai giữ cho ổn định', remedy: 'Chúng tôi sắp xếp lại code, vá lỗ hổng bảo mật và nhận trách nhiệm bảo trì để hệ thống dùng được lâu dài.' },
      { symptom: 'Nhà cung cấp cũ bỏ ngang, không liên lạc được hoặc bàn giao thiếu', remedy: 'Chúng tôi tiếp nhận từ hệ thống đang chạy thật, đối chiếu phạm vi còn thiếu và làm tiếp đến khi xong mà không phải chờ ai.' },
      { symptom: 'Không có mã nguồn, không có tài liệu, hoặc người làm đã nghỉ', remedy: 'Khôi phục code từ máy chủ vào kho Git do bạn sở hữu, kèm tài liệu và sơ đồ mới cho toàn bộ hệ thống.' },
      { symptom: 'Hệ thống hay sập, chậm hoặc tính sai mà không tìm ra nguyên nhân', remedy: 'Cài đặt giám sát, thu thập log và truy tìm nguyên nhân gốc đến khi dứt điểm.' },
      { symptom: 'Hệ thống quá cũ hoặc không mở rộng được để phục vụ thêm khách hàng', remedy: 'Lên kế hoạch nâng cấp và cải tiến từng phần, trong khi hệ thống vẫn hoạt động liên tục.' },
      { symptom: 'Cần một đội chuyên nghiệp bảo trì hệ thống, dự án lớn hay nhỏ', remedy: 'Chúng tôi là đội kỹ thuật luôn giám sát, cập nhật và xử lý sự cố để doanh nghiệp của bạn vận hành yên tâm.' },
    ],
    verdict: 'Mọi trường hợp đều bắt đầu bằng 5 ngày làm việc kiểm định, kèm báo giá trọn gói trước khi bắt tay vào làm.',
    verdictPicked: '{n} triệu chứng · 5 ngày làm việc kiểm định bao quát mọi điều bạn đã chọn, kèm báo giá trọn gói trước khi bắt tay vào làm',
    cta: 'Gửi trường hợp này cho chúng tôi',
    emailSubject: 'Đặt lịch kiểm định hệ thống',
    emailBody: 'Xin chào,\n\nHệ thống của chúng tôi có các triệu chứng sau:\n{symptoms}\n\nTên hệ thống / dự án:\nCông nghệ sử dụng (nếu biết):\nSố điện thoại:\n',
  },
  process: {
    title: 'Từ kiểm định đến bảo hành',
    times: ['5 ngày làm việc', '2 ngày', '2–8 tuần', '90 ngày'],
    notes: [
      'Đầu tiên, kiểm định code, máy chủ và cơ sở dữ liệu thật, báo cáo mọi rủi ro.',
      'Tiếp theo, báo giá trọn gói, liệt kê từng dòng.',
      'Trong quá trình làm, sửa theo từng việc nhỏ kiểm tra được, bàn giao và cập nhật hằng tuần.',
      'Sau bàn giao, bảo hành 90 ngày. Nếu phần việc của chúng tôi có lỗi, chúng tôi sửa miễn phí.',
    ],
  },
  audit: {
    title: ['Kiểm định ', 'mọi tầng'],
    intro: 'Trong năm ngày làm việc, chúng tôi mở từng tầng của hệ thống, từ màn hình cho đến những người vận hành nó.',
    layers: [
      { layer: 'Màn hình và tính năng', check: 'Mọi tính năng trong hợp đồng có thực sự hoạt động không?' },
      { layer: 'Code', check: 'Mã nguồn có khớp với bản đang chạy không? Cấu trúc có sửa tiếp được không?' },
      { layer: 'Cơ sở dữ liệu', check: 'Dữ liệu đúng, có sao lưu và khôi phục được thật.' },
      { layer: 'Máy chủ và đám mây', check: 'Phiên bản đã hết hỗ trợ chưa? Ai đang giữ mật khẩu?' },
      { layer: 'Bảo mật', check: 'Lỗ hổng đã biết, mật khẩu trong code và quyền truy cập mở quá mức.' },
      { layer: 'Con người và kiến thức', check: 'Ai biết gì, và điều gì chưa ai ghi lại.' },
    ],
    closing: 'Kết quả là một Audit Report cho biết cái gì hỏng, cái gì rủi ro và nên sửa gì trước.',
  },
  showcase: {
    label: 'Những gì bạn nhận được',
    tablist: 'Tài liệu bạn nhận được',
    note: 'Mẫu tài liệu thật bạn sẽ nhận, từ một dự án thật: hệ thống quản lý kho của một công ty phân phối.',
    mock: 'Lưu ý: toàn bộ dữ liệu là mock-up để bảo mật thông tin khách hàng.',
  },
  team: {
    title: ['Đội ngũ từ các hãng', 'tư vấn toàn cầu'],
    photoCaption: 'Ảnh: đường Borommaratchachonnani, Bangkok',
    photoAlt: 'Đường Borommaratchachonnani, Bangkok, đường trên cao phía trên dòng xe đông đúc',
    points: [
      {
        heading: 'Chuẩn dự án lớn cho công việc mọi quy mô',
        body: 'Khi ai cũng có thể tạo code bằng AI, điều phân biệt dự án sống sót với dự án đổ vỡ là người chăm lo nó. Đội ngũ của chúng tôi đến từ các công ty tư vấn toàn cầu, mang cách làm kiểm định, thiết kế hệ thống và bàn giao chuẩn cao vào việc sửa và vận hành hệ thống cho bạn, từ việc nhỏ đến quy mô doanh nghiệp.',
      },
      {
        heading: 'Cứu dự án đắt tiền mà không phát sinh chi phí',
        body: 'Chúng tôi hiểu nỗi đau khi trả một khoản lớn mà nhận về hệ thống không dùng được. Vì vậy chúng tôi không tính phí theo giờ không giới hạn. Mọi việc đều chốt giá trọn gói trước khi bắt đầu và được liệt kê rõ từng dòng trong báo giá.',
      },
    ],
    cta: 'Trò chuyện với đội ngũ',
  },
  faq: {
    title: 'Trước khi bắt đầu',
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
    city: 'Bangkok',
    copyright: '© 2026 BoromTech',
    credits: 'Một số hình minh họa được tạo bằng AI · Ảnh chụp từ Wikimedia Commons:',
    by: 'của',
    video: 'video',
  },
} satisfies typeof th
