
An example of how to cleanly break an HTML document into pages without having the last line on each page potentially cut off as usually happens with scrolling.

The pagination is accomplished by walking through the DOM tree and cloning over a single node at a time, then checking if the node caused the page to overflow by comparing the bottom of the `.getBoundingClientRect()` to the bottom of the page area. If the node is a text node then a binary search is performed to find the offset inside the text string where the text should be cut off by moving a Range's ending offset around and checking `.getBoundingClientRect()`.

This is an alternative to the CSS `column` based solution in the main branch of this repo. This solution is much faster in WebKit and can probably be optimized further.

Here are the calculation times for a 500 page document for various browsers:

* Chromium 78: 1.10 seconds
* Firefox 71: 2.26 seconds
* Epiphany (WebKit2GTK): 2.60 seconds

A demo is [hosted here](https://juul.io/paginator-chunk/).

Pressing `space` progresses to the next page . You can also press `s` to start a synchronous test to calculate the page boundaries. Open the console to see the timing measurement.

This example requires that you have permissions to access the document inside the iframe from javascript in the main document.

You need to host this example on a web server since browsers consider two files loaded from the filesystem to be from different domains and thus does not allow accessing the iframe document.

Currently doesn't take into account page resizing, scrolling or font size changes, so reload after changing any of that.

# ToDo

* Wait for images to load
* Handle situations where not even a single node could be added to the page before overflow
* Pre-paginate several pages and keep buffer of past pages, then move between them
* Check how using a column affects performance
* Try moving rather than cloning DOM nodes
