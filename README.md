
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
* Check how using a column affects performance
* Try moving rather than cloning DOM nodes
