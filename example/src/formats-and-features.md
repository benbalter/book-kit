# Going further {.section-opener}

## Formats and features

::: {.tldr custom-style="tldr"}
Tables, code, and emoji render in every format, with per-format fallbacks where a reader can't display them.
:::

Kindle e-ink can't show color emoji, so the build swaps in images: 👍 🎉 💡.

| Format | Built by | Notes |
| ------ | -------- | ----- |
| [EPUB]{.smallcaps} | pandoc | Reader-controlled typography |
| [PDF]{.smallcaps} | WeasyPrint | 6×9 trade paperback |
| [HTML]{.smallcaps} | pandoc | Self-contained page |

```sh
just all
```

> A blockquote, for good measure.
