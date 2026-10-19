-- Lua filter to strip HTML comments (<!-- ... -->) from HTML/EPUB output.
--
-- Editorial notes and linter directives live in the Markdown source as HTML
-- comments -- textlint-disable/enable and markdownlint-disable pragmas, and
-- the occasional note-to-self.
-- They're useful in the source, but Pandoc passes them through to HTML/EPUB as
-- raw nodes, so they ship *inside* the distributed .xhtml/.html files. They're
-- invisible when rendered, but present in view-source and reachable by search
-- indexers -- not something we want in a published book.
--
-- This filter drops any raw-HTML node that is exactly a single comment. The
-- print PDF path already discards them (WeasyPrint), so this closes the gap for
-- the EPUB and HTML deliverables. Wired into the epub/kindle/html recipes in
-- the justfile.

local function is_html_comment(fmt, text)
  if not (fmt == "html" or fmt == "html4" or fmt == "html5") then
    return false
  end
  local trimmed = text:gsub("^%s+", ""):gsub("%s+$", "")
  -- Must open with "<!--", close with "-->", and be a *single* comment: the
  -- first "-->" has to be the final three characters, so a raw block mixing a
  -- comment with real markup (e.g. `<!-- x --> <span>`) is left untouched.
  if trimmed:sub(1, 4) ~= "<!--" then return false end
  if trimmed:sub(-3) ~= "-->" then return false end
  local first_close = trimmed:find("-->", 1, true)
  return first_close == #trimmed - 2
end

function RawBlock(el)
  if is_html_comment(el.format, el.text) then
    return {}
  end
end

function RawInline(el)
  if is_html_comment(el.format, el.text) then
    return {}
  end
end
