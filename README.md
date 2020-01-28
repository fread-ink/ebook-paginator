
An example of how to cleanly break an HTML document into pages without having the last line on each page potentially cut off as usually happens with scrolling.

Uses an `<iframe>` to show an html document, then traverses the html elements in the document inside the iframe to figure out what's being cut off at the bottom, then hides whatever is being cut off.

This is an alternative to the CSS `column` based solution in the main branch of this repo. This solution is much faster and can probably be optimized further.

Here are the calculation times for a 1000 page document for various browsers:

* Chromium 78: 0.24 seconds
* Epiphany (WebKit2GTK): 0.3 seconds
* Firefox 71: 3.1 seconds (might be slowed by extensions)

A demo is [hosted here](https://juul.io/paginator-alt/).

Pressing `space` progresses to the next page by insta-scrolling to the top of the element that was cut off at the bottom. You can also press `s` to start a synchronous test to calculate the page boundaries. Open the console to see the timing measurement.

This example requires that you have permissions to access the document inside the iframe from javascript in the main document.

You need to host this example on a web server since browsers consider two files loaded from the filesystem to be from different domains and thus does not allow accessing the iframe document.

Currently doesn't take into account page resizing, scrolling or font size changes, so reload after changing any of that.


# ToDo

* Add handling on non text nodes (e.g. images)

## Edge cases

Current method fails if text contains e.g. <sub> or <sup> in the wrong spot or if font size changes for only some characters on the last line.

Possible solution: When walking through the tree remember the bottom position of each element in a sorted list, then after finding the first element that has its bottom above the top of the current element. That element's bottom is where we make the cut. Note that this could result in not being able to cleanly cut the page, e.g. if the entire page looks like this:

```
 ___
|   |
|   | ___
|_ _||   |
     |   |
     |___|

```
Or we could go through the entire list and find the first element that would be cut off (if counting from element 0).

The lazy solution is to not order the list and still only go back to the first element that's clear, but this _could_ fail.

It should be fine to do this on a per-node basis, without delving into text nodes, since if we have a situation like:

```
 ___
|   |
|   | ___
|_ _||   |
     |   |
     |___|
```

Where both are text nodes, then we probably don't want to break part-way through one of those nodes.