

class Paginator {

  constructor(iframeID, iframeURI) {

    this.iframe = document.getElementById('iframe');
    this.iframeContainer = document.getElementById('iframe-container');
        
    this.iframe.addEventListener('load', this.onIframeLoad.bind(this));
    this.timeStart = Date.now();
    this.iframe.src = iframeURI;

  }


  onIframeLoad(e) {

    console.log('iframe loaded');
    
    this.iWin = iframe.contentWindow;
    this.iDoc = iframe.contentDocument;

    document.body.addEventListener('keypress', this.onKeyPress.bind(this));
    this.iDoc.addEventListener('keypress', this.onKeyPress.bind(this));
    
    const timeStart = Date.now();

    // Modify iframe document body style to use column layout
    this.iDoc.body.style.columnWidth = this.iframeContainer.offsetWidth + 'px';
    this.iDoc.body.style.columnGap = '60px';
    this.iDoc.body.style.height = this.iframeContainer.offsetHeight + 'px';

    // Get the width that the <body> document inside the iframe
    // _wants_ to have and resize the iframe to make the <body> fit.
    // This will result in an extremely width iframe.
    const range = document.createRange();
    range.selectNodeContents(this.iDoc.body);
    this.iframe.style.width = range.getBoundingClientRect().width + 100 + 'px'

    // This line causes the browser to wait for the change to be applied
    // before running the console.log
    const tmp = this.iDoc.body.offsetWidth;
    console.log("Rendering took:", (Date.now() - timeStart) / 1000, "seconds", );
    console.log("for", this.countPages(), "pages");
  }

  countPages() {
    const pageCount = this.iframe.offsetWidth / (this.iframeContainer.offsetWidth + 61);

    return Math.ceil(pageCount);
  }

  nextPage() {
    const curLeft = this.iframe.offsetLeft;
    this.iframe.style.left = (curLeft - this.iframeContainer.offsetWidth - 61) + 'px';
  }

  onKeyPress(e) {  
    switch(e.charCode) {
      
    case 32: // space
      this.nextPage();
      break;
    }
  }

}



function init() {

  const iframeID = 'iframe';
  const iframeURI = 'moby_dick_chapter.html';

  const paginator = new Paginator(iframeID, iframeURI);
}

init();