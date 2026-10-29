/* DOM adapter for the supplied standalone prototype. Keeps its existing renderers,
   event handlers, technical names and markup. Production should use locale fields. */
(() => {
  const dictionary = window.RF_INDONESIAN;
  const root = document.documentElement;
  let locale = 'en';
  try { locale = localStorage.getItem('rf-locale') === 'id' ? 'id' : 'en'; } catch {}
  const records = new WeakMap();
  const attrs = ['aria-label', 'title', 'alt', 'placeholder'];
  const normalize = value => value.replace(/\s+/g, ' ').trim();
  function translate(value) {
    if (locale === 'en' || !value.trim()) return value;
    const key = normalize(value);
    let translated = dictionary[key];
    if (!translated) {
      const count = key.match(/^(\d+) (TOOLS|selected \/ (\d+) total|of (\d+) projects)$/);
      if (count) translated = count[2] === 'TOOLS' ? `${count[1]} ALAT` : count[3] ? `${count[1]} pilihan / ${count[3]} total` : `${count[1]} dari ${count[4]} proyek`;
      const empty = key.match(/^No (.+) projects yet\.$/);
      if (empty) translated = `Belum ada proyek ${dictionary[empty[1]] || empty[1]}.`;
      const detail = key.match(/^View (.+) details$/);
      if (detail) translated = `Lihat detail ${dictionary[detail[1]] || detail[1]}`;
      const credential = key.match(/^View details for (.+)$/);
      if (credential) translated = `Lihat detail ${dictionary[credential[1]] || credential[1]}`;
      const screenshot = key.match(/^(.+) — project screenshot$/);
      if (screenshot) translated = `${screenshot[1]} — screenshot proyek`;
      const certificate = key.match(/^Certificate: (.+)$/);
      if (certificate) translated = `Sertifikat: ${dictionary[certificate[1]] || certificate[1]}`;
      const question = key.match(/^(Question|Response): (.+)$/);
      if (question) translated = `${question[1] === 'Question' ? 'Pertanyaan' : 'Jawaban'}: ${translate(question[2])}`;
      const projectNumber = key.match(/^PROJECT \/ (\d+)$/);
      if (projectNumber) translated = `PROYEK / ${projectNumber[1]}`;
      const projectType = key.match(/^PROJECT (\d+) \/ (.+)$/);
      if (projectType) translated = `PROYEK ${projectType[1]} / ${dictionary[projectType[2]] || projectType[2]}`;
      const numberedCategory = key.match(/^(\d+) \/ WEB APP$/);
      if (numberedCategory) translated = `${numberedCategory[1]} / APLIKASI WEB`;
      const credentialNumber = key.match(/^CREDENTIAL \/ (\d+)$/);
      if (credentialNumber) translated = `KREDENSIAL / ${credentialNumber[1]}`;
      const credentialYear = key.match(/^(\d{4}) \/ (EXAMPLE CREDENTIAL|CERTIFICATE DETAILS)$/);
      if (credentialYear) translated = `${credentialYear[1]} / ${dictionary[credentialYear[2]]}`;
      if (key.startsWith('FRONTEND ') && key.includes('BACKEND')) translated = value.replace('LINUX & SERVERS','LINUX & SERVER').replace('TOOLING','PERALATAN');
    }
    if (!translated) return value;
    return value.match(/^\s*/)[0] + translated + value.match(/\s*$/)[0];
  }
  function excluded(el) { return el?.closest('script,style,svg,code,kbd,[data-locale-ignore]'); }
  function update(target, key, get, set) {
    let map = records.get(target);
    if (!map) records.set(target, map = {});
    const current = get();
    if (!map[key] || current !== map[key].rendered) map[key] = {source: current, rendered: current};
    const next = translate(map[key].source);
    if (current !== next) set(next);
    map[key].rendered = next;
  }
  function visit(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!excluded(node.parentElement)) update(node, 'text', () => node.nodeValue, value => node.nodeValue = value);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || excluded(node)) return;
    attrs.forEach(attr => { if (node.hasAttribute(attr)) update(node, attr, () => node.getAttribute(attr), value => node.setAttribute(attr, value)); });
    [...node.childNodes].forEach(visit);
  }
  const options = {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:attrs};
  const observer = new MutationObserver(mutations => {
    observer.disconnect();
    const targets = new Set();
    mutations.forEach(m => {
      if (m.type === 'childList') m.addedNodes.forEach(n => targets.add(n));
      else targets.add(m.target);
    });
    targets.forEach(visit);
    observer.observe(root, options);
  });
  function render() {
    observer.disconnect();
    root.lang = locale;
    document.querySelectorAll('[data-language-toggle]').forEach(button => {
      button.setAttribute('aria-label', locale === 'id' ? 'Switch to English' : 'Switch to Indonesian');
      button.querySelectorAll('[data-locale]').forEach(el => el.classList.toggle('is-active', el.dataset.locale === locale));
      button.querySelector('.locale-mobile').textContent = locale === 'id' ? 'Bahasa' : 'Language';
    });
    visit(root);
    observer.observe(root, options);
  }
  document.querySelectorAll('[data-language-toggle]').forEach(button => button.addEventListener('click', () => {
    if (typeof finishReply === 'function') finishReply(false);
    locale = locale === 'id' ? 'en' : 'id';
    try { localStorage.setItem('rf-locale', locale); } catch {}
    render();
    document.querySelector('#locale-announcement').textContent = locale === 'id' ? 'Bahasa Indonesia dipilih.' : 'English selected.';
  }));
  window.rfI18n = {t:translate, get locale() {return locale;}};
  render();
})();
