/* Preview inbox shared only by pages on this browser origin. */
(() => {
  const samples=M.map((m,i)=>({...m,id:'demo-'+i}));
  const originalRender=renderM;
  const fail=()=>toast('Couldn’t update the preview inbox. Check browser storage and try again.');
  renderM=function(){
    originalRender();
    const m=M[curM], panel=document.querySelector('#mread');
    const note=document.createElement('p');
    note.className='message-preview';
    note.textContent=m.preview?'LOCAL PREVIEW · Saved in this browser only.':'EXAMPLE MESSAGE · Demo content.';
    panel.prepend(note);
    panel.querySelector('a[href^="mailto:"]').setAttribute('href','mailto:'+encodeURIComponent(m.e));
    if(!m.preview)return;
    document.querySelector('#mr').onclick=()=>{
      try{RFContactStore.setRead(m.id,!!m.u);}catch{fail();}
    };
    const remove=document.createElement('button');
    remove.className='btn';remove.textContent='Delete message';remove.type='button';
    remove.onclick=()=>{try{RFContactStore.remove(m.id);}catch{fail();}};
    panel.lastElementChild.append(remove);
  };
  function refresh(){
    const selected=M[curM]?.id;
    try{
      const rows=RFContactStore.list().map(m=>({...m,t:new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short'}).format(m.createdAt)}));
      M=[...rows,...samples];
      curM=Math.max(0,M.findIndex(m=>m.id===selected));
      renderM();renderOv();
    }catch{fail();}
  }
  document.querySelector('#mlist').addEventListener('click',e=>{
    if(!e.target.closest('.row'))return;
    const m=M[curM];
    if(m?.preview){try{RFContactStore.setRead(m.id,true);}catch{fail();}}
  });
  addEventListener('rf-inbox-change',refresh);
  addEventListener('storage',e=>{if(e.key===RFContactStore.key||e.key===null)refresh();});
  refresh();
})();
