// Снимает демонстрационные экраны для базы знаний на изолированном сервере.
const {chromium}=require('../release/ui-check/node_modules/playwright');
const fs=require('node:fs');
(async()=>{
 if(process.env.CAPTURE_FINDER_VALIDATORS){await require('./site-finder-external-validators.cjs')();return;}
 if(process.env.CAPTURE_SCHEMA_VALIDATORS){require('node:child_process').execFileSync('python',['tests/site-schema-validator-screens.py',process.env.SCHEMA_ARTIFACT_DIR||'release/schema-validators-20261025'],{stdio:'inherit'});return;}
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  if(process.env.CAPTURE_WORKSPACE_GUEST){await require('./workspace-guest-check.cjs')(browser,process.env.WIKI_TEST_BASE||'http://127.0.0.1:8920',{capture:true});return;}
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const base=process.env.WIKI_TEST_BASE||'http://127.0.0.1:8878';
  await context.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'},headers:{Origin:base}});
  const page=await context.newPage();
  if(process.env.CAPTURE_HOME_INTRO){await require('./home-intro-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_HOME_ACCOUNT){await require('./home-account-menu-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_ACCOUNT_MENU){await require('./account-menu-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_DELETE_PROGRESS){await require('./workspace-delete-progress-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_INSTRUCTIONS_HOME){await require('./instructions-home-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_AVATAR_CROP){await require('./avatar-crop-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_USER_DIRECTORY){await require('./user-directory-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_WORKSPACE_ACTIONS){await require('./workspace-actions-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_ARTICLE_LINK_MANAGER){await require('./article-link-manager-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_USER_PROFILE){await require('./user-profile-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_SITE_PROFILE_MENU){await require('./site-profile-menu-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_WORKSPACE_RECENT){await require('./workspace-recent-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_WORKSPACE_NAVIGATION){await require('./workspace-navigation-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_WORKSPACE_RESUME){await require('./workspace-resume-check.cjs')(context,base,{capture:true});return;}

  if(process.env.CAPTURE_WORKSPACE){await require('./workspace-check.cjs')(context,base,{capture:true});return;}

  if(process.env.CAPTURE_ARTICLE_EXPORT){await page.goto(base+'/');await page.locator('#download').click();await page.locator('#export-dialog').screenshot({path:'instructions/screens/article-export-server.png'});await page.locator('#export-close').click();await page.locator('.toolstrip').screenshot({path:'instructions/screens/article-phosphor-tools.png'});return;}

  if(process.env.CAPTURE_FINDER_CATALOG){await require('./site-finder-catalog-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_FINDER_BRANDS){await require('./site-finder-brands-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_PRODUCT_BRANDS){await require('./site-product-brands-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_CHANGELOG_TEXT){
   if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))throw Error('Changelog captures require isolated demo server');
   await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
   for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.goto(base+'/instructions/#changelog',{waitUntil:'domcontentloaded'});const change=page.locator('.wiki-change').filter({has:page.getByRole('heading',{name:'Загрузка конструктора и сохранение настроек экрана',exact:true})});await change.waitFor();await change.evaluate(async section=>{const images=[...document.images].filter(img=>section.contains(img)||!!(img.compareDocumentPosition(section)&Node.DOCUMENT_POSITION_FOLLOWING));for(const img of images)img.loading='eager';await Promise.all(images.map(img=>img.decode().catch(()=>{})));});await page.evaluate(()=>document.fonts.ready);await change.locator('h3').evaluate(n=>n.scrollIntoView({block:'start'}));await page.evaluate(()=>scrollBy(0,-100));if(!/Добавлено:/.test(await change.innerText())||!/Изменено:/.test(await change.innerText())||!/Исправлено:/.test(await change.innerText()))throw Error('Missing categorized change list');await page.screenshot({path:'instructions/screens/changelog-text-'+(width===390?'phone':'desktop')+'.png'});}console.log('PASS categorized changelog screenshots desktop/mobile');return;
  }
  if(process.env.CAPTURE_MOBILE_MOTION){
   if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))throw Error('Motion captures require isolated demo server');
   await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());const seed=require('../site-builder/catalog-seed.json').products;await page.route('**/editor-api/site-builder/products?*',r=>r.fulfill({json:{products:Object.values(seed),missing:[],total:6}}));await page.goto(base+'/site-builder/hasl/');await page.waitForFunction(()=>window.SiteBuilder&&state&&document.getElementById('desktop').__haslDocState===state);const html=await page.evaluate(()=>R.build(state,products,content,{clean:true,site:'hasl'}));await page.setViewportSize({width:390,height:844});await page.setContent(html);await page.locator('.faq-q').first().click();await page.waitForTimeout(330);await page.locator('.faq-section').screenshot({path:'instructions/screens/site-mobile-motion-faq.png'});
   const {pathToFileURL}=require('node:url'),path=require('node:path');await page.unroute('**/*');for(const phase of ['published','candidate']){await page.setViewportSize({width:1440,height:1000});const report=phase==='candidate'?'paired/candidate':'published/audit';await page.goto(pathToFileURL(path.resolve('release/mobile-motion-20261026/'+report+'/lighthouse-1.html')).href);await page.waitForTimeout(400);await page.screenshot({path:'instructions/screens/site-mobile-performance-'+phase+'.png'});}console.log('PASS mobile FAQ and original Lighthouse reports captured');return;
  }
  if(process.env.CAPTURE_SITE_PRELOADER){if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))throw Error('Preloader captures require isolated demo server');await require('./site-preloader-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_WORKSPACE_PREFERENCES){if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))throw Error('Workspace captures require isolated demo server');await require('./site-workspace-preferences-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_FAQ_OPTIONS){if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))throw Error('FAQ captures require isolated demo server');await require('./site-faq-options-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_FAQ_EDIT){await require('./site-faq-edit-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_PROMO_HEADING){await require('./site-promo-heading-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_FAQ_CENTER){await require('./site-faq-center-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_PROMO_SECTION){await require('./site-promo-section-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_EXPORT_SHOPS){await require('./site-export-shops-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_FAQ_SINGLE){await require('./site-faq-single-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_PREVIEW_PARITY){await require('./site-preview-parity-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_STABLE_EDITING){await require('./site-stable-editing-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_EDITOR_LINKS){await require('./site-editor-links-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_STYLE_CONTROLS){await require('./site-style-controls-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_STORE_SWITCH){await require('./site-store-switch-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_SITE_REFRESH){await require('./site-refresh-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_SHOP_SETTINGS){await require('./site-shop-settings-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_WORD_DEVICES){await require('./site-word-responsive-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_WORD_FORMATTING){await require('./site-text-formatting-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_TEXT_MOUSE){await require('./site-text-mouse-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_TEMPLATE_WORKSPACE){await require('./site-template-workspace-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_HERO_COPY){await require('./site-hero-copy-check.cjs')(context,base,{capture:true});return;}
 if(process.env.CAPTURE_SHARED_PROMO){await require('./site-shared-promo-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_ADAPTIVE){await require('./site-adaptive-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_MULTI_SELECT){await require('./site-multiselect-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_PROFILE_ARROW){await require('./profile-arrow-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_STUDIO_MENU){await require('./site-studio-menu-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_STUDIO_REVIEW){await require('./site-mobile-structure-check.cjs')(context,base,{capture:true,reviewsOnly:true,studioReview:true});return;}
  if(process.env.CAPTURE_STUDIO_SHELL){await require('./site-studio-shell-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_PREVIEW_NATIVE){await require('./site-preview-check.cjs')(context,base,{capture:true,newZoom:true});return;}
  if(process.env.CAPTURE_PROMO_IMAGES){await require('./site-promo-images-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_PRODUCT_MEDIA){await require('./site-product-media-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_SITE_PREVIEW){await require('./site-preview-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_REVIEW_CARD_LAYOUT){await require('./site-mobile-structure-check.cjs')(context,base,{capture:true,reviewsOnly:true,cardLayout:true});return;}
  if(process.env.CAPTURE_SITE_LAYER_TREE){await require('./site-layer-tree-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_SITE_REVIEW_IMPORT){await require('./site-review-import-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_SITE_REVIEWS){await require('./site-product-reviews-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_SITE_COMMERCE){await require('./site-commerce-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_SITE_FONTS){await require('./site-fonts-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_SITE_QUALITY){await require('./site-quality-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_SITE_LAYERS){await require('./site-layers-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_SITE_TOOLBAR){
   if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))throw Error('Toolbar captures require isolated demo server');
   await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
   await page.goto(base+'/site-builder/hasl/',{waitUntil:'domcontentloaded'});await page.locator('#site-block-select').waitFor();await page.locator('[data-tab=objects]').click();
   for(const [width,name] of [[1440,'desktop'],[3440,'wide'],[390,'phone']]){
    await page.setViewportSize({width,height:1080});await page.locator('[data-preview-mode=both]').click();await page.waitForFunction(()=>document.getElementById('phone').clientHeight===844);await page.screenshot({path:'instructions/screens/site-toolbar-'+name+'.png'});
   }console.log('PASS demo toolbar and proportional preview screenshots desktop/wide/phone');return;
  }
  if(process.env.CAPTURE_CHANGELOG_DAYS){
   if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))throw Error('Changelog captures require isolated demo server');
   await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
   for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});await page.goto(base+'/instructions/#changelog',{waitUntil:'domcontentloaded'});await page.locator('[data-change-date][open] summary').waitFor();
    if(width===390){await page.locator('[data-change-date][open] summary').click();await page.locator('[data-change-date]').first().scrollIntoViewIfNeeded();}
    await page.screenshot({path:'instructions/screens/changelog-days-'+(width===390?'phone':'desktop')+'.png'});
   }console.log('PASS collapsible changelog demo screenshots: latest open, compact dates on phone');return;
  }
  if(process.env.CAPTURE_CHANGELOG){
   if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))throw Error('Changelog captures require isolated demo server');
   await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
   for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});await page.goto(base+'/instructions/#changelog',{waitUntil:'domcontentloaded'});await page.locator('[data-change-date="2026-10-24"] h2').waitFor();
    await page.locator('[data-change-date="2026-10-24"] [data-screenshot="site-google-html-final.png"]').scrollIntoViewIfNeeded();await page.locator('[data-screenshot="site-google-html-final.png"] img').evaluate(n=>n.decode());
    await page.screenshot({path:'instructions/screens/changelog-'+(width===390?'phone':'desktop')+'.png'});
   }console.log('PASS demo changelog screenshots desktop/mobile, grouped day and validation proof');return;
  }
  if(process.env.CAPTURE_SITE_GUIDES){await require('./site-guides-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_SITE_OBJECTS){await require('./site-objects-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_SITE_SCHEMA){await require('./site-schema-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_SITE_BUNDLE){await require('./site-bundle-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_SITE_DESIGNER){await require('./site-designer-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_BUTTON_STYLES){await require('./site-buttons-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_HERO_CONTROLS){await require('./site-hero-controls-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_SITE_BANNERS){await require('./site-banners-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_SITE_REVIEWS){await require('./site-mobile-structure-check.cjs')(context,base,{capture:true,reviewsOnly:true});return;}
  if(process.env.CAPTURE_SITE_STRUCTURE){await require('./site-mobile-structure-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_ARTICLE_EXPORT){
   for(const brand of ['outmax','hasl'])for(const mobile of [false,true]){
    await page.setViewportSize(mobile?{width:390,height:844}:{width:1440,height:1000});
    await page.goto(base+(brand==='hasl'?'/hasl/':'/'),{waitUntil:'domcontentloaded'});
    await page.locator('#download').click();await page.locator('#export-local-images').check();
    await page.locator('#export-dialog').screenshot({path:'instructions/screens/article-export-'+brand+(mobile?'-mobile':'')+'.png'});
   }
   console.log('PASS export screenshots, both brands desktop/mobile');return;
  }
  if(process.env.CAPTURE_IMAGE_URL){await require('./article-image-url-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_SITE_LINKS){await require('./site-text-links-check.cjs')();return;}
  if(process.env.CAPTURE_SITE_HASL){await require('./site-hasl-section-check.cjs')();return;}
  if(process.env.CAPTURE_SITE_SPACING){await require('./site-spacing-check.cjs')();return;}
  if(process.env.CAPTURE_SITE_MEDIA){await require('./site-images-check.cjs')(context,base,{capture:true});await require('./site-media-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_SITE_UPGRADE){await require('./site-upgrade-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_SITE_HERO){await require('./site-hero-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_SITE_EMBED){await require('./site-embed-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_SITE_WORDSTAT){await require('./site-wordstat-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_PRODUCT_MEDIA){await require('./site-product-media-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_SITE_PREVIEW){await require('./site-preview-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_SITE_DESIGN){await require('./site-design-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_SITE_PROMO){await require('./site-promo-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_SITE_CATALOG){await require('./site-catalog-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_SITE_BUILDER){await require('./site-builder-check.cjs')(context,base,{capture:true});return;}
  await page.route('**/*', route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await page.route('https://fonts.googleapis.com/**',route=>route.abort());
  if(process.env.CAPTURE_ADMIN_VIEW){await require('./impersonation-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_EDITOR_UX){await require('./wordstat-selection-check.cjs')(context,base,{capture:true});await require('./impersonation-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_ACCOUNT_BLOCKING){await require('./account-blocking-check.cjs')(context,base,{capture:true});console.log('PASS account status demonstration screenshots');return;}
  if(process.env.CAPTURE_WORDSTAT_SEO){
   await require('./wordstat-fixture.cjs')(page);
   await page.goto(base+'/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>articleBackupReady);
   await page.evaluate(()=>{setBody('<h1>Как выбрать кроссовки для бега</h1><h2>Амортизация и размер обуви</h2><p>Кроссовки для <strong>бега</strong> подходят для тренировок. Кроссовки для бега выбирают по размеру.</p><p>Мягкая подошва и удобная посадка.</p>');resetArticleEditorHistory();});
   await page.locator('#wordstat-open').click();await page.locator('#ws-analysis').evaluate(n=>n.open=true);await page.locator('#ws-analyze:not(:disabled)').click();await page.locator('#ws-analysis-status').filter({hasText:'Проверено фраз:'}).waitFor();
   await page.locator('#wordstat-dialog').screenshot({path:'instructions/screens/wordstat-seo.png'});
   await page.locator('#ws-tree').click();await page.locator('#ws-region-tree').waitFor();await page.getByRole('button',{name:'Развернуть Россия',exact:true}).click();await page.locator('#wordstat-dialog').screenshot({path:'instructions/screens/wordstat-regions.png'});
   await page.locator('#ws-mode').selectOption('dynamics');await page.locator('#ws-phrase').fill('кроссовки для бега');await page.locator('#ws-from').fill('2026-01-01');await page.locator('#ws-to').fill('2026-03-31');await page.locator('#ws-run').click();await page.locator('.ws-chart').focus();await page.keyboard.press('ArrowRight');await page.locator('.ws-chart-tip').waitFor();await page.locator('#wordstat-dialog').screenshot({path:'instructions/screens/wordstat-tooltip.png'});await page.keyboard.press('Escape');await page.keyboard.press('Escape');
   await page.locator('#workspace-general-brief').click();await page.locator('#workspace-seo-requirements[open]').screenshot({path:'instructions/screens/seo-requirements.png'});
   console.log('PASS SEO Wordstat, regions, tooltip, shared requirements demonstration screenshots');return;
  }
  if(process.env.CAPTURE_WORDSTAT_CONNECTION){
   await require('./wordstat-fixture.cjs')(page);
   await page.goto(base+'/',{waitUntil:'domcontentloaded'});
   await page.locator('#wordstat-open').click();
   await page.locator('#ws-settings:not([hidden])').waitFor();
   await page.locator('#ws-settings > summary').click();
   await page.locator('#ws-save:not(:disabled)').waitFor();
   await page.locator('#wordstat-dialog').screenshot({path:'instructions/screens/wordstat-connection.png'});
   await page.goto(base+'/instructions/#wordstat',{waitUntil:'domcontentloaded'});
   await page.getByRole('heading',{name:'Яндекс Wordstat: фразы, динамика и регионы',exact:true}).waitFor();
   fs.mkdirSync('output/playwright',{recursive:true});
   await page.screenshot({path:'output/playwright/wordstat-guide-desktop.png',fullPage:true});
   await page.setViewportSize({width:390,height:844});
   await page.screenshot({path:'output/playwright/wordstat-guide-mobile.png',fullPage:true});
   console.log('PASS Wordstat connection and guide demonstration screenshots');return;
  }
  if(process.env.CAPTURE_WORDSTAT){
   await require('./wordstat-fixture.cjs')(page);
   await page.goto(base+'/',{waitUntil:'domcontentloaded'});
   await page.locator('#wordstat-open img').waitFor();
   await page.waitForFunction(()=>document.querySelector('#wordstat-open img').naturalWidth>0);
   await page.locator('.toolstrip').screenshot({path:'instructions/screens/wordstat-toolbar.png'});
   await page.locator('#wordstat-open').click();
   await page.locator('#ws-run:not(:disabled)').waitFor();
   await page.locator('#ws-phrase').fill('кроссовки для бега');
   await page.locator('#ws-run').click();await page.locator('#ws-results table').first().waitFor();
   await page.screenshot({path:'instructions/screens/wordstat.png'});
   await page.setViewportSize({width:390,height:844});
   await page.screenshot({path:'instructions/screens/wordstat-mobile.png'});
   await page.setViewportSize({width:1440,height:1000});
   await page.locator('#ws-mode').selectOption('dynamics');
   await page.locator('#ws-from').fill('2026-01-01');await page.locator('#ws-to').fill('2026-03-31');
   await page.locator('#ws-run').click();await page.locator('.ws-chart').waitFor();
   await page.screenshot({path:'instructions/screens/wordstat-dynamics.png'});
   console.log('PASS Wordstat demonstration screenshots');return;
  }
  await page.route('https://fonts.gstatic.com/**',route=>route.abort());
  await page.route('**/editor-api/notisend/status',route=>route.fulfill({json:{connected:false,api_configured:false,smtp_configured:false}}));
  fs.mkdirSync('instructions/screens',{recursive:true});
  if(process.env.CAPTURE_ARTICLE_SCHEMA){
   await page.route('https://example.com/*.png',r=>r.fulfill({contentType:'image/png',body:fs.readFileSync('images/outmax.png')}));
   await page.goto(base+'/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>articleBackupReady);
   await page.evaluate(()=>{setBody('<meta name="description" content="Как выбрать кроссовки: посадка и амортизация."><meta name="article-cover" content="https://example.com/shoes.png">'+serializeArticleStructuredData([{'@context':'https://schema.org','@type':'Article',author:{'@type':'Person',name:'Демонстрационный автор'},datePublished:'2026-10-20T10:00:00+07:00',dateModified:'2026-10-20T12:00:00+07:00'}])+'<header><h1>Как выбрать кроссовки</h1><p>Демонстрационный материал для инструкции.</p><img src="https://example.com/shoes.png" alt="Демонстрационное изображение"></header>');resetArticleEditorHistory();document.querySelector('.article-description-settings').open=true;});
   await page.locator('#article-schema-edit').click();await page.locator('#article-schema-dialog').screenshot({path:'instructions/screens/article-metadata-outmax.png'});await page.keyboard.press('Escape');
   await page.evaluate(()=>setTab('html'));await page.locator('#source').screenshot({path:'instructions/screens/article-schema-export.png'});
   console.log('PASS Schema.org demonstration screenshots');return;
  }
  if(process.env.CAPTURE_ARTICLE_COLUMNS){await require('./article-columns-check.cjs')(context,base,{capture:true,guide:false});return;}
  if(process.env.CAPTURE_ARTICLE_FAQ){await require('./article-faq-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_EMAIL_PLAINTEXT){await require('./email-plaintext-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_WORKSPACE_BRIEF){await require('./workspace-brief-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_ARTICLE_OUTLINE){await require('./article-outline-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_EMAIL_KEYBOARD){await require('./email-keyboard-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_WORKSPACE_LINKS){await require('./workspace-links-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_MOBILE_WRITING){await require('./mobile-writing-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_ARTICLE_METADATA){await require('./article-metadata-check.cjs')(context,base,{capture:true});return;}
  if(process.env.CAPTURE_HASL_MOBILE_HEADING){
   await require('./hasl-mobile-heading-check.cjs')(context,base,{capture:true});return;
  }
  if(process.env.CAPTURE_ARTICLE_DESCRIPTION){
   await require('./article-description-check.cjs')(context,base,{capture:true});return;
  }
  if(process.env.CAPTURE_ARTICLE_COPY){
   await require('./article-copy-check.cjs')(context,base,{capture:true});return;
  }
  if(process.env.CAPTURE_ARTICLE_CARET){
   for(const brand of ['outmax','hasl']){
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(base+(brand==='hasl'?'/hasl/':'/'),{waitUntil:'domcontentloaded'});await page.locator('#canvas').waitFor();
    await page.evaluate(()=>{setBody('<header><h1>Работа с текстом</h1><p>Начните ввод в любом свободном месте статьи.</p></header><section class="om-section"><h2>Без лишних пустых строк</h2><p id="demo-caret-text">Если передумали писать, перейдите обратно к тексту. Временный абзац исчезнет.</p><p>Чтобы намеренно оставить пустую строку, нажмите Enter.</p></section>');resetArticleEditorHistory();});
    for(const width of [1440,390]){
     await page.setViewportSize({width,height:width===390?844:1000});await page.locator('#canvas').scrollIntoViewIfNeeded();
     const point=await page.locator('#canvas').evaluate(n=>{const r=n.getBoundingClientRect(),last=n.lastElementChild.getBoundingClientRect();return{x:r.left+r.width/2,y:Math.min(r.bottom-10,last.bottom+20)};});
     await page.mouse.click(point.x,point.y);await page.locator('#demo-caret-text').click();
     await page.screenshot({path:'instructions/screens/article-caret-'+brand+(width===390?'-mobile':'')+'.png'});
    }
   }
   console.log('Captured article caret cleanup: both brands, desktop/mobile');return;
  }
  if(process.env.CAPTURE_EMAIL_PROMOS){
   await page.goto(base+'/email/',{waitUntil:'domcontentloaded'});await page.locator('#new-email-project').waitFor();
   for(const brand of ['outmax','hasl']){
    await page.evaluate(brand=>{activeSite=brand+'_ru';canvas.innerHTML='<h1>Новости недели</h1><p>Демонстрационное письмо для проверки подвала.</p>';renderEmailChromeSettings(true);refresh();},brand);
    await page.evaluate(()=>{document.querySelector('#email-chrome-settings').open=true;document.querySelectorAll('#email-chrome-settings details').forEach((n,i)=>n.open=i===2);});
    await page.locator('[data-chrome-field=showPromos]').uncheck();await page.waitForFunction(()=>document.querySelector('#email-editor-footer a[href^="tel:"]')&&!document.querySelector('#email-editor-footer .outmax-promo-cell'));
    await page.locator('[data-chrome-field=showPromos]').scrollIntoViewIfNeeded();
    await page.screenshot({path:'instructions/screens/'+(brand==='outmax'?'email-settings':'email-footer-promos-hasl')+'.png'});
   }
   await page.setViewportSize({width:390,height:844});await page.locator('[data-chrome-field=showPromos]').scrollIntoViewIfNeeded();
   await page.screenshot({path:'instructions/screens/email-footer-promos-mobile.png'});
   console.log('PASS footer promo screenshots, two brands and mobile');return;
  }
  if(process.env.CAPTURE_EMAIL_NEW){
   await page.goto(base+'/email/',{waitUntil:'domcontentloaded'});
   await page.locator('#new-email-project').click();await page.locator('#email-new-brand').selectOption('hasl');
   await page.screenshot({path:'instructions/screens/email-new-project.png'});
   await page.setViewportSize({width:390,height:844});await page.screenshot({path:'instructions/screens/email-new-project-mobile.png'});
   console.log('PASS email creation screenshots, desktop/mobile');return;
  }
  const shot=async name=>page.screenshot({path:'instructions/screens/'+name+'.png'});
  const comparisonShot=async brand=>{
   await page.evaluate(()=>{
    setBody('<header><h1>Сравнение моделей</h1><p>Демонстрационные товары</p></header>');setArticleSaveDocument();
    const photo=color=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#f3f4f5"/><path d="M25 80h50l22 18 35 6v20H25Z" fill="${color}"/><path d="M25 124h107" stroke="#222" stroke-width="8"/></svg>`);
    const names=['Зимние Сапоги Nike Winterproof High цвет Серый','Зимние кеды Vans UltraRange EXO MTE-3 Hi цвет Черный','Зимние Кроссовки Adidas Terrex AX4 Mid цвет Коричневый','Зимние Кроссовки The North Face Glenclyffe high цвет Черный'];
    restoreProducts(names.map((title,i)=>({sku:String(11111+i),title,price:[7790,8310,7140,7400][i],inStock:true,properties:['Материал верха: натуральная кожа и плотный текстиль. Подкладка: мягкий флис. Подошва: резина. Назначение: повседневные прогулки.'],sizes:[{name:'42'},{name:'43'}],url:'https://example.com/demo-'+i,images:[photo(i%2?'#9b7961':'#617b95')]})));
   });
   await page.locator('#add-comparison').click();await page.locator('#comparison-dialog button[type=submit]').click();
   await page.evaluate(()=>clearSelection());
   await shot('article-comparison-'+brand);
   const preview=await context.newPage();await preview.setViewportSize({width:390,height:844});await preview.setContent(await page.evaluate(()=>previewDocument()));
   await preview.screenshot({path:'instructions/screens/article-comparison-mobile-'+brand+'.png'});await preview.close();
  };
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  await page.locator('#canvas').waitFor();await shot('article-editor');
  await page.evaluate(()=>{const node=document.querySelector('#canvas header p').firstChild,range=document.createRange();range.selectNodeContents(node);getSelection().removeAllRanges();getSelection().addRange(range);lastRange=range.cloneRange();});
  await page.locator('#article-commands-open').click();await page.locator('#article-command-search').fill('ссылк');await shot('article-commands');await page.keyboard.press('Escape');
  await page.locator('#article-find-open').click();await page.locator('#article-find-query').fill('статья');await shot('article-find');await page.keyboard.press('Escape');
  await page.locator('#download').click();await shot('article-portable');await page.keyboard.press('Escape');
  await page.locator('#article-macros-open').click();await page.locator('#article-macro-name').fill('Выделить главное');await shot('article-macros');await page.keyboard.press('Escape');
  await page.evaluate(()=>{const node=document.querySelector('#canvas header p').firstChild,range=document.createRange();range.selectNodeContents(node);getSelection().removeAllRanges();getSelection().addRange(range);lastRange=range.cloneRange();});
  await page.locator('#article-proposal-open').click();await page.locator('#article-proposal-text').fill('Эта статья поможет выбрать подходящую модель.');await shot('article-proposals');await page.keyboard.press('Escape');
  await page.evaluate(()=>{setBody('<h1>Оформление текста</h1><p style="font-family:Arial;font-size:28px!important;color:#231815"><span id="wiki-style-source" style="font-size:20px!important;font-weight:700;font-style:italic;color:#155fef">Пример оформления 👟</span></p>',{normalize:false});resetArticleEditorHistory();const range=document.createRange();range.selectNodeContents(document.querySelector('#wiki-style-source').firstChild);canvas.focus();getSelection().removeAllRanges();getSelection().addRange(range);lastRange=range.cloneRange();});
  await page.locator('#article-style-inspector-open').click();await page.locator('#article-style-property').selectOption('font-size');await shot('article-style-inspector');await page.keyboard.press('Escape');
  await page.locator('#article-paste-open').click();await page.locator('#article-paste-mode').selectOption('formatted');await page.locator('#article-paste-content').evaluate(field=>{const data=new DataTransfer();data.setData('text/plain','Проверенный фрагмент 👟');data.setData('text/html','<p><strong>Проверенный</strong> фрагмент 👟</p>');field.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
  await page.locator('#article-paste-dialog').screenshot({path:'instructions/screens/article-paste.png'});await page.keyboard.press('Escape');
  await page.evaluate(()=>{setBody('<header><h1>Демонстрационная статья</h1><p>Эта статья поможет выбрать подходящую модель.</p></header>');resetArticleEditorHistory();const range=document.createRange();range.selectNodeContents(canvas.querySelector('header p').firstChild);lastRange=range;getSelection().removeAllRanges();getSelection().addRange(range);});
  await page.locator('#article-proposal-open').click();await page.locator('#article-ai-settings').click();await shot('article-ai-settings');await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  await page.route('**/*article-assist/status',route=>route.fulfill({json:{available:true,model:'gpt-4.1-mini',managed:false}}));
  await page.route('**/*article-assist/propose',route=>route.fulfill({status:502,json:{error:'API-баланс OpenAI исчерпан. Пополните баланс API и повторите запрос. Исходный текст сохранён.'}}));
  await page.locator('#article-proposal-open').click();await page.locator('#article-proposal-generate').click();await page.locator('#article-proposal-status').filter({hasText:'API-баланс OpenAI исчерпан'}).waitFor();await shot('article-ai-credit-error');await page.keyboard.press('Escape');
  await page.locator('.editor-switcher>summary').click();await page.locator('.editor-switcher-menu').waitFor();await shot('navigation');
  await page.keyboard.press('Escape');await comparisonShot('outmax');
  await page.goto(base+'/hasl/',{waitUntil:'domcontentloaded'});await page.locator('body.hasl-editor #canvas').waitFor();await shot('hasl-editor');
  await comparisonShot('hasl');
  await page.goto(base+'/email/',{waitUntil:'domcontentloaded'});
  await page.locator('#email-editor-footer .outmax-email-footer').waitFor();await shot('email-editor');
  await page.locator('#new-email-project').click();await page.locator('#email-new-brand').selectOption('hasl');await shot('email-new-project');await page.keyboard.press('Escape');
  await page.evaluate(()=>{const node=canvas.querySelector('p').firstChild,range=document.createRange();range.selectNodeContents(node);canvas.focus();getSelection().removeAllRanges();getSelection().addRange(range);emailTypographyRange=range.cloneRange();});
  await page.locator('#email-commands-open').click();await page.locator('#email-command-search').fill('курсив');await shot('email-commands');await page.keyboard.press('Escape');
  await page.locator('#email-find-open').click();await page.locator('#email-find-query').fill('письмо');await shot('email-find');await page.keyboard.press('Escape');
  await page.evaluate(()=>{const node=canvas.querySelector('p').firstChild,range=document.createRange();range.selectNodeContents(node);EmailTextTools.select(range);});
  await page.locator('#email-proposal-open').click();await page.locator('#email-proposal-text').fill('Откройте письмо, чтобы узнать о полезных новинках недели.');await shot('email-proposals');await page.keyboard.press('Escape');
  await page.evaluate(()=>{const p=canvas.querySelector('p');p.style.fontSize='28px';p.innerHTML='<span id="wiki-email-style" style="font-size:20px!important;font-weight:700;font-style:italic;color:#155fef">Пример оформления письма 👟</span>';const range=document.createRange();range.selectNodeContents(p.firstChild.firstChild);EmailTextTools.select(range);});
  await page.locator('#email-style-inspector-open').click();await page.locator('#email-style-property').selectOption('font-size');await shot('email-style-inspector');await page.keyboard.press('Escape');
  await page.locator('#email-paste-open').click();await page.locator('#email-paste-mode').selectOption('formatted');await page.locator('#email-paste-content').evaluate(field=>{const data=new DataTransfer();data.setData('text/plain','Проверенный фрагмент письма 👟');data.setData('text/html','<p><strong>Проверенный</strong> фрагмент письма 👟</p>');field.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
  await page.locator('#email-paste-dialog').screenshot({path:'instructions/screens/email-paste.png'});await page.keyboard.press('Escape');
  await page.locator('#email-chrome-settings>summary').click();await shot('email-settings');
  await page.locator('.editor-tabs [data-view="preview"]').click();
  await page.frameLocator('#mobile-preview').locator('body').waitFor();await shot('email-preview');
  await page.locator('#notisend-open').click();await shot('notisend');
  await page.locator('[data-notisend-tab="history"]').click();await shot('email-archive');
  await page.locator('#notisend-close').click();
  await page.route('https://example.com/demo-photo-*.png',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#e9eaec"/><path d="M18 50h34l14 16 20 4v15H18Z" fill="#52677b"/></svg>'}));
  await page.evaluate(()=>{canvas.innerHTML='<header><h1>Сравнение моделей</h1><p>Демонстрационный импорт статьи</p></header><div class="om-table-scroll"><table class="om-comparison-table"><thead><tr><th class="om-comparison-thumb-column">Модель</th><th class="om-comparison-model-column">Наименование</th><th>Цена</th><th>Материалы</th></tr></thead><tbody>'+[1,2].map(i=>`<tr><td class="om-comparison-thumb-column"><img class="om-model-thumb" src="https://example.com/demo-photo-${i}.png" alt="Фото модели ${i}"></td><td class="om-comparison-model-column"><span class="om-model-cell"><a href="https://example.com/product-${i}">Демонстрационная модель ${i}</a></span></td><td>${i} 990 ₽</td><td>Кожа и текстиль</td></tr>`).join('')+'</tbody></table></div>';window.emailImportState={css:'',root:{tag:'article',className:'om-guide',id:'',style:''}};refresh();});
  for(const id of ['#desktop-preview','#mobile-preview'])await page.frameLocator(id).locator('img[src="https://example.com/demo-photo-1.png"]').evaluate(img=>{const table=img.closest('table');window.scrollTo(0,table.getBoundingClientRect().top+scrollY-32);});
  await shot('email-comparison');
  await page.goto(base+'/tiptap/',{waitUntil:'domcontentloaded'});await page.locator('#editor .tiptap').waitFor();await page.locator('#editor .tiptap p').first().click();await shot('tiptap');
  await page.goto(base+'/instructions/',{waitUntil:'domcontentloaded'});await page.locator('#wiki-search').waitFor();await shot('instructions');
  await page.setViewportSize({width:390,height:844});
  for(const [route,name] of [['/','article-mobile'],['/hasl/','hasl-mobile'],['/email/','email-mobile'],['/instructions/','instructions-mobile']]){
   await page.goto(base+route,{waitUntil:'domcontentloaded'});await page.locator(route==='/instructions/'?'#wiki-search':'#canvas').waitFor();await shot(name);
  }
  for(const email of [false,true]){
   const reviewContext=await browser.newContext({viewport:{width:1280,height:900}});
   await reviewContext.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'},headers:{Origin:base}});
   await reviewContext.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
   await reviewContext.route('**/editor-api/notisend/**',r=>r.fulfill({json:{connected:false,items:[]}}));
   const reviewPage=await reviewContext.newPage(),id='wiki-review-'+Date.now();
   const old='<h1>Новинки недели</h1><p style="color:#231815">Подборка моделей для прогулок.</p><p>Доставка по России.</p><p><a href="https://example.com/old">Посмотреть подборку</a></p>';
   const current='<h1>Новинки недели</h1><p style="color:#155fef">Подборка тёплых моделей для прогулок.</p><p>Доставка по России.</p><p><a href="https://example.com/new">Посмотреть подборку</a></p>';
   if(email){
    await reviewContext.request.post(base+'/editor-api/email-projects/'+id,{data:{filename:id,subject:'Новинки недели',preheader:'Обновлённая подборка',canvasHtml:old,renderedHtml:old}});
    await reviewPage.goto(base+'/email/');await reviewPage.locator('#email-version-compare').waitFor();await reviewPage.locator('#open-email-projects').click();await reviewPage.locator('[data-project-open="'+id+'"]').click();await reviewPage.waitForFunction(id=>emailReviewBridge.currentId()===id,id);
    await reviewPage.evaluate(current=>{canvas.innerHTML=current;document.querySelector('#subject').value='Тёплые новинки недели';document.querySelector('#preheader').value='Выбираем удобную пару';resetEmailEditorHistory();},current);await reviewPage.locator('#email-version-compare').click();
   }else{
    const first=await(await reviewContext.request.post(base+'/editor-api/save',{data:{id,title:'Новинки недели',body:old,automatic:true}})).json();
    await reviewContext.request.post(base+'/editor-api/save',{data:{id,title:'Новинки недели',body:current,automatic:true,expectedRevision:first.revision,documentId:first.documentId}});
    await reviewPage.goto(base+'/?article='+id);await reviewPage.waitForFunction(id=>currentId===id&&articleDocumentId,id);await reviewPage.locator('#article-version-history').click();await reviewPage.locator('[data-revision="'+first.revision+'"]').click();
   }
   await reviewPage.locator('.review-diff-summary').filter({hasText:'Ссылки'}).waitFor();await reviewPage.locator('dialog.article-versions-dialog[open]').screenshot({path:'instructions/screens/'+(email?'email':'article')+'-version-compare.png'});await reviewPage.keyboard.press('Escape');
   if(email){
    const saved=await(await reviewContext.request.get(base+'/editor-api/email-projects/'+id)).json();
    await reviewContext.request.post(base+'/editor-api/email-projects/'+id,{data:{...saved,expectedRevision:saved.revision,requestId:'wiki-history-'+Date.now(),subject:'Тёплые новинки недели',preheader:'Выбираем удобную пару',canvasHtml:current,renderedHtml:current,importState:{chrome:{brand:'outmax',phone:'Телефон демонстрации'}}}});
    await reviewPage.locator('#open-email-projects').click();await reviewPage.locator('[data-project-open="'+id+'"]').click();await reviewPage.locator('#email-version-history').click();await reviewPage.locator('[data-email-revision="'+saved.revision+'"]').click();await reviewPage.locator('.email-history-dialog .review-diff-summary').filter({hasText:'Настройки шаблона'}).waitFor();await reviewPage.locator('.email-history-dialog').screenshot({path:'instructions/screens/email-version-history.png'});await reviewPage.keyboard.press('Escape');
   }
   if(!email){
    const link=(await(await reviewContext.request.post(base+'/editor-api/preview/'+id)).json()).url;
    const endpoint=base+'/editor-api/preview-feedback/'+new URL(link,base).pathname.split('/').filter(Boolean).pop();
    await reviewContext.request.post(endpoint,{data:{text:'Проверить формулировку после редактирования.',anchor:{selector:'body > p:nth-of-type(1)',kind:'text',quote:'Старый удалённый текст',x:.5,y:.5}}});
    await reviewPage.goto(base+link+'?comments=1');await reviewPage.locator('.review-location').filter({hasText:'Место изменено или удалено'}).waitFor();await reviewPage.locator('.review-sidebar').screenshot({path:'instructions/screens/review-anchors.png'});
   }
   await reviewPage.close();await reviewContext.request.delete(base+'/editor-api/'+(email?'email-projects/':'draft/')+id);await reviewContext.close();
  }
  for(const email of [false,true]){
   const qualityContext=await browser.newContext({viewport:{width:1440,height:1000}});
   await qualityContext.request.post(base+'/login',{form:{login:'wiki-demo',password:'wiki-local-demo-only'}});
   await qualityContext.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
   await qualityContext.route('**/editor-api/notisend/**',r=>r.fulfill({json:{connected:false,items:[]}}));
   const qualityPage=await qualityContext.newPage();await qualityPage.goto(base+(email?'/email/':'/'));await qualityPage.locator('#'+(email?'email':'article')+'-quality-open').waitFor();
   await qualityPage.evaluate(email=>{const html='<h1>Выбираем пару для прогулок</h1><h3>На что обратить внимание</h3><p><a href="">Посмотреть подборку</a></p><p><img src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%2260%22%3E%3Crect width=%2280%22 height=%2260%22 fill=%22%23e2e6ec%22/%3E%3C/svg%3E"></p><p>Здравствуйте, [%name%]!</p>';if(email){canvas.innerHTML=html;resetEmailEditorHistory();}else{setBody(html,{normalize:false});resetArticleEditorHistory();}},email);
   await qualityPage.locator('#'+(email?'email':'article')+'-quality-open').click();await qualityPage.locator(email?'#notisend-dialog[open]':'#article-quality-dialog[open]').screenshot({path:'instructions/screens/'+(email?'email':'article')+'-quality.png'});await qualityContext.close();
  }
  console.log('Скриншоты сохранены: 39');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
