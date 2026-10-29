"use client";
import { createElement, useEffect } from "react";
import type { SiteContent } from "@rf/contracts";
import { Design, type DesignNode, type Overrides } from "./design";
import tree from "@/design/portfolio.json";
import { designContent } from "@/lib/design-content";
import dictionary from "@/design/locale-id.json";

declare global {
  interface Window {
    RF_DATA: unknown;
    RF_INDONESIAN: Record<string, string>;
    RF_COPY: SiteContent["settings"]["copy"];
  }
}
function load(src: string) {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = reject;
    document.body.append(script);
  });
}
export function Portfolio({
  content,
  initialView = "",
  markup = {},
}: {
  content: SiteContent;
  initialView?: string;
  markup?: Record<
    string,
    { innerHTML: string; textContent: string; hidden: boolean }
  >;
}) {
  useEffect(() => {
    if (document.documentElement.dataset.portfolioMounted) return;
    document.documentElement.dataset.portfolioMounted = "true";
    const c = content;
    window.RF_DATA = designContent(content);
    window.RF_COPY = content.settings.copy;
    const translations: Record<string, string> = { ...dictionary };
    for (const group of [
      c.projects,
      c.experience,
      c.certificates,
      c.stack,
      c.assistant,
    ])
      for (const item of group)
        for (const [field, value] of Object.entries(item.translations.id)) {
          const en = (item as unknown as Record<string, unknown>)[field];
          if (typeof en === "string" && value)
            translations[en.replace(/\s+/g, " ").trim()] = value;
        }
    for (const [key, value] of Object.entries(c.settings.copy)) {
      if (value.en && value.id) translations[value.en] = value.id;
      else if (value.id) translations[key] = value.id;
    }
    Object.assign(translations, {
      "Message sent. I’ll get back to you soon.":
        "Pesan terkirim. Saya akan segera membalasnya.",
      "I’ll use your details to reply and keep your message for up to 12 months. You can ask me to delete it in a follow-up message.":
        "Data kontakmu hanya dipakai untuk membalas. Pesan disimpan maksimal 12 bulan; kamu bisa meminta penghapusan lewat pesan berikutnya.",
      "Couldn’t send this message. Please try again in a moment.":
        "Pesan belum terkirim. Coba lagi sebentar, ya.",
    });
    for (const field of ["description", "aboutCopy", "availability"] as const) {
      const en =
        field === "availability"
          ? c.settings.availability
          : c.settings.profile[field];
      const id = c.settings.translations.id[field];
      if (en && id) translations[en] = id;
    }
    translations["SENT TO MY PRIVATE INBOX"] = "DIKIRIM LANGSUNG KE INBOX SAYA";
    window.RF_INDONESIAN = translations;
    (async () => {
      try {
        await load("/design/splash.js");
        await load("/design/projects.js");
        await load("/design/portfolio-runtime.js");
        await load("/design/locale.js");
      } catch {
        document.documentElement.classList.remove("splash");
        document.getElementById("splash")?.remove();
      }
    })();
  }, [content]);
  useEffect(() => {
    const track = () => {
      if (navigator.doNotTrack === "1") return;
      fetch(
        (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000") +
          "/api/track",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: location.pathname,
            referrer: document.referrer,
          }),
          keepalive: true,
        },
      ).catch(() => {});
    };
    track();
    window.addEventListener("popstate", track);
    window.addEventListener("rf-route", track);
    return () => {
      window.removeEventListener("popstate", track);
      window.removeEventListener("rf-route", track);
    };
  }, []);
  const overrides: Overrides = {
    "contact-form": <ContactForm />,
    yr: new Date().getFullYear(),
    "portfolio-main": (node, props, children) =>
      createElement(node.tag, { ...props, hidden: !!initialView }, children),
    "project-archive": (node, props, children) =>
      createElement(
        node.tag,
        { ...props, hidden: initialView !== "archive" },
        children,
      ),
  };
  for (const [id, value] of Object.entries(markup)) {
    if (id === "archive-empty") continue;
    if (value.innerHTML)
      overrides[id] = (node, props) =>
        createElement(node.tag, {
          ...props,
          hidden:
            id === "project-detail" ? initialView !== "detail" : props.hidden,
          dangerouslySetInnerHTML: { __html: value.innerHTML },
        });
    else if (value.textContent) overrides[id] = value.textContent;
  }
  function personalize(nodes: DesignNode[]): DesignNode[] {
    return nodes.map((node) => {
      if (typeof node === "string") {
        const normalized = node.trim(),
          p = content.settings.profile;
        if (normalized === "Rifki Muhammad Fadhil")
          return node.replace(normalized, p.name);
        if (normalized === "FULLSTACK DEVELOPER / INDONESIA")
          return node.replace(
            normalized,
            p.role.toUpperCase() +
              " / " +
              p.location.toUpperCase() +
              (content.settings.availability
                ? " · " + content.settings.availability
                : ""),
          );
        return content.settings.copy[normalized]?.en || node;
      }
      const classes = node.attrs.class || "",
        profile = content.settings.profile;
      if (node.tag === "h1" && classes.includes("hero-enter"))
        return {
          ...node,
          children: [
            profile.firstName + " ",
            { tag: "br", attrs: {}, children: [] },
            {
              tag: "span",
              attrs: {},
              children: [
                profile.lastName,
                { tag: "i", attrs: {}, children: ["."] },
              ],
            },
          ],
        };
      if (classes.includes("hero-description"))
        return { ...node, children: [profile.description] };
      if (classes === "about-copy")
        return { ...node, children: [profile.aboutCopy] };
      if (classes === "pt-img")
        return {
          ...node,
          attrs: {
            ...node.attrs,
            src: profile.portraitUrl || "/design/portrait.webp",
            alt: profile.name,
          },
        };
      return { ...node, children: personalize(node.children) };
    });
  }
  return (
    <Design nodes={personalize(tree as DesignNode[])} overrides={overrides} />
  );
}
function ContactForm() {
  useEffect(() => {
    const form = document.querySelector<HTMLFormElement>("#contact-form")!;
    const handler = async (event: SubmitEvent) => {
      event.preventDefault();
      const button = form.querySelector<HTMLButtonElement>("[type=submit]")!,
        status = document.getElementById("contact-form-status")!;
      if (button.disabled) return;
      button.disabled = true;
      status.textContent = "Sending…";
      const data = Object.fromEntries(new FormData(form));
      const body = {
        ...data,
        consent: (form.elements.namedItem("consent") as HTMLInputElement)
          .checked,
      };
      form
        .querySelectorAll("[aria-invalid]")
        .forEach((el) => el.removeAttribute("aria-invalid"));
      form
        .querySelectorAll(".contact-error")
        .forEach((el) => (el.textContent = ""));
      try {
        const response = await fetch(
          (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000") +
            "/api/contact",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        const result = await response.json();
        if (!response.ok) {
          for (const [name, error] of Object.entries(result.fields || {})) {
            const field = form.elements.namedItem(
              name,
            ) as HTMLInputElement | null;
            field?.setAttribute("aria-invalid", "true");
            const target = document.getElementById(
              "contact-" + name + "-error",
            );
            if (target) target.textContent = String(error);
          }
          throw Error(
            result.error ||
              "Couldn’t send this message. Please try again in a moment.",
          );
        }
        form.reset();
        status.dataset.state = "success";
        status.textContent = "Message sent. I’ll get back to you soon.";
      } catch (error) {
        status.dataset.state = "error";
        status.textContent =
          error instanceof Error
            ? error.message
            : "Couldn’t send this message. Please try again in a moment.";
      } finally {
        button.disabled = false;
      }
    };
    form.addEventListener("submit", handler);
    return () => form.removeEventListener("submit", handler);
  }, []);
  // Reuse the approved fields and spacing; only replace the preview-only explanation.
  const form = (tree as DesignNode[]).flatMap(function find(n): DesignNode[] {
    if (typeof n === "string") return [];
    return n.attrs.id === "contact-form" ? [n] : n.children.flatMap(find);
  })[0];
  if (typeof form === "string" || !form) return null;
  return (
    <Design
      nodes={form.children.map(function replace(n): DesignNode {
        if (typeof n === "string")
          return n.includes("PREVIEW ONLY")
            ? "SENT TO MY PRIVATE INBOX"
            : n.includes("preview inbox") || n.includes("this browser")
              ? "I’ll use your details to reply and keep your message for up to 12 months. You can ask me to delete it in a follow-up message."
              : n;
        return { ...n, children: n.children.map(replace) };
      })}
    />
  );
}
