import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=new URL('../',import.meta.url);
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const person={id:'p',name:'Test recipient',symbol:'*'};
const gift={id:'open',person:'p',title:'Synthetic general idea',kind:'idea',reservation_mode:'open-ended',quantity:1};
let selection=null;
for(const width of [390,1280]){
 const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('badillo-session',JSON.stringify({access_token:'synthetic',refresh_token:'synthetic',expires_at:Date.now()/1000+3600})));
 await page.route('https://example.supabase.co/**',async route=>{
  const path=new URL(route.request().url()).pathname;let result;
  if(path==='/auth/v1/user')result={email:'test@example.invalid'};
  else if(path.endsWith('get_wishlist'))result={account:{role:'editor'},people:[person],gifts:[gift]};
  else if(path.endsWith('list_gift_units'))result=[];
  else if(path.endsWith('get_my_selections'))result={gifts:selection?[gift]:[],units:selection?[selection]:[]};
  else if(path.endsWith('get_family_photo'))result=null;
  else if(path.endsWith('set_idea_selection')){const b=route.request().postDataJSON();selection=b.p_status==='available'?null:{gift_id:'open',unit_no:0,mine:true,status:b.p_status,private_note:b.p_private_note};result=null;}
  else if(path==='/auth/v1/logout')result=null;
  else throw Error('Unexpected backend request '+path);
  await route.fulfill({json:result});
 });
 await page.route('https://wishlist.test/**',async route=>{
  let file=new URL(route.request().url()).pathname.split('/').pop()||'index.html';
  if(file==='config.json')return route.fulfill({json:{supabaseUrl:'https://example.supabase.co',publishableKey:'test'}});
  if(['signin.js','passkeys.js','favicon.svg'].includes(file))return route.fulfill({body:'',contentType:file.endsWith('.js')?'application/javascript':'image/svg+xml'});
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
 await page.getByRole('button',{name:'Sign out',exact:true}).click();assert.equal(await page.locator('#gifts').textContent(),'');
 assert.deepEqual(errors,[]);await page.close();console.log('Browser width '+width+': passed');
}
await browser.close();
