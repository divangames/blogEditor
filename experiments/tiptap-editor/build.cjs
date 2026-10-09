const path = require('node:path');
const {createRequire} = require('node:module');
const deps = createRequire(path.resolve(__dirname,'../../release/tiptap-check/package.json'));
deps('esbuild').buildSync({entryPoints:[path.join(__dirname,'main.cjs')],bundle:true,minify:true,platform:'browser',outfile:path.resolve(__dirname,'../../release/tiptap-prototype/app.js'),
  alias:{'prototype-schema':path.resolve(__dirname,'../../release/tiptap-prototype/schema-browser.cjs'),'preservation-schema':path.resolve(__dirname,'../../release/tiptap-prototype/legacy-schema-browser.cjs'),'production-admin':path.resolve(__dirname,'../../release/tiptap-prototype/production-admin.cjs')},nodePaths:[path.resolve(__dirname,'../../release/tiptap-check/node_modules')]});
