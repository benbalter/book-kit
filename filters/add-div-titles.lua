-- Lua filter that injects callout labels and ARIA roles.
--
-- Callout prefixes ("TL;DR:", "💡 Pro-Tip:", ...) are drawn by CSS ::before in
-- HTML, but EPUB readers and DOCX don't support pseudo-elements, so the build
-- adds them to the content here. For PDF, emoji text in CSS content: crashes
-- WeasyPrint (Pango ZeroDivisionError), so Kindle and PDF get Twemoji <img>s.
--
-- The callouts themselves come from the `callouts` registry in book.config.yml
-- (see the kit's defaults/book.config.yml), read from the JSON the build writes
-- to $BOOK_KIT_CONFIG.
--
-- Metadata flags:
--   --metadata kindle=true  → Kindle Twemoji images (emoji.kindle_dir)
--   --metadata pdf=true     → PDF Twemoji images (emoji.pdf_callout_dir)
-- Translated builds can override labels with `callout-labels` / `callout-aria`
-- metadata maps keyed by callout class.

package.path = pandoc.path.directory(PANDOC_SCRIPT_FILE) .. "/lib/?.lua;" .. package.path
local book_kit = require("book_kit")

local config = book_kit.config()
local callouts = config.callouts or {}
local emoji_dirs = config.emoji or {}
local output_mode = "epub"  -- default

-- First pass: read metadata to detect output mode + pick up localized labels.
local function readMeta(meta)
  if meta.kindle then
    output_mode = "kindle"
  elseif meta.pdf then
    output_mode = "pdf"
  end

  local labels, aria = meta['callout-labels'], meta['callout-aria']
  for _, c in ipairs(callouts) do
    if labels and labels[c.class] then c.label = pandoc.utils.stringify(labels[c.class]) end
    if aria and aria[c.class] then c.aria = pandoc.utils.stringify(aria[c.class]) end
  end
end

-- Helper function to check if content starts with a specific text
local function startsWithText(content, text)
  if #content == 0 then return false end

  -- Stringify the first element to handle any inline type
  -- (Str, Strong, SmallCaps, Emph, etc.)
  local first_str = pandoc.utils.stringify(content[1])
  -- Use literal prefix comparison (not Lua patterns) to avoid
  -- metacharacter issues with labels like "Pro-Tip:"
  return first_str:sub(1, #text) == text
end

-- The symbol for a callout in the current output mode: emoji text for EPUB,
-- a Twemoji image spec for Kindle/PDF, or nil when the callout has none.
local function symbolFor(c)
  if not c.emoji then return nil end
  if output_mode == "epub" then return c.emoji end
  local dir = output_mode == "kindle" and emoji_dirs.kindle_dir or emoji_dirs.pdf_callout_dir
  return {cp = c.emoji_cp, alt = c.emoji_alt, dir = dir}
end

-- Helper: prepend a symbol + label to a div's first paragraph
local function prependCalloutLabel(div, symbol_char, label_text)
  -- Uses callout-label class instead of SmallCaps because e-readers
  -- synthesize small caps poorly (crude all-caps), while PDF uses
  -- real OpenType small caps via CSS ::before. The callout-label class
  -- provides a clean sans-serif label that approximates the PDF look.
  local label = pandoc.Strong({pandoc.Span({pandoc.Str(label_text)}, pandoc.Attr("", {"callout-label"}, {}))})
  local space = pandoc.Space()

  local prefix
  if type(symbol_char) == "table" then
    -- Kindle/PDF: inline Twemoji image + label on same line
    local img_size = output_mode == "kindle" and "24" or "16"
    local img = pandoc.Image(
      {pandoc.Str(symbol_char.alt)},
      symbol_char.dir .. symbol_char.cp .. ".png",
      "",
      pandoc.Attr("", {"emoji", "callout-emoji"}, {{"width", img_size}, {"height", img_size}})
    )
    prefix = {img, pandoc.Space(), label, space}
  else
    -- EPUB: inline emoji (if any) + label on same line
    prefix = {}
    if symbol_char then
      table.insert(prefix, pandoc.Str(symbol_char))
      table.insert(prefix, pandoc.Space())
    end
    table.insert(prefix, label)
    table.insert(prefix, space)
  end

  if #div.content > 0 and div.content[1].t == "Para" then
    for i = #prefix, 1, -1 do
      table.insert(div.content[1].content, 1, prefix[i])
    end
  elseif #div.content > 0 then
    table.insert(div.content, 1, pandoc.Para(prefix))
  end
end

-- Second pass: process Div elements
local function processDiv(div)
  -- Labels: every matching callout gets its prefix, unless the writer
  -- already typed it (or its emoji).
  for _, c in ipairs(callouts) do
    if c.label and div.classes:includes(c.class) then
      local already_has_prefix = false
      if #div.content > 0 and div.content[1].t == "Para" then
        local first = div.content[1].content
        already_has_prefix = (c.emoji and startsWithText(first, c.emoji)) or
                             startsWithText(first, c.label)
      end
      if not already_has_prefix then
        prependCalloutLabel(div, symbolFor(c), c.label)
      end
    end
  end

  -- ARIA: the first matching callout in registry order wins.
  -- Use doc-notice (DPUB-ARIA) for all callout types; doc-tip is not a valid EPUB3 role
  for _, c in ipairs(callouts) do
    if div.classes:includes(c.class) then
      div.attributes["role"] = "doc-notice"
      if c.aria then div.attributes["aria-label"] = c.aria end
      break
    end
  end

  -- Add DPUB-ARIA roles for special structural sections
  if div.classes:includes("dedication") then
    div.attributes["role"] = "doc-dedication"
  end
  if div.identifier == "copyright-page" then
    div.attributes["role"] = "doc-colophon"
  end

  return div
end

-- Strip role="doc-*" and epub:type from headings. Pandoc's EPUB writer
-- sometimes copies epub:type onto headings and synthesizes a matching
-- role attribute (e.g., <h1 epub:type="prologue" role="doc-prologue">),
-- but EPUBCheck's HTML role validation only allows "doc-subtitle",
-- "heading", "none", "presentation", or "tab" on heading elements, and
-- ACE requires any epub:type to have a matching role. Removing both from
-- the heading resolves the conflict: pandoc already emits identical
-- epub:type and role on the containing <section>, which is the correct
-- location per DPUB-ARIA and which both validators accept.
local function processHeader(h)
  local role = h.attributes["role"]
  if role and role:match("^doc%-") and role ~= "doc-subtitle" then
    h.attributes["role"] = nil
    h.attributes["epub:type"] = nil
  end
  return h
end

-- Insert zero-width spaces (U+200B) inside URL-like substrings so long URLs
-- in PDF footnotes can wrap mid-URL instead of being pushed onto their own
-- line. Triggered by links-to-footnotes.js rewriting `[text](url)` to
-- `text (url)` — the URL becomes one unbreakable Str token, and even with
-- `overflow-wrap: anywhere` WeasyPrint won't break it when there's a usable
-- space before the opening paren. ZWSPs after path separators give the line
-- breaker explicit opportunities to use only when they improve the line.
local ZWSP = "\226\128\139"
local function insertUrlBreakpoints(text)
  return (text:gsub("https?://[^%)%s]+", function(url)
    return (url:gsub("([/%?&=])", "%1" .. ZWSP))
  end))
end

-- For PDF: convert pandoc Note elements (endnotes) to inline Span elements
-- with class "fn-inline" so CSS float:footnote renders them at page bottom.
-- This is a no-op for EPUB/Kindle/screen (only active when pdf=true).
local function convertNote(note)
  if output_mode ~= "pdf" then return nil end
  local inlines = pandoc.List:new()
  for _, block in ipairs(note.content) do
    if block.t == "Para" or block.t == "Plain" then
      if #inlines > 0 then
        inlines:insert(pandoc.Space())
      end
      inlines:extend(block.content)
    end
  end
  inlines = inlines:map(function(inline)
    if inline.t == "Str" then
      return pandoc.Str(insertUrlBreakpoints(inline.text))
    end
    return inline
  end)
  return pandoc.Span(inlines, pandoc.Attr("", {"fn-inline"}, {}))
end

return {{Meta = readMeta}, {Div = processDiv, Header = processHeader, Note = convertNote}}
