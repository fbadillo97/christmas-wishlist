window.giftPhotos={
  async compress(file){
    const bitmap=await createImageBitmap(file);
    try {
      const canvas=document.createElement('canvas'), scale=Math.min(1,1024/Math.max(bitmap.width,bitmap.height));
      canvas.width=Math.max(1,Math.round(bitmap.width*scale)); canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      for(const quality of [.8,.6,.4]){
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
        if(blob&&blob.size<=524288)return blob;
      }
      throw Error('Choose a smaller photo.');
    } finally {bitmap.close();}
  },
  show(parent,g,config,game,auth,token){
    if(!g.photo)return;
    const img=document.createElement('img');img.alt=g.title;img.width=96;img.dataset.photo=g.photo;parent.append(img);
    fetch(config.supabaseUrl+'/functions/v1/we-gift-photo',{method:'POST',cache:'no-store',
      headers:{apikey:config.publishableKey,'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},
      body:JSON.stringify({game,gift:g.id,photo:g.photo,token}),signal:AbortSignal.timeout(10000)})
    .then(async r=>{
      if(!r.ok)throw Error();
      const blob=await r.blob();
      if(!img.isConnected)return;
      const url=URL.createObjectURL(blob);
      img.onload=img.onerror=()=>URL.revokeObjectURL(url);
      img.src=url;
    }).catch(()=>{img.alt='Photo unavailable';});
  }
};