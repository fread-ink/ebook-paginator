
An example of how to cleanly break an HTML document into pages without having the last line on each page potentially cut off as usually happens with scrolling.

Uses an `<iframe>` to show an html document and injects the CSS rules `column-width`, `column-gap` and `height` for the `<body>` element inside the document contained in the iframe.

Pressing `space` progresses to the next page.

A demo is [hosted here](https://juul.io/paginator/). Open the console to see the timing measurement.

This example demonstrates an issue with rendering time for column layouts on long documents.

Here are rendering times for various browsers:

* Chromium 78: 0.60 seconds
* Firefox 71: 1.47 seconds
* Epiphany (WebKit2GTK): 14.54 seconds

These numbers are only accounting for time taking from when the CSS column rules were added and the iframe resized to when the changes show up on screen. The numbers are from an Intel i5-2520 running at 2.5 GHz. The numbers are for rendering 402 pages (page number will depend on browser window width). The browsers all freeze at least the current tab during this time, showing a blank iframe, and the user is unable to navigate pages during rendering. 

This example requires that you have permissions to modify the document inside the iframe from javascript in the main document, or the ability to inject CSS rules into the document inside the iframe using some other method.

You need to host this example on a web server since browsers consider two files loaded from the filesystem to be from different domains and does not allow injection of the CSS rules into the iframe document.

Works in Firefox 71.0. Pixel offsets are somewhat off on WebKit (Epiphany) and Chromium but that should be easy to fix.

Currently doesn't take into account page resizing, scrolling or font size changes, so reload after changing any of that.