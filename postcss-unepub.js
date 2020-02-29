'use strict';

var postcss = require("postcss");

module.exports = postcss.plugin("postcss-unepub", function(opts) {
	opts = opts || {};

  const r = new RegExp(/^-epub-/);
  
	return function(css) {
		css.walkDecls(function(decl) {
			if(!decl.value) return;

      if(!r.test(decl.prop)) return;
      
			decl.parent.insertBefore(decl, decl.clone({
				prop: decl.prop.slice(6)
			}));
		})
	};
});
