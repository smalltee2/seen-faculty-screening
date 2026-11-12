#!/usr/bin/env python3
"""Builds the PowerPoint user manual for lecturers and programme chairs:
docs/manual/ppt/คู่มือการใช้งาน-อาจารย์และประธานหลักสูตร.pptx

Screenshots and the positions of their numbered markers come from
scripts/manual/ppt-shots.mjs (docs/manual/ppt/shots/*.png + *.json); run that first.
Markers are PowerPoint shapes over the pictures, so they stay editable.

Run:  python3 scripts/manual/build-ppt.py
"""
from __future__ import annotations

import json
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Inches, Pt

ROOT = Path(__file__).resolve().parents[2]
SHOTS = ROOT / "docs/manual/ppt/shots"
OUT = ROOT / "docs/manual/ppt/คู่มือการใช้งาน-อาจารย์และประธานหลักสูตร.pptx"
SITE = "https://seen-education-service.pages.dev/sfs_webapp"
EDITION = "ฉบับวันที่ 12 พฤศจิกายน 2569"

FONT = "TH SarabunPSK"  # Thai official documents (Tum's standing rule)
GREEN = RGBColor(0x1D, 0x5C, 0x33)
GREEN_DARK = RGBColor(0x14, 0x40, 0x24)
GREEN_TINT = RGBColor(0xEC, 0xF3, 0xEE)
ORANGE = RGBColor(0xC4, 0x51, 0x0F)
INK = RGBColor(0x22, 0x26, 0x23)
MUTED = RGBColor(0x5B, 0x63, 0x5E)
LINE = RGBColor(0xD5, 0xDB, 0xD7)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
BLANK = prs.slide_layouts[6]
SW, SH = 13.333, 7.5
page_no = 0


def set_font(font, name=FONT):
    """Latin and complex-script (Thai) typefaces: Thai text is drawn with the <a:cs> font, which
    `font.name` alone does not set."""
    font.name = name
    rpr = font._element
    for tag in ("a:ea", "a:cs"):
        el = rpr.find(qn(tag))
        if el is None:
            el = rpr.makeelement(qn(tag), {})
            # schema order inside a:rPr: ln, fills, effects, highlight, uLnTx, uLn, uFillTx, uFill, latin, ea, cs, sym
            latin = rpr.find(qn("a:latin"))
            (latin.addnext(el) if tag == "a:ea" else rpr.find(qn("a:ea")).addnext(el))
        el.set("typeface", name)


def text(slide, x, y, w, h, runs, *, size=20, color=INK, bold=False, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, spacing=None):
    """A text box. `runs` is a string, or a list of paragraphs; a paragraph is a string or a list of
    (text, {bold, color, size}) runs."""
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    for m in ("margin_left", "margin_right", "margin_top", "margin_bottom"):
        setattr(tf, m, 0)
    paras = [runs] if isinstance(runs, str) else runs
    for i, para in enumerate(paras):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        if spacing:
            p.space_after = Pt(spacing)
        parts = [(para, {})] if isinstance(para, str) else para
        for t, o in parts:
            r = p.add_run()
            r.text = t
            f = r.font
            set_font(f)
            f.size = Pt(o.get("size", size))
            f.bold = o.get("bold", bold)
            f.color.rgb = o.get("color", color)
    return box


def rect(slide, x, y, w, h, fill, *, line=None, rounded=True, radius=0.06):
    shp = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE if rounded else MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    shp.fill.solid()
    shp.fill.fore_color.rgb = fill
    if line is None:
        shp.line.fill.background()
    else:
        shp.line.color.rgb = line
        shp.line.width = Pt(1)
    shp.shadow.inherit = False
    if rounded:
        shp.adjustments[0] = radius
    return shp


def badge(slide, cx, cy, n, d=0.34, fill=ORANGE):
    """Numbered circle centred at (cx, cy) inches."""
    c = slide.shapes.add_shape(MSO_SHAPE.OVAL, Inches(cx - d / 2), Inches(cy - d / 2), Inches(d), Inches(d))
    c.fill.solid()
    c.fill.fore_color.rgb = fill
    c.line.color.rgb = WHITE
    c.line.width = Pt(1.5)
    c.shadow.inherit = False
    tf = c.text_frame
    for m in ("margin_left", "margin_right", "margin_top", "margin_bottom"):
        setattr(tf, m, 0)
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run()
    r.text = str(n)
    set_font(r.font)
    r.font.size = Pt(18)
    r.font.bold = True
    r.font.color.rgb = WHITE
    return c


def picture(slide, name, x, y, w, alt):
    """A screenshot with a thin frame; returns (x, y, w, h, scale inches per CSS px) and its marks."""
    path = SHOTS / f"{name}.png"
    meta = json.loads((SHOTS / f"{name}.json").read_text()) if (SHOTS / f"{name}.json").exists() else {"width": 1440, "height": 900, "marks": []}
    h = w * meta["height"] / meta["width"]
    pic = slide.shapes.add_picture(str(path), Inches(x), Inches(y), Inches(w), Inches(h))
    pic.line.color.rgb = LINE
    pic.line.width = Pt(0.75)
    pic._element.nvPicPr.cNvPr.set("descr", alt)
    return (x, y, w, h, w / meta["width"]), meta["marks"]


def place_marks(slide, frame, marks):
    x, y, w, h, k = frame
    r = 0.17
    for m in marks:
        if m.get("missing"):
            raise SystemExit(f"marker {m['n']} was not found on its screenshot; fix ppt-shots.mjs")
        cx = min(max(x + m["x"] * k - 0.02, x + r + 0.02), x + w - r - 0.02)
        cy = min(max(y + (m["y"] + m["h"] / 2) * k, y + r + 0.02), y + h - r - 0.02)
        badge(slide, cx, cy, m["n"])


def footer(slide, dark=False):
    global page_no
    page_no += 1
    col = RGBColor(0xC9, 0xD8, 0xCD) if dark else MUTED
    text(slide, 0.5, SH - 0.42, 8, 0.3, "คู่มือการใช้งาน ระบบตรวจสอบคุณสมบัติอาจารย์ SEEN", size=13, color=col)
    text(slide, SW - 1.5, SH - 0.42, 1.0, 0.3, str(page_no), size=13, color=col, align=PP_ALIGN.RIGHT)


def background(slide, color):
    bg = slide.background.fill
    bg.solid()
    bg.fore_color.rgb = color


def title(slide, t, sub=None):
    text(slide, 0.5, 0.32, 12.3, 0.6, t, size=34, bold=True, color=GREEN)
    if sub:
        text(slide, 0.5, 0.92, 12.3, 0.4, sub, size=18, color=MUTED)


def steps(slide, x, y, w, items, gap=0.12, size=17):
    """Numbered items beside a screenshot: (heading, explanation)."""
    cy = y
    for i, (head, body) in enumerate(items, 1):
        badge(slide, x + 0.17, cy + 0.19, i)
        lines = [[(head, {"bold": True, "size": size + 2, "color": INK})]]
        if body:
            lines.append([(body, {"size": size, "color": MUTED})])
        box = text(slide, x + 0.45, cy, w - 0.45, 0.9, lines)
        # height estimate: heading 0.34", each ~52 Thai characters of body ~0.3"
        n_body = 0 if not body else max(1, -(-len(body) // int((w - 0.45) * 13.5)))
        hgt = 0.36 + 0.29 * n_body
        box.height = Inches(hgt)
        cy += hgt + gap
    return cy


def shot_slide(section, heading, sub, shot, alt, items, *, note=None, pic_w=8.55):
    s = prs.slides.add_slide(BLANK)
    background(s, WHITE)
    title(s, heading, sub)
    frame, marks = picture(s, shot, 0.5, 1.5, pic_w, alt)
    place_marks(s, frame, [m for m in marks if m["n"] <= len(items)])
    many = len(items) > 6
    end = steps(s, 0.5 + pic_w + 0.35, 1.5, SW - 0.5 - (0.5 + pic_w + 0.35), items, gap=0.05 if many else 0.12, size=16 if many else 17)
    if note:
        nb = rect(s, 0.5 + pic_w + 0.35, max(end + 0.05, 1.5), SW - 0.5 - (0.5 + pic_w + 0.35), 0.1, GREEN_TINT)
        nt = text(s, 0.5 + pic_w + 0.5, max(end + 0.05, 1.5) + 0.1, SW - 0.5 - (0.5 + pic_w + 0.35) - 0.3, 0.6, note, size=16, color=GREEN_DARK)
        n_lines = max(1, -(-len(note) // 44))
        nb.height = Inches(0.25 + 0.28 * n_lines)
        nt.height = Inches(0.28 * n_lines)
    footer(s)
    return s


# 1 ── Cover ─────────────────────────────────────────────────────────────
s = prs.slides.add_slide(BLANK)
background(s, GREEN_DARK)
text(s, 0.7, 1.35, 6.4, 0.5, "คู่มือการใช้งาน", size=28, color=RGBColor(0xF2, 0xB8, 0x8F), bold=True)
text(s, 0.7, 1.85, 6.4, 1.9, ["ระบบตรวจสอบ", "คุณสมบัติอาจารย์ SEEN"], size=50, bold=True, color=WHITE)
text(s, 0.7, 3.85, 6.2, 0.9, "สำหรับอาจารย์ทั่วไปและประธานหลักสูตร คณะพลังงานและสิ่งแวดล้อม มหาวิทยาลัยพะเยา", size=22, color=RGBColor(0xD9, 0xE6, 0xDC))
text(s, 0.7, 5.05, 6.2, 0.4, "เข้าใช้งานที่", size=16, color=RGBColor(0xB5, 0xC9, 0xBB))
text(s, 0.7, 5.38, 6.4, 0.45, SITE, size=20, bold=True, color=WHITE)
text(s, 0.7, 6.3, 6.2, 0.4, EDITION, size=16, color=RGBColor(0xB5, 0xC9, 0xBB))
frame, _ = picture(s, "g-overview", 7.45, 1.45, 5.4, "หน้าภาพรวมของระบบ")
page_no += 1

# 2 ── Who sees what ─────────────────────────────────────────────────────
s = prs.slides.add_slide(BLANK)
background(s, WHITE)
title(s, "ใครใช้ส่วนไหนของระบบ", "ระบบเดียวกัน แต่ละบทบาทเห็นเมนูต่างกัน")
cards = [
    ("อาจารย์ทุกท่าน", "เข้าสู่ระบบด้วยอีเมล @up.ac.th", ["ภาพรวมของคณะ", "ตรวจสอบคุณสมบัติของฉัน", "เพิ่มผลงานที่ระบบยังไม่มี"], "ส่วนที่ 1"),
    ("ประธานหลักสูตร", "ใส่รหัสประธานหลักสูตร", ["ทุกอย่างของอาจารย์", "ผลงานอาจารย์ทุกท่าน 5 ปี", "ผลการประเมินรายบุคคลตามหน้าที่", "หน้ารายบุคคลและดาวน์โหลด CSV"], "ส่วนที่ 2"),
    ("รองฯวิชาการ / ผู้ดูแลระบบ", "ใส่รหัสผู้ดูแลระบบ", ["อนุมัติผลงานที่อาจารย์เพิ่ม", "ตัดสินงานประชุมวิชาการ", "แจ้งเตือนอาจารย์ทางอีเมล", "แนวโน้ม แหล่งข้อมูล ประวัติ"], "ไม่อยู่ในคู่มือนี้"),
]
cw, gap = 3.95, 0.25
for i, (who, how, menu, part) in enumerate(cards):
    x = 0.5 + i * (cw + gap)
    rect(s, x, 1.6, cw, 3.75, GREEN_TINT if i < 2 else RGBColor(0xF3, 0xF4, 0xF3))
    text(s, x + 0.3, 1.8, cw - 0.6, 0.35, part, size=16, bold=True, color=ORANGE if i < 2 else MUTED)
    text(s, x + 0.3, 2.15, cw - 0.6, 0.55, who, size=28, bold=True, color=GREEN if i < 2 else MUTED)
    text(s, x + 0.3, 2.75, cw - 0.6, 0.4, how, size=17, color=MUTED)
    text(s, x + 0.3, 3.3, cw - 0.6, 2.6, [[("✓  " + m, {"size": 19, "color": INK if i < 2 else MUTED})] for m in menu], spacing=6)
text(s, 0.5, 5.65, 12.3, 0.4, [[("ทุกคนเปิดหน้าภาพรวมได้โดยไม่ต้องเข้าสู่ระบบ  ·  ใช้ได้ทั้งคอมพิวเตอร์ แท็บเล็ต และมือถือ", {"size": 17, "color": MUTED})]])
footer(s)

# 3 ── How results are counted ──────────────────────────────────────────
s = prs.slides.add_slide(BLANK)
background(s, WHITE)
title(s, "ระบบนับผลงานอย่างไร", "ตามประกาศ กมอ. เรื่องเกณฑ์มาตรฐานหลักสูตร พ.ศ. 2565 (ปริญญาตรี ข้อ 10.1 · บัณฑิตศึกษา ข้อ 9.3–9.4)")
text(s, 0.5, 1.55, 12.3, 0.4, "รอบ 5 ปีการศึกษา ตัวอย่าง: ปีการศึกษา 2569 (ดูเดือนและปีที่ตีพิมพ์ ไม่ดูวันที่)", size=20, bold=True, color=INK)
years = [("ปีที่ 5", "มิ.ย. 65 – พ.ค. 66"), ("ปีที่ 4", "มิ.ย. 66 – พ.ค. 67"), ("ปีที่ 3", "มิ.ย. 67 – พ.ค. 68"), ("ปีที่ 2", "มิ.ย. 68 – พ.ค. 69"), ("ปีที่ 1", "มิ.ย. 69 – พ.ค. 70")]
bw = 2.0
rect(s, 0.5, 2.1, 1.75, 1.0, RGBColor(0xF3, 0xF4, 0xF3))
text(s, 0.6, 2.2, 1.55, 0.85, [[("ก่อน มิ.ย. 65", {"bold": True, "size": 18, "color": MUTED})], [("หมดอายุ ไม่นับ", {"size": 16, "color": MUTED})]], align=PP_ALIGN.CENTER)
for i, (n, span) in enumerate(years):
    x = 2.4 + i * (bw + 0.1)
    rect(s, x, 2.1, bw, 1.0, GREEN if i == 4 else GREEN_TINT)
    c = WHITE if i == 4 else GREEN_DARK
    text(s, x + 0.1, 2.2, bw - 0.2, 0.85, [[(n, {"bold": True, "size": 19, "color": c})], [(span, {"size": 17, "color": c})]], align=PP_ALIGN.CENTER)
cols = [
    ("ผลงานที่นับ", ["บทความในวารสาร", "Proceedings โปสเตอร์ และบทคัดย่อ จากการประชุมที่สมาคมวิชาการหรือวิชาชีพด้านสิ่งแวดล้อมหรือพลังงานจัด", "ไม่นับ preprint หนังสือ และบทในหนังสือ"]),
    ("แหล่งข้อมูลที่ระบบดึงให้อัตโนมัติ", ["Google Scholar · OpenAlex · Scopus", "TCI (วารสารไทย) · Crossref (รายละเอียดและเดือนตีพิมพ์)", "ดึงใหม่ทุกวัน เวลา 03:00 น. ผลงานเดียวกันจากหลายแหล่งนับครั้งเดียว"]),
    ("ถ้าผลงานยังไม่อยู่ในระบบ", ["อาจารย์เพิ่มเองได้ในหน้า ตรวจสอบคุณสมบัติของฉัน", "ผลงานจะนับหลังรองฯวิชาการ/ผู้ดูแลระบบอนุมัติ"]),
]
for i, (h, items) in enumerate(cols):
    x = 0.5 + i * 4.2
    text(s, x, 3.5, 3.95, 0.4, h, size=21, bold=True, color=ORANGE)
    text(s, x, 3.95, 3.95, 2.6, [[("•  " + t, {"size": 18})] for t in items], spacing=6)
footer(s)

# 4 ── Section 1 ─────────────────────────────────────────────────────────
s = prs.slides.add_slide(BLANK)
background(s, GREEN)
text(s, 0.8, 2.2, 6, 0.5, "ส่วนที่ 1", size=26, bold=True, color=RGBColor(0xF2, 0xB8, 0x8F))
text(s, 0.8, 2.75, 11, 1.0, "สำหรับอาจารย์ทุกท่าน", size=54, bold=True, color=WHITE)
text(s, 0.8, 3.9, 11.5, 1.4, "ดูภาพรวมของคณะ · เข้าสู่ระบบด้วยอีเมลมหาวิทยาลัย · ตรวจผลคุณสมบัติและรายการผลงานของตนเอง · เพิ่มผลงานที่ยังไม่มีในระบบ", size=22, color=RGBColor(0xD9, 0xE6, 0xDC))
footer(s, dark=True)

shot_slide(1, "หน้าภาพรวม", "เปิดได้ทันทีโดยไม่ต้องเข้าสู่ระบบ", "g-overview", "หน้าภาพรวม พร้อมหมายเลขกำกับ", [
    ("เมนูหลัก", "ภาพรวม และ ตรวจสอบคุณสมบัติของฉัน"),
    ("ช่วงผลงานที่นับ", "5 ปีการศึกษา ชี้เมาส์เพื่อดูเดือนเริ่มและสิ้นสุด"),
    ("เลือกปีการศึกษา", "ดูผลของปีนี้หรือปีหน้า"),
    ("เข้าสู่ระบบผู้ดูแล", "สำหรับประธานหลักสูตร (ส่วนที่ 2)"),
    ("สรุปผลของคณะ", "จำนวนอาจารย์ที่ผ่านเกณฑ์ครบ"),
    ("สิ่งที่ต้องติดตาม", "ผู้ยังไม่ผ่าน และผู้ที่ปีหน้าอาจไม่ผ่าน"),
    ("จำนวนอาจารย์ที่ผ่าน", "แยกระดับ ป.ตรี ป.โท ป.เอก"),
    ("ผลงานรวมที่นับได้", "ในรอบ 5 ปีการศึกษา"),
], pic_w=7.9)

shot_slide(1, "ภาพรวม: แผนภูมิและตาราง", "เลื่อนลงในหน้าภาพรวม", "g-overview-charts", "แผนภูมิในหน้าภาพรวม", [
    ("สัดส่วนอาจารย์ตามผลการประเมิน", "ผ่านครบ ผ่านบางหน้าที่ ไม่ผ่าน"),
    ("จำนวนอาจารย์ที่ผ่านแต่ละหน้าที่", "รายข้อตามประกาศ เช่น 10.1.1 อาจารย์ประจำหลักสูตร"),
    ("จำนวนผลงานต่อปี", "แผนภูมิและตารางตัวเลข 5 ปีการศึกษา"),
    ("สลับมุมมอง", "แยกตามประเภทผลงาน หรือแยกตามคุณภาพ (Q1–Q4, TCI)"),
])

shot_slide(1, "เข้าสู่ระบบด้วยอีเมล", "เมนู ตรวจสอบคุณสมบัติของฉัน · ไม่ต้องตั้งรหัสผ่าน", "g-login", "แบบฟอร์มเข้าสู่ระบบด้วยอีเมล", [
    ("ใส่อีเมลมหาวิทยาลัย", "ต้องเป็น @up.ac.th ที่ลงทะเบียนไว้กับคณะ"),
    ("จำเครื่องนี้ไว้ 30 วัน", "ติ๊กเฉพาะเครื่องส่วนตัว ถ้าไม่ติ๊ก ระบบจำไว้ 12 ชั่วโมงหรือจนปิดเบราว์เซอร์"),
    ("กดส่งลิงก์เข้าสู่ระบบ", "ระบบส่งลิงก์ไปที่อีเมลของท่าน"),
], note="จากนั้นเปิดอีเมลแล้วกดลิงก์ ลิงก์ใช้ได้ภายใน 24 ชั่วโมงและใช้ได้ครั้งเดียว · อีเมลอาจใช้เวลา 1–2 นาที ถ้าไม่พบให้ดูกล่อง Junk หรือ Spam · ขอลิงก์ได้ไม่เกิน 10 ครั้งต่อชั่วโมง")

shot_slide(1, "ผลคุณสมบัติของฉัน", "หลังเข้าสู่ระบบ ระบบแสดงเฉพาะข้อมูลของท่าน", "g-me-top", "หน้าผลคุณสมบัติของอาจารย์", [
    ("บัญชีที่เข้าสู่ระบบ", "อีเมลของท่าน"),
    ("ออกจากระบบ", "กดเมื่อใช้เครื่องสาธารณะ"),
    ("ข้อมูลอาจารย์", "ตำแหน่งวิชาการ วุฒิสูงสุด ปีที่สำเร็จการศึกษา และโปรไฟล์ Google Scholar"),
    ("ผลตามหน้าที่", "ทุกหน้าที่ของ ป.ตรี ป.โท ป.เอก พร้อมผล ผ่าน / ไม่ผ่าน"),
    ("ดาวน์โหลด CSV", "ผลตามหน้าที่เป็นไฟล์เปิดด้วย Excel"),
    ("เหตุผล", "เกณฑ์ที่ต้องการ และจำนวนผลงานที่ท่านมี"),
])

shot_slide(1, "รายการผลงานที่นับ", "อยู่ใต้ตารางผลตามหน้าที่", "g-me-works", "รายการผลงานที่นับของอาจารย์", [
    ("ผลงานที่นับในรอบ 5 ปี", "จำนวนรายการและช่วงเดือนที่นับ"),
    ("แสดงทุกปี", "ดูผลงานนอกช่วง 5 ปีด้วย (แสดงเป็นสีจาง)"),
    ("ดาวน์โหลด CSV", "รายการผลงานเป็นไฟล์ Excel"),
    ("ประเภท", "วารสาร proceedings หรือโปสเตอร์ พร้อมแหล่งข้อมูลและลิงก์ DOI"),
    ("นับ", "ใช่ = นับในการประเมิน ถ้าไม่นับ ระบบบอกเหตุผลในหมายเหตุ"),
])

shot_slide(1, "เพิ่มผลงานของฉัน", "สำหรับผลงานที่ระบบยังไม่มี เช่น วารสารไทย หรือ proceedings งานประชุมในประเทศ", "g-me-add", "แบบฟอร์มเพิ่มผลงาน", [
    ("เพิ่มผลงานของฉัน", "อยู่ท้ายหน้า ตรวจสอบคุณสมบัติของฉัน"),
    ("ปีที่ตีพิมพ์ (ค.ศ.)", "ช่องที่มี * ต้องกรอก"),
    ("ประเภทผลงาน", "วารสาร proceedings หรือโปสเตอร์/บทคัดย่อ"),
    ("ชื่อวารสารหรืองานประชุม", "ใส่ปีที่/ฉบับที่/หน้า และ DOI ถ้ามี"),
    ("เป็นงานวิจัยหรือไม่", "ใช่ หรือ ไม่ใช่ (เช่น บทความวิชาการ/ปริทัศน์)"),
    ("ส่งผลงานเพื่อรออนุมัติ", "แสดงเป็น รออนุมัติ ยังไม่นับจนกว่าจะอนุมัติ"),
], note="ระบบไม่รับผลงานซ้ำ (ชื่อเรื่องหรือ DOI) · ส่งผิดกด ถอน ในรายการ ผลงานที่ฉันเพิ่ม", pic_w=7.9)

# Phones
s = prs.slides.add_slide(BLANK)
background(s, WHITE)
title(s, "ใช้บนมือถือ", "หน้าเดียวกัน ปรับให้พอดีจอ เมนูอยู่ด้านล่าง")
for i, (name, cap) in enumerate([("g-mobile", "ภาพรวม"), ("g-mobile-me", "ตรวจสอบคุณสมบัติของฉัน")]):
    x = 0.9 + i * 2.9
    frame, _ = picture(s, name, x, 1.35, 2.3, f"หน้า{cap}บนมือถือ")
    text(s, x - 0.2, 1.35 + frame[3] + 0.08, 2.7, 0.35, cap, size=16, color=MUTED, align=PP_ALIGN.CENTER)
text(s, 7.7, 1.6, 5.1, 4.8, [
    [("เข้าสู่ระบบบนมือถือ", {"bold": True, "size": 22, "color": GREEN})],
    [("ขอลิงก์จากมือถือ แล้วเปิดลิงก์ในอีเมลบนมือถือเครื่องเดียวกัน จะเข้าสู่ระบบในเบราว์เซอร์ของมือถือนั้น", {"size": 19})],
    [("เมนูด้านล่าง", {"bold": True, "size": 22, "color": GREEN})],
    [("ภาพรวม และ ของฉัน อยู่ที่แถบด้านล่างของจอ", {"size": 19})],
    [("ตารางกว้าง", {"bold": True, "size": 22, "color": GREEN})],
    [("ตารางผลตามหน้าที่จัดเป็นบรรทัดต่อหน้าที่ อ่านได้โดยไม่ต้องเลื่อนซ้ายขวา", {"size": 19})],
], spacing=8)
footer(s)

# 5 ── Section 2 ─────────────────────────────────────────────────────────
s = prs.slides.add_slide(BLANK)
background(s, GREEN)
text(s, 0.8, 2.2, 6, 0.5, "ส่วนที่ 2", size=26, bold=True, color=RGBColor(0xF2, 0xB8, 0x8F))
text(s, 0.8, 2.75, 11, 1.0, "สำหรับประธานหลักสูตร", size=54, bold=True, color=WHITE)
text(s, 0.8, 3.9, 11.5, 1.4, "เข้าสู่ระบบผู้ดูแลด้วยรหัสประธานหลักสูตร · ดูผลงานและผลการประเมินของอาจารย์ทุกท่าน · กรองผู้ที่ยังไม่ผ่าน · เปิดหน้ารายบุคคล · ดาวน์โหลดและพิมพ์รายงาน", size=22, color=RGBColor(0xD9, 0xE6, 0xDC))
text(s, 0.8, 5.45, 11.5, 0.5, "ในภาพตัวอย่างของส่วนนี้ ชื่ออาจารย์ท่านอื่นถูกทำให้เบลอ", size=18, color=RGBColor(0xB5, 0xC9, 0xBB))
footer(s, dark=True)

shot_slide(2, "เข้าสู่ระบบผู้ดูแล", "ใช้รหัสประธานหลักสูตรที่ได้รับจากผู้ดูแลระบบ", "c-gate", "แบบฟอร์มเข้าสู่ระบบผู้ดูแล", [
    ("เข้าสู่ระบบผู้ดูแล", "ปุ่มมุมขวาบนของทุกหน้า"),
    ("รหัสผู้ดูแล", "ใส่รหัสประธานหลักสูตร"),
    ("จำรหัสบนเครื่องนี้", "ติ๊กเฉพาะเครื่องส่วนตัว ถ้าไม่ติ๊ก ระบบจำไว้จนปิดเบราว์เซอร์"),
    ("เข้าสู่ส่วนผู้ดูแล", "เมนู ผลงานอาจารย์ จะปรากฏ"),
], note="รหัสประธานหลักสูตรเปิดดูข้อมูลได้อย่างเดียว ไม่สามารถอนุมัติหรือแก้ไขผลงาน")

shot_slide(2, "ผลงานอาจารย์", "ผลงานในช่วง 5 ปีและผลการประเมินของอาจารย์ทุกท่าน", "c-lecturers", "หน้าผลงานอาจารย์ของประธานหลักสูตร", [
    ("ผลงานอาจารย์", "ตัวเลข = จำนวนผู้ยังไม่ผ่านบางหน้าที่"),
    ("ประธานหลักสูตร", "บทบาทที่เข้าสู่ระบบอยู่"),
    ("ผลงาน 5 ปีของแต่ละคน", "แผนภูมิแท่งรายคน"),
    ("ผลการประเมินรายบุคคล", "ผลตามหน้าที่ของทุกคน"),
    ("ดาวน์โหลด CSV", "ข้อมูลของมุมมองที่เปิดอยู่"),
    ("พิมพ์ / PDF", "พิมพ์รายงานหรือบันทึกเป็น PDF"),
    ("ระดับ", "สลับ ระดับปริญญาตรี / ระดับบัณฑิตศึกษา"),
    ("มุมมองแผนภูมิ", "วิจัย/อื่น ประเภท หรือคุณภาพ"),
], pic_w=7.9)

s = prs.slides.add_slide(BLANK)
background(s, WHITE)
title(s, "อ่านแผนภูมิผลงาน 5 ปี", "แท่งละหนึ่งคน เรียงจากมากไปน้อย")
frame, _ = picture(s, "c-lecturers-chart", 0.5, 1.5, 8.55, "แผนภูมิผลงาน 5 ปีของอาจารย์แต่ละคน")
legend = [
    (ORANGE, "แท่งสีส้ม", "จำนวนผลงานในรอบ 5 ปี ตัวเลขท้ายแท่งคือจำนวนเรื่อง"),
    (GREEN, "เส้นแนวตั้ง", "เกณฑ์ขั้นต่ำของระดับที่เลือก เช่น ≥ 1 เรื่อง สำหรับ ป.ตรี"),
    (RGBColor(0xC8, 0x2A, 0x2A), "กรอบสีแดง", "ไม่ผ่านบางหน้าที่ของระดับนั้น"),
    (RGBColor(0xD9, 0xA1, 0x1E), "กรอบสีเหลือง", "ปีการศึกษาหน้าอาจไม่ผ่าน ถ้าไม่มีผลงานเพิ่ม"),
]
y = 1.55
for col, h, b in legend:
    sw = rect(s, 9.4, y + 0.06, 0.36, 0.36, col, radius=0.2)
    text(s, 9.95, y, 2.9, 1.0, [[(h, {"bold": True, "size": 19})], [(b, {"size": 17, "color": MUTED})]])
    y += 1.12
text(s, 9.4, y + 0.05, 3.4, 0.9, "ชี้เมาส์ที่แท่งเพื่อดูจำนวนผลงานแยกประเภท และหน้าที่ที่ยังไม่ผ่าน", size=17, color=GREEN_DARK)
footer(s)

shot_slide(2, "ผลการประเมินรายบุคคลตามหน้าที่", "กรองเฉพาะกลุ่มที่ต้องติดตาม", "c-lecturers-eval", "ผลการประเมินรายบุคคล กรองเฉพาะผู้ไม่ผ่าน", [
    ("มีหน้าที่ไม่ผ่าน", "แสดงเฉพาะผู้ที่ยังไม่ผ่าน (มีตัวเลือก ปีหน้าอาจไม่ผ่าน ด้วย)"),
    ("ระดับ", "ทุกระดับ ป.ตรี หรือบัณฑิตศึกษา"),
    ("คอลัมน์", "การ์ดรายคน บอกผลทุกหน้าที่"),
    ("ตาราง", "ตารางรวม ✓ / ✗ ของทุกคนทุกหน้าที่"),
], note="ช่อง ค้นหาชื่อ… ใช้หาอาจารย์รายคน · กดชื่อบนการ์ดเพื่อเปิดหน้ารายบุคคล")

s = prs.slides.add_slide(BLANK)
background(s, WHITE)
title(s, "มุมมองการ์ดและตาราง", "สองแบบของผลการประเมินรายบุคคล")
for i, (name, cap) in enumerate([("c-lecturers-fail", "คอลัมน์: การ์ดรายคน พร้อมผลแต่ละหน้าที่"), ("c-lecturers-table", "ตาราง: แถวละคน คอลัมน์ละหน้าที่ ✓ ผ่าน ✗ ไม่ผ่าน")]):
    x = 0.5 + i * 6.25
    frame, _ = picture(s, name, x, 1.5, 6.05, cap)
    text(s, x, 1.5 + frame[3] + 0.12, 6.05, 0.4, cap, size=18, color=MUTED)
text(s, 0.5, 6.1, 12.3, 0.5, "กรอบสีแดง = ไม่ผ่านบางหน้าที่ · กรอบสีเหลือง = ปีการศึกษาหน้าอาจไม่ผ่าน · ตัวเลขมุมการ์ด เช่น 5/13 = จำนวนหน้าที่ที่ผ่าน จากทั้งหมด", size=17, color=GREEN_DARK)
footer(s)

shot_slide(2, "หน้ารายบุคคล", "กดชื่ออาจารย์จากแผนภูมิ การ์ด หรือตาราง", "c-person", "หน้ารายบุคคลของอาจารย์", [
    ("กลับไปรายชื่ออาจารย์", "กลับหน้าผลงานอาจารย์ที่ตัวกรองเดิม"),
    ("ข้อมูลอาจารย์", "ตำแหน่ง วุฒิ ปีที่จบ และโปรไฟล์"),
    ("ผลตามหน้าที่", "ผล ผลงาน วิจัย และเหตุผลรายหน้าที่"),
    ("ดาวน์โหลด CSV", "ผลตามหน้าที่ของอาจารย์ท่านนี้"),
], note="เลื่อนลงจะพบรายการผลงานที่นับ เหมือนหน้า ตรวจสอบคุณสมบัติของฉัน ของอาจารย์ท่านนั้น")

# FAQ
s = prs.slides.add_slide(BLANK)
background(s, WHITE)
title(s, "คำถามที่พบบ่อย")
faq = [
    ("ผลงานของฉันไม่ขึ้น", "ระบบดึงจากหลายแหล่งทุกวัน ถ้ายังไม่มีหลัง 1 วัน ให้เพิ่มเองในหน้า ตรวจสอบคุณสมบัติของฉัน"),
    ("ผลงานขึ้นแต่ไม่นับ", "ดูเหตุผลในคอลัมน์ หมายเหตุ เช่น ไม่มีชื่อแหล่งตีพิมพ์ เป็น preprint หรืองานประชุมรอผู้ดูแลยืนยันผู้จัด"),
    ("อีเมลเข้าสู่ระบบไม่มา", "รอ 1–2 นาที แล้วดูกล่อง Junk/Spam ลิงก์ใช้ได้ 24 ชั่วโมงและครั้งเดียว ขอใหม่ได้ไม่เกิน 10 ครั้งต่อชั่วโมง"),
    ("ผลงานที่เพิ่มยังไม่นับ", "ผลงานที่เพิ่มเองจะนับหลังรองฯวิชาการ/ผู้ดูแลระบบอนุมัติ ระหว่างนั้นแสดงเป็น รออนุมัติ"),
    ("ข้อมูลอัปเดตเมื่อไร", "ทุกวันเวลา 03:00 น. แบบฟอร์มของผู้ดูแลทุกชั่วโมง เวลาข้อมูลล่าสุดอยู่มุมซ้ายล่างของหน้า"),
    ("ข้อมูลตำแหน่งหรือวุฒิผิด", "แจ้งผู้ดูแลระบบของคณะเพื่อแก้ในทะเบียนอาจารย์"),
]
for i, (q, a) in enumerate(faq):
    col, row = i % 2, i // 2
    x, y = 0.5 + col * 6.25, 1.35 + row * 1.75
    rect(s, x, y, 6.05, 1.55, GREEN_TINT)
    text(s, x + 0.3, y + 0.18, 5.45, 1.25, [[(q, {"bold": True, "size": 21, "color": GREEN})], [(a, {"size": 17})]], spacing=2)
footer(s)

# Closing
s = prs.slides.add_slide(BLANK)
background(s, GREEN_DARK)
text(s, 0.8, 2.3, 11.5, 0.9, "เริ่มใช้งาน", size=48, bold=True, color=WHITE)
text(s, 0.8, 3.25, 11.5, 0.5, SITE, size=26, bold=True, color=RGBColor(0xF2, 0xB8, 0x8F))
text(s, 0.8, 4.0, 11.5, 1.4, ["มีปัญหาการใช้งาน หรือพบข้อมูลไม่ถูกต้อง แจ้งผู้ดูแลระบบของคณะ", "คณะพลังงานและสิ่งแวดล้อม มหาวิทยาลัยพะเยา"], size=20, color=RGBColor(0xD9, 0xE6, 0xDC), spacing=6)
footer(s, dark=True)

OUT.parent.mkdir(parents=True, exist_ok=True)
prs.save(OUT)
print(f"{OUT.relative_to(ROOT)}: {len(prs.slides)} slides")
