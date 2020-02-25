const breakAvoidVals = ['avoid', 'avoid-page'];
const breakForceVals = ['always', 'all', 'page', 'left', 'right', 'recto', 'verso'];

const iframeHTML = `<!DOCTYPE html>
<html>
  <head>
    <meta http-equiv="content-type" content="text/html; charset=utf-8">
    <title>iframe paginator test</title>
    <style type="text/css">
      body {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        margin: 0;
        padding: 0;
      }
      #page {
        display: block;
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        margin: 0;
        padding: 0;
      }
    </style>
  </head>
  <body>
    <div id="page"></div>
  </body>
</html>`;

// async version of setTimeout(arg, 0);
async function nextTick(func) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      func().then(resolve)
    }, 0);
  });
}

async function waitForImage(img) {
  if(img.complete) return true;
  return new Promise(function(cb) {
		img.onload = cb;
    img.onerror = cb;
  });  
}

function toLower(str) {
  if(!str) return str;
  return str.toLowerCase();
}

function parseDOM(str, mimetype) {

  var parser = new DOMParser();
  var doc = parser.parseFromString(str, mimetype);

  // Check for errors according to:
  // see https://developer.mozilla.org/en-US/docs/Web/API/DOMParser
  var errs = doc.getElementsByTagName('parsererror');
  if(errs.length) {
    var txt = errs[0].textContent;
    txt = txt.replace(/Below is a rendering.*/i, ''); // remove useless message
    txt = txt.replace(':', ': ').replace(/\s+/, ' '); // improve formatting
    throw new Error("Parsing XML failed: " + txt);
  }

  return doc;
}

function parseHTML(str) {
  return parseDOM(str, 'text/html');
}

function request(uri, isBinary, cb) {
  var req = new Request(uri);
  fetch(req).then(function(resp) {
    if(!resp.ok || resp.status < 200 || resp.status > 299) {
      return cb(new Error("Failed to get: " + uri));
    }
      
    if(isBinary) {
      resp.blob().then(function(blob) {
        cb(null, blob);
      });
    } else {
      resp.text().then(function(text) {
        cb(null, text);
      });
    }

  });
}

// Traverse recursively to next node in a DOM tree
// and shallow-copy it to the equivalent location in the target DOM tree
// while tracking tree depth
function appendNextNode(node, target, depth) {
  var tmp;
  
  if(node.childNodes.length) {
    node = node.firstChild;
    depth++;
		tmp = node.cloneNode(); // shallow copy
    target.appendChild(tmp);
    target = tmp;

	} else if(node.nextSibling) {
    node = node.nextSibling;
		tmp = node.cloneNode();
    target.parentNode.appendChild(tmp);
    target = tmp;
    
	} else {

    // Don't proceed past body element in source document
    if(toLower(node.tagName) === 'body') return {};
    
		while(node) {
			node = node.parentNode;
      target = target.parentNode;
      depth--;

			if(node && node.nextSibling) {
        node = node.nextSibling;
		    tmp = node.cloneNode();
        target.parentNode.appendChild(tmp);
        target = tmp;
        break;
			}
		}
	}

  if(!node) return {}; // no more pages
  
  return {node, target, depth};
}


function appendAsFirstChild(parent, node) {
  if(!parent.firstChild) {
    return parent.appendChild(node);
  }
  return parent.insertBefore(node, parent.firstChild);
}

// Traverse recursively to previous node in a DOM tree
// and copy it to the equivalent location in the target DOM tree
// if it doesn't already exist, while tracking tree depth.
// Shallow copy is preferred when possible, but is not always
// viable while traversing in reverse order
// since a node should never be added without its ancestor nodes
function appendPrevNode(node, target, depth) {
  var tmp;
  
  if(node.previousSibling) {
    node = node.previousSibling;
		tmp = node.cloneNode();
    appendAsFirstChild(target.parentNode, tmp);
    target = tmp;

    while(node.childNodes.length) {
      node = node.lastChild;
		  tmp = node.cloneNode();
      target.appendChild(tmp);
      target = tmp;
      depth++;
    }
    
	} else if(node.parentNode) {

    node = node.parentNode;
    
    // Don't proceed past body element in source document
    if(toLower(node.tagName) === 'body') return {};

    // This should never happen
    if(!target.parentNode) {
      console.error("failure in appendPrevNode()");
      return {}; 
    }
    
    target = target.parentNode;
    depth--;
	}

  if(!node) return {}; // no more pages
  
  return {node, target, depth};
}

// Traverse backwards through siblings and parents
// until a <thead> or a <tr> containing a <th> is found
// then return the <thead> or <tr>
// Returns null if no such element is found
// or if that element is an ancestor of the starting node
function findPrevTableHeader(node) {

  var tagName;
  var isAncestor = true; // is the found header and ancestor of node?

  while(node) {
    tagName = toLower(node.tagName);
    if(tagName === 'table' || tagName === 'body') {
      return null;
    }

    if(!isAncestor) {
      if(tagName === 'thead') {
        return node;
      } else if(tagName === 'tr') {
        for(let c of node.childNodes) {
          if(toLower(c.tagName) === 'th') {
            return node;
          }
        }
      }
    }
    
    if(node.previousSibling) {
      // no longer dealing with a direct ancestor
      if(tagName === 'tr' || tagName === 'thead') {
        isAncestor = false;
      }
      node = node.previousSibling
    } else {
      if(tagName === 'tbody') {
        isAncestor = false;      
      }
      node = node.parentNode;
    }
  }

}

// Shallow clone the structure of ancestors back up to <body>
// If repeatTableHeader is true then the first <thead>
// (or <tr> which contains <th>) will be copied as
// the first child of <table>
function cloneAncestors(node, repeatTableHeader) {
  var ret, tmp;
  var innerMost;
  var header;
  const startNode = node;
  
  while(node.parentNode && toLower(node.parentNode.tagName) !== 'body') {
  
    tmp = node.parentNode.cloneNode() // shallow clone
    if(!innerMost) innerMost = tmp;
    
    if(repeatTableHeader && toLower(node.parentNode.tagName) === 'table') {
      header = findPrevTableHeader(startNode);
      if(header) {
        tmp.appendChild(header.cloneNode(true));
      }
    }

    if(ret) {
      tmp.appendChild(ret);
    }
    ret = tmp;
    node = node.parentNode;
  }
  return {
    tree: ret,
    innerMost: innerMost
  };
}


// Get next node in document order recursively
// TODO unused
function nextNode(node) {

	if(node.childNodes.length) {
		return node.firstChild;
	} else if(node.nextSibling) {
		return node.nextSibling;
	} else {
		while(node) {
			node = node.parentNode;
			if(node && node.nextSibling) {
				return node.nextSibling;
			}
		}
	}
  return null;
}


function createIframeContainer() {

  var iframeElement = document.createElement('iframe');
  iframeElement.src = "about:blank";
  iframeElement.style.position = 'absolute';
  iframeElement.style.display = 'block';
  iframeElement.style.top = '0';
  iframeElement.style.left = '0';
  iframeElement.style.width = '100%';
  iframeElement.style.height = '100%';
  iframeElement.style.border = 'none';

  return iframeElement;
}


class Paginator {

  constructor(containerID, chapterURI, opts) {
    this.opts = opts || {};
    
    this.opts.cacheForwardPagination = ((opts.cacheForwardPagination === undefined) ? true : opts.cacheForwardPagination);
    this.opts.repeatTableHeader = ((opts.repeatTableHeader === undefined) ? true : opts.repeatTableHeader);

    // Does the page currently overflow elements at the top?
    // If this is false then the page overflows at the bottom
    this.overflowTop = false; 
    
    if(this.opts.columnLayout) {
      this.columnLayout = true;
    }

    this.curNodeCount = 0; // see findNodeWithCount()
    this.curNodeOffset = 0;
    
    this.curPage = 0;
    this.pages = [];

    // Create iframe container element
    this.containerElement = document.getElementById(containerID);
    this.iframeElement = createIframeContainer();
    this.containerElement.appendChild(this.iframeElement);

    // Add HTML to iframe document
    this.iDoc = this.iframeElement.contentWindow.document;
    this.iDoc.open();
    this.iDoc.write(iframeHTML);
    this.iDoc.close();

    this.page = this.iDoc.getElementById('page');
    
    this.setOverflowBottom();

    // Use column-based layout? (slow on WebKit but may be more accurate)
    if(this.columnLayout) {
      this.pageRight = this.page.getBoundingClientRect().right;
      this.page.style.columnWidth = this.page.offsetWidth + 'px';
    } else {
      this.pageBottom = this.page.getBoundingClientRect().bottom;
      this.pageTop = this.page.getBoundingClientRect().top;
    }
    
    document.body.addEventListener('keypress', this.onKeyPress.bind(this));

    this.loadChapter(chapterURI, function(err) {
      if(err) return console.error(err);

      this.firstPage();

    }.bind(this));
  }

  // Make page overflow at top
  setOverflowTop() {
    this.overflowTop = true;
    this.page.style.top = ''; 
  }

  // Make page overflow at bottom (like a normal page)
  setOverflowBottom() {
    this.overflowTop = false;
    this.page.style.top = '0'; 
  }  

  // Traverse node's ancestors until an element is found
  getFirstElementAncestor(node) {
    while(node.nodeType !== Node.ELEMENT_NODE) {
      node = node.parentNode;
      if(toLower(node.tagName) === 'body') return null;
    }
    return node;
  }

  // Get combined bottom-padding and bottom-spacing of element
  getBottomSpacing(el) {
    if(!el) return 0;
    const style = window.getComputedStyle(el);
    return (parseFloat(style.getPropertyValue('padding-bottom')) || 0) + (parseFloat(style.getPropertyValue('margin-bottom')) || 0);
  }

  // Get combined top-padding and top-spacing of element
  getTopSpacing(el) {
    if(!el) return 0;
    const style = window.getComputedStyle(el);
    return (parseFloat(style.getPropertyValue('padding-top')) || 0) + (parseFloat(style.getPropertyValue('margin-top')) || 0);
  }
  
    
  // Does the node overflow the bottom/top of the page
  async didOverflow(node, topOverflow) {
    var el;
    var rect;
    var edge;
    var spacing;

    // TODO can we use a similar simplified method for bottom overflow?
    if(topOverflow) {
      // If it's an image, wait for it to load
      if(toLower(node.tagName) === 'img') {
        await waitForImage(node);
      }
      if(this.page.getBoundingClientRect().top < 0) {
        return true;
      }
      return false;
    }

    if(node.getBoundingClientRect) {

      // If it's an image, wait for it to load
      if(toLower(node.tagName) === 'img') {
        await waitForImage(node);
      }
      
      rect = node.getBoundingClientRect();
      el = node;
    } else { // handle text nodes
      const range = document.createRange();
      range.selectNode(node);
      rect = range.getBoundingClientRect();
      el = this.getFirstElementAncestor(node);
    }

    if(el) {
      spacing = this.getBottomSpacing(el)
    } else {
      spacing = 0;
    }

    if(this.columnLayout) {
      // TODO add support for top overflow
      if(Math.round(rect.right) > Math.floor(this.pageRight)) {
        return true;
      }
    } else {
      edge = Math.round(rect.bottom + spacing);
      if(edge > Math.floor(this.pageBottom)) {
        return true;
      }
    }
    return false
  }

  // Warning: Changing the way nodes are counted, either here or in the
  //          paginate() function will break existing bookmarks.
  //
  // The paginate() function returns an integer `nodesTraversed`
  // which is a count of how many nodes were traversed when paginating the page.
  // The nextPage() and prevPage() functions keep track of how many nodes into
  // the paginated html we currently are and that information can be
  // retrieved with .getBookmark()
  // This function makes it possible to find the node again from its index/count
  // as reported by .getBookmark()
  findNodeWithCount(startNode, nodeCount) {
    var node = startNode;
    var count = 0;
    
    while(node) {
      if(count === nodeCount) {
        return node;
      }
      
      if(node.childNodes.length) {
        node = node.firstChild;
	    } else if(node.nextSibling) {
        node = node.nextSibling;
	    } else {
        // Don't proceed past body element in source document
        if(toLower(node.tagName) === 'body') return null;
        
		    while(node) {
			    node = node.parentNode;

			    if(node && node.nextSibling) {
            node = node.nextSibling;
            break;
			    }
		    }
	    }
      if(node) {
        count++;
      }
    }
    return null;
  }
  
  // Find the exact offset in a text node just before the overflow occurs
  // by using document.createRange() for a part of the text and adjusting
  // the part of the text included in the range until the range
  // doesn't overflow.
  // Uses binary search to speed up the process.
  // Returns -1 if offset could not be found.
  findOverflowOffset(node, topOverflow) {
    const range = document.createRange();
    range.selectNode(node);
    range.setStart(node, 0);
    
    const el = this.getFirstElementAncestor(node);

    if(this.columnLayout) {
      var pageRight = Math.ceil(this.pageRight);
    } else {
      var pageBottom = Math.floor(this.pageBottom);
    }
    const len = node.textContent.length;
    range.setEnd(node, len - 1);
    
    var prev = 0; 
    var tooFar = false;
    var prevTooFar;
    var dist, halfDist, bottom, top;

    if(len === 0) return 0;
    if(len === 1) return 1;

    // init binary search
    // `i` is the index into the text
    var i = Math.round((len-1) / 2);
    if(len === 2) {
      i = 1;
    }

    while(true) {

      if(i < 0) i = 0;
      if(i > len - 1) i = len - 1;

      if(!topOverflow) {
        range.setEnd(node, i);
      } else {
        range.setStart(node, i);
      }

      prevTooFar = tooFar;
      if(this.columnLayout) {
        // TODO make this work with topOverflow
        if(range.getBoundingClientRect().right > pageRight) {
          tooFar = true;
        } else {
          tooFar = false;
        }
      } else {
        if(!topOverflow) {
          bottom = Math.round(range.getBoundingClientRect().bottom + this.getBottomSpacing(el));
          if(bottom > pageBottom) {
            tooFar = true;
          } else {
            tooFar = false;
          }
        } else {
          top = Math.round(range.getBoundingClientRect().top - this.getTopSpacing(el));
          if(top < 0) {
            tooFar = true;
          } else {
            tooFar = false;
          }
        }
      }

      dist = Math.abs(prev - i);

      // Switch to incremental search if we moved less than 3 chars
      // since last loop iteration
      if(dist < 3) {
        if(dist === 1) {
          if(tooFar && !prevTooFar) return prev;
          if(!tooFar && prevTooFar) return i;
        }
        if(dist === 0) {
          return -1;
        }

        prev = i;

        if(!topOverflow) {
          i += ((tooFar) ? -1 : 1);
        } else {
          i += ((tooFar) ? 1 : -1);
        }
        continue;
      } 

      // binary search
      halfDist = Math.round(dist / 2);
      prev = i;
      if(!topOverflow) {
        i += ((tooFar) ? -halfDist : halfDist);
      } else {
        i += ((tooFar) ? halfDist : -halfDist);        
      }
    }
  }

  // Check for CSS break-inside, break-before and break-after
  // as well as <tr> elements which should always avoid breaks inside
  shouldBreak(node) {
    if(node.nodeType !== Node.ELEMENT_NODE) return;

    if(toLower(node.tagName) === 'tr') {
      return 'avoid-inside';
    }
    
    var val;      
    const styles = window.getComputedStyle(node);
    
    val = styles.getPropertyValue('break-inside');
    if(breakAvoidVals.indexOf(val) >= 0) {
      return 'avoid-inside';
    }

    val = styles.getPropertyValue('break-before');
    if(breakForceVals.indexOf(val) >= 0) {
      return 'before';
    }

    val = styles.getPropertyValue('break-after');
    if(breakForceVals.indexOf(val) >= 0) {
      return 'after';
    }
    
    return null;
  }

  async gotoKnownPage(pageNumber) {
    
    // Do we know the starting node+offset of the page?
    var pageRef = this.pages[pageNumber];
    if(!pageRef) return false;
    
    const nextPageRef = await this.paginate(pageRef.node, pageRef.offset);
    if(!this.pages[pageNumber + 1]) {
      this.pages[pageNumber+1] = nextPageRef;
    }
    this.curPage = pageNumber;
    
    return true;
  }

  async gotoPage(pageNumber) {
    var nextPageRef;

    if(this.gotoKnownPage(pageNumber)) {
      this.curPage = pageNumber;
      return true;
    }

    // Walk backwards until we find a starting node+offset we _do_ have
    var startPage;
    var i;
    for(i = pageNumber-1; i >= 0; i--) {
      if(this.pages[i]) {
        startPage = i;
        break;
      }
    }
    if(!startPage) return false;
    startPage--;

    if(!await this.gotoKnownPage(startPage)) {
      return false;
    }
    
    // Paginate forward until we reach the desired page
    var curPage;
    do {
      curPage = await this.nextPage();
    } while(curPage && curPage < pageNumber);

    if(curPage === pageNumber) {
      this.curPage = pageNumber;
      return true;
    }
    return false;
  }
  
  async firstPage() {

    this.pages[0] = {
      node: this.doc.body,
      offset: 0
    };
    this.curPage = 0;
    this.curNodeCount = 0;
    this.curNodeOffset = 0;
    
    const nextPageStartRef = await this.paginate(this.doc.body, 0);
    if(!nextPageStartRef || !nextPageStartRef.node) return false;

    this.pages[this.curPage+1] = nextPageStartRef;
    return true;
  }
  
  async nextPage() {
    this.curPage++;
    const curPageStartRef = this.pages[this.curPage];

    if(!curPageStartRef || !curPageStartRef.node) return false; // no more pages

    const nextPageStartRef = await this.paginate(curPageStartRef.node, curPageStartRef.offset)
    
    if(!nextPageStartRef || !nextPageStartRef.node) return false; // no more pages

    this.pages[this.curPage+1] = nextPageStartRef;
    this.curNodeCount += curPageStartRef.nodesTraversed;
    
    if(typeof curPageStartRef.offset === 'number') {
      this.curNodeOffset = curPageStartRef.offset;
    } else {
      this.curNodeOffset = 0;
    }
    return this.curPage;
  }

  async prevPage() {
    const curPageStartRef = this.pages[this.curPage];
    if(!curPageStartRef || !curPageStartRef.node) return false;

    this.curPage--;
    if(this.curPage < 0) {
      this.curPage = 0;
      return await this.firstPage();
    }

    var prevPageStartRef = this.pages[this.curPage];

    // If we shouldn't use the cache or don't have a cache entry for this page
    // then paginate backwards
    if(!this.opts.cacheForwardPagination || !prevPageStartRef) {
      console.log("backwards");
      prevPageStartRef = await this.paginateBackwards(curPageStartRef.node, curPageStartRef.offset)
      if(!prevPageStartRef || !prevPageStartRef.node) {
        return false; // no more pages
      }
      this.pages[this.curPage] = prevPageStartRef;
    } else {
      // Paginate using the previously cached page start location
      prevPageStartRef = await this.paginate(prevPageStartRef.node, prevPageStartRef.offset)
    }

    this.curNodeCount -= prevPageStartRef.nodesTraversed;
    
    if(typeof prevPageStartRef.offset === 'number') {
      this.curNodeOffset = prevPageStartRef.offset;
    } else {
      this.curNodeOffset = 0;
    }
    return this.curPage;
  }

  redraw(doInvalidateCache) {
    if(doInvalidateCache) {
      this.invalidateCache()
    };
    // TODO implement
  }

  // invalidate all but the reference to the start of the current page
  invalidateCache() {
    var cur = this.pages[this.curPage];
    this.pages = [];
    this.pages[this.curPage] = cur;
  }  

  async gotoBookmark(count, offset) {
    const node = this.findNodeWithCount(this.doc.body, count);
    if(!node) return;

    this.paginate(node, offset);
  }

  getBookmark() {
   
    return {nodeCount: this.curNodeCount, offset: this.curNodeOffset}
  }

  async paginateBackwards(node, offset) {
    this.setOverflowTop();
    const ret = await this.paginate(node, offset, true)
    this.setOverflowBottom();
    return ret;
  }
    
  // Render the next page's content into the this.page element
  // and return a reference to the beginning of the next page
  // of the form: {node: <start_node>, offset: <optional_integer_offset_into_node>}
  async paginate(node, offset, reverse) {
    var tmp, i, shouldBreak;
    var forceBreak, breakBefore;
    var avoidInside;
    const curPage = this.curPage;
    var target = this.page;
    var breakAtDepth = 0;
    var depth = 1; // current depth in DOM hierarchy
    var nodesAdded = 0;
    var nodesTraversed = 0;

    this.page.innerHTML = ''; // clear the page container
    if(!offset) offset = 0;
    
    if(!node) return {node: null};

    // if we're not on the first node in the source document
    if(toLower(node.tagName) !== 'body') {

      // Re-construct the ancestor structure
      // from the current point within the source document
      // so content in the new page has the same ancestor structure
      // as in the source document
      let {tree, innerMost} = cloneAncestors(node, this.opts.repeatTableHeader);
      if(tree) {
        target.appendChild(tree);
        target = innerMost;
      }

      // If the last page ended in the middle of a text node
      // create a new text node with the remaining content
      if(offset) {
        
        if(!reverse) {
          tmp = document.createTextNode(node.textContent.slice(offset));
        } else {
          tmp = document.createTextNode(node.textContent.slice(0, offset));
        }
        target.appendChild(tmp);
        
        if(await this.didOverflow(tmp)) {
          let newOffset = this.findOverflowOffset(tmp, reverse);
          target.removeChild(tmp);
          
          if(!reverse) {
            tmp = document.createTextNode(tmp.textContent.slice(0, newOffset));
            offset += newOffset;
          } else {
            offset -= (tmp.textContent.length - newOffset);
            tmp = document.createTextNode(tmp.textContent.slice(newOffset));
          }
          target.appendChild(tmp);
          
          return {node, offset, nodesTraversed};
        }
        
        offset = 0;
        target = tmp;

      } else {
        tmp = node.cloneNode();
        target.appendChild(tmp);
        target = tmp;
      }

    }

    const appendNode = async (cb) => {
      
      // If the page number changes while we are paginating
      // then stop paginating immediately
      if(curPage !== this.curPage) {
        return null;
      }
      
      // Get the next/prev node in the source document in order recursively
      // and shallow copy the node to the corresponding spot in
      // the target location (inside this.page)
      if(!reverse) {
        ({node, target, depth} = appendNextNode(node, target, depth));
      } else {
        ({node, target, depth} = appendPrevNode(node, target, depth));
      }

      if(!node || !target) {
        return null;
      }
      
      // Warning: Changing the way this is counted will break existing bookmarks
      nodesTraversed++;
      
      // We found a node that doesn't want us to break inside.
      // Save the current location and depth so we can break before
      // this node if any of its children end up causing an overflow
      shouldBreak = this.shouldBreak(target);
      if(shouldBreak === 'avoid-inside') {
        avoidInside = {node, target, nodesTraversed};
        breakAtDepth = depth;

      // We must have passed the "break-inside:no" node without overflowing
      } else if(depth <= breakAtDepth && avoidInside && node !== avoidInside.node) {
        breakAtDepth = 0;
        avoidInside = null;
      }

      // If the current node wants us to break before itself
      // and nodes have already been added to the page
      // then we want to force a break.
      
      if(shouldBreak === 'before' && (nodesAdded || reverse)) {
        breakBefore = true;
      } else {
        breakBefore = false;
      }

      var didOverflow = await this.didOverflow(target, reverse);
//      if(didOverflow) {
//        console.log("DID OVERFLOW:", target);
//      }
      
      // If the page number changes while we are paginating
      // then stop paginating immediately
      if(curPage !== this.curPage) {
        return null;
      }
      
      // If the first non-text node added to the page caused an overflow
      if(didOverflow && nodesAdded <= 0 && target.nodeType !== Node.TEXT_NODE) {

        // Force the node to fit
        let r = this.page.getBoundingClientRect();
        target.style.width = 'auto';
        target.style.maxWidth = r.width + 'px';
        target.style.maxHeight = r.height + 'px';

        didOverflow = false;
      }  

      // If reverse paginating and we didn't overflow
      // and we should break before the current node
      // then we're done with this page.
      if(reverse && !didOverflow && breakBefore) {
        return {node, offset, nodesTraversed};        
      }
      
      // If adding the most recent node caused the page element to overflow
      if(didOverflow || breakBefore) {

        // If we're at or inside a node that doesn't want us to break inside
        if(breakAtDepth && depth >= breakAtDepth && avoidInside) {
          target = avoidInside.target.parentNode;
          avoidInside.target.parentNode.removeChild(avoidInside.target);
          return {node: avoidInside.node, offset: 0, nodesTraversed: avoidInside.nodesTraversed};
        }
        
        // If this is a text node and we're not supposed to break before
        if(target.nodeType === Node.TEXT_NODE && (!breakBefore || reverse)) {

          // Find the position inside the text node where we should break
          offset = this.findOverflowOffset(target, reverse);

          tmp = target.parentNode;
          tmp.removeChild(target);

          if(!reverse) {
            if(offset > 0) {
              target = document.createTextNode(node.textContent.slice(0, offset));
              tmp.appendChild(target);
            } else {
              target = tmp;
              offset = null;
            }
          } else {
            if(offset < (node.textContent.length - 1)) {
              target = document.createTextNode(node.textContent.slice(offset));
              tmp.appendChild(target);
            } else {
              target = tmp;
              offset = null;
            }
          }
          
        } else {

          tmp = target.parentNode;
          tmp.removeChild(target);
          target = tmp;
          offset = null;
        }

        return {node, offset, nodesTraversed};
      } else {
        // Count all nodes except pure whitespace text nodes
        if(!(target.nodeType === Node.TEXT_NODE && !target.textContent.trim().length)) {
          nodesAdded++;
        }
      }

      // TODO run this e.g. every 200 ms
      // so the browser tab doesn't feel unresponsive to the user
      //return await nextTick(appendNode);
     
      return await appendNode();      
    }

    return await appendNode();
  }

  async speedTest() {
    const t = Date.now();
    console.log("Starting speed test");

    var i = 0;
    while(await this.nextPage()) {
      i++
    }
    
    console.log("Paginated", i, "pages in", (Date.now() - t) / 1000, "seconds");
    alert((Date.now() - t) / 1000);
  }
  
  async onKeyPress(e) {

    switch(e.charCode) {
      
    case 32: // space
      this.nextPage();
      break;
    case 116: // t
      this.speedTest();
      break;
    case 103: // g
      //      this.gotoPage(50);
      this.gotoBookmark(128, 196);
      break;
    case 113: // q

      break;
      
    case 98: // 'b'
      this.prevPage();
      break;
    }
  }

  getNodeCount() {
    return this.nodeCount;
  }
  
  loadChapter(uri, cb) {

    request(uri, false, function(err, str) {
      if(err) return cb(err);

      try {
        // TODO don't assume XHTML
        this.doc = parseHTML(str);

        cb();

      } catch(err) {
        return cb(err);
      }

    }.bind(this));
  }
}



function init() {

  const pageID = 'page2';
  const chapterURI = 'moby_dick_chapter.html';
//  const chapterURI = 'vertical.html';
  
  const paginator = new Paginator(pageID, chapterURI, {
    columnLayout: false,
    repeatTableHeader: false,
    cacheForwardPagination: true
  });

  window.setTop = paginator.setOverflowTop.bind(paginator);
  window.setBottom = paginator.setOverflowBottom.bind(paginator);
}

init();
