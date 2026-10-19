-- Lua filter: convert body-text color emoji to inline Twemoji <img> for the
-- PRINT PDF only.
--
-- Why: WeasyPrint renders raw emoji characters via a fallback emoji font, where
-- they come out undersized and sitting high above the baseline (small + too
-- high). Converting them to sized <img class="emoji"> elements lets the
-- `img.emoji` rule in @media print control their size and baseline alignment so
-- they match the surrounding serif text.
--
-- Scope: this filter is wired only into the PDF pipeline (justfile `pdf`
-- recipe). It mirrors the Kindle emoji-image approach in strip-emoji-kindle.lua
-- but keeps the color Twemoji from emoji.source_dir — no B&W swaps and no
-- stripping; every non-emoji character is preserved exactly. Callout-label
-- emoji are emitted as Image elements by add-div-titles.lua and are never Str,
-- so they are untouched here.
--
-- Only emoji listed in emoji.images (book.config.yml) are converted; anything
-- else is left as text.

package.path = pandoc.path.directory(PANDOC_SCRIPT_FILE) .. "/lib/?.lua;" .. package.path
local book_kit = require("book_kit")
local body_dir = book_kit.config().emoji.pdf_body_dir

-- emoji character sequence → {cp = PNG name, alt = alt text}, from
-- emoji.images in book.config.yml.
local image_map = book_kit.config().emoji.images

-- Build an inline Image element for an emoji. emoji.pdf_body_dir is relative
-- to the PDF base-url (dist/). Those PNGs are opaque, flattened onto white
-- (commands/composite-print-emoji.py) so the PDF/X-1a step's -dNOTRANSPARENCY has
-- no alpha to drop — body emoji sit on the white page, so a white flatten is
-- invisible. Size and vertical alignment are left to `img.emoji` in @media print.
local function emoji_image(info)
  return pandoc.Image(
    {pandoc.Str(info.alt)},
    body_dir .. info.cp .. ".png",
    "",
    pandoc.Attr("", {"emoji"}, {{"width", "16"}, {"height", "16"}})
  )
end

local image_keys = book_kit.sorted_keys(image_map)

function Str(el)
  if book_kit.contains_any(el.text, image_keys) then
    return book_kit.split_emoji(el.text, image_map, image_keys, emoji_image)
  end
end
