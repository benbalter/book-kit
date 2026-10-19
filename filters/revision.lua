-- Fills [...]{.revision} spans with the build stamp from the `date` metadata
-- ("<version> (<sha>)", set by book-kit), so the copyright page shows which
-- build a reader has without the build rewriting the source file.

local stamp

return {
  {Meta = function(meta)
    if meta.date then stamp = pandoc.utils.stringify(meta.date) end
  end},
  {Span = function(span)
    if stamp and span.classes:includes("revision") then
      span.content = pandoc.Inlines(stamp)
      return span
    end
  end},
}
