Deno.serve(async req=>{
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Cache-Control':'no-store'};
  const empty=(status:number)=>new Response(null,{status,headers});
  if(req.method==='OPTIONS') return empty(204);
  if(req.method!=='POST') return empty(405);
  try {
    const {game,gift,photo,token}=await req.json();
    const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
    if(![game,gift,photo].every(x=>uuid.test(x))) return empty(400);
    const url=Deno.env.get('SUPABASE_URL'), key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const board=await fetch(url+'/rest/v1/rpc/'+(token?'we_tv_board':'we_host_action'),{method:'POST',
      headers:{apikey:Deno.env.get('SUPABASE_ANON_KEY')!,'Content-Type':'application/json',...(token?{}:{Authorization:req.headers.get('Authorization')||''})},
      body:JSON.stringify(token?{game,token}:{game,expected:null,command:'read'})});
    if(!board.ok) return empty(board.status);
    const data=await board.json();
    const gifts=Object.values(token?data.gifts:data.state.gifts) as {id:string,photo:string}[];
    if(![...gifts,...(data.portraits||[])].some(g=>g.id===gift&&g.photo===photo)) return empty(404);
    const image=await fetch(url+'/storage/v1/object/authenticated/we-gift-photos/'+game+'/'+gift+'/'+photo+'.jpg',{headers:{apikey:key,Authorization:'Bearer '+key}});
    if(!image.ok) return empty(image.status);
    return new Response(image.body,{headers:{...headers,'Content-Type':'image/jpeg','X-Content-Type-Options':'nosniff'}});
  } catch {return empty(502);}
});
