-- callout-classes.lua
-- Gives a book's own callouts the theme's look. The kit theme styles its
-- core callouts (note, tip, warning) and business-nonfiction's by class; any
-- other class in the callouts registry gets the generic `callout` class (the
-- .note look in every format) and a data-label attribute, which the theme
-- draws as the label in the web edition. add-div-titles.lua adds the label to
-- the content in every other format.
--
-- A registry entry with `generic: false` opts out, for a book that styles that
-- callout in its own CSS.

package.path = pandoc.path.directory(PANDOC_SCRIPT_FILE) .. "/lib/?.lua;" .. package.path
local book_kit = require("book_kit")

-- The callout classes css/theme/ styles itself.
local THEMED = {
  ["note"] = true, ["tip"] = true, ["warning"] = true,
  ["tldr"] = true, ["pro-tip"] = true, ["for-managers"] = true, ["for-ics"] = true,
  ["common-objection"] = true, ["takeaways"] = true,
}

local generic = {}
for _, c in ipairs(book_kit.config().callouts or {}) do
  if not THEMED[c.class] and c.generic ~= false then table.insert(generic, c) end
end

-- Nothing to do for a book that only uses themed callouts.
if #generic == 0 then return {} end

function Div(div)
  for _, c in ipairs(generic) do
    if div.classes:includes(c.class) then
      if not div.classes:includes("callout") then div.classes:insert("callout") end
      if c.label then
        div.attributes["data-label"] = c.emoji and (c.emoji .. " " .. c.label) or c.label
      end
      return div
    end
  end
end
