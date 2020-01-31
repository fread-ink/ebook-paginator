
Variation that sacrifices speed for obeying `break-inside`, `break-before` and break-after`.

Here are the calculation times for a 500 page document for various browsers:

* Chromium 78: 1.0 seconds
* Firefox 71: 2.3 seconds
* Epiphany (WebKit2GTK): 9.9 seconds

A demo is [hosted here](https://juul.io/paginator-chunk/).

Pressing `space` progresses to the next page . You can also press `s` to start a synchronous test to calculate the page boundaries. Open the console to see the timing measurement.

This example requires that you have permissions to access the document inside the iframe from javascript in the main document.

You need to host this example on a web server since browsers consider two files loaded from the filesystem to be from different domains and thus does not allow accessing the iframe document.

Currently doesn't take into account page resizing, scrolling or font size changes, so reload after changing any of that.

# ToDo

* Wait for images to load
* Handle situations where not even a single node could be added to the page before overflow
* Pre-paginate several pages and keep buffer of past pages, then move between them
* Add deep-clone of non-container nodes

## break-before / break-after

While `break-inside` can be used to avoid page breaks inside an element, `break-before` and `break-after` do nothing in firefox (not even when printing) but when set to 'column' then they do force a break when inside a column, but only on webkit and chrome. This works even when not printing. We could re-write the othersimilar values e.g. 'page', 'left', 'right', 'verso' and 'lefto' to 'column' and that would then work correctly in webkit.

Using `break-before` or `break-after` with the value 'avoid', 'avoid-page', 'avoid-column' or 'avoid-region' does nothing in any of the browsers, not even when printing.

Both of these are annoying to implement manually as they'd require us to backtrack if multiple successive elements have `break-*:avoid`.

Webkit understands that `page-break-before` and `break-before` are aliases, so getting the computed style for `break-before` will work no matter which is set. Weirdly `break-before: column-avoid` isn't understood but setting `-webkit-column-break-before: avoid;` results in the value `avoid` when fetching the computed style for `break-before`.

This is with WebKitGTK+ 2.26.2.

## Different strategy

If a node has `break-inside` set to 'avoid' then when we encounter it while traversing the tree (we have to add it, but just a shallow copy, before we can check) we simply remove it and add a deep copy instead.