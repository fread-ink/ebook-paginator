
An in-browser javascript library that consumes an HTML file and displays it one page at a time. Useful for reading ebooks. This library focuses on fast performance (especially in WebKit) and low memory consumption (usable on systems with 256 MB ram).

An example is in `example/`. Build it with `npm run build`. You need to host the code on a web server since browsers consider two files loaded from the filesystem to be from different domains and thus does not allow accessing the sample ebook chapter html file.

The example doesn't take into account page resizing, scrolling or font size changes, so reload after changing any of that.

# NPM

This module is on `npm` so you can:

```
npm install ebook-paginator
```

# API

Create an element (e.g. a <div>) with a specified height where you want the content to appear, then:

```
const Paginator = require('Paginator');
const paginator = new Paginator(pageID, {});
await paginator.load(contentURI);
```

Where `pageID` is the `id=` of the element and `contentURI` is the URI of an HTML document you want to show one page at a time inside your `pageID` element.

## Constructor options

`loadCSS`: If this is true then CSS referenced by `<link rel="stylesheet" href="<uri>">` and from inside `<style type="text/css">` tags in the source document is added to the rendered document. Default value for this option is true.

`loadScripts`: If true, allow `<script>` content from the source document to run. Default value is false.

`preprocessCSS`: If this is true then all CSS from the source document is pre-processed to enhance compatibility with epub-specific CSS rules. Since many of the `-epub-<something>` CSS rules are available in modern browsers but without the `-epub-` prefix, this option causes all `-epub-<something>` CSS rules to be repeated without the `-epub-` prefix. Default value for this option is true. Only has an effect if the `postcss` library was available when the bundle was generated. Note enabling this option increases memory usage. See the "Memory usage" section for more info.

`cacheForwardPagination`: If this is true then the point at which page breaks happened during forward pagination are cached and re-used when backward paginating to the same pages. This is nice because backward pagination does not always result in page breaks in the same locations as forward pagination (due to CSS rules like break-before) but it may feel odd to the user if moving forward one page and then back one page gives a different result. By enabling caching, the pages will be paginated the same. Note that backwards pagination is never cached/re-used, only forward pagination. This option has no effect if a location was arrived at by means other than forward paginating to the page (e.g. using a bookmark) since then no pagination results have been prevously cached. If this option is false then pagination is always re-calculated. This cache should be invalidated when e.g. font size or page size is changed by calling `.redraw(true)`. Default value for this option is true. 

`detectEncoding`: Set to true to force manual detection of encoding. Useful in case the source (usually a web server) sends the wrong mimetype. E.g. if an XHTML file has the HTML extension the wrong mimetype will likely be sent and encoding detection can fail. This is enabled by default but can cause the source document to be re-parsed once or twice. See the _Detecting encoding_ sub-section under _Implementation details_ for more info.

## async load(contentURI)

Load an HTML document from the specified URI and paginate the first page.

## async nextPage()

Paginate another pageful of content in the forward direction.

## async prevPage()

Paginate another pageful of content in the backward direction.

## async firstPage()

Go to beginning of document and paginate a pageful of content.

## getBookmark()

Returns a serializable bookmark object for the current location (top of current page). Note that boomark objects only remain valid as long as the paginated html that the bookmark was made for does not change.

## async gotoBookmark(bookmark)

Start paginating from the bookmarked location. Takes a bookmark object as argument.

## async redraw()

Re-render the currently shown page. You should call this whenever the font size or page size changes.

## async injectCSS(css, opts)

Add custom CSS to the page. `css` is a string containing the CSS.

```
opts.order: 'after' // or 'before' inject <style> tag before or after existing tags
opts.preprocess: true // Should CSS be pre-processed using PostCSS (if available)
``` 

Returns the generated `<style>` element.

## async injectCSSByURI(uri, opts)

Same as `injectCSS()` but takes a URI to a CSS file.

## clearCSS(clearAll)

Remove all injected CSS elements. If `clearAll` is true, then remove _all_ CSS, including CSS from the source document (except in-line CSS).

## Experimental constructor options

`repeatTableHeader`: Not currently reliable. If this is true and a page break happens inside a `<table>` element, then the last header row before the page break (if any) will be repeated on the next page. This works for both `<thead>` elements and `<tr>` elements with `<th>` elements inside. If neither `<thead>` nor `<th>` elements are used then the header element cannot be detected. Default value is false.

`columnLayout`: This feature hasn't been maintained recently and may not work as expected. Setting `opts.columnLayout` to `true` will cause the paginator to use a different method for calculating how much to put on each page. This method is based on setting the `column-width` CSS property. This will use the browser's built-in support for the CSS rules `break-inside`, `break-before` and `break-after` which is probably better than this library's support but will incur a serious performance penalty on WebKit (4-5x slower). See the "Page breaks" section.

# Usage without npm

If you don't need the CSS pre-processing then you don't need `npm` nor `browserify` or any build tool. You can simply load `script.js` directly in your browser.

# Quirks and limitations

Vertical text layout modes (e.g. `writing-mode: vertical-rl`) are not yet supported. This can break everything even if _any_ amount of vertically laid out text is paginated. Hopefully this will be suported in the future

If an element has a specified height, e.g. `height: 100px` then a page break will never happen inside of the element.

If the first element on a page is tall enough that it can't fit on the page, and the paginator does not know how to break inside of the element (e.g. an <img> or an element with a specified height), then the element will have its `width` set to 'auto' and its `max-height` set to the height of the page.

When a page break happens inside an element where its width is determined by the contents, then the part of the element before and after the page break could have different widths. This is often noticable for `<table>` elements. The only way around this would be to finish paginating however many pages it takes before reaching the end of the element. Unfortunately the worst case scenario here is that showing a single page requires paginating the entire html file.

While CSS rules from the source HTML should apply cleanly without modification, there is currently a few exceptions. The following rules are applid to the `<body>` element by this library:

```
body {
  display: block !important; 
  position: absolute !important;
  top: 0 !important;
  bottom: 0 !important;
  left: 0 !important;
  right: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
}
```

That means that any margins or padding specified by the source HTML are ignored. This is probably OK for ebook-related use cases since the user will likely want control of margin/padding. It may however be possible to reduce or eliminate these in the future.

## break-inside

Currently the `break-inside` values of 'avoid' and 'avoid-page' are handled correctly by this library. The value 'avoid-column' has nothing to with pagination so it is not handled by this library but may be handled by your browser.

## break-before / break-after

Currently only `break-before` with a values of 'always', 'all', 'page', 'left', 'right', 'recto' or 'verso' is handled by this library. All of the supported values for `break-before` are treated the same since currently only single-page pagination is supported. Not all of these values work in all browsers since they may be rejected by the browser's CSS parser if they are not recognized.

## Backward pagination

The simple way to implement backward pagination is to simply cache where the page boundaries occurred during forward pagination and re-use those locations when backward paginating. The problem occurs when the user arrives at a page without forward paginating to that page. This can occur by clicking a link or bookmark. Another issue pops up if the font size or page size is changed, which would invalidate the cache. One way to solve this would be to forward paginate from page 1 to the current location in the background to re-build the cache. This would be problematic, both for perfomance reasons, but also because there is no guarantee that a page boundary matches up with the location of the link or bookmark. It would be odd if going to a bookmarked location takes you to a page where the bookmarked location is right at the bottom of the page.

Another way to solve this, and the method used by this code, is to implement pagination in the backward direction such that it becomes possible to start paginating forward or backward from any point in a book. The problem with this solution is that paginating backward and forward will sometimes give different results for the same page. That is: Moving one page forward and then one page back can result in different content being shown. This is due to CSS rules such as `break-before` which can cause a bunch of empty space at the end of a page when paginating forward but not when paginating backward.

If the `cacheForwardPagination` option is true (the default) then a hybrid solution is used where the results of forward pagination are remembered and re-used when backward pagination such that moving back and forth over the same pages won't give different results. However, if no forward pagination has has occurred before backward paginating (or the cache has been invalidated by font or page size changes) then true backward paginating is used.

# Implementation details

## Pagination strategies

There are at least a few good ways to accomplish this type of pagination.

One way is to load the HTML in an iframe, put a `column-width` CSS style on the iframe that makes the content reflow into a page the exact width of the desired page, resize the iframe to make it wide enough to fit the entire HTML document and then move the iframe element left one page width at a time to show the next page. This solution has the advantage that it is simple to implement and is in fact used by [Epub.js](https://github.com/futurepress/epub.js) but has the following issues. First, it freezes the browser tab until pagination is done and even on Chrome, which is very fast at column layout, paginating a 1000 page HTML page will take multiple seconds on slower computer. On WebKit column layout is slow, and laying out a 1000 page HTML page can take over a minute! Another issue is that CSS rules relating to column layout inside the HTML may malfunction, e.g. the `break-inside:avoid-column` will act as `break-inside:avoid-page`. A proof of concept example of this type of implementation is in the [iframe-paginator](https://github.com/Juul/iframe-paginator/tree/iframe-paginator) branch of this repo.

Another way is to parse the source HTML with the browser's built-in DOM parser, then walk through the nodes in order, adding them to the desired page one by one, while checking whether the node caused the page to overflow, then backtracking. This is much more complicated from an implementation standpoint and has the disadvantage that it is actually slower in Chrome and Firefox (at least 40% and 30% slower respectively) but it is almost six times faster in WebKit _and_ can be done asynchronously such that it doesn't freeze the browser.

There are two sub-types of this last method: One where overflow is checked using column-based layout as in the previously described method and one where overflow checked without resorting to column layout. The first sub-type is used by the [Paged.js](https://gitlab.pagedmedia.org/tools/pagedjs) paged media polyfill but this solution again suffers poor performance on WebKit. The second sub-type it employed by this library.

## Detecting encoding

The only way to automatically detect encoding on an HTML/XHTML that is loaded and parsed rather than just opened in a frame/iframe is to use XMLHTTPRequest with `.responseType = 'document'` and accessing `.responseXML`.

[developer.mozilla.org](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/HTML_in_XMLHttpRequest) has this to say about how encoding is detected:

> If the character encoding is declared in the HTTP Content-Type header, that character encoding is used. Failing that, if there is a byte order mark, the encoding indicated by the byte order mark is used. Failing that, if there is a <meta> element that declares the encoding within the first 1024 bytes of the file, that encoding is used. Otherwise, the file is decoded as UTF-8.

However, the file `test/encoding_detect_fail.html` is detected by Firefox as having the encoding `windows-1252` (at least when served up by Apache 2) even though it has no Byte Order Mark and the XML header specifies `utf-8` as the encoding.

If the `.detectEncoding` option is set then a manual detection method is used. This first detects if the file is an XHTML document by looking for an `xmlns` property on the `<html>` tag , then detects encoding by checking, in order of presedence: The `encoding=` attribute of the `<?xml?>` header (if it's an XHTML document), then any `<meta content="... charset=<encoding>">` and `<meta charset="<encoding>">` tags where the last tag specifying an encoding overwrites all previous.

If nothing is found, UTF-8 is assumed.

## break-inside, break-before and break-after

Here are some notes on native browser support of these features. This was true as of Febrary 25th 2020.

While `break-inside` can be used to avoid page breaks inside an element, `break-before` and `break-after` natively do nothing in firefox (not even when printing) but when set to 'column' then they do force a break when inside a column, but only on webkit and chrome. This works even when not printing. We could re-write the other similar values e.g. 'page', 'left', 'right', 'verso' and 'lefto' to 'column' and that would then work correctly in webkit.

Using `break-before` or `break-after` with the value 'avoid', 'avoid-page', 'avoid-column' or 'avoid-region' does nothing in any of the browsers, not even when printing. Both of these are annoying to implement manually as they'd require us to backtrack if multiple successive elements have `break-*:avoid`.

Webkit understands that `page-break-before:all` and `break-before:page` are aliases, so getting the computed style for `break-before` will work no matter which is set. Weirdly `break-before: column-avoid` isn't understood but setting `-webkit-column-break-before: avoid;` results in the value `avoid` when fetching the computed style for `break-before`. This is with WebKitGTK+ 2.26.2.

# Other content paginators

If you don't need speed or low memory consumption then take a look at:

* [Epub.js](https://github.com/futurepress/epub.js) - In-browser e-book reader
* [Vivliostyle](https://github.com/vivliostyle/vivliostyle) - A very feature-complete in-browser e-book reader
* [Paged.js](https://gitlab.pagedmedia.org/tools/pagedjs) - CSS polyfill for paged (print) media

# Memory usage

Since this library was written with the [fread.ink UI](https://github.com/fread-ink/fread.ui) in mind, which uses WebKit, here are some results of brief tests on WebKit.

Using browserify vs. plain js with no build tool (and no require) had no measurable impact on memory usage.

`require`ing both `postcss` and `postcss-epub` and processing a single CSS file before injecting it took ~2.5 MB extra ram for a tiny 60 byte CSS file and 11 MB extra for a fairly chunky 80 kB CSS file (unusually large for an ebook). Hopefully most of the ram above 2.5 MB will be reclaimed by the garbage collector. Splitting the 80 kB CSS file into three files had no significant impact on memory usage.

# ToDo

In order of priority:

* Unit tests
* Disable scripts from running and enable same-origin-policy while adding content, then when done adding content disable same-origin-policy before enabling scripts to run (if opts.allowScripts is true)
* Handle top-to-bottom text flow and mixed side-to-side/top-to-bottom content
* Reduce / eliminate the CSS rules applied to `<body>` by this library
* Add option to re-load `<script>` tags outside `<body>` after each pagination run (remove the elements before paginating, then re-add them after). Maybe figure out how to fake a document loaded event after each pagination as well?

## Nice to have

* Implement column based pagination as alternate strategy see [this example code](https://github.com/fread-ink/ebook-paginator/tree/iframe-paginator)
* Figure out how to render partial table with same cell sizes as full table
* Implement gotoPage()
* Add support for at least the 'truthy' values for `break-after`

## Minor bugs:

* Fix `repeatTableHeader` doubling of table header if cut-off happens at top of table
* `repeatTableHeader` doesn't work for backward pagination

# Copyright and license

Copyright 2020 Marc Juul

License: AGPLv3