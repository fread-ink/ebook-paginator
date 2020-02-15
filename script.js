const breakAvoidVals = ['avoid', 'avoid-page'];
const breakForceVals = ['always', 'all', 'page', 'left', 'right', 'recto', 'verso'];

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

function parseXHTML(str) {
  return parseDOM(str, 'application/xhtml+xml');
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
        tmp.appendChild(header);
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


class Paginator {

  constructor(pageID, chapterURI, opts) {
    this.opts = opts || {};
    this.opts.repeatTableHeader = ((opts.repeatTableHeader === undefined) ? true : opts.repeatTableHeader);

    if(this.opts.columnLayout) {
      this.columnLayout = true;
    }

    this.curPage = 0;
    this.pages = [];
    this.page = document.getElementById(pageID);

    // Use column-based layout? (slow on WebKit but may be more accurate)
    if(this.columnLayout) {
      this.pageRight = this.page.getBoundingClientRect().right;
      this.page.style.columnWidth = this.page.offsetWidth + 'px';
    } else {
      this.pageBottom = this.page.getBoundingClientRect().bottom;
    }
    
    document.body.addEventListener('keypress', this.onKeyPress.bind(this));

    this.loadChapter(chapterURI, function(err) {
      if(err) return console.error(err);

      this.firstPage();

    }.bind(this));
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
  
  // Does the node overflow the bottom of the page
  async didOverflow(node) {
    var el;
    var rect;
    var bottom;

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

    if(this.columnLayout) {
      if(Math.round(rect.right) > Math.floor(this.pageRight)) {
        return true;
      }
    } else {
      bottom = Math.round(rect.bottom + this.getBottomSpacing(el));

      if(bottom > Math.floor(this.pageBottom)) {
        return true;
      }
    }
    return false
  }

  // Find the exact offset in a text node just before the overflow occurs.
  findOverflowOffset(node) {

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
    var prev = 0; 
    var tooFar = false;
    var prevTooFar;
    var dist, halfDist, bottom;

    if(len === 0) return 0;
    if(len === 1) return 1;

    var i = Math.round((len-1) / 2);
    if(len === 2) {
      i = 1;
    }
    
    while(true) {

      if(i < 0) i = 0;
      if(i > len - 1) i = len - 1;
      
      range.setEnd(node, i);

      prevTooFar = tooFar;
      if(this.columnLayout) {
        if(range.getBoundingClientRect().right > pageRight) {
          tooFar = true;
        } else {
          tooFar = false;
        }
      } else {
        bottom = Math.round(range.getBoundingClientRect().bottom + this.getBottomSpacing(el));
        if(bottom > pageBottom) {
          tooFar = true;
        } else {
          tooFar = false;
        }
      }
        
      dist = Math.abs(prev - i);

      if(dist < 3) {
        if(dist === 1) {
          if(tooFar && !prevTooFar) return prev;
          if(!tooFar && prevTooFar) return i;
        }
        if(dist === 0) {
          return -1;
        }

        prev = i;
        i += ((tooFar) ? -1 : 1);
        continue;
      } 

      halfDist = Math.round(dist / 2);
      prev = i;
      i += ((tooFar) ? -halfDist : halfDist);
    }
  }

  shouldBreak(node) {
    if(node.nodeType !== Node.ELEMENT_NODE) return;
    
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
    
    const nextPageStartRef = await this.paginate(this.doc.body, 0);
    if(!nextPageStartRef || !nextPageStartRef.node) return false;

    this.pages[this.curPage+1] = nextPageStartRef;
    return true;
  }
  
  async nextPage(cb) {
    this.curPage++;

    const curPageStartRef = this.pages[this.curPage];
    if(!curPageStartRef || !curPageStartRef.node) return false; // no more pages

    
    const nextPageStartRef = await this.paginate(curPageStartRef.node, curPageStartRef.offset)
    if(!nextPageStartRef || !nextPageStartRef.node) return false; // no more pages

    this.pages[this.curPage+1] = nextPageStartRef;
    return this.curPage;
  }

  async prevPage() {
    this.curPage--;
    
    if(this.curPage < 0) {
      this.curPage = 0;
      return 0;
    }
    const page = this.pages[this.curPage];
    
    // TODO implement
    if(!page) throw new Error("Unknown starting point for page");
    
    const prevPageRef = await this.paginate(page.node, page.offset);
    
    if(!prevPageRef || !prevPageRef.node) return false;
    return this.curPage;
  }

  // Render the next page's content into the this.page element
  // and return a reference to the beginning of the next page
  // of the form: {node: <start_node>, offset: <optional_integer_offset_into_node>}
  async paginate(node, offset) {
    var tmp, i, shouldBreak, avoidInsideTarget;
    var forceBreak, breakBefore, avoidInsideNode;
    const curPage = this.curPage;
    var target = this.page;
    var breakAtDepth = 0;
    var depth = 1; // current depth in DOM hierarchy
    var nodesAdded = 0;

    this.page.innerHTML = ''; // clear the page container
    if(!offset) offset = 0;
    
    if(!node) return {node: null};
    
    // if we're not on the first node in the source document
    if(toLower(node.tagName) !== 'body') {

      // Re-construct the ancestor structure
      // from the current point within the source document
      // so content in the new page has the same structure
      // as in the source document
      let {tree, innerMost} = cloneAncestors(node, this.opts.repeatTableHeader);
      if(tree) {
        target.appendChild(tree);
        target = innerMost;
      }

      // If the last page ended in the middle of a text node
      // create a new text node with the remaining content
      if(offset) {
        tmp = document.createTextNode(node.textContent.slice(offset));
      } else {
        tmp = node.cloneNode();
      }
      target.appendChild(tmp);
      target = tmp;
    }

    const appendNode = async (cb) => {
      // If the page number changes while we are paginating
      // then stop paginating immediately
      if(curPage !== this.curPage) {
        return null;
      }
      
      // Get the next node in the source document in order recursively
      // and shallow copy the node to the corresponding spot in
      // the target location (inside this.page)

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
        if(toLower(node.tagName) === 'body') return false;
        
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

      if(!node) return false; // no more pages
      
      // We found a node that doesn't want us to break inside.
      // Save the current location and depth so we can break before
      // this node if any of its children end up causing an overflow
      shouldBreak = this.shouldBreak(target);
      if(shouldBreak === 'avoid-inside') {
        avoidInsideNode = node;
        avoidInsideTarget = target;
        breakAtDepth = depth;

        // We must have passed the "break-inside:nope" node without overflowing
      } else if(depth <= breakAtDepth && node !== avoidInsideNode) {
        breakAtDepth = 0;
        avoidInsideTarget = null;
      }

      // If the current node wants us to break before itself
      // and nodes have already been added to the page
      // then we want to force a break.
      if(shouldBreak === 'before' && nodesAdded) {
        breakBefore = true;
      } else {
        breakBefore = false;
      }

      // Count all nodes except pure whitespace text nodes
      if(!(target.nodeType === Node.TEXT_NODE && !target.textContent.trim().length)) {
        nodesAdded++;
      }

      var didOverflow = await this.didOverflow(target);
      // If the page number changes while we are paginating
      // then stop paginating immediately
      if(curPage !== this.curPage) {
        return null;
      }

      // If the first non-text left node added caused an overflow
      if(didOverflow && nodesAdded <= 1 && target.nodeType !== Node.TEXT_NODE) {

        // Force the node to fit
        let r = this.page.getBoundingClientRect();
        target.style.width = 'auto';
        target.style.maxWidth = r.width + 'px';
        target.style.maxHeight = r.height + 'px';

        didOverflow = false;
      }  
      
      // If adding the most recent node caused the page element to overflow
      if(didOverflow || breakBefore) {

        // If we're at or inside a node that doesn't want us to break inside
        if(breakAtDepth && depth >= breakAtDepth) {
          target = avoidInsideTarget.parentNode;
          avoidInsideTarget.parentNode.removeChild(avoidInsideTarget);
          return {avoidInsideNode, offset};
        }
        
        // If this is a text node and we're not supposed to break before
        if(target.nodeType === Node.TEXT_NODE && !breakBefore) {
          // Find the position inside the text node where we should break
          offset = this.findOverflowOffset(target);
          tmp = target.parentNode;
          tmp.removeChild(target);
          
          if(offset > 0) {
            target = document.createTextNode(node.textContent.slice(0, offset));
            tmp.appendChild(target);
          } else {
            target = tmp;
            offset = null;
          }
          
        } else {

          tmp = target.parentNode;
          tmp.removeChild(target);
          target = tmp;
          offset = null;
        }

        return {node, offset};
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
      this.gotoPage(50);
      break;
    case 113: // q

      break;
      
    case 98: // 'b'
      this.prevPage();
      break;
    }
  }


  loadChapter(uri, cb) {

    request(uri, false, function(err, str) {
      if(err) return cb(err);

      try {
        // TODO don't assume XHTML
        this.doc = parseXHTML(str);

        cb();

      } catch(err) {
        return cb(err);
      }

    }.bind(this));
  }
}



function init() {

  const pageID = 'page';
  const chapterURI = 'moby_dick_chapter.html';
  
  const paginator = new Paginator(pageID, chapterURI, {
    columnLayout: false
  });

//  window.gotoPage = paginator.gotoPage.bind(paginator);

  window.f = findPrevTableHeader;
}

init();
