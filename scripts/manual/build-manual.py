#!/usr/bin/env python3
"""Builds the user manual: docs/manual/คู่มือการใช้งาน.pdf

1. Draws numbered markers with arrows on the screenshots in docs/manual/shots/
   (taken by scripts/manual/shots.sh; desktop views only)
   → docs/manual/annotated/*.png
2. Writes docs/manual/manual.html (TH SarabunPSK) and prints it to PDF with
   headless Google Chrome.

Run:  python3 scripts/manual/build-manual.py
"""
from __future__ import annotations

import math
import subprocess
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SHOTS = ROOT / "docs/manual/shots"
OUT = ROOT / "docs/manual/annotated"
HTML = ROOT / "docs/manual/manual.html"
PDF = ROOT / "docs/manual/คู่มือการใช้งาน.pdf"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
FONT_BOLD = ROOT / "docs/manual/fonts/Sarabun-Bold.ttf"  # OFL, Arabic digits

ORANGE = (196, 81, 15)
WHITE = (255, 255, 255)


@dataclass
class Callout:
    n: int
    target: tuple[int, int]  # arrow tip (page pixels)
    badge: tuple[int, int]  # where the numbered circle sits
    text: str  # legend entry


@dataclass
class Figure:
    key: str
    title: str
    src: str
    crop: tuple[int, int, int, int] | None  # left, top, right, bottom in the source image
    intro: str
    callouts: list[Callout]


C = Callout
FIGURES: list[Figure] = [
    Figure(
        "overview-top", "หน้าภาพรวม (ส่วนบน): ส่วนหัว ปีที่ประเมิน และสรุปผล", "overview.png", (0, 0, 1400, 700),
        "หน้าแรกของระบบ สรุปผลการตรวจสอบของอาจารย์ทั้งคณะในปีที่ประเมิน",
        [
            C(1, (75, 118), (75, 60), "แท็บหลัก 3 หน้า: ภาพรวม, รายชื่ออาจารย์ (ตัวเลข = จำนวนอาจารย์) และ เพิ่มผลงานด้วยตนเอง (สำหรับผู้ดูแล)"),
            C(2, (1260, 117), (1130, 60), "วันและเวลาที่ข้อมูลอัปเดตล่าสุด ระบบดึงข้อมูลจาก Google Scholar, OpenAlex และ Scopus ให้อัตโนมัติทุกวัน"),
            C(3, (128, 218), (330, 240), "ปีที่ประเมิน เลือกได้จากเมนู ช่วงผลงาน 5 ปีจะเลื่อนตาม (เปิดหน้าใหม่จะกลับมาที่ปีปัจจุบัน)"),
            C(4, (380, 470), (560, 365), "กรอบสรุป: จำนวนอาจารย์ที่ผ่านครบทุกหน้าที่ และจำนวนผู้มีคุณสมบัติเป็นผู้รับผิดชอบหลักสูตรแต่ละระดับ เทียบกับจำนวนขั้นต่ำ"),
            C(5, (1050, 470), (1300, 365), "กรอบเตือน: จำนวนผู้ที่ยังไม่ผ่านบางหน้าที่ และผู้ที่ปีหน้าอาจไม่ผ่านถ้าไม่มีผลงานเพิ่ม คลิกตัวเลขเพื่อเปิดรายชื่อที่กรองไว้แล้ว"),
            C(6, (160, 575), (250, 660), "การ์ดตัวเลขหลัก: อาจารย์ทั้งหมด, ผู้รับผิดชอบหลักสูตร ป.ตรี/ป.โท/ป.เอก (ป้าย ผ่าน = หลักสูตรมีครบตามเกณฑ์) และจำนวนผลงานในช่วง 5 ปี (นับผลงานไม่ซ้ำ)"),
            C(7, (1305, 315), (1200, 270), "พิมพ์หน้านี้ หรือบันทึกเป็น PDF"),
        ],
    ),
    Figure(
        "overview-charts", "หน้าภาพรวม (ส่วนกลาง): กราฟสรุป", "overview.png", (0, 700, 1400, 1340),
        "สามกราฟสรุปภาพรวมของคณะ: สัดส่วนผลการประเมิน จำนวนผู้ผ่านแต่ละหน้าที่ และผลงานต่อปี",
        [
            C(1, (230, 1080), (330, 800), "สัดส่วนอาจารย์ตามผลการประเมิน: ผ่านครบทุกหน้าที่ / ผ่านบางหน้าที่ / ไม่ผ่านทุกหน้าที่ (หน้าที่ระดับบัณฑิตศึกษา)"),
            C(2, (650, 1000), (650, 1310), "จำนวนผู้ผ่านแต่ละหน้าที่ แยกแถบสีตามระดับ: ส้ม = ป.ตรี (ข้อ 10.1), น้ำเงิน = ป.โท (ข้อ 9.3), เขียว = ป.เอก (ข้อ 9.4)"),
            C(3, (1110, 930), (1310, 1310), "ผลงานต่อปีแยกประเภท: วารสารนานาชาติ (อยู่ใน Scopus), ระดับชาติ (TCI กลุ่ม 1–2), อื่น ๆ, Proceedings, โปสเตอร์ กรอบเขียวประ = ช่วง 5 ปีที่ใช้ประเมิน"),
            C(4, (1110, 1170), (980, 1310), "ตารางสรุปจำนวนผลงานแยกประเภท ช่วง 5 ปี (นับซ้ำตามรายชื่ออาจารย์ ผลงานร่วมนับให้ทุกคน)"),
        ],
    ),
    Figure(
        "overview-bottom", "หน้าภาพรวม (ส่วนล่าง): ผลงานในช่วง 5 ปีของอาจารย์แต่ละคน", "overview.png", (0, 1340, 1400, 2600),
        "กราฟแท่งแนวนอนของอาจารย์ทุกคน เรียงจากมากไปน้อย เทียบกับเกณฑ์ขั้นต่ำของระดับที่เลือก",
        [
            C(1, (480, 1445), (300, 1400), "สวิตช์ระดับ: ระดับปริญญาตรี (เกณฑ์ ≥ 1 เรื่อง) หรือ ระดับบัณฑิตศึกษา (เกณฑ์ ≥ 3 เรื่อง)"),
            C(2, (830, 1445), (1050, 1400), "สวิตช์มุมมอง: งานวิจัย/ผลงานอื่น หรือ แยกตามประเภทผลงาน (วารสารนานาชาติ, ระดับชาติ, อื่น ๆ, Proceedings, โปสเตอร์)"),
            C(3, (300, 1700), (160, 1560), "เส้นเขียว = เกณฑ์จำนวนผลงานขั้นต่ำ แท่งที่สั้นกว่าเส้นนี้คือยังไม่ถึงเกณฑ์"),
            C(4, (640, 1640), (900, 1560), "แท่ง = จำนวนผลงานในช่วง 5 ปีของแต่ละคน (สีเข้ม = งานวิจัย, ลายเฉียง = ผลงานอื่น) ชี้ที่ชื่อหรือแท่งเพื่อดูรายละเอียด"),
            C(5, (700, 2255), (900, 2400), "กรอบแดง = ไม่ผ่านบางหน้าที่ของระดับนั้น, กรอบเหลือง = ปีหน้าอาจไม่ผ่านถ้าไม่มีผลงานเพิ่ม"),
        ],
    ),
    Figure(
        "lecturers-cards", "หน้ารายชื่ออาจารย์ (มุมมองคอลัมน์)", "lecturers-cards.png", (0, 150, 1400, 1300),
        "แสดงผลของอาจารย์แต่ละคนเป็นการ์ด หนึ่งคนหนึ่งคอลัมน์ ครบทั้ง 13 หน้าที่",
        [
            C(1, (190, 370), (470, 325), "ช่องค้นหาชื่ออาจารย์ (ไทยหรืออังกฤษ)"),
            C(2, (520, 370), (520, 250), "ตัวกรอง: ทั้งหมด / มีหน้าที่ไม่ผ่าน / ปีหน้าอาจไม่ผ่าน เมื่อเลือกกรองจะมีสวิตช์เลือกระดับที่พิจารณาเพิ่มขึ้นมา"),
            C(3, (765, 370), (820, 250), "สลับมุมมอง: คอลัมน์ (การ์ด) หรือ ตาราง"),
            C(4, (1250, 315), (1100, 250), "ดาวน์โหลดผลทั้งหมดเป็น CSV (เปิดใน Excel ได้) หรือพิมพ์/บันทึก PDF"),
            C(5, (310, 445), (362, 445), "ชื่ออาจารย์ และจำนวนหน้าที่ที่ผ่าน / ทั้งหมด 13 หน้าที่ (3 ป.ตรี + 5 ป.โท + 5 ป.เอก)"),
            C(6, (150, 485), (362, 492), "ตำแหน่งวิชาการ วุฒิสูงสุด และปีที่จบ (พ.ศ.)"),
            C(7, (190, 735), (362, 735), "ผลแต่ละหน้าที่ แยกกรอบสีตามระดับ: ส้ม ป.ตรี, น้ำเงิน ป.โท, เขียว ป.เอก"),
            C(8, (868, 410), (868, 250), "การ์ดกรอบแดง = มีหน้าที่ที่ไม่ผ่านในปีที่ประเมิน"),
            C(9, (1205, 537), (1100, 250), "กรอบเหลือง = ถ้าปีหน้าไม่มีผลงานเพิ่มจะไม่ผ่าน (ระบุจำนวนหน้าที่)"),
            C(10, (820, 1255), (1000, 1200), "คลิกเพื่อเปิดหน้ารายบุคคล ดูเหตุผลและรายการผลงาน"),
        ],
    ),
    Figure(
        "lecturers-table", "หน้ารายชื่ออาจารย์ (มุมมองตาราง)", "lecturers-table.png", (0, 250, 1400, 1200),
        "ตารางเมทริกซ์ อาจารย์ × หน้าที่ เหมาะสำหรับดูภาพรวมทั้งคณะในหน้าเดียวและพิมพ์",
        [
            C(1, (760, 425), (760, 300), "หัวตารางแยกสีตามระดับ ป.ตรี (10.1) / ป.โท (9.3) / ป.เอก (9.4) แต่ละคอลัมน์คือหนึ่งหน้าที่ตามข้อในประกาศ"),
            C(2, (115, 580), (300, 650), "คลิกชื่อเพื่อเปิดหน้ารายบุคคล"),
            C(3, (38, 700), (300, 760), "แถบซ้ายสีแดง = ไม่ผ่านบางหน้าที่"),
            C(4, (110, 790), (300, 870), "แถบซ้ายสีเหลือง = ปีหน้าอาจไม่ผ่าน ถ้าไม่มีผลงานเพิ่ม"),
            C(5, (750, 870), (900, 980), "ช่องผล: ✓ ผ่าน / ✗ ไม่ผ่าน ชี้เมาส์ที่ช่องเพื่อดูเหตุผล"),
        ],
    ),
    Figure(
        "person", "หน้ารายบุคคล (ส่วนบน): ข้อมูลอาจารย์และผลตามหน้าที่", "person.png", (0, 150, 1400, 1100),
        "เปิดจากชื่ออาจารย์ในหน้ารายชื่อ หรือจากกราฟในหน้าภาพรวม แสดงเหตุผลของผลแต่ละหน้าที่",
        [
            C(1, (95, 285), (300, 285), "กลับไปหน้ารายชื่ออาจารย์"),
            C(2, (700, 405), (900, 320), "ข้อมูลอาจารย์: ตำแหน่งวิชาการ วุฒิสูงสุด (สาขา) ปีที่สำเร็จการศึกษา และลิงก์โปรไฟล์ Google Scholar"),
            C(3, (445, 620), (260, 530), "ผลของแต่ละหน้าที่ (ผ่าน / ไม่ผ่าน) ตามลำดับข้อในประกาศ"),
            C(4, (950, 1000), (1200, 870), "เหตุผล: คุณวุฒิหรือตำแหน่งที่ข้อนั้นต้องการ และจำนวนผลงานที่ต้องการเทียบกับที่มีในช่วง 5 ปี"),
            C(5, (1305, 485), (1200, 585), "ดาวน์โหลดผลและรายการผลงานของคนนี้เป็น CSV"),
        ],
    ),
    Figure(
        "person-pubs", "หน้ารายบุคคล (ส่วนล่าง): รายการผลงานที่นับ", "person.png", (0, 1690, 1400, 2080),
        "รายการผลงานในช่วง 5 ปีที่ระบบนับให้อาจารย์คนนี้ พร้อมที่มาของข้อมูล",
        [
            C(1, (1140, 1725), (980, 1725), "ติ๊ก แสดงทุกปี เพื่อดูผลงานนอกช่วง 5 ปีด้วย"),
            C(2, (1305, 1725), (1330, 1815), "ดาวน์โหลดรายการผลงานเป็น CSV"),
            C(3, (500, 1830), (300, 2040), "ชื่อเรื่อง แหล่งตีพิมพ์ และแหล่งข้อมูลที่พบผลงานนี้ (Scholar / OpenAlex / Scopus) พร้อมลิงก์ DOI"),
            C(4, (1080, 1830), (980, 2040), "ประเภทผลงาน (วารสาร / Proceedings / โปสเตอร์) และป้ายฐานข้อมูลวารสาร: Scopus = นานาชาติ, TCI 1–2 = ระดับชาติ"),
            C(5, (1230, 1830), (1230, 2040), "เป็นงานวิจัยหรือไม่ และนับตามเกณฑ์หรือไม่"),
        ],
    ),
    Figure(
        "admin", "หน้าเพิ่มผลงานด้วยตนเอง (ผู้ดูแลระบบ)", "admin.png", (300, 150, 1100, 700),
        "สำหรับเพิ่มผลงานที่ระบบดึงอัตโนมัติไม่พบ เช่น บทความในวารสารไทยหรือการประชุมระดับชาติ ต้องใช้รหัสผู้ดูแล",
        [
            C(1, (700, 463), (420, 400), "ใส่รหัสผู้ดูแล (ขอได้จากผู้ดูแลระบบ ไม่ควรแชร์)"),
            C(2, (521, 514), (420, 580), "ติ๊กเพื่อจำรหัสบนเครื่องส่วนตัว ถ้าไม่ติ๊ก ระบบจำไว้จนปิดเบราว์เซอร์"),
            C(3, (700, 591), (980, 650), "เข้าสู่ส่วนผู้ดูแล จากนั้นกรอกแบบฟอร์มเพิ่มผลงาน (ชื่ออาจารย์ ชื่อเรื่อง แหล่งตีพิมพ์ ปี ประเภท DOI) ระบบจะดึงเข้ามาในการอัปเดตประจำวัน"),
        ],
    ),
]


def draw_callouts(img: Image.Image, fig: Figure) -> Image.Image:
    left, top = (fig.crop[0], fig.crop[1]) if fig.crop else (0, 0)
    if fig.crop:
        img = img.crop(fig.crop)
    img = img.convert("RGB")
    d = ImageDraw.Draw(img)
    r = 22
    font = ImageFont.truetype(str(FONT_BOLD), 26)
    for c in fig.callouts:
        tx, ty = c.target[0] - left, c.target[1] - top
        bx, by = c.badge[0] - left, c.badge[1] - top
        # Arrow from the badge edge to the target, with a white halo for contrast.
        ang = math.atan2(ty - by, tx - bx)
        sx, sy = bx + r * math.cos(ang), by + r * math.sin(ang)
        d.line([(sx, sy), (tx, ty)], fill=WHITE, width=7)
        d.line([(sx, sy), (tx, ty)], fill=ORANGE, width=3)
        head = 14
        p1 = (tx - head * math.cos(ang - 0.45), ty - head * math.sin(ang - 0.45))
        p2 = (tx - head * math.cos(ang + 0.45), ty - head * math.sin(ang + 0.45))
        d.polygon([(tx, ty), p1, p2], fill=ORANGE, outline=WHITE)
        d.ellipse([bx - r - 2, by - r - 2, bx + r + 2, by + r + 2], fill=WHITE)
        d.ellipse([bx - r, by - r, bx + r, by + r], fill=ORANGE)
        d.text((bx, by - 2), str(c.n), fill=WHITE, font=font, anchor="mm")
    return img


def build_images() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for fig in FIGURES:
        src = SHOTS / fig.src
        if not src.exists():
            raise SystemExit(f"missing screenshot {src}; run scripts/manual/shots.sh first")
        draw_callouts(Image.open(src), fig).save(OUT / f"{fig.key}.png", optimize=True)
        print(f"  annotated/{fig.key}.png")


INTRO = """
<p>ระบบตรวจสอบคุณสมบัติอาจารย์เป็นเว็บไซต์สำหรับตรวจว่าอาจารย์ของคณะพลังงานและสิ่งแวดล้อมแต่ละคนมีคุณสมบัติ
ทำหน้าที่ใดได้บ้างตามเกณฑ์มาตรฐานหลักสูตรระดับปริญญาตรี พ.ศ. 2565 (ข้อ 10.1) และระดับบัณฑิตศึกษา พ.ศ. 2565
(ข้อ 9.3 และ 9.4) โดยดูจากวุฒิการศึกษา ตำแหน่งวิชาการ และจำนวนผลงานทางวิชาการในช่วง 5 ปีย้อนหลัง</p>
<p>เข้าใช้งานได้ที่ <b>https://smalltee2.github.io/seen-faculty-screening/</b> จากคอมพิวเตอร์ แท็บเล็ต หรือโทรศัพท์
ไม่ต้องเข้าสู่ระบบ (ยกเว้นส่วนเพิ่มผลงานของผู้ดูแล) ข้อมูลผลงานดึงจาก Google Scholar, OpenAlex และ Scopus
และอัปเดตให้อัตโนมัติทุกวัน หากมีข้อมูลใหม่ขณะเปิดหน้าอยู่ ระบบจะโหลดหน้าใหม่ให้เอง</p>
<h3>เกณฑ์ที่ระบบใช้โดยย่อ</h3>
<table class="rules">
<tr><th>ระดับ</th><th>หน้าที่</th><th>คุณวุฒิ / ตำแหน่ง</th><th>ผลงานใน 5 ปี</th></tr>
<tr><td rowspan="2">ปริญญาตรี (ข้อ 10.1)</td><td>อาจารย์ประจำหลักสูตร, ผู้รับผิดชอบหลักสูตร</td><td>ปริญญาโท หรือ ผศ. ขึ้นไป</td><td>≥ 1 เรื่อง</td></tr>
<tr><td>อาจารย์ผู้สอน</td><td>ปริญญาโท หรือ ผศ. ขึ้นไป</td><td>ไม่กำหนด</td></tr>
<tr><td rowspan="3">ปริญญาโท (ข้อ 9.3)</td><td>อาจารย์ประจำหลักสูตร, อาจารย์ผู้สอน</td><td>ปริญญาเอก หรือ ปริญญาโท + รศ.</td><td>≥ 3 เรื่อง (วิจัย ≥ 1)</td></tr>
<tr><td>ผู้รับผิดชอบหลักสูตร, ที่ปรึกษาวิทยานิพนธ์หลัก, ผู้สอบวิทยานิพนธ์</td><td>ปริญญาเอก หรือ ปริญญาโท + รศ.</td><td>≥ 3 เรื่อง (วิจัย ≥ 1)</td></tr>
<tr><td>อาจารย์ใหม่ (ข้อ 9.3.6)</td><td colspan="2">ปริญญาเอกที่จบไม่เกิน 5 ปี ใช้เกณฑ์ผ่อนผันตามจำนวนปีที่จบ</td></tr>
<tr><td rowspan="2">ปริญญาเอก (ข้อ 9.4)</td><td>อาจารย์ประจำหลักสูตร, ที่ปรึกษา, ผู้สอบ, อาจารย์ผู้สอน</td><td>ปริญญาเอก หรือ ปริญญาโท + รศ.</td><td>งานวิจัย ≥ 3 เรื่อง</td></tr>
<tr><td>ผู้รับผิดชอบหลักสูตร</td><td>ปริญญาเอก หรือ ปริญญาโท + ศ.</td><td>งานวิจัย ≥ 3 เรื่อง</td></tr>
</table>
<p class="small">ผลงานที่นับ: บทความวารสาร, proceedings ฉบับเต็ม, โปสเตอร์/บทคัดย่อในงานประชุม ช่วง 5 ปี = ปีที่ประเมินและ 4 ปีก่อนหน้า
ผลงานที่มีผู้เขียนร่วมหลายคนนับให้ทุกคน รายละเอียดเกณฑ์ฉบับเต็มดูได้จากลิงก์ท้ายหน้าเว็บ</p>
"""

FAQ = """
<h2>คำถามที่พบบ่อย</h2>
<dl>
<dt>ทำไมผลงานบางเรื่องไม่ปรากฏ</dt>
<dd>ระบบดึงจาก Google Scholar, OpenAlex และ Scopus ถ้าผลงานไม่อยู่ในฐานเหล่านี้ (เช่น การประชุมระดับชาติบางรายการ)
ให้ผู้ดูแลเพิ่มผ่านแท็บ "เพิ่มผลงานด้วยตนเอง" ระบบจะนำเข้าในการอัปเดตวันถัดไป</dd>
<dt>วารสารนานาชาติ / ระดับชาติ ตัดสินอย่างไร</dt>
<dd>บทความที่อยู่ใน Scopus หรือตีพิมพ์ในวารสารที่ Scopus จัดทำดัชนี = นานาชาติ; วารสารใน TCI กลุ่ม 1–2 = ระดับชาติ; นอกนั้น = อื่น ๆ
การแบ่งนี้ใช้เพื่อแสดงผลเท่านั้น ไม่มีผลต่อการผ่าน/ไม่ผ่าน</dd>
<dt>"ปีหน้าอาจไม่ผ่าน" หมายความว่าอย่างไร</dt>
<dd>เมื่อขึ้นปีถัดไป ช่วง 5 ปีจะเลื่อนไป 1 ปี ผลงานปีเก่าสุดจะหลุดออกจากช่วง ระบบจึงเตือนล่วงหน้าว่าถ้าไม่มีผลงานใหม่ในปีถัดไป
จะไม่ผ่านหน้าที่ใดบ้าง</dd>
<dt>ต้องการดูผลของปีอื่น</dt>
<dd>เลือกปีจากเมนู "ปีที่ประเมิน" มุมซ้ายบน ทุกหน้าจะคำนวณใหม่ตามปีนั้นทันที</dd>
<dt>ข้อมูลอาจารย์ (วุฒิ ตำแหน่ง ปีที่จบ) ไม่ถูกต้อง</dt>
<dd>แจ้งผู้ดูแลระบบเพื่อแก้ไขในไฟล์ข้อมูลอาจารย์ ระบบจะคำนวณใหม่หลังอัปเดต</dd>
</dl>
"""


THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"]


def thai_date() -> str:
    import datetime

    d = datetime.date.today()
    return f"{d.day} {THAI_MONTHS[d.month - 1]} {d.year + 543}"


def build_html() -> None:
    parts = [
        """<!doctype html><html lang="th"><head><meta charset="utf-8">
<title>คู่มือการใช้งาน ระบบตรวจสอบคุณสมบัติอาจารย์</title>
<style>
@page { size: A4 landscape; margin: 14mm 14mm 16mm; }
@font-face { font-family: "Sarabun"; src: url("fonts/Sarabun-Regular.ttf"); font-weight: 400; }
@font-face { font-family: "Sarabun"; src: url("fonts/Sarabun-Bold.ttf"); font-weight: 700; }
html { font-family: "Sarabun", sans-serif; font-size: 13pt; line-height: 1.4; color: #1b1b1b; }
body { margin: 0; }
h1 { font-size: 26pt; color: #1d5c33; margin: 0 0 4mm; border-left: 6px solid #f37225; padding-left: 6mm; }
h2 { font-size: 18pt; color: #1d5c33; margin: 0 0 3mm; padding-top: 3mm; }
h3 { font-size: 14pt; margin: 4mm 0 2mm; }
p { margin: 0 0 3mm; }
.small { font-size: 11.5pt; color: #444; }
.cover { height: 180mm; display: flex; flex-direction: column; justify-content: center; }
.cover .org { font-size: 16pt; color: #444; }
.cover .date { margin-top: 12mm; font-size: 13pt; color: #444; }
.page { page-break-before: always; padding-top: 5mm; }
.fig { display: grid; grid-template-columns: 1fr 92mm; gap: 6mm; align-items: start; break-inside: avoid; }
.fig img { max-width: 100%; max-height: 138mm; width: auto; height: auto; display: block; margin: 0 auto; border: 1px solid #cfd6cf; border-radius: 4px; }
.fig.tall img { max-height: 150mm; }
.fig.wide { grid-template-columns: 1fr; }
.fig.wide img { max-height: 105mm; }
.fig.wide ol.legend { columns: 2; column-gap: 8mm; }
.fig.wide ol.legend li { break-inside: avoid; }
ol.legend { margin: 0; padding-left: 0; list-style: none; font-size: 11.5pt; line-height: 1.35; }
ol.legend li { display: grid; grid-template-columns: 8mm 1fr; gap: 2mm; margin-bottom: 1.8mm; }
ol.legend b { display: inline-block; width: 6.5mm; height: 6.5mm; line-height: 6.5mm; text-align: center; border-radius: 50%; background: #c4510f; color: #fff; font-size: 10.5pt; }
table.rules { border-collapse: collapse; width: 100%; font-size: 12pt; }
table.rules th, table.rules td { border: 1px solid #b9c4b9; padding: 1.2mm 2.5mm; text-align: left; vertical-align: top; }
table.rules th { background: #e9f1ea; }
dl dt { font-weight: bold; margin-top: 3mm; }
dl dd { margin: 0 0 1mm 0; }
</style></head><body>
<div class="cover">
  <h1>คู่มือการใช้งาน<br>ระบบตรวจสอบคุณสมบัติอาจารย์</h1>
  <div class="org">คณะพลังงานและสิ่งแวดล้อม มหาวิทยาลัยพะเยา<br>ตามเกณฑ์มาตรฐานหลักสูตรระดับปริญญาตรี และระดับบัณฑิตศึกษา พ.ศ. 2565</div>
  <div class="date">https://smalltee2.github.io/seen-faculty-screening/ · ฉบับวันที่ """
        + thai_date()
        + """</div>
</div>
<div class="page"><h2>ระบบนี้คืออะไร</h2>"""
        + INTRO
        + "</div>"
    ]
    for i, fig in enumerate(FIGURES, 1):
        legend = "".join(f"<li><b>{c.n}</b><span>{c.text}</span></li>" for c in fig.callouts)
        tall = " wide" if fig.key in ("overview-charts", "person-pubs") else " tall" if fig.key == "overview-bottom" else ""
        parts.append(
            f'<div class="page"><h2>{i}. {fig.title}</h2><p>{fig.intro}</p>'
            f'<div class="fig{tall}"><img src="annotated/{fig.key}.png" alt="{fig.title}"><ol class="legend">{legend}</ol></div></div>'
        )
    parts.append('<div class="page">' + FAQ + "</div>")
    parts.append("</body></html>")
    HTML.write_text("\n".join(parts), encoding="utf-8")
    print(f"  {HTML.relative_to(ROOT)}")


def build_pdf() -> None:
    subprocess.run(
        [CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--virtual-time-budget=5000",
         f"--print-to-pdf={PDF}", HTML.as_uri()],
        check=True, capture_output=True,
    )
    print(f"  {PDF.relative_to(ROOT)} ({PDF.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    print("[manual] annotating screenshots")
    build_images()
    print("[manual] writing HTML")
    build_html()
    print("[manual] printing PDF")
    build_pdf()
