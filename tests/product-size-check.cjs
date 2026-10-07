const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const creds=JSON.parse(fs.readFileSync(path.join(root,'release/.outmax-deploy-credentials.json'),'utf8'));
const base=process.env.EDITOR_TEST_BASE||'http://127.0.0.1:8877';
const out=path.join(root,'release/ui-check/screens');fs.mkdirSync(out,{recursive:true});
let browser;

async function addProduct(page,url,sku,expectedSize,expectedHint,screenshot){
  await page.locator('#product-input').evaluate(element=>{const group=element.closest('details');if(group)group.open=true;});
  await page.locator('#product-input').fill(url);
  await page.locator('#load-products').click();
  const shelf=page.locator(`.product-shelf-card[data-sku="${sku}"]`);await shelf.waitFor({timeout:45000});
  await shelf.locator('[data-insert]').click();
  const sizes=page.locator(`#product-${sku} .om-sizes`);await sizes.waitFor();
  const chip=sizes.locator('span').filter({has:page.locator(`b:text-is("${expectedSize}")`)});
  assert.equal(await chip.locator('small').textContent(),expectedHint);
  await sizes.screenshot({path:path.join(out,screenshot)});
}

(async()=>{
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
  await context.request.post(base+'/login',{form:{login:creds.user,password:creds.password}});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.locator('#account-name strong').waitFor();
  await addProduct(page,'https://outmaxshop.ru/snickers/adidas-46472','46472','46','30 см','qa-outmax-product-sizes.png');
  await page.goto(base+'/hasl/');await page.locator('#account-name strong').waitFor();
  await addProduct(page,'https://haslestore.com/sneakers/muzhskie/krossovki-puma-california-vintage-43368','43368','40','24,5 см','qa-hasl-product-sizes.png');
  assert.deepEqual(errors,[]);
  console.log('Product cards: OUTMAX and HASL show available sizes with centimetres: OK');
  await browser.close();
})().catch(async error=>{console.error(error);if(browser)await browser.close();process.exitCode=1;});
