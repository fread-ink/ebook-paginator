
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

# API

Create an element (e.g. a <div>) with a specified height where you want the content to appear, then:

```
const paginator = new Paginator(pageID, contentURI, opts);
```

Where `pageID` is the `id=` of the element and `contentURI` is the URI of an HTML document you want to show, one page at a time, inside your `pageID` element.

Setting `opts.columnLayout` to `true` will cause the paginator to use a different method for calculating how much to put on each page. This method is based on setting the `column-width` CSS property. This will use the browser's built-in support for the CSS rules `break-inside`, `break-before` and `break-after` which is probably better than this library's support but will incur a serious performance penalty on WebKit (4-5x slower). See the "Page breaks" section.

# Page breaks

## break-inside

Currently the `break-inside` values of 'avoid' and 'avoid-page' are handled correctly by this library. The value 'column-avoid' has nothing to with pagination so it is not handled by this library but may be handled by your browser.

## break-before / break-after

These are not handled by this library and only partially handled by current browsers.

While `break-inside` can be used to avoid page breaks inside an element, `break-before` and `break-after` do nothing in firefox (not even when printing) but when set to 'column' then they do force a break when inside a column, but only on webkit and chrome. This works even when not printing. We could re-write the othersimilar values e.g. 'page', 'left', 'right', 'verso' and 'lefto' to 'column' and that would then work correctly in webkit.

Using `break-before` or `break-after` with the value 'avoid', 'avoid-page', 'avoid-column' or 'avoid-region' does nothing in any of the browsers, not even when printing.

Both of these are annoying to implement manually as they'd require us to backtrack if multiple successive elements have `break-*:avoid`.

Webkit understands that `page-break-before` and `break-before` are aliases, so getting the computed style for `break-before` will work no matter which is set. Weirdly `break-before: column-avoid` isn't understood but setting `-webkit-column-break-before: avoid;` results in the value `avoid` when fetching the computed style for `break-before`.

This is with WebKitGTK+ 2.26.2.

# ToDo

* Wait for images to load
* Handle situations where not even a single node could be added to the page before overflow
* Pre-paginate several pages and keep buffer of past pages, then move between them
* Add deep-clone of non-container nodes
* Add support for at least the 'truthy' values for `break-before` and `break-after`
