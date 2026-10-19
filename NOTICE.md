# Third-party notices

book-kit is licensed under the [MIT License](LICENSE). It bundles the
following third-party assets, whose own licenses apply to those files rather
than the MIT License.

## Fonts

The theme uses Adobe's Source Serif 4, Source Sans 3, and Source Code Pro,
licensed under the [SIL Open Font License 1.1](https://openfontlicense.org)
with the Reserved Font Name "Source". The license and copyright notices are in:

- [`fonts/LICENSE-source-serif.md`](fonts/LICENSE-source-serif.md)
- [`fonts/LICENSE-source-sans.md`](fonts/LICENSE-source-sans.md)
- [`fonts/LICENSE-source-code-pro.md`](fonts/LICENSE-source-code-pro.md)

The kit doesn't redistribute the fonts. The OFL bars redistributing modified
versions under a Reserved Font Name, and the theme needs Latin subsets and
static Kindle instances. So `book-kit fonts` downloads the unmodified releases
pinned in `toolchain.json` (verified by SHA-256) and builds those files on your
machine from [`fonts/recipe.json`](fonts/recipe.json); embedding them in your
book is permitted.

## Emoji (`emoji/`)

[Twemoji](https://github.com/jdecked/twemoji) graphics, © Twitter, Inc. and
other contributors, licensed under
[CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/). Books built with
these images should credit Twemoji (for example, on the copyright page).

## Pandoc templates (`templates/`)

`templates/template.html` and `templates/template-epub.html` are adapted from
[pandoc](https://pandoc.org)'s default HTML and EPUB templates. Copyright (c)
2014--2024, John MacFarlane. Pandoc's templates are dual-licensed under the
GPL (v2 or higher) or, at your option, the BSD 3-clause license; book-kit uses
them under the BSD 3-clause license:

> Redistribution and use in source and binary forms, with or without
> modification, are permitted provided that the following conditions are met:
> (1) Redistributions of source code must retain the above copyright notice,
> this list of conditions and the following disclaimer. (2) Redistributions in
> binary form must reproduce the above copyright notice, this list of
> conditions and the following disclaimer in the documentation and/or other
> materials provided with the distribution. (3) Neither the name of the
> copyright holder nor the names of its contributors may be used to endorse or
> promote products derived from this software without specific prior written
> permission.
>
> THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
> AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
> IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
> DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
> FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
> DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
> SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
> CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
> OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
> OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

## PDF/X output intent (`profiles/pdfx-def.ps`)

The pdfmark sequence that attaches the PDF/X output intent follows the
example `lib/PDFX_def.ps` shipped with [Ghostscript](https://ghostscript.com)
(Artifex Software, Inc.). Ghostscript itself isn't bundled; the kit runs it
as an external tool.

## Not bundled

The USWebCoatedSWOP ICC profile used for PDF/X-1a conversion is downloaded
on demand and verified by SHA-256 (see `commands/download-icc-profile.sh`);
it isn't redistributed here.
