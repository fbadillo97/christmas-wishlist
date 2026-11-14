import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
for(const width of [390,1024]){
 const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://wishlist.test/**',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').pop()||'admin.html';
  if(['signin.js','passkeys.js','app.js','roadmap.js','favicon.svg'].includes(name))return route.fulfill({body:'',contentType:name.endsWith('.js')?'application/javascript':'image/svg+xml'});
  await route.fulfill({body:await fs.readFile(new URL('../'+name,import.meta.url)),contentType:name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html'});
 });
 await page.goto('https://wishlist.test/admin.html');
 await page.evaluate(()=>{
  window.wishlistAdmin.init({getGeneration:()=>1,refresh:async()=>{},request:async()=>{throw Error('No backend writes allowed in this test')}});
  window.syntheticData={account:{role:'owner'},members:[
   {account_id:'c',first_name:'Zoe',last_name:'Test',email:'z@example.invalid',role:'viewer',active:false,has_signed_in:false,has_passkey:false,invitation_status:'not_sent'},
   {account_id:'a',first_name:'Anna',last_name:'Test',email:'a@example.invalid',role:'editor',active:true,has_signed_in:true,has_passkey:true,passkey_count:1,invitation_status:'sent',invitation_sent_at:'2026-11-14T01:00:00Z'},
   {account_id:'b',first_name:'Ben',last_name:'Test',email:'b@example.invalid',role:'viewer',active:true,has_signed_in:true,has_passkey:false,invitation_status:'failed'}],gift_tracking:[]};
  window.wishlistAdmin.sync(window.syntheticData,true);
 });
 const names=()=>page.locator('#member-list tr td:nth-child(2)').allTextContents();
 assert.deepEqual(await names(),['Anna','Ben','Zoe']);
 await page.getByRole('button',{name:'Sort by First name',exact:true}).click();assert.deepEqual(await names(),['Zoe','Ben','Anna']);
 await page.getByRole('button',{name:'Sort by First name',exact:true}).click();
 await page.locator('#member-filter-access').selectOption('active');await page.locator('#member-filter-role').selectOption('viewer');assert.deepEqual(await names(),['Ben']);
 await page.locator('#member-filter-passkey').selectOption('yes');assert.equal(await page.locator('#member-list').textContent(),'No accounts match your search.');
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();
 await page.locator('#member-filter-signed').selectOption('no');assert.deepEqual(await names(),['Zoe']);
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();await page.locator('#member-filter-welcome').selectOption('sent');assert.deepEqual(await names(),['Anna']);
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();await page.locator('#member-search').fill('b@example');assert.deepEqual(await names(),['Ben']);
 await page.evaluate(()=>window.wishlistAdmin.sync(window.syntheticData,true));assert.deepEqual(await names(),['Ben']);
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();
 await page.locator('.account-table-wrap').evaluate(el=>el.scrollLeft=300);
 const pinned=await page.evaluate(()=>{const wrap=document.querySelector('.account-table-wrap').getBoundingClientRect();const th=document.querySelector('.account-table th:nth-child(2)').getBoundingClientRect();const td=document.querySelector('#member-list td:nth-child(2)').getBoundingClientRect();return {wrap:wrap.left,th:th.left,td:td.left,scroll:document.documentElement.scrollWidth,viewport:innerWidth};});
 assert.ok(Math.abs(pinned.th-pinned.wrap)<=2);assert.ok(Math.abs(pinned.td-pinned.wrap)<=2);assert.equal(pinned.scroll,pinned.viewport);
 await page.evaluate(()=>window.wishlistAdmin.clear());assert.equal(await page.locator('#member-list').textContent(),'');assert.equal(await page.locator('#member-filter-role').inputValue(),'all');assert.deepEqual(errors,[]);
 console.log('Admin table '+width+'px: sorting, combined filters, search, refresh, sticky names, layout and clearing passed');await page.close();
}
await browser.close();
