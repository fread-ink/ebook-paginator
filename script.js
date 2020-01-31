
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

  while(node.parentNode && node.parentNode.tagName !== 'body') {
    tmp = node.parentNode.cloneNode() // shallow clone
    if(ret) {
      tmp.appendChild(ret);
    }
    ret = tmp;
    node = node.parentNode;
  }
  return ret;
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

  constructor(containerID, pageID, chapterURI) {

    this.container = document.getElementById(containerID);
    this.page = document.getElementById(pageID);
    this.pageBottom = this.page.getBoundingClientRect().bottom; // TODO unused?
    this.pageRight = this.page.getBoundingClientRect().right;

    this.page.style.columnWidth = this.page.offsetWidth + 'px';
    
    document.body.addEventListener('keypress', this.onKeyPress.bind(this));

    this.loadChapter(chapterURI, function(err) {
      if(err) return console.error(err);

      this.paginate(this.doc.body);

    }.bind(this));
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

    if(Math.floor(rect.right) > Math.floor(this.pageRight)) {
      return true;
    }
    return false
  }

  // Find the exact offset in a text node just before the overflow occurs.
  findOverflowOffset(node) {

    const range = document.createRange();
    range.selectNode(node);
    range.setStart(node, 0);
    
    const pageRight = Math.ceil(this.pageRight);
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
      if(range.getBoundingClientRect().right > pageRight) {
        tooFar = true;
      } else {
        tooFar = false;
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
  
  paginate(source) {
    var target = this.page;
    var node = source;
    var tmp;
    var i;

    if(this.location) {
      this.page.innerHTML = '';
      node = this.location;
      
      tmp = cloneAncestors(node);
      if(tmp) {
        this.page.appendChild(tmp);
        target = tmp;
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
          
			    if(node && node.nextSibling) {
            node = node.nextSibling;
		        tmp = node.cloneNode();
            target.parentNode.appendChild(tmp);
            target = tmp;
            break;
			    }
		    }
	    }
      
      if(this.didOverflow(target)) {
        this.location = node;

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

  const containerID = 'container';
  const pageID = 'page';
  const chapterURI = 'moby_dick_chapter.html';
  
  const paginator = new Paginator(containerID, pageID, chapterURI);
}

init();
