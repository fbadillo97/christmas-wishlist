import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=new URL('../',import.meta.url);
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const person={id:'p',name:'Test recipient',symbol:'*'};
const gift={id:'open',person:'p',title:'Synthetic general idea',kind:'idea',reservation_mode:'open-ended',quantity:1};
const productTemplate={...gift,match:'exact',used:true,revision:1,image:'https://wishlist.test/test-image.svg',id:'limited',title:'Synthetic product',kind:'product',reservation_mode:'limited'};
for(const width of [320,375,390,430,768,1280]){
 let selection=null;
 const product={...productTemplate};
 let productStatus='available';
 const writes=[];

 const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('badillo-session',JSON.stringify({access_token:'synthetic',refresh_token:'synthetic',expires_at:Date.now()/1000+3600})));
 await page.route('https://example.supabase.co/**',async route=>{
  const path=new URL(route.request().url()).pathname;let result;
  if(path==='/auth/v1/user')result={email:'test@example.invalid'};
  else if(path.endsWith('get_wishlist'))result={account:{role:'editor'},people:[person],gifts:[gift,product]};
  else if(path.endsWith('editor_save_gift')){
   const edit=route.request().postDataJSON();
   assert.equal(edit.p_revision,product.revision);
   assert.equal(edit.p_id,product.id);
   Object.assign(product,edit.p_payload);
   result=null;
  }
  else if(path.endsWith('list_gift_units'))result=[{gift_id:product.id,unit_no:1,status:productStatus,mine:productStatus!=='available'}];
  else if(path==='/auth/v1/passkeys')result=[{id:'test-key',friendly_name:'Test phone'}];
  else if(path.endsWith('set_gift_unit_status')){
   productStatus=route.request().postDataJSON().p_status;
   writes.push(productStatus);
   result=null;
  }
  else if(path.endsWith('get_my_selections'))result={gifts:selection?[gift]:[],units:selection?[selection]:[]};
  else if(path.endsWith('get_family_photo'))result=null;
  else if(path.endsWith('set_idea_selection')){const b=route.request().postDataJSON();writes.push(b.p_status);selection=b.p_status==='available'?null:{gift_id:'open',unit_no:0,mine:true,status:b.p_status,private_note:b.p_private_note};result=null;}
  else if(path==='/auth/v1/logout')result=null;
  else throw Error('Unexpected backend request '+path);
  await route.fulfill({json:result});
 });
 await page.route('https://wishlist.test/**',async route=>{
  let file=new URL(route.request().url()).pathname.split('/').pop()||'index.html';
  if(file==='config.json')return route.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'test'}});
  if(file==='test-image.svg')return route.fulfill({body:'<svg xmlns="http://www.w3.org/2000/svg" width="60" height="90"></svg>',contentType:'image/svg+xml'});
  if(file==='favicon.svg')return route.fulfill({body:'',contentType:file.endsWith('.js')?'application/javascript':'image/svg+xml'});
  const content=await fs.readFile(new URL(file,base));await route.fulfill({body:content,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});
 });
 await page.goto('https://wishlist.test/');await page.getByText('Open to everyone · Your selection never limits anyone else.').waitFor();
 await page.getByRole('button',{name:selection?'Edit my private selection':'I’m getting something',exact:true}).click();
 await page.getByLabel('What are you planning to get? (optional)').fill('Synthetic private plan');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Horizontal overflow');
 await page.getByRole('button',{name:'Save my selection',exact:true}).click();await page.getByText('Your private note',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Add gift',exact:false}).click();await page.locator('#gift-kind').selectOption('idea');
 assert.equal(await page.locator('#quantity-field').isVisible(),false);assert.equal(await page.locator('#gift-reservation_mode').inputValue(),'open-ended');
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 const dialogFits=async selector=>{
  assert.ok(await page.locator(selector).evaluate(el=>{
   const r=el.getBoundingClientRect();
   return el.open&&r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1&&el.scrollWidth<=el.clientWidth+1;
  }),selector+' fits at '+width);
 };
 const limited=page.locator('.card').filter({has:page.getByRole('heading',{name:product.title})});
 const idea=page.locator('.card').filter({has:page.getByRole('heading',{name:gift.title})});
 const reserve=limited.getByRole('button',{name:/^Reserve ·/});
 if(width<=620){
  const box=await reserve.boundingBox(), row=await reserve.locator('..').boundingBox();
  assert.ok(Math.abs(box.width-row.width)<2&&box.height>=44);
  assert.ok((await limited.locator('.art').boundingBox()).height<140);
  assert.equal((await idea.locator('.art').boundingBox()).height,56);
 }
 await reserve.click();
 await limited.getByText('Reserved by you',{exact:true}).waitFor();
 await limited.getByRole('button',{name:/^Mark purchased/}).click();
 await limited.getByText('✓ Purchased by you',{exact:true}).waitFor();
 await idea.getByRole('button',{name:'Mark purchased'}).click();
 await idea.getByText('You purchased something.').waitFor();
 for(const [card,title] of [[limited,product.title],[idea,gift.title]]){
  const undo=card.getByRole('button',{name:/^Undo my selection/});
  const count=writes.length;
  for(const accept of [false,true]){
   const handled=page.waitForEvent('dialog').then(async dialog=>{
    assert.equal(dialog.type(),'confirm');
    assert.ok(dialog.message().includes(title));
    await (accept?dialog.accept():dialog.dismiss());
   });
   await Promise.all([handled,undo.click()]);
   if(!accept)assert.equal(writes.length,count);
  }
  await undo.waitFor({state:'detached'});
  assert.deepEqual(writes.slice(count),['available']);
 }
 await limited.getByRole('button',{name:'Edit gift'}).click();
 await dialogFits('#gift-dialog');
 await page.locator('#gift-title').fill('Edited test title');
 await page.locator('#save-gift').click();
 await page.getByRole('heading',{name:'Edited test title',exact:true}).waitFor();
 await page.locator('#manage-passkeys').click();
 await page.getByText('Test phone',{exact:true}).waitFor();
 await dialogFits('#passkey-dialog');
 await page.locator('#passkey-refresh').click();
 await page.locator('#close-passkeys').click();
 await page.getByRole('button',{name:'Sign out',exact:true}).click();assert.equal(await page.locator('#gifts').textContent(),'');
 await page.locator('#signin').click();
 await dialogFits('#signin-dialog');
 await page.locator('#email').fill('viewer@example.invalid');
 await page.locator('#close-signin').click();
 assert.deepEqual(errors,[]);await page.close();console.log('Browser width '+width+': passed');
}
await browser.close();
