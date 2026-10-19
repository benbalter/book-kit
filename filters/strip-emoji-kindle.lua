-- Lua filter to replace color emoji with Kindle-safe alternatives.
-- Color emoji don't render on Kindle e-ink (no bundled emoji font).
-- This filter runs ONLY for the Kindle build (`just kindle`).
--
-- Strategy:
--   - Emoji with B&W Unicode equivalents → use those (text replacement)
--   - Emoji used as subjects of discussion → inline Twemoji PNG images
--   - Any remaining unmapped emoji → stripped silently
--   - Keeps prose readable on e-ink without emoji support

-- B&W Unicode equivalents (render natively on Kindle; simple text swap).
-- NOTE: ❌/✅ are intentionally NOT here — their would-be text equivalents
-- (✗ U+2717 / ✓ U+2713) tofu (render as an empty box) on Kindle's fonts, so
-- they are handled as images in image_map below instead. Arrows (↑ ←) are
-- common glyphs that render reliably, so they stay as text.
local bw_map = {
  ["\u{1F446}"] = "\u{2191}",  -- 👆 → ↑
  ["\u{1F448}"] = "\u{2190}",  -- 👈 → ←
}

-- Image replacements: emoji → {cp = PNG name, alt = alt text}, from
-- emoji.images in book.config.yml, minus entries marked kindle: false. The
-- PNGs (Twemoji, 72×72, CC-BY 4.0) are whitened for e-ink into
-- emoji.kindle_dir. ❌/✅ are images rather than ✗/✓ text, since those tofu
-- on Kindle's fonts.
package.path = pandoc.path.directory(PANDOC_SCRIPT_FILE) .. "/lib/?.lua;" .. package.path
local book_kit = require("book_kit")
local image_map = {}
for emoji, entry in pairs(book_kit.config().emoji.images) do
  if entry.kindle ~= false then image_map[emoji] = entry end
end

-- Catch-all pattern for emoji Unicode ranges that aren't in the map.
-- Only targets Supplemental Plane emoji (U+1Fxxx) which are guaranteed
-- color emoji. BMP symbols (U+2xxx — arrows, dingbats, geometric shapes)
-- are left alone because many render fine in monochrome text fonts.
local emoji_ranges = {
  {0x1F300, 0x1F5FF},  -- Misc Symbols & Pictographs
  {0x1F600, 0x1F64F},  -- Emoticons
  {0x1F680, 0x1F6FF},  -- Transport & Map
  {0x1F700, 0x1F77F},  -- Alchemical Symbols
  {0x1F900, 0x1F9FF},  -- Supplemental Symbols & Pictographs
  {0x1FA00, 0x1FA6F},  -- Chess Symbols
  {0x1FA70, 0x1FAFF},  -- Symbols & Pictographs Extended-A
}

local function is_emoji_codepoint(cp)
  for _, range in ipairs(emoji_ranges) do
    if cp >= range[1] and cp <= range[2] then
      return true
    end
  end
  return false
end

-- Build a UTF-8 pattern that matches any single emoji codepoint
-- not already handled by bw_map. Uses the codepoint ranges above.
local function strip_unmapped_emoji(text)
  local result = {}
  local i = 1
  local len = #text
  local stripped = false

  while i <= len do
    local byte = text:byte(i)
    local cp, seq_len

    -- Decode UTF-8 sequence
    if byte < 0x80 then
      cp, seq_len = byte, 1
    elseif byte < 0xE0 then
      cp = ((byte - 0xC0) * 64) + (text:byte(i+1) - 0x80)
      seq_len = 2
    elseif byte < 0xF0 then
      cp = ((byte - 0xE0) * 4096) + ((text:byte(i+1) - 0x80) * 64) + (text:byte(i+2) - 0x80)
      seq_len = 3
    else
      cp = ((byte - 0xF0) * 262144) + ((text:byte(i+1) - 0x80) * 4096) + ((text:byte(i+2) - 0x80) * 64) + (text:byte(i+3) - 0x80)
      seq_len = 4
    end

    if is_emoji_codepoint(cp) then
      stripped = true
      -- Skip this character (don't add to result)
    else
      table.insert(result, text:sub(i, i + seq_len - 1))
    end

    i = i + seq_len
  end

  return table.concat(result), stripped
end

-- Inline style for emoji images (Kindle ignores external CSS on images)
local kindle_dir = book_kit.config().emoji.kindle_dir

local emoji_style = "height:1em;width:1em;vertical-align:middle;margin:0;padding:0;display:inline;background:transparent;background-color:transparent"

-- Build an inline Image element for an emoji
local function emoji_image(info)
  return pandoc.Image(
    {pandoc.Str(info.alt)},
    kindle_dir .. info.cp .. ".png",
    "",
    pandoc.Attr("", {"emoji"}, {{"width", "16"}, {"height", "16"}, {"style", emoji_style}})
  )
end

local image_keys = book_kit.sorted_keys(image_map)
local bw_keys = book_kit.sorted_keys(bw_map)

-- strip_unmapped_emoji without its second return value.
local function strip_only(text)
  return (strip_unmapped_emoji(text))
end

function Str(el)
  local text = el.text

  -- If text contains image-map emoji, split into Str + Image inlines, after
  -- the B&W swaps; unmapped emoji are stripped from the text in between.
  if book_kit.contains_any(text, image_keys) then
    text = book_kit.replace_all(text, bw_map, bw_keys)
    return book_kit.split_emoji(text, image_map, image_keys, emoji_image, strip_only)
  end

  -- Otherwise, apply B&W text replacements and strip unmapped emoji
  local replaced = book_kit.replace_all(text, bw_map, bw_keys)
  local cleaned, stripped = strip_unmapped_emoji(replaced)
  if stripped or replaced ~= text then
    return pandoc.Str(cleaned)
  end
end
