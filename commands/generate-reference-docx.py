#!/usr/bin/env python3
"""
Generate a styled reference.docx for pandoc docx output.

This creates a reference document with the book's typography:
  - Body text: Source Serif 4
  - Headings:  Source Sans 3
  - Code:      Source Code Pro

Color palette matches the theme's tokens (css/theme/01-tokens.css):
  --color-brand:     #0056b3  (links, accents)
  --color-emphasis:  #495057  (body text, headings)
  --color-muted:     #6c757d  (captions, footnotes)
  --color-border:    #dee2e6  (table borders, hr)
"""

import sys
import subprocess
import tempfile
import os
from pathlib import Path
from docx import Document
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

# The build looks for reference.docx in the book root (lib/pandoc.js), which
# `book-kit generate-reference-docx` passes as $BOOK_ROOT.
OUTPUT_PATH = Path(os.environ.get("BOOK_ROOT", os.getcwd())) / "reference.docx"

# ── Color palette ─────────────────────────────────────────────────────────────
COLOR_EMPHASIS = "495057"   # body text, headings
COLOR_BRAND = "0056b3"      # links
COLOR_MUTED = "6c757d"      # captions, footnotes
COLOR_BORDER = "DEE2E6"     # table borders, HR

# ── Fonts ─────────────────────────────────────────────────────────────────────
FONT_BODY = "Source Serif 4"
FONT_HEADING = "Source Sans 3"
FONT_MONO = "Source Code Pro"

# ── Helpers ───────────────────────────────────────────────────────────────────

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def w(tag):
    return f"{{{W_NS}}}{tag}"


def set_font(rPr, name):
    """Set the font for a run-properties element, clearing theme inheritance."""
    rFonts = rPr.find(w("rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.insert(0, rFonts)
    # Remove theme-based font attributes so our explicit fonts take precedence
    for attr in ("w:asciiTheme", "w:hAnsiTheme", "w:eastAsiaTheme", "w:csTheme"):
        if rFonts.get(qn(attr)):
            del rFonts.attrib[qn(attr)]
    rFonts.set(qn("w:ascii"), name)
    rFonts.set(qn("w:hAnsi"), name)
    rFonts.set(qn("w:cs"), name)


def set_color(rPr, hex_color):
    """Set the run color, removing any theme color or shade overrides."""
    color_el = rPr.find(w("color"))
    if color_el is None:
        color_el = OxmlElement("w:color")
        rPr.append(color_el)
    color_el.set(qn("w:val"), hex_color)
    # Remove theme color/shade overrides so our hex value wins
    for attr in ("w:themeColor", "w:themeShade", "w:themeTint"):
        if color_el.get(qn(attr)):
            del color_el.attrib[qn(attr)]


def set_size(rPr, half_pts):
    """Set font size in half-points (e.g. 22 → 11 pt)."""
    for tag in ("w:sz", "w:szCs"):
        el = rPr.find(w(tag.split(":")[1]))
        if el is None:
            el = OxmlElement(tag)
            rPr.append(el)
        el.set(qn("w:val"), str(half_pts))


def set_spacing(pPr, before_twips=None, after_twips=None, line_twips=None, line_rule=None):
    """Set paragraph spacing (1pt = 20 twips)."""
    spacing = pPr.find(w("spacing"))
    if spacing is None:
        spacing = OxmlElement("w:spacing")
        pPr.append(spacing)
    if before_twips is not None:
        spacing.set(qn("w:before"), str(before_twips))
    if after_twips is not None:
        spacing.set(qn("w:after"), str(after_twips))
    if line_twips is not None:
        spacing.set(qn("w:line"), str(line_twips))
    if line_rule is not None:
        spacing.set(qn("w:lineRule"), line_rule)


def get_or_create(parent, tag):
    el = parent.find(w(tag))
    if el is None:
        el = OxmlElement(f"w:{tag}")
        parent.append(el)
    return el


def ensure_pPr(style_el):
    return get_or_create(style_el, "pPr")


def ensure_rPr(style_el):
    return get_or_create(style_el, "rPr")


def style_heading(style_el, size_half_pts, before_twips, after_twips=120):
    """Apply book heading style (Source Sans 3, emphasis color)."""
    pPr = ensure_pPr(style_el)
    rPr = ensure_rPr(style_el)
    set_spacing(pPr, before_twips=before_twips, after_twips=after_twips)
    set_font(rPr, FONT_HEADING)
    set_color(rPr, COLOR_EMPHASIS)
    set_size(rPr, size_half_pts)
    # Ensure bold is set
    if rPr.find(w("b")) is None:
        b = OxmlElement("w:b")
        rPr.append(b)
    if rPr.find(w("bCs")) is None:
        bCs = OxmlElement("w:bCs")
        rPr.append(bCs)


def apply_border(tcPr_or_tblPr, tag, color=COLOR_BORDER, sz="4", val="single"):
    """Add a border child to a table cell or table properties element."""
    borders = tcPr_or_tblPr.find(w(tag))
    if borders is None:
        borders = OxmlElement(f"w:{tag}")
        tcPr_or_tblPr.append(borders)
    for side in ("top", "left", "bottom", "right", "insideH", "insideV"):
        el = borders.find(w(side))
        if el is None:
            el = OxmlElement(f"w:{side}")
            borders.append(el)
        el.set(qn("w:val"), val)
        el.set(qn("w:sz"), sz)
        el.set(qn("w:color"), color)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    # Start from pandoc's built-in reference.docx so all required styles exist
    result = subprocess.run(
        ["pandoc", "--print-default-data-file", "reference.docx"],
        capture_output=True,
    )
    if result.returncode != 0:
        print("ERROR: pandoc not found or failed", file=sys.stderr)
        sys.exit(1)

    with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as tmp:
        tmp.write(result.stdout)
        tmp_path = tmp.name

    doc = Document(tmp_path)
    os.unlink(tmp_path)

    styles = {s.style_id: s for s in doc.styles}

    # ── Normal (body text) ────────────────────────────────────────────────────
    normal = styles["Normal"]
    pPr = ensure_pPr(normal.element)
    rPr = ensure_rPr(normal.element)
    set_font(rPr, FONT_BODY)
    set_color(rPr, COLOR_EMPHASIS)
    set_size(rPr, 22)  # 11 pt
    set_spacing(pPr, after_twips=120, line_twips=336, line_rule="auto")  # ~1.4 line spacing

    # ── Body Text (used for most prose) ──────────────────────────────────────
    if "BodyText" in styles:
        bt = styles["BodyText"]
        pPr = ensure_pPr(bt.element)
        rPr = ensure_rPr(bt.element)
        set_font(rPr, FONT_BODY)
        set_color(rPr, COLOR_EMPHASIS)
        set_size(rPr, 22)
        set_spacing(pPr, after_twips=120, line_twips=336, line_rule="auto")

    # ── Headings ──────────────────────────────────────────────────────────────
    # H1: chapter / part titles — 20 pt, big space before
    if "Heading1" in styles:
        style_heading(styles["Heading1"].element, size_half_pts=40, before_twips=480, after_twips=200)

    # H2: section titles — 16 pt
    if "Heading2" in styles:
        style_heading(styles["Heading2"].element, size_half_pts=32, before_twips=360, after_twips=160)

    # H3: subsection — 13 pt
    if "Heading3" in styles:
        style_heading(styles["Heading3"].element, size_half_pts=26, before_twips=280, after_twips=120)

    # H4: 12 pt
    if "Heading4" in styles:
        style_heading(styles["Heading4"].element, size_half_pts=24, before_twips=240, after_twips=80)

    # H5: 11 pt
    if "Heading5" in styles:
        style_heading(styles["Heading5"].element, size_half_pts=22, before_twips=200, after_twips=80)

    # H6: 11 pt, italic
    if "Heading6" in styles:
        style_heading(styles["Heading6"].element, size_half_pts=22, before_twips=200, after_twips=80)
        h6_rPr = ensure_rPr(styles["Heading6"].element)
        if h6_rPr.find(w("i")) is None:
            i = OxmlElement("w:i")
            h6_rPr.append(i)

    # ── Title / Subtitle / Author (title page) ────────────────────────────────
    if "Title" in styles:
        title_style = styles["Title"]
        pPr = ensure_pPr(title_style.element)
        rPr = ensure_rPr(title_style.element)
        set_font(rPr, FONT_HEADING)
        set_color(rPr, COLOR_EMPHASIS)
        set_size(rPr, 56)  # 28 pt
        set_spacing(pPr, before_twips=0, after_twips=240)
        # Ensure bold is removed — title uses weight from font
        for tag in ("w:b", "w:bCs"):
            el = rPr.find(w(tag.split(":")[1]))
            if el is not None:
                rPr.remove(el)

    if "Subtitle" in styles:
        subtitle_style = styles["Subtitle"]
        pPr = ensure_pPr(subtitle_style.element)
        rPr = ensure_rPr(subtitle_style.element)
        set_font(rPr, FONT_HEADING)
        set_color(rPr, COLOR_MUTED)
        set_size(rPr, 32)  # 16 pt
        set_spacing(pPr, before_twips=0, after_twips=480)

    if "Author" in styles:
        author_style = styles["Author"]
        pPr = ensure_pPr(author_style.element)
        rPr = ensure_rPr(author_style.element)
        set_font(rPr, FONT_HEADING)
        set_color(rPr, COLOR_MUTED)
        set_size(rPr, 24)  # 12 pt
        set_spacing(pPr, before_twips=0, after_twips=120)

    # ── Block Text (blockquote) ───────────────────────────────────────────────
    if "BlockText" in styles:
        bt = styles["BlockText"]
        pPr = ensure_pPr(bt.element)
        rPr = ensure_rPr(bt.element)
        set_font(rPr, FONT_BODY)
        set_color(rPr, COLOR_MUTED)
        set_size(rPr, 22)
        set_spacing(pPr, before_twips=120, after_twips=120, line_twips=336, line_rule="auto")
        # Indent blockquotes
        ind = pPr.find(w("ind"))
        if ind is None:
            ind = OxmlElement("w:ind")
            pPr.append(ind)
        ind.set(qn("w:left"), "720")   # 0.5 inch
        ind.set(qn("w:right"), "720")

    # ── Verbatim (code blocks) ────────────────────────────────────────────────
    if "VerbatimChar" in styles:
        vc = styles["VerbatimChar"]
        rPr = ensure_rPr(vc.element)
        set_font(rPr, FONT_MONO)
        set_color(rPr, COLOR_EMPHASIS)
        set_size(rPr, 20)  # 10 pt

    # ── Footnote Text ─────────────────────────────────────────────────────────
    if "FootnoteText" in styles:
        fn = styles["FootnoteText"]
        pPr = ensure_pPr(fn.element)
        rPr = ensure_rPr(fn.element)
        set_font(rPr, FONT_BODY)
        set_color(rPr, COLOR_MUTED)
        set_size(rPr, 18)  # 9 pt
        set_spacing(pPr, before_twips=0, after_twips=80)

    # ── Hyperlink ────────────────────────────────────────────────────────────
    if "Hyperlink" in styles:
        hl = styles["Hyperlink"]
        rPr = ensure_rPr(hl.element)
        set_color(rPr, COLOR_BRAND)
        # Ensure underline
        u = rPr.find(w("u"))
        if u is None:
            u = OxmlElement("w:u")
            rPr.append(u)
        u.set(qn("w:val"), "single")

    # ── Caption / Table Caption / Image Caption ───────────────────────────────
    for style_id in ("Caption", "TableCaption", "ImageCaption"):
        if style_id in styles:
            cap = styles[style_id]
            rPr = ensure_rPr(cap.element)
            set_font(rPr, FONT_HEADING)
            set_color(rPr, COLOR_MUTED)
            set_size(rPr, 18)  # 9 pt

    # ── TOC Heading ───────────────────────────────────────────────────────────
    if "TOCHeading" in styles:
        toch = styles["TOCHeading"]
        pPr = ensure_pPr(toch.element)
        rPr = ensure_rPr(toch.element)
        set_font(rPr, FONT_HEADING)
        set_color(rPr, COLOR_EMPHASIS)
        set_size(rPr, 32)  # 16 pt

    # ── Document-level defaults: page margins ─────────────────────────────────
    # Set comfortable 1-inch margins
    body = doc.element.body
    sectPr = body.find(w("sectPr"))
    if sectPr is None:
        sectPr = OxmlElement("w:sectPr")
        body.append(sectPr)
    pgMar = sectPr.find(w("pgMar"))
    if pgMar is None:
        pgMar = OxmlElement("w:pgMar")
        sectPr.append(pgMar)
    # 1 inch = 1440 twips
    pgMar.set(qn("w:top"), "1440")
    pgMar.set(qn("w:right"), "1440")
    pgMar.set(qn("w:bottom"), "1440")
    pgMar.set(qn("w:left"), "1440")
    pgMar.set(qn("w:header"), "720")
    pgMar.set(qn("w:footer"), "720")

    doc.save(str(OUTPUT_PATH))
    print(f"Generated {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
