(() => {
  const form=document.querySelector('#contact-form');
  const status=document.querySelector('#contact-form-status');
  const button=form.querySelector('[type=submit]');
  const fields=['name','email','phone','message','consent'];
  const clearErrors=()=>fields.forEach(name=>{
    form.elements[name].removeAttribute('aria-invalid');
    document.querySelector(`#contact-${name}-error`).textContent='';
  });
  form.addEventListener('input',e=>{
    const name=e.target.name;
    if(fields.includes(name)){
      e.target.removeAttribute('aria-invalid');
      document.querySelector(`#contact-${name}-error`).textContent='';
    }
  });
  form.addEventListener('submit',e=>{
    e.preventDefault();clearErrors();status.textContent='';
    if(form.elements.website.value) return;
    const data=Object.fromEntries(new FormData(form));data.consent=form.elements.consent.checked;
    const validation=window.RFContactStore.validate(data);
    const invalid=Object.keys(validation.errors);
    if(invalid.length){
      invalid.forEach(name=>{
        form.elements[name].setAttribute('aria-invalid','true');
        document.querySelector(`#contact-${name}-error`).textContent=validation.errors[name];
      });
      form.elements[invalid[0]].focus();return;
    }
    button.disabled=true;
    try{
      window.RFContactStore.add(data);
      form.reset();
      status.dataset.state='success';
      status.textContent='Saved for this preview. You can find it in the dashboard’s Messages.';
    }catch{
      status.dataset.state='error';
      status.textContent='Couldn’t save this message. Check browser storage or whether the preview inbox is full, then try again.';
    }finally{button.disabled=false;}
  });
})();
