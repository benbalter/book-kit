-- The fixture book's own EPUB filter (build.extra_filters.epub): marks every
-- chapter heading so a test can tell the filter ran, in its slot in the chain.
function Header(el)
  if el.level == 2 then
    el.attributes["data-book-filter"] = "mark-headings"
    return el
  end
end
