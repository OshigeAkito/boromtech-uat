// The sample deliverables in the showcase. Thai pages show them in Thai; every other locale shows them in English,
// in the terms an engineering lead expects. Dates in the Thai copy use the Buddhist era.
const en = {
  lang: 'en',
  tabs: { audit: 'Audit Report', weekly: 'Weekly Update', warranty: 'Warranty' },
  severity: { critical: 'Critical', high: 'High', mid: 'Medium' },
  audit: {
    head: 'Audit Report · BT-A-0412',
    title: 'Inventory Management System · Sample Engagement',
    meta: 'Assessment window 3–7 Nov 2026 · 182,400 LOC · 3 production hosts',
    findings: [
      'Hard-coded database credentials committed to source and replicated across every backup artifact',
      'No automated backup policy. Effective RPO is 41 days, the age of the last restorable snapshot',
      'Runtime is PHP 5.6, end-of-life with no security patches since December 2018',
      'Sales reporting rounds before aggregation, introducing cumulative variance in totals',
      'Configuration drift: production source is 7 months ahead of the version-controlled repository',
    ],
  },
  weekly: {
    head: 'Weekly Update · Sprint 3 of 6',
    title: '7 of 12 work items closed',
    status: { done: 'Verified', review: 'In review', work: 'In progress' },
    tasks: [
      'Recover production source and re-baseline it in Git',
      'Migrate credentials out of code into a managed secrets store',
      'Automated nightly backups at 02:00, with a tested restore',
      'Fix the rounding defect in sales aggregation',
      'Upgrade the inventory module to PHP 8.3',
    ],
    next: 'Next sprint: upgrade the orders module and run regression tests against October sales data.',
  },
  warranty: {
    head: 'Warranty · BT-W-0412',
    title: '90-Day Warranty',
    terms: [
      ['Scope', 'Work items BT-104 to BT-115 (12 items)'],
      ['Effective', '1 Dec 2026'],
      ['Expires', '1 Mar 2027'],
      ['SLA', 'Defects attributable to BoromTech work are remediated at no cost within 2 business days of report.'],
    ],
  },
}

const th: typeof en = {
  lang: 'th',
  tabs: { audit: 'รายงานผลตรวจสอบ', weekly: 'สรุปงานรายสัปดาห์', warranty: 'ใบรับประกัน' },
  severity: { critical: 'วิกฤต', high: 'สูง', mid: 'ปานกลาง' },
  audit: {
    head: 'รายงานผลตรวจสอบ · BT-A-0412',
    title: 'ระบบบริหารสต็อกสินค้า · ตัวอย่างงานจริง',
    meta: 'ช่วงตรวจสอบ 3–7 พ.ย. 2569 · โค้ด 182,400 บรรทัด · เซิร์ฟเวอร์โปรดักชัน 3 เครื่อง',
    findings: [
      'รหัสผ่านฐานข้อมูลถูกเขียนไว้ในซอร์สโค้ด และติดไปกับไฟล์แบ็กอัปทุกชุด',
      'ไม่มีนโยบายแบ็กอัปอัตโนมัติ ข้อมูลล่าสุดที่กู้คืนได้มีอายุ 41 วัน',
      'รันบน PHP 5.6 ที่หมดซัพพอร์ตแล้ว ไม่มีแพตช์ความปลอดภัยตั้งแต่ ธ.ค. 2561',
      'รายงานยอดขายปัดเศษก่อนรวมยอด ทำให้ยอดรวมคลาดเคลื่อนสะสม',
      'โค้ดบนโปรดักชันล้ำหน้าโค้ดใน Git ไป 7 เดือน เวอร์ชันไม่ตรงกัน',
    ],
  },
  weekly: {
    head: 'สรุปงานรายสัปดาห์ · สปรินต์ 3 จาก 6',
    title: 'ปิดงานแล้ว 7 จาก 12 รายการ',
    status: { done: 'ตรวจแล้ว', review: 'รอตรวจ', work: 'กำลังทำ' },
    tasks: [
      'กู้ซอร์สโค้ดจากโปรดักชัน แล้วเก็บเข้า Git ใหม่',
      'ย้ายรหัสผ่านออกจากโค้ดไปเก็บในระบบจัดการรหัสลับ',
      'ตั้งแบ็กอัปอัตโนมัติทุกคืนเวลา 02:00 พร้อมทดสอบกู้คืน',
      'แก้บั๊กการปัดเศษในการรวมยอดขาย',
      'อัปเกรดโมดูลสต็อกเป็น PHP 8.3',
    ],
    next: 'สปรินต์ถัดไป: อัปเกรดโมดูลคำสั่งซื้อ และทดสอบย้อนหลังกับข้อมูลยอดขายเดือนตุลาคม',
  },
  warranty: {
    head: 'ใบรับประกัน · BT-W-0412',
    title: 'รับประกัน 90 วัน',
    terms: [
      ['ขอบเขต', 'งาน BT-104 ถึง BT-115 (12 รายการ)'],
      ['เริ่มมีผล', '1 ธ.ค. 2569'],
      ['สิ้นสุด', '1 มี.ค. 2570'],
      ['SLA', 'หากพบข้อบกพร่องจากงานของ BoromTech เราแก้ไขให้โดยไม่มีค่าใช้จ่าย ภายใน 2 วันทำการหลังได้รับแจ้ง'],
    ],
  },
}

export const sampleDocs = (locale: string) => (locale === 'th' ? th : en)
