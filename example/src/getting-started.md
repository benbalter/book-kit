# Getting started {.section-opener epub:type=introduction}

::: {.lead custom-style="lead"}
This section opens the book. A section opener is a level-one heading followed by a short lead paragraph.
:::

## Writing a chapter

::: {.tldr custom-style="tldr"}
Each chapter is one Markdown file, listed in `index.yml`, that opens with a one- or two-sentence summary.
:::

Chapters live in `src/` and use [pandoc's Markdown](https://pandoc.org/MANUAL.html#pandocs-markdown). The build turns the same source into an [EPUB]{.smallcaps}, a Kindle file, a print-ready [PDF]{.smallcaps}, and a web page.

Links become footnotes in print, because paper can't click.[^paper]

[^paper]: Footnotes written by hand work too.

### Cross-references

Link to another chapter by its heading: see [callouts and conventions](#callouts-and-conventions).
