
An example of how to cleanly break an HTML document into pages without having the last line on each page potentially cut off as usually happens with scrolling.

Uses an `<iframe>` to show an html document then traverses the html elements in the document inside the iframe to figure out what's being cut off at the bottom, then hides whatever is being cut off.

This is an alternative to the CSS `column` based solution in the main branch of this repo. This solution takes quite a bit longer to calculate the location of the page breaks (which is no surprise since here it's done in javascript vs. the browser built-in functionality) but the advantage is that it can be done asynchronously while the user reads. The downside is that calculating the total number of pages in a book takes a fairly long time, as does jumping to a specific page. This work _could_ be performed in the background whenever a new book is added to the user's library but then adding a lot of books could take a serious chunk out of battery life. It also doesn't make a ton of sense to pre-calculate this given that e.g. changing font size or screen dimensions (e.g. flipping between vertical and horizontal reading modes) will require this to be re-calculated.

Here are the calculation times for a 1000 page document for various browsers:

* Chromium 78: 0.24 synchronous)
* Epiphany (WebKit2GTK): (0.3 synchronous)
* Firefox 71: 9.7 seconds (3.1 synchronous) (might be slowed by extensions)

A demo is [hosted here](https://juul.io/paginator-alt/).

Pressing `space` progresses to the next page by insta-scrolling to the top of the element that was cut off at the bottom. You can also press `s` to start a synchronous test to calculate the page boundaries. Open the console to see the timing measurement.

This example requires that you have permissions to access the document inside the iframe from javascript in the main document.

You need to host this example on a web server since browsers consider two files loaded from the filesystem to be from different domains and thus does not allow accessing the iframe document.

Currently doesn't take into account page resizing, scrolling or font size changes, so reload after changing any of that.