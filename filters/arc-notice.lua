-- arc-notice.lua
-- Stamps an "Advance Reader Copy — not for redistribution" notice onto the
-- copyright page. Active ONLY when the build passes `--metadata arc=true`
-- (the `just arc` recipe); every other build is a no-op and returns the
-- document untouched.
--
-- The notice is prepended to the `#copyright-container` div so it reads as the
-- first thing on the copyright page. It establishes that the free advance file
-- is licensed for review, not for resale or redistribution. The text comes from
-- strings.arc_notice in book.config.yml.

package.path = pandoc.path.directory(PANDOC_SCRIPT_FILE) .. "/lib/?.lua;" .. package.path
local book_kit = require("book_kit")

function Pandoc(doc)
  if not doc.meta.arc then return nil end
  local text = book_kit.config().strings.arc_notice

  return doc:walk {
    Div = function(el)
      if el.identifier ~= "copyright-container" then return nil end

      local notice = pandoc.Div(
        pandoc.Para {
          pandoc.Strong { pandoc.Str(text.heading) },
          pandoc.Space(),
          pandoc.Str(text.body),
        },
        pandoc.Attr("", { "arc-notice" }, {})
      )

      table.insert(el.content, 1, notice)
      return el
    end,
  }
end
