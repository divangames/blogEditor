// Regression adapter: reveal the real menu/category before using existing editor operations.
exports.reveal=async(page,selector)=>{
 const locator=page.locator(selector).first();
 if(await locator.count())await locator.evaluate(node=>{const side=node.closest('#studio-sidebar');if(side?.hidden)window.StudioShell?.showPanels();if(node.closest('#studio-add-panel')?.hidden)window.StudioShell?.showAdd();const parents=[];for(let p=node.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')parents.push(p);for(const p of parents.reverse())p.open=true;});
};
exports.click=async(page,selector)=>{await exports.reveal(page,selector);await page.locator(selector).click();};
