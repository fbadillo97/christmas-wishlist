// No live network or SMTP calls: run with node tests/invitations.mjs.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const directory=new URL('../supabase/functions/wishlist-welcome/',import.meta.url);
const renderer=readFileSync(new URL('welcome-email.js',directory),'utf8');
const welcomeEmail=new Function(renderer.replaceAll('export const','const').replaceAll('export function','function')+';return welcomeEmail;')();
const code=readFileSync(new URL('index.ts',directory),'utf8').replace(/^import .*;\n/gm,'').replace('export async function','async function').replace('Deno.serve(handle);','return handle;');
const contact='contact@example.invalid';
const sampleWelcomeURL='https://fbadillo97.github.io/christmas-wishlist/welcome.html#'+'a'.repeat(64);
const request=(authorization='Bearer signed-in',origin='https://fbadillo97.github.io')=>new Request('https://example.invalid',{method:'POST',headers:{...(authorization?{authorization}:{}),origin,'content-type':'application/json'},body:JSON.stringify({email:'recipient@example.invalid',revision:1,first_name:'Untrusted name',html:'Untrusted body',cc:'untrusted@example.invalid'})});
async function check(name,{req=request(),claimStatus=200,error=null,accepted=true,configured=true,expected=200}={}){
 const calls=[],emails=[];let closed=false;
 const handler=new Function('Deno','fetch','Response','AbortSignal','nodemailer','welcomeEmail',code)(
  {env:{get:n=>({SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'server-secret',WISHLIST_SMTP_USERNAME:configured?'sender@example.invalid':null,WISHLIST_SMTP_PASSWORD:configured?'smtp-secret':null})[n]}},
  async(path,options)=>{
   calls.push({path,body:options.body?JSON.parse(options.body):null});let data;
   if(path.endsWith('/user'))data={id:'actor',email_confirmed_at:'confirmed'};
   else if(path.endsWith('wishlist_begin_personal_welcome'))data=claimStatus===200?{attempt:'attempt',email:'recipient@example.invalid',first_name:'Example <name>',contact_email:contact}:{code:'42501',message:'Editor access required'};
   else if(path.endsWith('wishlist_finish_invitation'))data=null;
   else throw Error('Unexpected API: '+path);
   return new Response(JSON.stringify(data),{status:path.endsWith('wishlist_begin_personal_welcome')?claimStatus:200});
  },Response,AbortSignal,
  {createTransport:options=>{assert.equal(options.port,465);assert.equal(options.secure,true);return {sendMail:async email=>{emails.push(email);if(error)throw error;return {accepted:accepted?['recipient@example.invalid',contact]:[]};},close:()=>{closed=true;}};}},welcomeEmail);
 const response=await handler(req);assert.equal(response.status,expected,name);
 const result=JSON.stringify(await response.json());assert.ok(!result.includes('smtp-secret')&&!result.includes('server-secret'));
 assert.ok(!calls.some(c=>/\/otp|\/invite\?/.test(c.path)),'Welcome must not invoke Auth email APIs');
 if(emails.length){
  assert.ok(closed);
  const personal=[...emails[0].html.matchAll(/href="([^"]+)"/g)].map(m=>m[1]).find(x=>x.includes('/welcome.html#'));
  assert.ok(personal,'Missing personal welcome URL');
  const token=new URL(personal).hash.slice(1);
  const claim=calls.find(c=>c.path.endsWith('wishlist_begin_personal_welcome'));
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
  assert.equal(claim.body.p_token_hash,hash);assert.notEqual(claim.body.p_token_hash,token);assert.equal(emails.length,1);assert.equal(emails[0].cc,contact);assert.equal(emails[0].replyTo,contact);
  assert.ok(emails[0].html.includes('Hi Example &lt;name&gt;,'));assert.ok(!emails[0].html.includes('Untrusted'));
  assert.ok(emails[0].text.includes('This sending address isn’t monitored.'));
  const links=[...emails[0].html.matchAll(/href="([^"]+)"/g)].map(m=>m[1]);assert.ok(links.every(x=>x==='https://fbadillo97.github.io/christmas-wishlist/'||/^https:\/\/fbadillo97[.]github[.]io\/christmas-wishlist\/welcome[.]html#[0-9a-f]{64}$/.test(x)||x==='mailto:'+contact));
  const outcome=error?(Number(error.responseCode)>=400?'failed':'unknown'):accepted?'sent':'failed';
  assert.equal(calls.find(c=>c.path.endsWith('wishlist_finish_invitation'))?.body.p_status,outcome);
 }
 if(expected===200)assert.equal(emails.length,1);
 if([401,403,503].includes(expected))assert.equal(emails.length,0);
 console.log(name+': passed');
}
await check('Personalized permanent welcome with trusted CC and Reply-To');
await check('Missing authentication',{req:request(null),expected:401});
await check('Wrong origin',{req:request('Bearer signed-in','https://evil.invalid'),expected:403});
await check('Viewer/non-admin denied',{claimStatus:403,expected:403});
await check('Missing SMTP settings sends nothing',{configured:false,expected:503});
await check('SMTP rejection recorded',{error:{responseCode:535},expected:502});
await check('SMTP timeout never retried',{error:{code:'ETIMEDOUT'},expected:502});
assert.ok(welcomeEmail('',contact,sampleWelcomeURL).html.includes('Hi there,'));
assert.throws(()=>welcomeEmail('Example','bad\ncontact@example.invalid',sampleWelcomeURL));
console.log('Fallback greeting and contact validation: passed');
