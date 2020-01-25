

class Paginator {

  constructor(iframeID, iframeURI) {

    this.iframe = document.getElementById('iframe');
    this.iframeContainer = document.getElementById('iframe-container');
    this.bottomHider = document.getElementById('bottom-hider');
        
    this.iframe.addEventListener('load', this.onIframeLoad.bind(this));
    this.timeStart = Date.now();
    this.iframe.src = iframeURI;

    // the scrollY values for each page in the document
    this.pageScroll = [0];
    this.curPage = 0;

    this.speedTestBound = this.speedTest.bind(this);
  }


  onIframeLoad(e) {

    console.log('iframe loaded');
    
    this.iWin = iframe.contentWindow;
    this.iDoc = iframe.contentDocument;

    document.body.addEventListener('keypress', this.onKeyPress.bind(this));
    this.iDoc.addEventListener('keypress', this.onKeyPress.bind(this));

    this.walker = this.iDoc.createTreeWalker(this.iDoc, NodeFilter.SHOW_TEXT); 
    this.hideHalfShownLines();

  }

  countPages() {
    const pageCount = this.iframe.offsetWidth / (this.iframeContainer.offsetWidth + 61);

    return Math.ceil(pageCount);
  }

  nextPage() {
    const nextPageStart = this.pageScroll[this.curPage+1];
//    console.log("next page:", nextPageStart)
    this.iWin.scrollTo(0, nextPageStart);
    this.hideHalfShownLines()
    this.curPage++;
  }

  // This is quite a bit faster as a loop (instead of recursive
  speedTest(numPages, count) {
    if(!numPages) numPages = 1000;
    if(!count) {
      count = 0;
      console.log("Starting async speed test for", numPages, "pages");
      this.t = Date.now();
    }


    if(count >= numPages) {
      console.log("Took:", (Date.now() - this.t) / 1000, 'seconds')
      return;
    }

    this.hideHalfShownLines(true, this.speedTestBound, numPages, count);
  }

  speedTestLoop(numPages) {
    if(!numPages) numPages = 1000;

    console.log("Starting sync speed test for", numPages, "pages");
    const t = Date.now();
    
    var i;
    for(i=0; i < numPages; i++) {
      this.hideHalfShownLines(true);
    }
    console.log("Took:", (Date.now() - t) / 1000, 'seconds')
  }
  
  isPartiallyInView(el) {

    var rect;
    if(el.getBoundingClientRect) {
      rect = el.getBoundingClientRect();

    } else {
      const range = document.createRange();
      range.selectNodeContents(el);
      rect = range.getBoundingClientRect();
    }
    const bottom = document.getElementById('iframe').offsetHeight;

    if(rect.top < bottom && rect.bottom > bottom) {
//      console.log("Debug:", bottom, rect.top, rect.bottom, el);
      document.getElementById('debugger').style.height = (rect.top) + 'px';
      return 0;
    } else if(rect.top > bottom) {
      return 1;
    } else {
      return -1
    }
  }

  hideHalfShownLines(rewind, cb, total, count) {

    var toRewind = 0;
    
    var i, cur, found, bottomCutoff, diff, nextOffset;

    for(i=0; i < 2000; i++) { // TODO find real max
      cur = this.walker.currentNode;
      if(cur.nodeName !== '#text') {
        this.walker.nextNode();
        toRewind++;
        continue;
      }
      const inView = this.isPartiallyInView(cur);
      if(inView == 0) {
//        console.log("Node:", cur);
        const range = document.createRange();
        range.selectNodeContents(cur);
        var rect;
        var lastTop = -1;
        var tooFar = false;
        var lastTooFar = false;
        var lastMove = 0;
//        console.log('------------------------');
        // TODO what if there is only a single character?
        while(true) {
//          console.log("at:", range.startOffset, '-', range.endOffset);          
          diff = range.endOffset - range.startOffset;
          rect = range.getBoundingClientRect();
          
          // Use binary search to find the correct cut-off point

          if(rect.top > (this.iframe.offsetHeight)) {

//            console.log('FOUND!', rect.top, this.iframe.offsetHeight);

//            bottomCutoff = (this.iframe.offsetHeight - lastTop) - 1;            
//            found = true;
//            break;

            tooFar = true;
          } else {
            tooFar = false;
            lastTop = rect.top;
          }
          lastTooFar = tooFar;

//          console.log("  diff:", diff, tooFar);

          if(lastMove == 1) {
//            console.log("Ended on:", range.startOffset, tooFar, lastTooFar, '-', rect.top, lastTop);
            break;
          } else if(range.startOffset == 0) {
            nextOffset = Math.round(range.endOffset / 2);
          } else {
            if(tooFar) {
              if(range.lastMove < 4) {
//                console.log("too far (close to beginning)", range.startOffset, '-', rect.top, lastTop);
                nextOffset = range.startOffset - (lastMove - 1);
              } else {
//                console.log("too far (long way to go)", range.startOffset, '-', rect.top, lastTop);
                nextOffset = range.startOffset - Math.round(lastMove / 2) - 1;
              }
            } else {
              if(lastMove < 4) {
//                console.log("NOT too far (close to end)", range.startOffset, '-', rect.top, lastTop);
                nextOffset = range.startOffset + (lastMove - 1);
              } else {
//                console.log("NOT too far (long way to go)", range.startOffset, '-', rect.top, lastTop);
                nextOffset = range.startOffset + Math.round(lastMove / 2) + 1;
              }
            }
          }
          if(nextOffset < 0) {
            nextOffset = 0;
          } else if(nextOffset > range.endOffset) {
            nextOffset = range.endOffset;
          }
          lastMove = Math.abs(range.startOffset - nextOffset);
          range.setStart(cur, nextOffset);
        }

        if(lastTop > -1) {
          bottomCutoff = Math.round((this.iframe.offsetHeight - lastTop) - 1);
          if(bottomCutoff < 1) {
            bottomCutoff = 0;
          }
//          console.log("Cutting off:", bottomCutoff);
        }
        found = true;
        break;
      }

      this.walker.nextNode();
      toRewind++;

      // We went too far
      if(inView == 1) {
        this.walker.previousNode();
        if(toRewind) {
          toRewind--;
        }
        break;
      }
    }
    if(!found) {
//      console.log("NOTHING");
      bottomCutoff = 0;
    }
    
    const nextPageScroll = this.iWin.scrollY + this.iframeContainer.offsetHeight - bottomCutoff;
    if(!rewind) {
      this.pageScroll.push(nextPageScroll);
      this.bottomHider.style.height = bottomCutoff + 'px';
    }
    
    for(i=0; i < toRewind; i++) {
      this.walker.previousNode();
    }
    if(cb) setTimeout(cb, 0, total, count+1)
  }
  
  onKeyPress(e) {
    
    switch(e.charCode) {
      
    case 32: // space
      this.nextPage();
      break;
    case 116: // t
      this.speedTest();
      break;
    case 115: // s
      this.speedTestLoop();
      break;
    case 98: // 'b'
      this.iWin.scrollTo(0, this.iWin.scrollY - 10);
    }
  }

}



function init() {

  const iframeID = 'iframe';
  const iframeURI = 'moby_dick_chapter.html';
//  const iframeURI = 'chapter1.html';

  const paginator = new Paginator(iframeID, iframeURI);
}

init();
