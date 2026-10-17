export const site = {
  name: 'BoromTech',
  email: 'hello@boromtech.co',
  city: 'กรุงเทพมหานคร',
  title: 'BoromTech · รีสโตร์เลกาซีซิสเต็ม และโปรเจกต์ที่ถูกทิ้ง พร้อมการันตี',
  description:
    'BoromTech รับช่วงต่อเลกาซีซิสเต็มที่ไม่มีใครรับ และโปรเจกต์ที่เวนเดอร์ทิ้งไว้กลางทาง ออดิตฟิกซ์ไพรซ์ ใบเสนอราคาแจกแจงทุกบรรทัด และการันตีทุกงาน 90 วัน',
  auditPrice: '฿25,000',
}

export const symptoms = [
  { symptom: 'เวนเดอร์เดิมติดต่อไม่ได้', remedy: 'เรารับแฮนด์โอเวอร์จากซิสเต็มที่รันอยู่จริง โดยไม่ต้องรอใคร' },
  { symptom: 'ไม่มีซอร์สโค้ด หรือไม่แน่ใจว่าเป็นเวอร์ชันล่าสุด', remedy: 'รีคัฟเวอร์โค้ดจากเซิร์ฟเวอร์โปรดักชัน แล้วเก็บเข้า Git ที่คุณเป็นเจ้าของ' },
  { symptom: 'ไม่มีด็อกคิวเมนต์ ไม่มีใครเข้าใจซิสเต็ม', remedy: 'เขียนด็อกคิวเมนต์และไดอะแกรมใหม่ทั้งหมด จากโค้ดที่รันอยู่จริง' },
  { symptom: 'เฟรมเวิร์กหมดซัพพอร์ต เช่น PHP 5, AngularJS, .NET Framework', remedy: 'วางแผนอัปเกรดทีละส่วน โดยซิสเต็มยังใช้งานได้ตลอดเวลา' },
  { symptom: 'ซิสเต็มล่มหรือช้า โดยหาสาเหตุไม่เจอ', remedy: 'ติดตั้งมอนิเตอริง เก็บล็อก และไล่หารูทคอสจนเจอ' },
  { symptom: 'คนเดียวที่เข้าใจซิสเต็มลาออกไปแล้ว', remedy: 'สัมภาษณ์ทีมผู้ใช้ และไล่โค้ดแทนความรู้ที่หายไป' },
  { symptom: 'งานส่งมอบไม่ครบตามสัญญา', remedy: 'เทียบสโคปในสัญญากับของที่ส่งมอบจริง ทีละรายการ' },
]

export const stages = [
  { key: 'audit', time: '5 วันทำการ', days: 5, note: 'แรกเริ่ม ออดิตโค้ด เซิร์ฟเวอร์ และดาต้าเบสจริง พร้อมรีพอร์ตความเสี่ยงทุกจุด' },
  { key: 'quote', time: '2 วัน', days: 2, note: 'จากนั้น ใบเสนอราคาแบบฟิกซ์ไพรซ์ แจกแจงทุกบรรทัด' },
  { key: 'restore', time: '2–8 สัปดาห์', days: 30, note: 'ระหว่างงาน รีสโตร์เป็นทาสก์ย่อยที่ตรวจได้ ส่งมอบและอัปเดตทุกสัปดาห์' },
  { key: 'warranty', time: '90 วัน', days: 90, note: 'หลังส่งมอบ การันตี 90 วัน หากงานของเรามีปัญหา เราแก้ให้โดยไม่มีค่าใช้จ่าย' },
]

export const faqs = [
  {
    q: 'ไม่มีซอร์สโค้ดเลย ยังรีสโตร์ได้ไหม',
    a: 'ได้ในเคสส่วนใหญ่ เรารีคัฟเวอร์จากเซิร์ฟเวอร์โปรดักชันหรือไฟล์ที่ดีพลอยอยู่ หากรีคัฟเวอร์ไม่ได้ คุณจะรู้ตั้งแต่ในออดิตรีพอร์ต ก่อนจ่ายค่ารีสโตร์ใดๆ',
  },
  {
    q: 'การันตีครอบคลุมอะไรบ้าง',
    a: 'ทุกทาสก์ที่เราส่งมอบ การันตี 90 วัน หากปัญหาเกิดจากงานของเรา เราแก้ให้โดยไม่มีค่าใช้จ่าย ไม่รวมฟีเจอร์ใหม่ และส่วนที่มีผู้อื่นแก้ไขภายหลัง',
  },
  {
    q: 'ราคาคิดอย่างไร',
    a: `ออดิตเป็นฟิกซ์ไพรซ์ ${site.auditPrice} และหักคืนเต็มจำนวนเมื่อรีสโตร์ต่อกับเรา จากนั้นทุกทาสก์มีราคาของตัวเอง คุณเลือกลำดับได้เอง หากสโคปเปลี่ยน เราเสนอราคาใหม่ก่อนเริ่มเสมอ`,
  },
  {
    q: 'รับเทคโนโลยีอะไรบ้าง',
    a: 'PHP, Laravel, WordPress, Java, .NET, Node.js, Python, React และ Angular บนดาต้าเบส MySQL, PostgreSQL, SQL Server และ Oracle ทั้งบนเซิร์ฟเวอร์ของคุณและบนคลาวด์ หากไม่อยู่ในรายการ ส่งมาให้เราดูก่อน',
  },
  {
    q: 'ข้อมูลของเราปลอดภัยไหม',
    a: 'เราเซ็น NDA ก่อนเข้าถึงซิสเต็ม ใช้แอคเคาท์แยกที่คุณเพิกถอนได้ทุกเมื่อ และโค้ดกับด็อกคิวเมนต์ทั้งหมดเป็นของคุณ',
  },
  {
    q: 'เวนเดอร์เดิมยังอยู่ ทำงานร่วมกันได้ไหม',
    a: 'ได้ เราวางแผนแฮนด์โอเวอร์ร่วมกัน เพื่อให้ความรู้ไม่หายไประหว่างทาง',
  },
]

export const credits = [
  { title: 'Sathorn Unique Tower (II)', by: 'Supanut Arunoprayote', licence: 'CC BY 4.0', href: 'https://commons.wikimedia.org/wiki/File:Sathorn_Unique_Tower_(II).jpg' },
  { title: 'Chao Phraya River from King Taksin Bridge', by: 'Supanut Arunoprayote', licence: 'CC BY 4.0', href: 'https://commons.wikimedia.org/w/index.php?curid=114609994' },
  { title: 'Sukhumvit, Bangkok at night', by: 'Slyronit', licence: 'CC BY-SA 4.0', href: 'https://commons.wikimedia.org/wiki/File:Sukhumvit,_Bangkok_at_night.jpg' },
  { title: 'Bangkok Skytrain BTS 3', by: 'kallerna', licence: 'CC BY-SA 4.0', href: 'https://commons.wikimedia.org/wiki/File:Bangkok_Skytrain_BTS_3.jpg' },
  { title: 'Bangkok Skytrain P1110323 (วิดีโอ)', by: 'Deror Avi', licence: 'CC BY-SA 3.0', href: 'https://commons.wikimedia.org/wiki/File:Bangkok_Skytrain_P1110323.ogv' },
]
