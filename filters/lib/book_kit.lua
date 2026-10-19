-- Shared helpers for book-kit Lua filters.
--
-- Filters load this with:
--   package.path = pandoc.path.directory(PANDOC_SCRIPT_FILE) .. "/lib/?.lua;" .. package.path
--   local book_kit = require("book_kit")

local M = {}

-- The resolved book.config.yml, as JSON. The build writes it to
-- dist/.book-kit/config.json (`book-kit prepare`) and may point
-- $BOOK_KIT_CONFIG at it. When neither file exists (pandoc run by hand, or a
-- book's tests calling a filter directly on a fresh checkout), ask the kit's
-- CLI for the same JSON, so a filter works without a prior build.
function M.config()
  if M._config then return M._config end
  local path = os.getenv("BOOK_KIT_CONFIG") or "dist/.book-kit/config.json"
  local text
  local f = io.open(path, "r")
  if f then
    text = f:read("a")
    f:close()
  else
    local cli = pandoc.path.join({ pandoc.path.directory(PANDOC_SCRIPT_FILE), "..", "bin", "book-kit.js" })
    local ok, out = pcall(pandoc.pipe, "node", { cli, "config" }, "")
    if not ok then
      error(PANDOC_SCRIPT_FILE .. ": can't read " .. path .. " or run `book-kit config` (" ..
        tostring(out) .. "). Run from the book's directory, or set BOOK_KIT_CONFIG.")
    end
    text = out
  end
  M._config = pandoc.json.decode(text, false)
  return M._config
end

-- A map's keys, longest first, then bytewise. pairs() order changes from run
-- to run, so walking a map with it makes any choice between keys that match at
-- the same spot (an emoji with and without its U+FE0F selector) a coin flip.
-- Walking these instead makes the longest match win every time.
function M.sorted_keys(map)
  local keys = {}
  for k in pairs(map) do keys[#keys + 1] = k end
  table.sort(keys, function(a, b)
    if #a ~= #b then return #a > #b end
    return a < b
  end)
  return keys
end

-- Does text contain any of keys (plain substrings, not Lua patterns)?
function M.contains_any(text, keys)
  for _, k in ipairs(keys) do
    if text:find(k, 1, true) then return true end
  end
  return false
end

-- Replace every occurrence of each key with map[key], as plain text: keys
-- aren't Lua patterns and values aren't %-escaped replacement strings.
function M.replace_all(text, map, keys)
  for _, k in ipairs(keys or M.sorted_keys(map)) do
    local out, pos = {}, 1
    while true do
      local s, e = text:find(k, pos, true)
      if not s then break end
      out[#out + 1] = text:sub(pos, s - 1)
      out[#out + 1] = map[k]
      pos = e + 1
    end
    if pos > 1 then
      out[#out + 1] = text:sub(pos)
      text = table.concat(out)
    end
  end
  return text
end

-- Split text at the image-map emoji, returning a pandoc.List of Str and
-- Image inlines. make_image(info) builds the Image for map[emoji]; clean(text),
-- if given, rewrites the text between emoji (empty results are dropped). At a
-- position where several keys match, the first in keys (the longest) wins.
function M.split_emoji(text, map, keys, make_image, clean)
  clean = clean or function(s) return s end
  local inlines = pandoc.List()
  local function emit(s)
    s = clean(s)
    if #s > 0 then inlines:insert(pandoc.Str(s)) end
  end

  while #text > 0 do
    local first_pos, first_key
    for _, k in ipairs(keys) do
      local pos = text:find(k, 1, true)
      if pos and (not first_pos or pos < first_pos) then
        first_pos, first_key = pos, k
      end
    end

    if not first_pos then
      emit(text)
      break
    end
    if first_pos > 1 then emit(text:sub(1, first_pos - 1)) end
    inlines:insert(make_image(map[first_key]))
    text = text:sub(first_pos + #first_key)
  end

  return inlines
end

return M
