// Run existing browser scenarios against the isolated instructions server.
// Substitute credentials in memory; never access production credential bytes.
const Module=require('node:module'),fs=require('node:fs'),path=require('node:path');
const file=path.resolve(process.argv[2]||'');
const demoBase=process.env.DEMO_TEST_BASE||'http://127.0.0.1:8878';
if(!/^http:\/\/127\.0\.0\.1:(8878|8879|8880)$/.test(demoBase))throw Error('Expected isolated demo server');
if(path.dirname(file)!==__dirname||!file.endsWith('-check.cjs'))throw Error('Expected a browser check in tests/');
const runner=new Module(file,module);runner.filename=file;runner.paths=Module._nodeModulePaths(path.dirname(file));
const originalRequire=runner.require.bind(runner);
const demoFs=Object.create(fs);
demoFs.readFileSync=(file,...args)=>String(file).replaceAll('\\','/').endsWith('/.outmax-deploy-credentials.json')?JSON.stringify({user:'wiki-demo',password:'wiki-local-demo-only'}):fs.readFileSync(file,...args);
runner.require=name=>{
 if(['fs','node:fs'].includes(name))return demoFs;
 const value=originalRequire(name);
 if(!name.endsWith('/playwright'))return value;
 return {...value,chromium:{...value.chromium,launch:async options=>{
  if(options?.executablePath&&!fs.existsSync(options.executablePath)) options={...options,executablePath:undefined,channel:'msedge'};
  const browser=await value.chromium.launch(options),create=browser.newContext.bind(browser);
  browser.newContext=async options=>{
   const context=await create(options);
   await context.route('https://fonts.googleapis.com/**',r=>r.abort());
   await context.route('https://fonts.gstatic.com/**',r=>r.abort());
   return context;
  };
  return browser;
 }}};
};
runner._compile(fs.readFileSync(file,'utf8').replaceAll('http://127.0.0.1:8877',demoBase),file);
