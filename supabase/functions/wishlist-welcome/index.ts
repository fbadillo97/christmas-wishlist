import nodemailer from 'npm:nodemailer@10.5.0';
import { welcomeEmail } from './welcome-email.js';
const origin='https://fbadillo97.github.io';
const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
const reply=(status,message)=>new Response(JSON.stringify({message}),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
export async function handle(req){
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return reply(405,'Use POST.');
 if(req.headers.get('origin')&&req.headers.get('origin')!==origin)return reply(403,'Origin is not allowed.');
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)return reply(503,'Welcome email service is unavailable.');
 const authorization=req.headers.get('authorization');
 if(!authorization?.startsWith('Bearer '))return reply(401,'Please sign in again.');
 const call=(path,body,token='Bearer '+key)=>fetch(url+path,{method:body===undefined?'GET':'POST',headers:{apikey:key,Authorization:token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(8000)});
 let attempt,transport;
 try{
  const auth=await call('/auth/v1/user',undefined,authorization);
  if(!auth.ok)return reply(401,'Please sign in again.');
  const user=await auth.json();
  if(!user.id||!user.email_confirmed_at)return reply(403,'A verified account is required.');
  let body;try{body=await req.json();}catch{return reply(400,'Invalid request.');}
  if(typeof body?.email!=='string'||body.email.length>254||!Number.isInteger(body.revision))return reply(400,'Choose a saved account and refresh before sending.');
  const username=Deno.env.get('WISHLIST_SMTP_USERNAME'),password=Deno.env.get('WISHLIST_SMTP_PASSWORD');
  if(!username||!password)return reply(503,'Welcome emails need the Gmail SMTP secrets configured in Supabase Edge Functions. No email was sent.');
  const claim=await call('/rest/v1/rpc/wishlist_begin_invitation',{p_actor:user.id,p_email:body.email,p_revision:body.revision});
  if(!claim.ok){const error=await claim.json();return reply(error.code==='42501'?403:409,error.message||'Welcome email is not allowed.');}
  const target=await claim.json();attempt=target.attempt;
  const email=welcomeEmail(target.first_name,target.contact_email);
  transport=nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,auth:{user:username,pass:password},connectionTimeout:5000,greetingTimeout:5000,socketTimeout:10000,logger:false,debug:false});
  // Recipient, name, sender, subject and body come only from trusted server sources.
  // This is an ordinary welcome email: no Auth user creation or sign-in token.
  let outcome='unknown',accepted=false,ccAccepted=false;
  try{
   const info=await transport.sendMail({from:{name:'Badillo Family Wishlist',address:username},to:target.email,cc:target.contact_email,replyTo:target.contact_email,subject:email.subject,text:email.text,html:email.html,disableFileAccess:true,disableUrlAccess:true});
   accepted=Array.isArray(info.accepted)&&info.accepted.some(address=>String(address).toLowerCase()===target.email.toLowerCase());
   ccAccepted=Array.isArray(info.accepted)&&info.accepted.some(address=>String(address).toLowerCase()===target.contact_email.toLowerCase());
   outcome=accepted?'sent':'failed';
  }catch(error){
   // Explicit SMTP rejection means not accepted; connection loss/timeouts may be ambiguous.
   outcome=(Number(error?.responseCode)>=400||['EAUTH','EENVELOPE','EDNS'].includes(error?.code))?'failed':'unknown';
  }
  const recorded=await call('/rest/v1/rpc/wishlist_finish_invitation',{p_attempt:attempt,p_status:outcome});
  if(!recorded.ok)return reply(502,'Welcome email result could not be recorded. Delivery may have occurred; refresh before resending.');
  if(!accepted)return reply(502,outcome==='unknown'?'Delivery is uncertain. Check with the recipient before resending.':'The welcome email was not accepted. Check the Gmail SMTP configuration before retrying.');
  return reply(200,ccAccepted?'Welcome email and CC accepted by Gmail. Its website link does not expire. Inbox delivery is not confirmed.':'Welcome email accepted, but the CC was not accepted. Check the contact address before resending; the recipient may already have the email.');
 }catch{
  if(attempt){try{await call('/rest/v1/rpc/wishlist_finish_invitation',{p_attempt:attempt,p_status:'unknown'});}catch{}}
  return reply(502,attempt?'Delivery is uncertain. Refresh and check with the recipient before resending.':'The welcome email service could not be reached. Try again later.');
 }finally{transport?.close();}
}
Deno.serve(handle);
