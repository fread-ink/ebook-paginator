'use strict';

var Paginator = require('../index.js');

async function init() {

  const pageID = 'page';
  const chapterURI = 'moby_dick_chapter.xhtml';

  const paginator = new Paginator(pageID, {
    columnLayout: false,
    repeatTableHeader: false,
    cacheForwardPagination: false,
    loadScripts: true,
    detectEncoding: true,
    preprocessCSS: true
  });

  await paginator.load(chapterURI);

  document.body.addEventListener('keypress', onKeyPress.bind(this));
  
  window.paginator = paginator;
}

async function speedTest() {
  const t = Date.now();
  console.log("Starting speed test");

  var i = 0;
  while(await paginator.nextPage()) {
    i++;
  }
  
  console.log("Paginated", i, "pages in", (Date.now() - t) / 1000, "seconds");
  alert((Date.now() - t) / 1000);
}
  
async function onKeyPress(e) {

  switch(e.charCode) {
    
  case 32: // space
    paginator.nextPage();
    break;
  case 98: // 'b'
    paginator.prevPage();
    break;
  case 114: // r
    paginator.redraw();
    break;
  case 116: // t
    paginator.speedTest();
    break;
  }
}


init();
