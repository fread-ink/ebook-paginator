'use strict';

if(typeof require === 'function') {
  var postcss = require('postcss');
  var postcssUnEpub = require('./postcss-unepub.js');
}

const breakAvoidVals = ['avoid', 'avoid-page'];
const breakForceVals = ['always', 'all', 'page', 'left', 'right', 'recto', 'verso'];

function getIframeHTML() {
  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8">
      <style type="text/css">
        body {
          display: block !important; 
          position: absolute !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
        }
      </style>
    </head>
    <body>
    </body>
  </html>`;
}

// async version of setTimeout(arg, 0);
async function nextTick(func) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      func().then(resolve)
    }, 0);
  });
}

// TODO Debug function. Not used in production
var nextStep;
async function waitForPress(func) {
  return new Promise((resolve, reject) => {
    nextStep = () => {
      func().then(resolve)
    };
  });
}

// TODO Debug function. Not used in production
async function wait(func, delay) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      func().then(resolve)
    }, delay);
  });
}

async function waitForElementLoad(el) {
  if(el.complete) return true;
  return new Promise(function(cb) {
		el.onload = cb;
    el.onerror = cb;
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

function getXMLDocEncoding(doc, firstChild) {
  // If the document has xml header like:
  // <?xml version="1.0" encoding="ISO-8859-2"?>
  // then this always overrides any
  // <meta charset="utf-8"/> or <meta content="text/html; charset=utf-8"/>
  // This is true in firefox, webkit and chrome

  // As of February 2020 this works in WebKit and Chrome
  if(doc.xmlEncoding) {
    return doc.xmlEncoding;
  }

  // For some reason firefox decided to remove Document.xmlEncoding
  // which is the only way to do this without manual parsing:
  // https://developer.mozilla.org/en-US/docs/Web/API/Document/xmlEncoding
  // Now there seems to be no way to detect XML encoding
  // other than manually parsing the <?xml> tag

  if(!firstChild.textContent) return undefined;
  const m = firstChild.textContent.match(/\?xml[^\?]+encoding=['"]([^'"]+)['"]/);
  if(m && m.length > 1) {
    return m[1];
  }
  
  return undefined;
}

// Unfortunately neither document.characterSet
// nor document.inputEncoding are set correctly
// on a Document or XMLDocument created by DOMParser
// so we have to do it manually
function getDocEncoding(doc, firstChild) {
  var encoding;
  if(doc instanceof XMLDocument) {
    encoding = getXMLDocEncoding(doc, firstChild);
    if(encoding) return encoding;
  }

  var r = new RegExp(/charset\=([^;\s]+)/i);
  
  var els = doc.querySelectorAll("head > meta[charset], head > meta[content]");
  var el, attr, m;
  for(el of els) {

    // <meta http-equiv="Content-Type" content="text/xhtml; charset=utf-8"/>
    attr = el.getAttribute('content');
    if(attr) {
      m = attr.match(r);
      if(m && m.length > 1) {
        encoding = m[1];
      }
    }
    
    // <meta charset="utf-8"/>      
    attr = el.getAttribute('charset');
    if(attr) {
      encoding = attr;
    }
  }

  return encoding || 'utf-8';
}

function isXHTML(doc) {
  if(doc.querySelector('html').getAttribute('xmlns')) {
    return true;
  }
  return false;
}

// Takes an arrayBuffer
// and returns a parsed Document or XMLDocument (autodetected)
// converted to utf-8 from whatever the native encoding was
async function parseHTML(arrayBuffer) {
  var firstChild;

  // Assume UTF-8 until we know different
  const utf8Decoder = new TextDecoder('utf-8');
  var str = utf8Decoder.decode(arrayBuffer);
  
  var doc = parseDOM(str, 'text/html');

  // If it's XHTML then re-parse with correct mime-type
  const isX = isXHTML(doc);
  if(isX) {
    firstChild = doc.firstChild;
    doc = parseDOM(str, 'application/xhtml+xml');
  }

  // Detect encoding
  const encoding = getDocEncoding(doc, firstChild);
  
  if(encoding.toLowerCase() !== 'utf-8') {
    const decoder = new TextDecoder(encoding);

    str = decoder.decode(arrayBuffer);
    if(isX) {
      doc = parseDOM(str, 'application/xhtml+xml');
    } else {
      doc = parseDOM(str, 'text/html');
    }
  }

  return {doc, encoding: encoding};
}

// type is 'blob', 'text', 'json' or 'arrayBuffer'
// default type is 'text'
async function request(uri, type) {
  var req = new Request(uri);
  var resp = await fetch(req);
  // If .status is 0 then resp.ok does not have a useful value.
  // This can happen with non-http URI schemes
  if(resp.status && (!resp.ok || resp.status < 200 || resp.status > 299)) {
    throw new Error("Failed to get: " + uri);
  }
  if(!type) return await resp.text();
  
  return await resp[type]();
}

async function requestHTML(uri) {  
  return new Promise((resolve, reject) => {
    
    var xhr = new XMLHttpRequest;

    xhr.open('GET', uri);
    xhr.responseType = 'document';
    
    xhr.onload = function() {
      if(xhr.readyState === xhr.DONE) {
        if(xhr.status < 200 || xhr.status >= 300) {
          reject(new Error("Failed to get: " + uri));
          return;
        }
        resolve(xhr.responseXML);
      }
    }
    xhr.onerror = function() {
      reject(new Error("Failed to get: " + uri));
    }
    
    xhr.send();
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

		while(node) {
			node = node.parentNode;
      
      // Don't proceed past body element in source document
      if(toLower(node.tagName) === 'body') return {};
      
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


function createIframeContainer(allowScripts) {

  var iframeElement = document.createElement('iframe');
  iframeElement.sandbox = "allow-same-origin";
  
  if(allowScripts) {
    iframeElement.sandbox += " allow-scripts";
  }
  
  iframeElement.scrolling = 'no';
  iframeElement.style.position = 'absolute';
  iframeElement.style.display = 'block';
  iframeElement.style.top = '0';
  iframeElement.style.left = '0';
  iframeElement.style.width = '100%';
  iframeElement.style.height = '100%';
  iframeElement.style.border = 'none';
  iframeElement.style.overflow = 'hidden';
  
  return iframeElement;
}


class Paginator {

  constructor(containerID, opts) {
    this.opts = Object.assign({
      loadScripts: false,
      loadCSS: true,
      preprocessCSS: true,
      cacheForwardPagination: true,
      repeatTableHeader: false,
      detectEncoding: true
    }, opts || {})

    // Does the page currently overflow elements at the top?
    // If this is false then the page overflows at the bottom
    this.overflowTop = false; 
    
    if(this.opts.columnLayout) {
      this.columnLayout = true;
    }
    
    this.curPage = 0;
    this.pages = {};

    // List of <style> elements injected using
    // the .injectCSS or .injectCSSbyURI API
    this.injectedCSS = [];

    // Create iframe container element
    this.containerElement = document.getElementById(containerID);
    this.iframeElement = createIframeContainer(this.opts.loadScripts);
    this.containerElement.appendChild(this.iframeElement);

    // Add HTML to iframe document
    
    this.iDoc = this.iframeElement.contentWindow.document;
    this.iDoc.open();
    this.iDoc.write(getIframeHTML());
    this.iDoc.close();
    
    this.page = this.iDoc.body;
    
    this.setOverflowBottom();

    // Use column-based layout? (slow on WebKit but may be more accurate)
    if(this.columnLayout) {
      this.pageRight = this.page.getBoundingClientRect().right;
      this.page.style.columnWidth = this.page.offsetWidth + 'px';
    } else {
      this.pageBottom = this.page.getBoundingClientRect().bottom;
      this.pageTop = this.page.getBoundingClientRect().top;
    }
  }

  async load(chapterURI) {
    this.doc = await this.loadChapter(chapterURI);
    console.log("DOC:", this.doc);
    
    if(this.opts.loadCSS) {
      await this.loadCSS();
    }

    if(this.opts.loadScripts) {
      this.loadScripts();
    }
    
    await this.firstPage(); 
  }

  getDocumentLanguage() {

  }

  getDocumentEncoding() {

  }
  
  // Traverse recursively to previous node in a DOM tree
  // and copy it to the equivalent location in the target DOM tree
  // if it doesn't already exist, while tracking tree depth.
  // Shallow copy is preferred when possible, but is not always
  // viable while traversing in reverse order
  // since a node should never be added without its ancestor nodes
  appendPrevNode(node, target, depth) {
    var tmp;
    var forceAvoidInside;
    
    if(node.previousSibling) {
      node = node.previousSibling;
		  tmp = node.cloneNode();
      appendAsFirstChild(target.parentNode, tmp);
      target = tmp;

      if(!forceAvoidInside && this.shouldBreak(node) === 'avoid-inside') {
        forceAvoidInside = {node, target, depth};
      }      
      
      while(node.childNodes.length) {
        node = node.lastChild;
		    tmp = node.cloneNode();
        target.appendChild(tmp);
        target = tmp;
        depth++;;
        
        if(!forceAvoidInside && this.shouldBreak(node) === 'avoid-inside') {
          forceAvoidInside = {node, target, depth};
        }      
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
    
    return {node, target, depth, forceAvoidInside};
  }

  async processCSS(css, uri) {
    uri = uri || 'unnamed';
    if(!this.opts.preprocessCSS || !postcss) {
      return css;
    }
    var result = await postcss([postcssUnEpub])
        .process(css, {from: uri, to: uri+'.out'});
    
    return result.css;
  }
  
  async loadCSS() {
    // handle <link rel="stylesheet" href="<uri>">
    // and <style> tags
    var els = this.doc.querySelectorAll("head > link[rel=stylesheet], head > style");
    var el, uri, css, type, result;
    for(el of els) {
      try {
        if(toLower(el.tagName) === 'link') {
          if(el.getAttribute('disabled')) continue;
          uri = el.getAttribute('href');
          if(!uri) continue;
          css = await request(uri);
        } else { // <style> tags
          css = el.innerHTML;
        }
        css = await this.processCSS(css, uri);
        
      } catch(err) {
        console.error(err);
        continue;
      }
      this._injectCSS(css);
    }
  }

  cloneElements(target, els) {
    var el, tmp;
    for(el of els) {
      tmp = el.cloneNode(true);
      target.appendChild(tmp);
    }
  }
  
  loadScripts() {
    const head = this.iDoc.querySelector("head");
    var els = this.doc.querySelectorAll("head > script");
    this.cloneElements(head, els);

    const html = this.iDoc.querySelector("html");
    var els = this.doc.querySelectorAll("html > script");
    this.cloneElements(html, els);
  }
  
  async injectCSSByURI(uri, opts) {
    var css;
    css = await request(uri);
    return this.injectCSS(css, opts);
  }

  async injectCSS(css, opts) {
    opts = Object.assign({
      order: 'after',
      preprocess: true
    }, opts || {});
    
    if(opts.preprocessCSS) {
      css = await this.processCSS(css);
    }
    var el = this._injectCSS(css, (opts.order === 'before'));
    this.injectedCSS.push(el);
    return el;
  }

  clearCSS(clearAll) {
    var els;
    if(clearAll) {
      els = this.iDoc.querySelectorAll("head > link[rel=stylesheet], head > style");
    } else {
      els = this.injectedCSS;
    }
    
    var el;
    for(el of els) {
      el.parentNode.removeChild(el);
    }
    this.injectedCSS = [];
  }
  
  _injectCSS(css, before) {
    const style = this.iDoc.createElement('STYLE');
    style.type = "text/css";
    style.innerHTML = css;
    const head = this.iDoc.querySelector("head");
    if(before) {
      appendAsFirstChild(head, style);
    } else {
      head.appendChild(style);
    }
    return style;
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
        await waitForElementLoad(node);
      }

      if(this.page.getBoundingClientRect().top < 0) {
        return true;
      }
      return false;
    }

    if(node.getBoundingClientRect) {

      // If it's an image, wait for it to load
      if(toLower(node.tagName) === 'img') {
        await waitForElementLoad(node);
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

  // Warning: Changing the way nodes are counted here
  //          will break existing bookmarks.
  //
  // If given a node, it will traverse the DOM, counting nodes
  // until it finds the node and then return the count.
  // If given a count it will do the same but return the node
  // when it reaches the specified count
  findNodeOrCount(startNode, nodeOrCount) {
    var nodeCount;
    var nodeToFind;
    if(typeof nodeOrCount === 'number') {
      nodeCount = nodeOrCount;
    } else {
      nodeToFind = nodeOrCount;
    }
    var node = startNode;
    var count = 0;
    
    while(node) {
      if(nodeCount) {
        if(count === nodeCount) {
          return node;
        }
      } else if(nodeToFind) {
        if(node === nodeToFind) {
          return count;
        }
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

  // Must match the way prev appendPrevNode() traverses
  getPrevNode(node) {
    // Don't proceed past body element in source document
    if(toLower(node.tagName) === 'body') return node;
    
    if(node.previousSibling) {
      node = node.previousSibling;
      while(node.childNodes.length) {
        node = node.lastChild;
      }
	  } else if(node.parentNode) {
      node = node.parentNode;
    }
    return node;
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
          // This only happens when topOverflow is true
          // and all possible offsets result in overflow
          if(i === len - 1) {
            return i;
          }
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
    // TODO
  }

  async processQueue() {
    if(!this.queuedAction) return;

    const action = this.queuedAction;
    this.queuedAction = null;

    // Is the queued action a 'gotoBookmark' ?
    if(typeof queue === 'object') {
      await this.gotoBookmark(action);
      return;
    }
    
    switch(action) {
      
    case 'first':
      await this.firstPage();
      break;
    case 'next':
      await this.nextPage();
      break;
    case 'prev':
      await this.prevPage();
      break;
    case 'redraw':
      await this.redraw();
      break;
    }
  }

  async queue(action) {
    // Only queue one action at a time
    this.queuedAction = action;
  }
  
  async firstPage() {
    if(this.paginating) {
      if(!this.queuedAction) this.queue('first');
      return;
    }
    this.paginating = true;
    
    this.pages[0] = {
      node: this.doc.body,
      offset: 0
    };
    this.curPage = 0;;
    
    const nextPageStartRef = await this.paginate(this.doc.body, 0);
    if(!nextPageStartRef || !nextPageStartRef.node) {
      this.paginating = false
      return false;
    }

    this.pages[this.curPage+1] = nextPageStartRef;
    
    this.paginating = false    
    await this.processQueue();
  }
  
  async nextPage() {
    if(this.paginating) {
      if(!this.queuedAction) this.queue('next');
      return;
    }
    this.paginating = true;
    
    this.curPage++;
    const curPageStartRef = this.pages[this.curPage];

    if(!curPageStartRef || !curPageStartRef.node) {
      this.paginating = false;
      return false; // no more pages
    }

    const nextPageStartRef = await this.paginate(curPageStartRef.node, curPageStartRef.offset)
    
    if(!nextPageStartRef || !nextPageStartRef.node) {
      this.paginating = false;
      return false; // no more pages
    }

    this.pages[this.curPage+1] = nextPageStartRef;

    this.paginating = false;
    await this.processQueue();
  }

  async prevPage() {
    if(this.paginating) {
      if(!this.queuedAction) this.queue('prev');
      return;
    }
    this.paginating = true;
    
    const curPageStartRef = this.pages[this.curPage];
    if(!curPageStartRef || !curPageStartRef.node) {
      this.paginating = false;
      return false;
    }

    // don't paginate back before body
    if(curPageStartRef.node == this.doc.body) {
      this.curPage = 0;
      this.paginating = false;
      return 0;
    }
    
    this.curPage--;
    var prevPageStartRef = this.pages[this.curPage];

    // If we shouldn't use the cache or don't have a cache entry for this page
    // then paginate backwards
    if(!this.opts.cacheForwardPagination || !prevPageStartRef) {
      var node;
      // The page refs start at the beginning element of the current page
      // so we don't want to repeat it unless there's an offset
      if(!curPageStartRef.offset) {
        node = this.getPrevNode(curPageStartRef.node);
      } else {
        node = curPageStartRef.node;
      }
      prevPageStartRef = await this.paginateBackwards(node, curPageStartRef.offset)
      if(!prevPageStartRef || !prevPageStartRef.node) {
        // no more pages
        this.curPage = 0;
        this.paginating = false;
        await this.firstPage();
        return;
      }
      
      this.pages[this.curPage] = prevPageStartRef;

      
    } else {
      // Paginate using the previously cached page start location
      prevPageStartRef = await this.paginate(prevPageStartRef.node, prevPageStartRef.offset)
    }

    this.paginating = false;
    await this.processQueue();
  }

  async redraw(doInvalidateCache) {
    if(this.paginating) {
      if(!this.queuedAction) this.queue('redraw');
      return;
    }
    this.paginating = true;
    
    if(doInvalidateCache) {
      this.invalidateCache()
    };
    const curPageRef = this.pages[this.curPage];
    if(!curPageRef || !curPageRef.node) {
      this.paginating = false;
      return false;
    }

    const nextPageRef = await this.paginate(curPageRef.node, curPageRef.offset);

    this.paginating = false;
    await this.processQueue();
  }

  // invalidate all but the reference to the start of the current page
  invalidateCache() {
    var cur = this.pages[this.curPage];
    this.pages = {};
    this.pages[this.curPage] = cur;
  }  

  async gotoBookmark(count, offset) {
    if(this.paginating) {
      if(!this.queuedAction) this.queue({count, offset});
      return;
    }
    this.paginating = true;
    
    if(typeof count === 'object') {
      offset = count.offset;
      count = count.count;
    }
    
    const node = this.findNodeOrCount(this.doc.body, count);
    if(!node) {
      this.paginating = false
      return false;
    }

    const nextPageRef = await this.paginate(node, offset);
    this.curPage = 0
    this.pages[0] = {
      node: node,
      offset: offset,
      nodesTraversed: nextPageRef.nodesTraversed
    };
    delete nextPageRef.nodesTraversed;
    this.pages[1] = nextPageRef;

    this.paginating = false    
    await this.processQueue();
  }

  getBookmark() {
    const ref = this.pages[this.curPage];
    const count = this.findNodeOrCount(this.doc.body, ref.node);
    
    return {count, offset: ref.offset};
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
    var heightAdded = 0;

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
          
          return {node, offset};
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
      var forceAvoidInside, traversed;
      
      // Get the next/prev node in the source document in order recursively
      // and shallow copy the node to the corresponding spot in
      // the target location (inside this.page)
      if(!reverse) {
        ({node, target, depth} = appendNextNode(node, target, depth));
        
      } else {
        ({node, target, depth, forceAvoidInside} = this.appendPrevNode(node, target, depth));
      }

      console.log("APPENDED:", node);
      
      if(!node || !target) {
        return null;
      }
      
      // Since appendPrevNode sometimes appends multiple nodes
      // in order to re-create ancestor structure, it does its own checking
      // of whether we should avoid breaking inside a node
      if(forceAvoidInside) {
        avoidInside = {node: forceAvoidInside.node, target: forceAvoidInside.target};
        breakAtDepth = forceAvoidInside.depth;
      }
      
      // We found a node that doesn't want us to break inside.
      // Save the current location and depth so we can break before
      // this node if any of its children end up causing an overflow
      shouldBreak = this.shouldBreak(target);
      if(!avoidInside && shouldBreak === 'avoid-inside') {
        avoidInside = {node, target};
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
      
      // If the first non-zero height node added to the page caused an overflow
      if(didOverflow && heightAdded <= 1) {

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
        return {node, offset};
      }
      
      // If adding the most recent node caused the page element to overflow
      if(didOverflow || breakBefore) {

        // If we're at or inside a node that doesn't want us to break inside
        if(breakAtDepth && depth >= breakAtDepth && avoidInside) {
          target = avoidInside.target.parentNode;
          avoidInside.target.parentNode.removeChild(avoidInside.target);
          return {node: avoidInside.node, offset: 0};
        }
        
        // If this is a text node and we're not supposed to break before
        if(target.nodeType === Node.TEXT_NODE && (!breakBefore)) {

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

        return {node, offset};
      } else {
        // Count all nodes except pure whitespace text nodes
        if(!(target.nodeType === Node.TEXT_NODE && !target.textContent.trim().length)) {
          nodesAdded++;
          heightAdded += target.offsetHeight;
        }
      }

      // TODO run this with nextTick e.g. every 200 ms
      // so the browser tab doesn't feel unresponsive to the user
      return await appendNode();
    }

    return await appendNode();
  }

  getNodeCount() {
    return this.nodeCount;
  }
  
  async loadChapter(uri) {
    if(this.opts.detectEncoding) {
      var resp = await request(uri, 'arrayBuffer');
      var o = await parseHTML(resp);
      this.encoding = o.encoding;
      this.isXHTML = (o.doc instanceof XMLDocument);
      return o.doc;
    }

    var doc = await requestHTML(uri);
    
    // WebKit does not detect encoding correctly in this mode
    // and seems to simply convert encoding to the primary document's encoding
    this.encoding = doc.characterSet;
    this.isXHTML = (doc instanceof XMLDocument);
    
    return doc;
  }
}


module.exports = Paginator;
