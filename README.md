
Work-in-progress in-browser javascript library that consumes an HTML file and displays it one page at a time. This library focuses on fast performance (especially in WebKit) and low memory consumption (usable on systems with 256 MB ram).

A demo is [hosted here](https://juul.io/paginator-nice/).

Pressing `space` progresses to the next page or `b` for previous. You can also press `t` to start a synchronous test to calculate the page boundaries. Open the console to see the timing measurement.

Here are the pagination times for a 400 page document for various browsers done on an i5-2520M CPU @ 2.50GHz:

* Chromium 78: 1.0 seconds
* Firefox 71: 2.1 seconds
* Epiphany (WebKit2GTK): 2.5 seconds

You need to host the code on a web server since browsers consider two files loaded from the filesystem to be from different domains and thus does not allow accessing the sample ebook chapter html file.

Currently doesn't take into account page resizing, scrolling or font size changes, so reload after changing any of that.

# API

Create an element (e.g. a <div>) with a specified height where you want the content to appear, then:

```
const paginator = new Paginator(pageID, contentURI, opts);
```

Where `pageID` is the `id=` of the element and `contentURI` is the URI of an HTML document you want to show, one page at a time, inside your `pageID` element.

Setting `opts.columnLayout` to `true` will cause the paginator to use a different method for calculating how much to put on each page. This method is based on setting the `column-width` CSS property. This will use the browser's built-in support for the CSS rules `break-inside`, `break-before` and `break-after` which is probably better than this library's support but will incur a serious performance penalty on WebKit (4-5x slower). See the "Page breaks" section.

# Other content paginators

If you don't need speed or low memory consumption then take a look at:

* [Epub.js](https://github.com/futurepress/epub.js) - In-browser e-book reader
* [Paged.js](https://gitlab.pagedmedia.org/tools/pagedjs) - CSS polyfill for paged (print) media
* [Vivliostyle](https://github.com/vivliostyle/vivliostyle) - A very feature-complete in-browser e-book reader

# Implementation details

There are at least a few good ways to accomplish this type of pagination.

One way is to load the HTML in an iframe, put a `column-width` CSS style on the iframe that makes the content reflow into a page the exact width of the desired page, resize the iframe to make it wide enough to fit the entire HTML document and then move the iframe element left one page width at a time to show the next page. This solution has the advantage that it is simple to implement and is in fact used by [Epub.js](https://github.com/futurepress/epub.js) but has the following issues. First, it freezes the browser tab until pagination is done and even on Chrome, which is very fast at column layout, paginating a 1000 page HTML page will take multiple seconds on slower computer. On WebKit column layout is slow, and laying out a 1000 page HTML page can take over a minute! Another issue is that CSS rules relating to column layout inside the HTML may malfunction, e.g. the `break-inside:avoid-column` will act as `break-inside:avoid-page`. A proof of concept example of this type of implementation is in the [iframe-paginator](https://github.com/Juul/iframe-paginator/tree/iframe-paginator) branch of this repo.

Another way is to parse the source HTML with the browser's built-in DOM parser, then walk through the nodes in order, adding them to the desired page one by one, while checking whether the node caused the page to overflow, then backtracking. This is much more complicated from an implementation standpoint and has the disadvantage that it is actually slower in Chrome and Firefox (40% and 30% slower respectively) but it is almost six times faster in WebKit _and_ can be done asynchronously such that it doesn't freeze the browser. In fact,

There are two sub-types of this last method: One where overflow is checked using column-based layout as in the previously described method and one where overflow checked without resorting to column layout. The first sub-type is used by the [Paged.js](https://gitlab.pagedmedia.org/tools/pagedjs) paged media polyfill but this solution again suffers poor performance on WebKit. The second sub-type it employed by this library.

# Page breaks

## break-inside

Currently the `break-inside` values of 'avoid' and 'avoid-page' are handled correctly by this library. The value 'avoid-column' has nothing to with pagination so it is not handled by this library but may be handled by your browser.

## break-before / break-after

Currently only `break-before` with a values of 'always', 'all', 'page', 'left', 'right', 'recto' or 'verso' is handled by this library. They are all treated the same since currently only single-page pagination is supported. Not all of these values work in all browsers since they may be rejected by the browser's CSS parser if they are not recognized.

While `break-inside` can be used to avoid page breaks inside an element, `break-before` and `break-after` do nothing in firefox (not even when printing) but when set to 'column' then they do force a break when inside a column, but only on webkit and chrome. This works even when not printing. We could re-write the othersimilar values e.g. 'page', 'left', 'right', 'verso' and 'lefto' to 'column' and that would then work correctly in webkit.

Using `break-before` or `break-after` with the value 'avoid', 'avoid-page', 'avoid-column' or 'avoid-region' does nothing in any of the browsers, not even when printing.

Both of these are annoying to implement manually as they'd require us to backtrack if multiple successive elements have `break-*:avoid`.

Webkit understands that `page-break-before:all` and `break-before:page` are aliases, so getting the computed style for `break-before` will work no matter which is set. Weirdly `break-before: column-avoid` isn't understood but setting `-webkit-column-break-before: avoid;` results in the value `avoid` when fetching the computed style for `break-before`.

This is with WebKitGTK+ 2.26.2.

# Limitations

If an element has a specified height, e.g. `height: 100px` then a page break will never happen inside of the element.

If the first element on a page is tall enough that it can't fit on the page, and the paginator does not know how to break inside of the element (e.g. an <img> or an element with a specified height), then the element will have its `width` set to 'auto' and its `max-height` set to the height of the page.

When a page break happens inside an element where its width is determined by the contents, then the part of the element before and after the page break could have different widths. This is often noticable for `<table>` elements. The only way around this would be to finish paginating however many pages it takes before reaching the end of the element. Unfortunately the worst case scenario here is that showing a single page requires paginating the entire html file.

## Backwards pagination

NOTE: This problem can be solved by setting the `left`, `right` and `bottom` positions on the containing element (page), but leaving `top` unset. This will cause the page to overflow at the top.

Unfortunately paginating backwards from an arbitrary starting location is non-trivial. Because elements are added in the opposite order of the page flow, the element causing the overflow will be at the bottom of the page, while the element that is being added (and may need to be split in two) is at the top. If the top element is a text element then the only safe way to precisely figure out where to split the top element would be to iteratively split the top element at different locations, adding it to the DOM, and seeing if that caused the bottom element to overflow. This is probably slow, even if implemented with binary search. Doing this in an imprecise manner would case forwards and backwards pagination to give different results, which would be confusing.

There are two side-effects from not having backwards pagination. First, going to a bookmarked location will only be precise to the page since we can't just start paginating from an arbitrary element but have to start paginating from page 1. If e.g. the font size has been changed since the bookmark was created then the bookmark may no longer be at the start of a page.

Second, in order to paginate backwards the paginator must first paginate forwards to the current location from page 1.

If we had backwards pagination then it would be trivial to jump to a precise bookmark and move forwards or backwards from there.

# Options

`repeatTableHeader`: If this is true and a page break happens inside a `<table>` element, then the last header row before the page break (if any) will be repeated on the next page. This works for both `<thead>` elements and `<tr>` elements with `<th>` elements inside. If neither `<thead>` nor `<th>` elements are used then the header element cannot be detected. Default value is true.

# ToDo

* Copy CSS into iframe document and wait for it to load
* Also copy inline styles into iframe document
* Add option to inject CSS (by URI)
* Quietly paginate several pages ahead in the background (especially backwards)
* Unit tests

Bugs:

* Fix doubling of table header if cut-off happens at top of table
* Trying to paginate to next page during load (waiting for img) stops pagination

Nice to have:

* Add pageCount function
* Add option to auto-recalc on browser resize or font size changes
* Handle top-to-bottom text flow
* Add support for at least the 'truthy' values for `break-after`

## Bookmarks

Maybe have paginate() return not only the ref to the next node but also the number of nodes it paginated through. Then keep track of the node count for the current page's start node.

Then add a function that does the exact same stepping through nodes as the paginator but only counts nodes until it reaches the specified number.