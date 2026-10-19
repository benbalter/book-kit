import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const libDir = fileURLToPath(new URL('../filters/lib/', import.meta.url));

// Run a Lua snippet under `pandoc lua` with filters/lib/book_kit.lua loaded as
// `bk`, and return what it prints.
function lua(code) {
  const script = `package.path = ${JSON.stringify(libDir)} .. "?.lua;" .. package.path
local bk = require("book_kit")
${code}`;
  return execFileSync('pandoc', ['lua', '-'], { input: script, encoding: 'utf8' }).trim();
}

const HEART = '❤';
const HEART_VS16 = '❤️';

describe('book_kit.lua emoji helpers', () => {
  it('sorts keys longest first, then bytewise', () => {
    const out = lua(`print(table.concat(bk.sorted_keys({ b = 1, aaa = 1, a = 1, cc = 1 }), ","))`);
    expect(out).toBe('aaa,cc,a,b');
  });

  it('prefers the longest key when two match at the same spot', () => {
    // Without a fixed order, pairs() decides whether the bare heart or the
    // heart + VS16 wins, and a stray U+FE0F can be left behind.
    const out = lua(`
local map = { ["${HEART}"] = { cp = "short" }, ["${HEART_VS16}"] = { cp = "long" } }
local inlines = bk.split_emoji("a${HEART_VS16}b${HEART}c", map, bk.sorted_keys(map),
  function(info) return pandoc.Str("[" .. info.cp .. "]") end)
local parts = {}
for _, el in ipairs(inlines) do parts[#parts + 1] = el.text end
print(table.concat(parts, "|"))`);
    expect(out).toBe('a|[long]|b|[short]|c');
  });

  it('replaces keys and values as plain text, not Lua patterns', () => {
    const out = lua(`print(bk.replace_all("50% off. 50% off.", { ["50%"] = "%1", ["."] = "!" }))`);
    expect(out).toBe('%1 off! %1 off!');
  });

  it('drops text segments the cleaner empties', () => {
    const out = lua(`
local map = { x = { cp = "x" } }
local inlines = bk.split_emoji("ZxZ", map, { "x" },
  function(info) return pandoc.Str("<" .. info.cp .. ">") end,
  function(s) return (s:gsub("Z", "")) end)
print(#inlines, inlines[1].text)`);
    expect(out).toBe('1\t<x>');
  });
});
