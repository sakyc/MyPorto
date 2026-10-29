/* Same-browser prototype inbox. Production must replace this with the API. */
window.RFContactStore = (() => {
  const key = 'rf-preview-messages-v1';
  function normalizePhone(value) {
    let phone = value.trim().replace(/[\s().-]/g, '');
    if (!phone) return '';
    if (phone.startsWith('00')) phone = '+' + phone.slice(2);
    else if (phone.startsWith('0')) phone = '+62' + phone.slice(1);
    else if (/^62\d+$/.test(phone)) phone = '+' + phone;
    else if (/^\d+$/.test(phone)) phone = '+62' + phone;
    return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
  }
  function validate(fields) {
    const errors = {};
    const name = String(fields.name || '').trim();
    const email = String(fields.email || '').trim();
    const body = String(fields.message || '').trim();
    const phone = normalizePhone(String(fields.phone || ''));
    if (!name || name.length > 80) errors.name = 'Please add your name (up to 80 characters).';
    if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) errors.email = 'Please enter a valid email address.';
    if (phone === null) errors.phone = 'Please use a valid phone number, like +62 812 3456 7890.';
    if (body.length < 10 || body.length > 2000) errors.message = 'Please write between 10 and 2,000 characters.';
    for (const [field, value] of Object.entries({name, message:body})) {
      if (/<[^>]*>/.test(value)) errors[field] = 'Please use plain text, without HTML tags.';
    }
    if (!fields.consent) errors.consent = 'Please tick the box so I can use your details to reply.';
    return {errors, value:{name, email, phone:phone || '', message:body}};
  }
  function list() {
    const data = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(data)) throw Error('Invalid preview inbox');
    return data.filter(row => row && typeof row.id === 'string' && typeof row.n === 'string' && typeof row.e === 'string' && typeof row.b === 'string' && typeof row.ph === 'string' && Number.isFinite(row.createdAt)).map(row => ({id:row.id,n:row.n.slice(0,80),e:row.e.slice(0,254),ph:row.ph.slice(0,20),b:row.b.slice(0,2000),consent:row.consent === true,u:row.u ? 1 : 0,createdAt:row.createdAt,preview:true})).sort((a,b)=>b.createdAt-a.createdAt);
  }
  function save(rows) { localStorage.setItem(key,JSON.stringify(rows)); dispatchEvent(new Event('rf-inbox-change')); }
  function add(fields) {
    const result=validate(fields);
    if (Object.keys(result.errors).length) return result;
    const rows=list();
    if (rows.length>=100) throw Error('Preview inbox is full');
    const v=result.value;
    const row={id:crypto.randomUUID(),n:v.name,e:v.email,ph:v.phone,b:v.message,consent:true,u:1,createdAt:Date.now(),preview:true};
    save([row,...rows]);
    return {...result,id:row.id};
  }
  function setRead(id,read) { const rows=list(); const row=rows.find(row=>row.id===id); if(row){row.u=read?0:1;save(rows);} }
  function remove(id) { save(list().filter(row=>row.id!==id)); }
  return {key,list,validate,add,setRead,remove};
})();
