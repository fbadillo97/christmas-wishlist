// Run: node tests/open-ended-ui.mjs (requires jsdom in a separate test environment).
import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const base=new URL('../',import.meta.url);
const html=fs.readFileSync(new URL('index.html',base),'utf8');
const app=fs.readFileSync(new URL('app.js',base),'utf8');
const editor=fs.readFileSync(new URL('editor.js',base),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,0));
const fixtures={account:{role:'viewer'},people:[{id:'p',name:'Test recipient',symbol:'*'}],gifts:[
 {id:'open',person:'p',title:'Synthetic idea',kind:'idea',reservation_mode:'open-ended',quantity:1},
 {id:'product',person:'p',title:'Synthetic product',kind:'product',reservation_mode:'limited',quantity:1},
 {id:'inspire',person:'p',title:'Synthetic inspiration',kind:'idea',reservation_mode:'inspiration-only',quantity:1}]};
let units=[],requests=[];
function setup({signedIn=true,approved=true,role='viewer'}={}){
 const dom=new JSDOM(html,{url:'https://example.invalid/christmas-wishlist/',runScripts:'outside-only'}),w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.AbortController=globalThis.AbortController;w.setInterval=()=>0;
 if(signedIn)w.localStorage.setItem('badillo-session',JSON.stringify({access_token:'synthetic',refresh_token:'synthetic',expires_at:Date.now()/1000+3600}));
 w.fetch=async(url,opts={})=>{
  requests.push([url,opts.body]);
  if(url==='config.json')return {ok:true,json:async()=>({supabaseUrl:'https://example.supabase.co',publishableKey:'test'})};
  let value;
  if(url.endsWith('/auth/v1/user'))value={email:'test@example.invalid'};
  else if(!approved)return {ok:false,status:403,json:async()=>({message:'Family access required'})};
  else if(url.endsWith('get_wishlist'))value={...fixtures,account:{role}};
  else if(url.endsWith('list_gift_units'))value=[{gift_id:'product',unit_no:1,status:'reserved',mine:false}];
  else if(url.endsWith('get_my_selections'))value={gifts:units.length?[fixtures.gifts[0]]:[],units};
  else if(url.endsWith('set_idea_selection')){const b=JSON.parse(opts.body);units=b.p_status==='available'?[]:[{gift_id:b.p_gift_id,unit_no:0,mine:true,status:b.p_status,private_note:b.p_private_note}];value=null;}
  else if(url.endsWith('get_family_photo'))value=null;
  else if(url.endsWith('/auth/v1/logout'))value=null;
  else throw Error('Unexpected request: '+url);
  return {ok:true,json:async()=>value};
 };
 w.eval(editor);w.eval(app);return dom;
}
let d=setup();await tick();await tick();let w=d.window;
let cards=[...w.document.querySelectorAll('.card')];
assert.equal(cards.length,3);assert.match(cards[0].textContent,/Open to everyone/);assert.doesNotMatch(cards[0].textContent,/wanted|reserved|unavailable/i);
assert.equal(cards[0].querySelector('button').textContent,'I’m getting something');assert.equal(cards[0].querySelector('button').disabled,false);
assert.equal(cards[1].querySelectorAll('button').length,0);assert.equal(cards[2].querySelectorAll('button').length,0);
cards[0].querySelector('button').click();assert.equal(w.document.querySelector('#idea-dialog').open,true);
w.document.querySelector('#idea-note').value='<img src=x onerror=alert(1)> private note';
await w.document.querySelector('#idea-form').onsubmit({preventDefault(){}});await tick();
assert.equal(w.document.querySelector('#idea-dialog').open,false);
cards=[...w.document.querySelectorAll('.card')];assert.match(cards[0].textContent,/You’re getting something/);assert.equal(cards[0].querySelectorAll('img').length,0);
await [...cards[0].querySelectorAll('button')].find(b=>b.textContent==='Mark purchased').onclick();await tick();
assert.match(w.document.querySelector('.card').textContent,/You purchased something/);assert.match(w.document.querySelector('.card').textContent,/Open to everyone/);
w.document.querySelector('#filter').value='available';w.document.querySelector('#filter').onchange();assert.equal(w.document.querySelectorAll('.card').length,2);
w.document.querySelector('#filter').value='all';w.document.querySelector('#filter').onchange();
w.document.querySelector('.card button').click();w.document.querySelector('#idea-note').value='unsaved private draft';
await w.document.querySelector('#logout').onclick();assert.equal(w.document.querySelector('#idea-note').value,'');assert.equal(w.document.querySelector('#idea-dialog').open,false);assert.equal(w.document.querySelectorAll('.card').length,0);d.window.close();
for(const params of [{signedIn:false},{approved:false}]){d=setup(params);await tick();await tick();assert.equal(d.window.document.querySelectorAll('.card').length,0);d.window.close();}
units=[];d=setup({role:'editor'});await tick();await tick();w=d.window;w.document.querySelector('#add-gift').click();assert.equal(w.document.querySelector('#gift-reservation_mode').value,'limited');
w.document.querySelector('#gift-kind').value='idea';w.document.querySelector('#gift-kind').onchange();assert.equal(w.document.querySelector('#gift-reservation_mode').value,'open-ended');assert.equal(w.document.querySelector('#quantity-field').hidden,true);d.window.close();
assert.ok(!requests.some(([url])=>/otp|invite/.test(url)));
console.log('UI checks passed: open availability, notes, purchased, filters, sign-out clearing, signed-out/unapproved, editor defaults, no emails.');
