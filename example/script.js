'use strict';

var Paginator = require('../script.js');

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
  
  window.paginator = paginator;
}

init();
