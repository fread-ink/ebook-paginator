const breakAvoidVals = ['avoid', 'avoid-page'];
const breakForceVals = ['always', 'all', 'page', 'left', 'right', 'recto', 'verso'];

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

// Shallow clone the structure of ancestors back up to <body>
function cloneAncestors(node) {
  var ret, tmp;
  var innerMost;
  
  while(node.parentNode && node.parentNode.tagName !== 'body') {
    tmp = node.parentNode.cloneNode() // shallow clone
    if(!innerMost) innerMost = tmp;
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
    if(this.opts.columnLayout) {
      this.columnLayout = true;
    }

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

      this.paginate(this.doc.body);

    }.bind(this));
  }

  debug(node) {
    const debugEl = document.getElementById('debug');
    const rect = node.getBoundingClientRect();
    console.log("rect", rect);
    debugEl.style.top = rect.top + 'px';
    debugEl.style.left = rect.left + 'px';
    debugEl.style.width = rect.width + 'px';
    debugEl.style.height = (rect.height || 1) + 'px';
  }

  // Does the node overflow the bottom of the page
  didOverflow(node) {
    var rect;
    if(node.getBoundingClientRect) {
      rect = node.getBoundingClientRect();
    } else { // handle text nodes
      const range = document.createRange();
      range.selectNode(node);
      rect = range.getBoundingClientRect();
    }

    if(this.columnLayout) {
      if(Math.floor(rect.right) > Math.floor(this.pageRight)) {
        return true;
      }
    } else {
      if(Math.floor(rect.bottom) > Math.floor(this.pageBottom)) {
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

    if(this.columnLayout) {
      var pageRight = Math.ceil(this.pageRight);
    } else {
      var pageBottom = Math.floor(this.pageBottom);
    }
    const len = node.textContent.length;
    var prev = 0; 
    var tooFar = false;
    var prevTooFar;
    var dist, halfDist;

    if(len === 0) return 0;
    if(len === 1) return 1;

    // TODO handle length === 0 and length === 1
    
//    console.log('len:', len);

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
        if(range.getBoundingClientRect().bottom > pageBottom) {
          tooFar = true;
        } else {
          tooFar = false;
        }
      }
        
//      console.log("i", i, "tooFar", tooFar);

      dist = Math.abs(prev - i);

      if(dist < 3) {
        if(dist === 1) {
          if(tooFar && !prevTooFar) return prev;
          if(!tooFar && prevTooFar) return i;
        }
        if(dist === 0) {
          return -1; // should never happen
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
  
  paginate(source) {
    var tmp, i, shouldBreak, toRemoveNode;
    var target = this.page;
    var node = source;
    var breakAtDepth = 0;
    var depth = 1; // current depth in DOM hierarchy

    if(this.location) {
      this.page.innerHTML = '';
      node = this.location;
      
      let {tree, innerMost} = cloneAncestors(node);
      if(tree) {
        this.page.appendChild(tree);
        target = innerMost;
      }
            
      if(this.locationOffset) {
        tmp = document.createTextNode(node.textContent.slice(this.locationOffset));
      } else {
        tmp = node.cloneNode();
      }
      target.appendChild(tmp);
      target = tmp;
    }

    
    if(!node) return null; // no more pages left
    
    while(node) {
      // Get next node in document order recursively
      // and shallow copy the node to the corresponding
      // spot in the target location (inside this.page)

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

      
      // We found a node that doesn't want us to break inside.
      // Save the current location and depth so we can break before
      // this node if any of its children end up causing an overflow
      shouldBreak = this.shouldBreak(target);
      if(shouldBreak === 'avoid-inside') {
        this.location = node;
        toRemoveNode = target;
        breakAtDepth = depth;
        // We must have passed the "break-inside:nope" node without overflowing
      } else if(depth <= breakAtDepth && node !== this.location) {
        breakAtDepth = 0;
        toRemoveNode = null;
      }
      
      if(this.didOverflow(target)) {
        this.location = node;

        // If we're at or inside the element that doesn't want us to break inside
        if(breakAtDepth && depth >= breakAtDepth) {
          target = toRemoveNode.parentNode;
          toRemoveNode.parentNode.removeChild(toRemoveNode);
          node = this.location;
          return true;
        }
        
        // TODO check if node is not allowed to be broken
        if(target.nodeType === Node.TEXT_NODE) {
          const offset = this.findOverflowOffset(target);
          tmp = target.parentNode;
          tmp.removeChild(target);
          
          if(offset > 0) {
            target = document.createTextNode(node.textContent.slice(0, offset));
            tmp.appendChild(target);
            this.locationOffset = offset;
          } else {
            target = tmp;
            this.locationOffset = null;
          }
          
        } else {

          tmp = target.parentNode;
          tmp.removeChild(target);
          target = tmp;
          this.locationOffset = null;
        }

        return true;
      }
      
      this.location = null;
    }
    this.location = null;
    return false;
  }

  speedTest() {
    const t = Date.now();
    console.log("Starting speed test");

    var i = 0;
    while(this.paginate()) {
      i++
    }
    
    console.log("Paginated", i, "pages in", (Date.now() - t) / 1000, "seconds");
    alert((Date.now() - t) / 1000);
  }
  
  onKeyPress(e) {
    
    switch(e.charCode) {
      
    case 32: // space
      this.paginate();
      break;
    case 116: // t
      this.speedTest();
      break;
    case 115: // s

      break;
    case 113: // q

      break;
      
    case 98: // 'b'

    }
  }


  loadChapter(uri, cb) {

    request(uri, false, function(err, str) {
      if(err) return cb(err);

      try {
        // TODO don't assume XHTML
        this.doc = parseXHTML(str);

//        this.walker = this.doc.createTreeWalker(this.doc.body, NodeFilter.SHOW_ELEMENT);
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
}

init();
