## Printed extras

::: {.tldr custom-style="tldr"}
A marker comment in the index pulls this page into the print interior and nowhere else.
:::

This page isn't listed in `index.yml`. The `__PRINT_ONLY_PAGE__` marker comment stands in its place, and `build.print_inject` swaps the page in for the [PDF]{.smallcaps} build only. A page like this suits material that only works on paper, such as a card meant to be cut out.
