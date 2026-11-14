import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const code=readFileSync(new URL('../supabase/functions/wishlist-invite/index.ts',import.meta.url),'utf8').replace('export async function handle','async function handle').replace('Deno.serve(handle);','return handle;');
const req=(auth='Bearer test',origin='https://fbadillo97.github.io')=>new Request('https://example.invalid',{method:'POST',headers:{...(auth?{authorization:auth}:{}),origin,'content-type':'application/json'},body:JSON.stringify({email:'test@example.invalid',revision:1})});
const auth={body:{id:'actor',email_confirmed_at:'confirmed'}};
const claim={body:{attempt:'attempt',email:'test@example.invalid',existing_user:false}};
async function check(name,request,responses,status,paths,recorded){
 const calls=[];
 const handler=new Function('Deno','fetch','Response','AbortSignal',code)({env:{get:n=>n==='SUPABASE_URL'?'https://example.invalid':'server-secret'}},async(path,options)=>{
  calls.push({path,body:options.body?JSON.parse(options.body):null});const r=responses.shift();if(r instanceof Error)throw r;assert.ok(r,'Unexpected network call');return new Response(JSON.stringify(r.body),{status:r.status||200});
 },Response,AbortSignal);
 const result=await handler(request);assert.equal(result.status,status,name);assert.equal(calls.length,paths.length,name);
 calls.forEach((c,i)=>assert.ok(c.path.includes(paths[i]),name));
 if(recorded)assert.equal(calls.at(-1).body.p_status,recorded,name);
 assert.ok(!JSON.stringify(await result.json()).includes('server-secret'));console.log(name+': passed');
}
await check('Missing authentication',req(null),[],401,[]);
await check('Disallowed origin',req('Bearer test','https://evil.invalid'),[],403,[]);
await check('Invalid session',req(),[{status:401,body:{}}],401,['/auth/v1/user']);
await check('Viewer rejected before email',req(),[auth,{status:403,body:{code:'42501'}}],403,['/auth/v1/user','wishlist_begin_invitation']);
await check('New account invitation',req(),[auth,claim,{body:{}},{body:null}],200,['/auth/v1/user','wishlist_begin_invitation','/auth/v1/invite?','wishlist_finish_invitation'],'sent');
await check('Existing account resend',req(),[auth,{body:{...claim.body,existing_user:true}},{body:{}},{body:null}],200,['/auth/v1/user','wishlist_begin_invitation','/auth/v1/otp?','wishlist_finish_invitation'],'sent');
await check('Rate limit recorded',req(),[auth,claim,{status:429,body:{}},{body:null}],429,['/auth/v1/user','wishlist_begin_invitation','/auth/v1/invite?','wishlist_finish_invitation'],'failed');
await check('Ambiguous send never retried',req(),[auth,claim,new Error('timeout'),{body:null}],502,['/auth/v1/user','wishlist_begin_invitation','/auth/v1/invite?','wishlist_finish_invitation'],'unknown');
