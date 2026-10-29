import type { SiteContent } from "@rf/contracts";
/** Canonical API fields mapped to the approved templates' display names. */
export function designContent(c: SiteContent) {
  return {
    about: c.settings.profile.aboutCopy.split("\n"),
    stack: c.stack.map((g) => ({ c: g.name, i: g.items })),
    projects: c.projects.map((p) => ({
      ...p,
      n: p.title,
      cat: p.type,
      ph: p.isExample,
      problem: p.description,
      contrib: p.contribution,
      image: p.imageUrl,
      live: p.liveUrl,
      repo: p.repoUrl,
    })),
    exp: c.experience.map((e) => ({
      y: e.period,
      r: e.role,
      o: e.company,
      d: e.description,
      ph: e.isExample,
    })),
    certs: c.certificates.map((c) => ({
      n: c.name,
      o: c.issuer,
      y: c.year,
      id: c.credentialId,
      url: c.credentialUrl,
      image: c.imageUrl,
      ph: c.isExample,
    })),
    contact: c.settings.contact.map((c) => ({
      l: c.label,
      v: c.value,
      h: c.url,
      ph: c.isExample,
    })),
    assistant: c.assistant,
  };
}
