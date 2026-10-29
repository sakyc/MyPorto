/* eslint-disable react-hooks/refs, react-hooks/immutability -- The approved design adapter uses render callbacks that return event handlers. The compiler lint misidentifies those deferred handlers as render-time access. State remains in React; refs hold the draft-save queue and native dialogs. */
/* eslint-disable react/display-name -- These functions are Design overrides, not React component definitions. */
/* eslint-disable @next/next/no-img-element -- Uploaded media is already resized and converted to WebP by the API. */
"use client";
import {
  createElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  SiteContent,
  ContentEntry,
  ResourceName,
  PublishPreview,
  Message,
  Analytics,
  Media,
  Settings,
  OwnerCredentials,
  OwnerCredentialsInput,
} from "@rf/contracts";
import { ownerCredentialsSchema } from "@rf/contracts";
import { api, setCsrf, ApiError } from "@/lib/api";
import { Design, type DesignNode, type Overrides } from "./design";
import tree from "@/design/admin-dashboard.json";

type Row = ContentEntry & Record<string, unknown>;
const sections = [
  ["overview", "Overview"],
  ["projects", "Projects"],
  ["experience", "Experience"],
  ["certificates", "Certificates"],
  ["stack-groups", "Stack"],
  ["assistant-presets", "Assistant"],
  ["messages", "Messages"],
  ["settings", "Settings"],
  ["media", "Media"],
];
const categories = [
  ["php", "PHP"],
  ["javascript", "JavaScript"],
  ["mobile", "Mobile"],
  ["website", "Website"],
  ["web-app", "Web App"],
  ["desktop", "Desktop"],
  ["api", "API / Backend"],
  ["devops", "DevOps"],
];
const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
const title = (row: Record<string, unknown>) =>
  String(row.title || row.name || row.role || row.question || "Untitled");
function theme(button?: HTMLElement) {
  const root = document.documentElement;
  const apply = () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
  };
  if (
    !document.startViewTransition ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    apply();
    return;
  }
  const box = button?.getBoundingClientRect(),
    x = box ? box.x + box.width / 2 : innerWidth / 2,
    y = box ? box.y + box.height / 2 : innerHeight / 3,
    r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  document
    .startViewTransition(apply)
    .ready.then(() =>
      root.animate(
        {
          clipPath: [
            `circle(0 at ${x}px ${y}px)`,
            `circle(${r}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 550,
          easing: "ease-in-out",
          pseudoElement: "::view-transition-new(root)",
        },
      ),
    )
    .catch(() => {});
}
interface Status {
  api: string;
  database: string;
  latency: number;
  lastPublish: { version: number; commitHash: string; publishedAt: string };
  unread: number;
  activity: { id: number; action: string; entity: string; createdAt: string }[];
  backup: string;
}
export function Admin() {
  const [auth, setAuth] = useState<"loading" | "out" | "in">("loading"),
    [section, setSection] = useState("overview"),
    [content, setContent] = useState<SiteContent | null>(null),
    [preview, setPreview] = useState<PublishPreview | null>(null),
    [status, setStatus] = useState<Status | null>(null),
    [messages, setMessages] = useState<Message[]>([]),
    [messagePage, setMessagePage] = useState(1),
    [messageTotal, setMessageTotal] = useState(0),
    [analytics, setAnalytics] = useState<Analytics | null>(null),
    [selected, setSelected] = useState<number | null>(null),
    [saveStatus, setSaveStatus] = useState("● saved"),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [refreshingCache, setRefreshingCache] = useState(false),
    [intro, setIntro] = useState(true),
    [leaving, setLeaving] = useState(false),
    [palette, setPalette] = useState(""),
    [media, setMedia] = useState<Media[]>([]);
  const pub = useRef<HTMLDialogElement>(null),
    pal = useRef<HTMLDialogElement>(null),
    flush = useRef<(() => Promise<void>) | null>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((value: string) => {
    setToast(value);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4200);
  }, []);
  const updatePreview = useCallback(async () => {
    setPreview(await api<PublishPreview>("/publish/preview"));
  }, []);
  const loadMessages = useCallback(async (page: number) => {
    const result = await api<{ items: Message[]; total: number }>(
      "/messages?page=" + page,
    );
    setMessages(result.items);
    setMessageTotal(result.total);
  }, []);
  const refresh = useCallback(async () => {
    const results = await Promise.all([
      api<SiteContent>("/content"),
      api<PublishPreview>("/publish/preview"),
      api<Status>("/status"),
      api<Analytics>("/analytics"),
      api<Media[]>("/media"),
    ]);
    setContent(results[0]);
    setPreview(results[1]);
    setStatus(results[2]);
    setAnalytics(results[3]);
    setMedia(results[4]);
    await loadMessages(1);
  }, [loadMessages]);
  useEffect(() => {
    let active = true;
    api<{ csrfToken: string }>("/me")
      .then(async (result) => {
        if (!active) return;
        setCsrf(result.csrfToken);
        setAuth("in");
        await refresh();
      })
      .catch((error) => {
        if (active) {
          setAuth("out");
          if (!(error instanceof ApiError && error.status === 401))
            setError(errorText(error));
        }
      });
    const expired = () => {
      setCsrf("");
      setAuth("out");
      setContent(null);
    };
    window.addEventListener("rf-session-expired", expired);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => setLeaving(true), reduced ? 0 : 1650),
      end = setTimeout(
        () => {
          setIntro(false);
          document.documentElement.classList.remove("splash");
        },
        reduced ? 0 : 2500,
      );
    const route = () => {
      const path = location.pathname.split("/")[2],
        hash = location.hash.slice(1),
        key = hash || path || "overview";
      setSection(sections.some((s) => s[0] === key) ? key : "overview");
      setSelected(null);
    };
    route();
    window.addEventListener("hashchange", route);
    const keyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (pal.current?.open) pal.current.close();
        else pal.current?.showModal();
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(end);
      window.removeEventListener("hashchange", route);
      window.removeEventListener("rf-session-expired", expired);
      window.removeEventListener("keydown", keyboard);
    };
  }, [refresh]);
  useEffect(() => {
    if (auth !== "in") return;
    const timer = setInterval(() => {
      api<Status>("/status")
        .then(setStatus)
        .catch(() => {});
      if (section === "messages") loadMessages(messagePage).catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, [auth, section, messagePage, loadMessages]);
  useEffect(() => {
    document
      .querySelectorAll<HTMLElement>(".rail,.top,main,.sl,#login")
      .forEach((element) => {
        element.inert = intro || (element.id !== "login" && auth !== "in");
      });
    const target = intro
      ? document.querySelector<HTMLElement>("#admin-splash .skip")
      : auth === "in"
        ? document.querySelector<HTMLElement>("#nav a")
        : document.querySelector<HTMLElement>("#lpw");
    target?.focus({ preventScroll: true });
  }, [auth, intro]);
  async function go(key: string) {
    try {
      await flush.current?.();
      location.hash = "#" + key;
      pal.current?.close();
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function signOut() {
    try {
      await flush.current?.();
      await api("/logout", { method: "POST", body: "{}" });
      setCsrf("");
      setAuth("out");
      setContent(null);
    } catch (e) {
      setError(errorText(e));
    }
  }
  const resource = sections.slice(1, 6).some((s) => s[0] === section)
    ? (section as ResourceName)
    : null;
  const key =
    resource === "stack-groups"
      ? "stack"
      : resource === "assistant-presets"
        ? "assistant"
        : resource;
  const rows = key && content ? (content[key] as Row[]) : [];
  const current = rows.find((row) => row.id === selected) || rows[0];
  async function save(row: Row) {
    if (!resource) return;
    setSaveStatus("● saving…");
    try {
      const saved = await api<Row>("/" + resource + "/" + row.id, {
        method: "PATCH",
        body: JSON.stringify(row),
      });
      setContent((c) =>
        c && key
          ? {
              ...c,
              [key]: (c[key] as Row[]).map((item) =>
                item.id === saved.id ? saved : item,
              ),
            }
          : c,
      );
      setSaveStatus("● saved");
      await updatePreview();
    } catch (e) {
      setSaveStatus("● not saved — retry");
      throw e;
    }
  }
  async function create() {
    if (!resource) return;
    setBusy(true);
    try {
      await flush.current?.();
      const defaults: Record<string, unknown> = {
        projects: { title: "Untitled project", slug: "", sort: rows.length },
        experience: { role: "New role", sort: rows.length },
        certificates: { name: "New certificate", sort: rows.length },
        "stack-groups": { name: "New group", sort: rows.length },
        "assistant-presets": { question: "New question", sort: rows.length },
      };
      const row = await api<Row>("/" + resource, {
        method: "POST",
        body: JSON.stringify(defaults[resource]),
      });
      setContent((c) => (c && key ? { ...c, [key]: [...c[key], row] } : c));
      setSelected(row.id!);
      await updatePreview();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (
      !resource ||
      !current ||
      !confirm(
        "Delete this draft entry? The live site changes after you publish.",
      )
    )
      return;
    try {
      await flush.current?.();
      await api("/" + resource + "/" + current.id, { method: "DELETE" });
      setContent((c) =>
        c && key
          ? {
              ...c,
              [key]: (c[key] as Row[]).filter((row) => row.id !== current.id),
            }
          : c,
      );
      setSelected(null);
      await updatePreview();
      notify("Draft entry deleted.");
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function reorder(direction: number) {
    if (!resource || !current) return;
    try {
      await flush.current?.();
      const ordered = [...rows],
        from = ordered.findIndex((r) => r.id === current.id),
        to = from + direction;
      if (to < 0 || to >= ordered.length) return;
      [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
      await api("/" + resource + "/order", {
        method: "PUT",
        body: JSON.stringify({ ids: ordered.map((r) => r.id) }),
      });
      setContent((c) =>
        c && key
          ? { ...c, [key]: ordered.map((r, sort) => ({ ...r, sort })) }
          : c,
      );
      await updatePreview();
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function review() {
    try {
      await flush.current?.();
      await updatePreview();
      pub.current?.showModal();
    } catch (e) {
      setError(errorText(e));
    }
  }
  async function publish() {
    if (!preview) return;
    setBusy(true);
    try {
      await flush.current?.();
      const result = await api<{ commitHash: string; revalidated: boolean }>(
        "/publish",
        {
          method: "POST",
          body: JSON.stringify({ revision: preview.revision }),
        },
      );
      pub.current?.close();
      await refresh();
      notify(
        result.revalidated
          ? "Published · " + result.commitHash
          : "Published. Use Refresh live site in Review & publish to retry the cache refresh.",
      );
    } catch (e) {
      setError(errorText(e));
      await updatePreview().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  const control =
    (
      id: string,
      handler: () => void,
      extra: Record<string, unknown> = {},
    ): Overrides[string] =>
    (node, props, children) =>
      createElement(
        node.tag,
        { ...props, ...extra, onClick: handler },
        children,
      );
  const overrides: Overrides = {
    "admin-splash": (node, props, children) =>
      intro
        ? createElement(
            "div",
            {
              ...props,
              hidden: false,
              className: props.className + (leaving ? " is-leaving" : ""),
              onClick: (event: React.MouseEvent) => {
                if ((event.target as Element).closest(".skip")) {
                  setIntro(false);
                  document.documentElement.classList.remove("splash");
                }
              },
              onKeyDown: (event: React.KeyboardEvent) => {
                if (event.key === "Escape") {
                  setIntro(false);
                  document.documentElement.classList.remove("splash");
                }
              },
            },
            children,
          )
        : null,
    nav: sections.map(([id, label], i) => (
      <li key={id}>
        <a
          className={"nv" + (section === id ? " on" : "")}
          href={"#" + id}
          aria-current={section === id ? "page" : undefined}
          onClick={(event) => {
            event.preventDefault();
            void go(id);
          }}
        >
          <b>{String(i + 1).padStart(2, "0")}</b>
          <span className="lb">{label}</span>
          {id === "messages" && <em>{status?.unread || ""}</em>}
        </a>
      </li>
    )),
    path: (
      <>
        ~/admin/<b>{section}</b>
      </>
    ),
    pubBtn: control("pubBtn", () => void review(), {
      disabled: auth !== "in" || busy,
    }),
    pc: preview?.changes.length || 0,
    palBtn: control("palBtn", () => pal.current?.showModal()),
    thBtn: control("thBtn", () => theme(document.getElementById("thBtn")!)),
    outBtn: control("outBtn", () => void signOut()),
    "login-theme": control("login-theme", () =>
      theme(document.getElementById("login-theme")!),
    ),
    "v-overview": (node, props) =>
      createElement(
        node.tag,
        { ...props, className: "view" + (section === "overview" ? " on" : "") },
        content ? (
          <Overview
            content={content}
            status={status}
            analytics={analytics}
            messages={messages}
          />
        ) : (
          <p className="mono">
            {auth === "in"
              ? "Loading your workspace…"
              : "Sign in to open your workspace."}
          </p>
        ),
      ),
    "v-projects": () => null,
    "v-gen": () =>
      resource ? (
        <section className="view on" aria-label="Content editor">
          <p className="lbl">
            {String(sections.findIndex((s) => s[0] === section) + 1).padStart(
              2,
              "0",
            )}{" "}
            / content
          </p>
          <h1 className="h1">
            {sections.find((s) => s[0] === section)?.[1]}
            <i>.</i>
          </h1>
          <div className="split">
            <div>
              <div className="ph">
                <span className="lbl">{rows.length} items</span>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => void create()}
                >
                  + New
                </button>
              </div>
              <div>
                {rows.map((row) => (
                  <button
                    className={"row" + (row.id === current?.id ? " on" : "")}
                    key={row.id}
                    onClick={async () => {
                      try {
                        await flush.current?.();
                        setSelected(row.id!);
                      } catch (e) {
                        setError(errorText(e));
                      }
                    }}
                  >
                    <strong>{title(row)}</strong>
                    <span className="mono">
                      {String(row.status || "draft")}
                    </span>
                    <span className="mono">
                      {row.featured ? "★ " : ""}
                      {row.isExample ? "example" : ""}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {current ? (
              <EntryEditor
                key={resource + "-" + current.id}
                row={current}
                resource={resource}
                media={media}
                save={save}
                flush={flush}
                setError={setError}
                setSaveStatus={setSaveStatus}
                remove={() => void remove()}
                reorder={(d) => void reorder(d)}
                upload={async (file) => {
                  const data = new FormData();
                  data.set("file", file);
                  const image = await api<Media>("/media", {
                    method: "POST",
                    body: data,
                  });
                  setMedia((items) => [image, ...items]);
                  return image;
                }}
              />
            ) : (
              <p className="mono">No entries yet. Add your first one.</p>
            )}
          </div>
        </section>
      ) : section === "settings" && content ? (
        <section className="view on">
          <p className="lbl">08 / site</p>
          <h1 className="h1">
            Settings<i>.</i>
          </h1>
          <CredentialsEditor />
          <SettingsEditor
            settings={content.settings}
            save={async (settings) => {
              setSaveStatus("● saving…");
              const updated = await api<Settings>("/settings", {
                method: "PUT",
                body: JSON.stringify(settings),
              });
              setContent((c) => (c ? { ...c, settings: updated } : c));
              setSaveStatus("● saved");
              await updatePreview();
              notify("Settings saved to draft.");
            }}
            setError={setError}
          />
        </section>
      ) : section === "media" ? (
        <section className="view on">
          <p className="lbl">09 / assets</p>
          <h1 className="h1">
            Media<i>.</i>
          </h1>
          <MediaLibrary
            media={media}
            reload={async () => setMedia(await api<Media[]>("/media"))}
            setError={setError}
          />
        </section>
      ) : null,
    "v-messages": (node, props) =>
      section === "messages"
        ? createElement(
            node.tag,
            { ...props, className: "view on" },
            <>
              <p className="lbl">07 / inbox</p>
              <h1 className="h1">
                Messages<i>.</i>
              </h1>
              <Inbox
                messages={messages}
                page={messagePage}
                total={messageTotal}
                setPage={async (page) => {
                  setMessagePage(page);
                  await loadMessages(page);
                }}
                update={async (id, method, body) => {
                  await api("/messages/" + id, {
                    method,
                    body: JSON.stringify(body),
                  });
                  await loadMessages(messagePage);
                  setStatus(await api<Status>("/status"));
                }}
              />
            </>,
          )
        : null,
    mode: "NORMAL",
    slp: "~/admin/" + section,
    slc: saveStatus,
    pub: (node, props) =>
      createElement(
        node.tag,
        { ...props, ref: pub },
        <>
          <div className="bd">
            <p className="lbl">git diff --stat</p>
            <h2 style={{ margin: ".3rem 0", font: "600 1.6rem var(--fd)" }}>
              Review changes
            </h2>
            <div className="dl">
              {preview?.changes.length ? (
                preview.changes.map((change, i) => (
                  <div key={i} className="diff-entry">
                    <p className="mono">
                      <b>{change.kind}</b> · {change.entity}/{change.slug}
                    </p>
                    {change.fields.map((field) => (
                      <details key={field.name}>
                        <summary>{field.name}</summary>
                        <div className="diff-values">
                          <pre>− {JSON.stringify(field.from, null, 2)}</pre>
                          <pre>+ {JSON.stringify(field.to, null, 2)}</pre>
                        </div>
                      </details>
                    ))}
                  </div>
                ))
              ) : (
                <p>Everything is up to date.</p>
              )}
            </div>
            <p className="mono mu">
              Revalidate: {preview?.revalidate.join(" · ")}
            </p>
            <button
              className="tl"
              disabled={refreshingCache || busy}
              onClick={async () => {
                setRefreshingCache(true);
                try {
                  const result = await api<{ revalidated: boolean }>(
                    "/publish/revalidate",
                    { method: "POST", body: "{}" },
                  );
                  notify(
                    result.revalidated
                      ? "Public cache refreshed."
                      : "Couldn’t refresh the cache. Check the web server connection.",
                  );
                } catch (e) {
                  setError(errorText(e));
                } finally {
                  setRefreshingCache(false);
                }
              }}
            >
              {refreshingCache ? "Refreshing…" : "Refresh live site ↻"}
            </button>
          </div>
          <div className="acts">
            <button className="btn" onClick={() => pub.current?.close()}>
              Cancel
            </button>
            <button
              className="pub"
              disabled={!preview?.changes.length || busy}
              onClick={() => void publish()}
            >
              {busy ? "Publishing…" : "Publish"}
            </button>
          </div>
        </>,
      ),
    pal: (node, props) =>
      createElement(
        node.tag,
        { ...props, ref: pal },
        <>
          <input
            id="palIn"
            placeholder="Type a command…"
            aria-label="Command"
            value={palette}
            onChange={(e) => setPalette(e.target.value)}
          />
          <ul id="palL">
            {sections
              .filter((s) => s[1].toLowerCase().includes(palette.toLowerCase()))
              .map(([key, label]) => (
                <li key={key}>
                  <button className="tl" onClick={() => void go(key)}>
                    Go to {label}
                  </button>
                </li>
              ))}
            <li>
              <button
                className="tl"
                onClick={() => {
                  theme();
                  pal.current?.close();
                }}
              >
                Toggle theme
              </button>
            </li>
          </ul>
        </>,
      ),
    login: (node, props, children) =>
      createElement(node.tag, { ...props, hidden: auth === "in" }, children),
    lf: () => (
      <Login
        loading={auth === "loading"}
        done={async () => {
          setAuth("in");
          setError("");
          await refresh();
          notify("Welcome back. Your session lasts 12 hours.");
        }}
      />
    ),
    toast: toast,
  };
  // Replace only obsolete demo claims; all structural styling comes from the approved reference.
  function clean(nodes: DesignNode[]): DesignNode[] {
    return nodes.map((n) =>
      typeof n === "string"
        ? n
            .replace(
              "api 38 ms",
              status ? "api " + status.latency + " ms" : "api",
            )
            .replace("prototype · dummy data", "private workspace")
        : { ...n, children: clean(n.children) },
    );
  }
  return (
    <>
      <Design nodes={clean(tree as DesignNode[])} overrides={overrides} />
      {error && (
        <div className="admin-error" role="alert">
          <span>{error}</span>
          <button className="btn" onClick={() => setError("")}>
            Dismiss ×
          </button>
        </div>
      )}
    </>
  );
}

function Login({
  loading,
  done,
}: {
  loading: boolean;
  done: () => Promise<void>;
}) {
  const [step, setStep] = useState(1),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [retrySeconds, setRetrySeconds] = useState(0),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!retrySeconds) return;
    const timer = window.setInterval(
      () => setRetrySeconds((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [retrySeconds]);
  const retryTime = `${Math.floor(retrySeconds / 60)}:${String(retrySeconds % 60).padStart(2, "0")}`;
  const codeInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (step === 2) codeInput.current?.focus();
  }, [step]);
  return (
    <form
      id="lf"
      autoComplete="on"
      style={{ padding: "1.4rem 1.3rem 1.2rem", display: "grid", gap: "1rem" }}
      onSubmit={async (event) => {
        event.preventDefault();
        if (retrySeconds) return;
        setBusy(true);
        setError("");
        try {
          if (step === 1) {
            await api("/login", {
              method: "POST",
              body: JSON.stringify({ email, password }),
            });
            setStep(2);
            setPassword("");
          } else {
            const result = await api<{ csrfToken: string }>("/login/2fa", {
              method: "POST",
              body: JSON.stringify({ code }),
            });
            setCsrf(result.csrfToken);
            await done();
          }
        } catch (e) {
          setError(errorText(e));
          if (e instanceof ApiError && e.status === 429) {
            setError("");
            setRetrySeconds(e.retryAfter || 60);
          }
          if (e instanceof ApiError && e.status === 401 && step === 2)
            setCode("");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <p className="h1" style={{ fontSize: "2.6rem", margin: 0 }}>
          RF<i>.</i>
        </p>
        <p className="lbl" style={{ margin: ".4rem 0 0" }}>
          restricted · owner only
        </p>
      </div>
      {step === 1 ? (
        <div id="s1" style={{ display: "grid", gap: "1rem" }}>
          <Field label="Username or email">
            <input
              id="lu"
              className="in-t"
              autoComplete="username"
              placeholder="Enter your username or email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="password">
            <input
              id="lpw"
              className="in-t"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
        </div>
      ) : (
        <div id="s2" className="auth-step">
          <div className="auth-heading">
            <span className="auth-symbol" aria-hidden="true">
              ↳
            </span>
            <h2>
              One last step<span>.</span>
            </h2>
            <p>Enter the code from your authenticator.</p>
          </div>
          <label className="auth-code-label" htmlFor="lcode">
            6-digit code
          </label>
          <div className="auth-code-group">
            <input
              id="lcode"
              ref={codeInput}
              className="auth-code-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              spellCheck={false}
              aria-describedby="auth-code-hint lerr"
              aria-invalid={!!error}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              onPaste={(event) => {
                event.preventDefault();
                setCode(
                  event.clipboardData
                    .getData("text")
                    .replace(/\D/g, "")
                    .slice(0, 6),
                );
              }}
              required
            />
            <div className="auth-code-slots" aria-hidden="true">
              {Array.from({ length: 6 }, (_, index) => (
                <span
                  key={index}
                  className={
                    (code[index] ? "is-filled " : "") +
                    (index === Math.min(code.length, 5) ? "is-current" : "")
                  }
                >
                  {code[index] || <i />}
                </span>
              ))}
            </div>
          </div>
          <p id="auth-code-hint" className="mono mu">
            You can paste all six digits.
          </p>
          <button
            type="button"
            className="tl auth-back"
            onClick={() => {
              setStep(1);
              setCode("");
              setError("");
            }}
          >
            ← Back to password
          </button>
        </div>
      )}
      <p
        id="lerr"
        hidden={!error && !retrySeconds}
        className="mono"
        role="alert"
        style={{
          color: "var(--ak)",
          fontSize: ".72rem",
          minHeight: "1.1rem",
          margin: 0,
        }}
      >
        {retrySeconds
          ? `Too many incorrect attempts. Try again in ${retryTime}.`
          : error}
      </p>
      <button
        id="lbtn"
        className="pub"
        disabled={
          busy ||
          loading ||
          retrySeconds > 0 ||
          (step === 2 && code.length !== 6)
        }
        type="submit"
        style={{ justifyContent: "center" }}
      >
        {loading
          ? "Checking session…"
          : retrySeconds
            ? `Try again in ${retryTime}`
            : busy
              ? "One moment…"
              : step === 1
                ? "Continue →"
                : "Open dashboard →"}
      </button>
      <p className="mono mu" style={{ fontSize: ".64rem", margin: 0 }}>
        {step === 1
          ? "Your workspace. Sign in to make it yours."
          : "A little extra security for your workspace."}
      </p>
    </form>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="f">
      <span className="lbl">{label}</span>
      {children}
      {hint && <span className="mono mu field-hint">{hint}</span>}
    </label>
  );
}

const fields: Record<ResourceName, [string, string, boolean?][]> = {
  projects: [
    ["title", "Title"],
    ["slug", "URL slug"],
    ["description", "Description", true],
    ["role", "My role"],
    ["type", "Project type"],
    ["tech", "Tech (comma separated)"],
    ["contribution", "What I worked on", true],
    ["challenge", "The tricky part", true],
    ["results", "What changed", true],
    ["liveUrl", "Live demo URL"],
    ["repoUrl", "Repository URL"],
    ["featuredOrder", "Featured order"],
  ],
  experience: [
    ["role", "Role"],
    ["company", "Organization"],
    ["period", "Period"],
    ["description", "Contribution", true],
  ],
  certificates: [
    ["name", "Name"],
    ["issuer", "Issuer"],
    ["year", "Year"],
    ["credentialId", "Credential ID"],
    ["credentialUrl", "Credential URL"],
  ],
  "stack-groups": [
    ["name", "Group"],
    ["items", "Items (comma separated)", true],
  ],
  "assistant-presets": [
    ["question", "Question"],
    ["answer", "Answer", true],
    ["command", "Command (e.g. /about)"],
    ["label", "Button label"],
    ["goSection", "Open section after answer"],
  ],
};
function EntryEditor({
  row,
  resource,
  media,
  save,
  flush,
  setError,
  setSaveStatus,
  remove,
  reorder,
  upload,
}: {
  row: Row;
  resource: ResourceName;
  media: Media[];
  save: (row: Row) => Promise<void>;
  flush: React.MutableRefObject<(() => Promise<void>) | null>;
  setError: (s: string) => void;
  setSaveStatus: (s: string) => void;
  remove: () => void;
  reorder: (d: number) => void;
  upload: (file: File) => Promise<Media>;
}) {
  const [value, setValue] = useState<Row>(row),
    [locale, setLocale] = useState("en"),
    [uploading, setUploading] = useState(false),
    [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const latest = useRef(value),
    saved = useRef(JSON.stringify(row)),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    chain = useRef(Promise.resolve()),
    saveFn = useRef(save);
  saveFn.current = save;
  const persist = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    const candidate = latest.current,
      encoded = JSON.stringify(candidate);
    if (encoded === saved.current) return;
    const operation = chain.current
      .catch(() => {})
      .then(async () => {
        if (encoded === saved.current) return;
        try {
          await saveFn.current(candidate);
          saved.current = encoded;
          setFieldErrors({});
        } catch (e) {
          if (e instanceof ApiError) setFieldErrors(e.fields);
          setSaveStatus("● not saved — retry");
          setError(errorText(e));
          throw e;
        }
      });
    chain.current = operation;
    await operation;
  }, [setError, setSaveStatus]);
  useEffect(() => {
    flush.current = persist;
    return () => {
      if (timer.current) clearTimeout(timer.current);
      flush.current = null;
    };
  }, [flush, persist]);
  function change(field: string, next: unknown) {
    let updated: Row;
    if (
      locale === "id" &&
      ![
        "slug",
        "tech",
        "categories",
        "status",
        "featured",
        "featuredOrder",
        "isExample",
        "imageId",
        "imageUrl",
        "liveUrl",
        "repoUrl",
        "items",
        "command",
        "goSection",
        "credentialId",
        "credentialUrl",
        "year",
        "period",
      ].includes(field)
    ) {
      updated = {
        ...latest.current,
        translations: {
          id: { ...latest.current.translations.id, [field]: String(next) },
        },
      };
    } else updated = { ...latest.current, [field]: next };
    latest.current = updated;
    setValue(updated);
    setSaveStatus("● unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist().catch(() => {}), 700);
  }
  function get(field: string) {
    if (locale === "id" && value.translations.id[field] !== undefined)
      return value.translations.id[field];
    const result = value[field];
    return Array.isArray(result) ? result.join(", ") : String(result ?? "");
  }
  return (
    <>
      <form
        className="form"
        id={resource === "projects" ? "form" : "gform"}
        onSubmit={(event) => {
          event.preventDefault();
          void persist().catch(() => {});
        }}
      >
        <div className="editor-actions">
          <div className="seg">
            <button
              type="button"
              aria-pressed={locale === "en"}
              onClick={() => setLocale("en")}
            >
              English
            </button>
            <button
              type="button"
              aria-pressed={locale === "id"}
              onClick={() => setLocale("id")}
            >
              Indonesia
            </button>
          </div>
          <button className="btn" type="submit">
            Save draft
          </button>
        </div>
        <p className="mono mu field-hint">
          Changes save automatically. Review &amp; publish when you’re ready.
        </p>
        {fields[resource].map(([field, label, multiline]) => (
          <Field key={field} label={label} hint={fieldErrors[field]}>
            {field === "goSection" ? (
              <select
                className="in-t"
                value={get(field)}
                onChange={(e) => change(field, e.target.value)}
              >
                {[
                  "",
                  "about",
                  "stack",
                  "projects",
                  "experience",
                  "certificates",
                  "contact",
                ].map((v) => (
                  <option value={v} key={v}>
                    {v || "Stay here"}
                  </option>
                ))}
              </select>
            ) : multiline ? (
              <textarea
                className="in-t"
                aria-invalid={!!fieldErrors[field]}
                value={get(field)}
                onChange={(e) =>
                  change(
                    field,
                    field === "items"
                      ? e.target.value.split(",").map((s) => s.trim())
                      : e.target.value,
                  )
                }
              />
            ) : (
              <input
                className="in-t"
                aria-invalid={!!fieldErrors[field]}
                type={field === "featuredOrder" ? "number" : "text"}
                min={field === "featuredOrder" ? 0 : undefined}
                value={get(field)}
                onChange={(e) =>
                  change(
                    field,
                    field === "featuredOrder"
                      ? Number(e.target.value)
                      : e.target.value,
                  )
                }
              />
            )}
          </Field>
        ))}
        {resource === "projects" && (
          <>
            <Field label="Categories">
              <div className="chips">
                {categories.map(([key, label]) => (
                  <button
                    className="chip"
                    type="button"
                    key={key}
                    aria-pressed={(value.categories as string[]).includes(key)}
                    onClick={() =>
                      change(
                        "categories",
                        (value.categories as string[]).includes(key)
                          ? (value.categories as string[]).filter(
                              (c) => c !== key,
                            )
                          : [...(value.categories as string[]), key],
                      )
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Status">
              <div className="seg">
                {["draft", "published"].map((status) => (
                  <button
                    type="button"
                    key={status}
                    aria-pressed={value.status === status}
                    onClick={() => change("status", status)}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Featured">
              <div className="seg">
                <button
                  type="button"
                  aria-pressed={!!value.featured}
                  onClick={() => change("featured", !value.featured)}
                >
                  ★ featured
                </button>
              </div>
            </Field>
          </>
        )}
        {"isExample" in value && (
          <Field label="Label">
            <div className="seg">
              <button
                type="button"
                aria-pressed={!!value.isExample}
                onClick={() => change("isExample", !value.isExample)}
              >
                marked EXAMPLE
              </button>
            </div>
          </Field>
        )}
        {(resource === "projects" || resource === "certificates") && (
          <>
            <Field
              label="Image"
              hint="Choose a library image, or upload below. Save and publish this entry to show it on the portfolio."
            >
              <select
                className="in-t"
                value={String(value.imageId || "")}
                onChange={(e) => {
                  const image = media.find(
                    (m) => m.id === Number(e.target.value),
                  );
                  latest.current = {
                    ...latest.current,
                    imageId: image?.id || null,
                  };
                  change("imageUrl", image?.url || "");
                }}
              >
                <option value="">No image</option>
                {media.map((image) => (
                  <option key={image.id} value={image.id}>
                    {image.alt || image.filename}
                  </option>
                ))}
              </select>
            </Field>
            <label className="drop">
              {uploading
                ? "Converting to WebP…"
                : "Choose screenshot → WebP · max 5 MB"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={uploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  try {
                    await persist();
                    const image = await upload(file);
                    latest.current = { ...latest.current, imageId: image.id };
                    change("imageUrl", image.url);
                  } catch (error) {
                    setError(errorText(error));
                  } finally {
                    setUploading(false);
                    e.target.value = "";
                  }
                }}
              />
            </label>
          </>
        )}
        <div className="editor-actions">
          <button type="button" className="btn" onClick={() => reorder(-1)}>
            ↑ Move up
          </button>
          <button type="button" className="btn" onClick={() => reorder(1)}>
            ↓ Move down
          </button>
          <button type="button" className="btn danger" onClick={remove}>
            Delete
          </button>
        </div>
      </form>
      <div className="pvw">
        <div className="ph">
          <span className="lbl">Live preview</span>
          <span className="lbl">draft · {locale.toUpperCase()}</span>
        </div>
        <div className="pv">
          <article className="pcard">
            <div className="a">
              <span>{String(value.type || resource)} / preview</span>
              <span>{String(value.status || "draft")}</span>
            </div>
            {value.imageUrl ? (
              <img
                className="editor-image"
                src={String(value.imageUrl)}
                alt={title(value)}
              />
            ) : null}
            <h3>{get(fields[resource][0][0]) || "Untitled"}</h3>
            <div className="c">
              <p>
                {get(
                  resource === "assistant-presets" ? "answer" : "description",
                )}
              </p>
              {resource === "stack-groups" ? (
                (value.items as string[]).map((item, i) => (
                  <span className="tag" key={i}>
                    {item}
                  </span>
                ))
              ) : (
                <p className="mono">
                  {get("tech") || get("company") || get("issuer")}
                </p>
              )}
              {value.isExample ? <p className="lbl">Example entry</p> : null}
            </div>
          </article>
        </div>
      </div>
    </>
  );
}

function Overview({
  content,
  status,
  analytics,
  messages,
}: {
  content: SiteContent;
  status: Status | null;
  analytics: Analytics | null;
  messages: Message[];
}) {
  const examples = [
      ...content.projects,
      ...content.experience,
      ...content.certificates,
    ].filter((e) => e.isExample).length,
    images = content.projects.filter((p) => p.imageUrl).length,
    drafts = content.projects.filter((p) => p.status === "draft").length;
  const checklist = [
    [examples === 0, examples + " items still marked EXAMPLE"],
    [
      images === content.projects.length,
      images + " of " + content.projects.length + " projects have a screenshot",
    ],
    [drafts === 0, drafts + " drafts not published"],
    [
      !!content.settings.availability,
      "Availability " + (content.settings.availability ? "set" : "not set"),
    ],
  ];
  const done = checklist.filter((c) => c[0]).length,
    max = Math.max(1, ...(analytics?.daily.map((d) => d.uniques) || []));
  return (
    <>
      <p className="lbl">Control room · live data</p>
      <h1 className="h1" id="t-ov">
        All systems
        <br />
        quiet<i>.</i>
      </h1>
      <div className="g2">
        <div className="box">
          <div className="wh">
            <i />
            <i />
            <i />
            <span>zsh — rf status</span>
          </div>
          <div className="in">
            <p className="mono" style={{ margin: 0 }}>
              <span className="ak">$</span> rf status
            </p>
            <dl className="kv">
              <dt>api</dt>
              <dd>
                <span className="dot live" />
                {status ? "online · " + status.latency + " ms" : "checking…"}
              </dd>
              <dt>database</dt>
              <dd>mysql · {status?.database || "checking…"}</dd>
              <dt>last publish</dt>
              <dd>
                {status
                  ? "v" +
                    status.lastPublish.version +
                    " · " +
                    status.lastPublish.commitHash
                  : "—"}
              </dd>
              <dt>backup</dt>
              <dd>Configure scheduled backups on VPS</dd>
              <dt>revalidate</dt>
              <dd>Runs after publish</dd>
            </dl>
          </div>
        </div>
        <div className="box">
          <div className="in">
            <p className="lbl">Content checklist</p>
            <div className="bar">
              <i style={{ width: (done / 4) * 100 + "%" }} />
            </div>
            <p className="mono mu" style={{ fontSize: ".7rem" }}>
              {done} of 4 complete
            </p>
            {checklist.map(([ok, text], i) => (
              <div key={i} className={"ck" + (ok ? " ok" : "")}>
                <u>{ok ? "[x]" : "[ ]"}</u>
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="g2" style={{ marginTop: "1.25rem" }}>
        <div className="box">
          <div className="in">
            <p className="lbl">Activity · audit log</p>
            <ul className="log">
              {status?.activity.map((item) => (
                <li key={item.id}>
                  <b>#{item.id}</b>
                  {item.action} · {item.entity}{" "}
                  <em>· {new Date(item.createdAt).toLocaleDateString()}</em>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="box">
          <div className="in">
            <p className="lbl">Inbox</p>
            {messages.length ? (
              messages.slice(0, 3).map((m) => (
                <p className="mono inbox-summary" key={m.id}>
                  <span className={m.read ? "mu" : "ak"}>
                    {m.read ? "○" : "●"}
                  </span>{" "}
                  {m.name}{" "}
                  <span className="mu">
                    · {new Date(m.createdAt).toLocaleDateString()}
                  </span>
                </p>
              ))
            ) : (
              <p className="mono mu">
                No messages yet. Messages from Contact appear here.
              </p>
            )}
            <a className="mono ak" href="#messages">
              Open messages →
            </a>
          </div>
        </div>
      </div>
      <div className="box" style={{ marginTop: "1.25rem" }}>
        <div className="in">
          <div className="editor-actions">
            <p className="lbl">Visitors · last 14 days</p>
            <p className="mono mu field-hint">
              anonymous daily hash · no cookies · no raw IP
            </p>
          </div>
          <div className="stats">
            {[
              ["Today", analytics?.today || 0],
              ["Last 7 days", analytics?.last7 || 0],
              ["Last 14 days", analytics?.total || 0],
            ].map(([label, n]) => (
              <div key={label}>
                <b>{n}</b>
                <span>{label} · daily uniques</span>
              </div>
            ))}
          </div>
          <div
            className="spark"
            role="img"
            aria-label={
              "Daily unique visitors: " +
              analytics?.daily.map((d) => d.uniques).join(", ")
            }
          >
            {analytics?.daily.map((d, i) => (
              <i
                key={d.day}
                title={d.day + ": " + d.uniques}
                style={
                  {
                    height: Math.max(1, (d.uniques / max) * 100) + "%",
                    "--bar-index": i,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
          <div className="g2" style={{ marginTop: "1.1rem" }}>
            {[
              ["Top pages", analytics?.topPages.map((p) => [p.path, p.views])],
              [
                "Referrers",
                analytics?.referrers.map((p) => [p.source, p.views]),
              ],
            ].map(([label, items], i) => (
              <div key={i}>
                <p className="lbl">{label as string}</p>
                {(items as [string, number][] | undefined)?.length ? (
                  (items as [string, number][]).map(([name, count]) => (
                    <div className="vr" key={name}>
                      <span>{name}</span>
                      <span>{count} views</span>
                    </div>
                  ))
                ) : (
                  <p className="mono mu">No visits recorded yet.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
function Inbox({
  messages,
  page,
  total,
  setPage,
  update,
}: {
  messages: Message[];
  page: number;
  total: number;
  setPage: (p: number) => Promise<void>;
  update: (id: number, method: string, body: unknown) => Promise<void>;
}) {
  const [selected, setSelected] = useState<number | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const current = messages.find((m) => m.id === selected);
  async function action(id: number, method: string, body: unknown) {
    setBusy(true);
    try {
      await update(id, method, body);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="split message-split">
        <div>
          {messages.length ? (
            messages.map((m) => (
              <button
                key={m.id}
                className={"row" + (selected === m.id ? " on" : "")}
                onClick={() => {
                  setSelected(m.id);
                  if (!m.read) void action(m.id, "PATCH", { read: true });
                }}
              >
                <strong>
                  {!m.read && <span className="ak">● </span>}
                  {m.name}
                </strong>
                <span className="mono">
                  {new Date(m.createdAt).toLocaleDateString()}
                </span>
                <span className="mono">{m.body.slice(0, 55)}…</span>
              </button>
            ))
          ) : (
            <p className="mono mu">Your inbox is empty.</p>
          )}
          <div className="editor-actions">
            <button
              className="btn"
              disabled={page === 1}
              onClick={() => void setPage(page - 1)}
            >
              ← Previous
            </button>
            <span className="mono">
              {page} / {Math.max(1, Math.ceil(total / 50))}
            </span>
            <button
              className="btn"
              disabled={page * 50 >= total}
              onClick={() => void setPage(page + 1)}
            >
              Next →
            </button>
          </div>
        </div>
        <div className="msg">
          {current ? (
            <>
              <p className="lbl">
                {new Date(current.createdAt).toLocaleString()}
              </p>
              <h2>{current.name}</h2>
              <p>
                <a href={"mailto:" + encodeURIComponent(current.email)}>
                  {current.email}
                </a>
              </p>
              {current.phone && (
                <p>
                  <a href={"tel:" + current.phone}>{current.phone}</a>
                </p>
              )}
              <p className="message-body">{current.body}</p>
              <p className="mono mu">
                Consent given to use these details to reply.
              </p>
              <div className="editor-actions">
                <a
                  className="btn"
                  href={"mailto:" + encodeURIComponent(current.email)}
                >
                  Reply by email ↗
                </a>
                {current.phone && (
                  <a
                    className="btn"
                    href={"https://wa.me/" + current.phone.replace(/\D/g, "")}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    WhatsApp ↗
                  </a>
                )}
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() =>
                    void action(current.id, "PATCH", { read: !current.read })
                  }
                >
                  {current.read ? "Mark unread" : "Mark read"}
                </button>
                <button
                  className="btn danger"
                  disabled={busy}
                  onClick={() => {
                    if (confirm("Delete this message permanently?"))
                      void action(current.id, "DELETE", {});
                  }}
                >
                  Delete
                </button>
              </div>
            </>
          ) : (
            <p className="mono mu">Choose a message to read it.</p>
          )}
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
function CredentialsEditor() {
  const [value, setValue] = useState<OwnerCredentialsInput>({
    username: "",
    email: "",
    newPassword: "",
    currentPassword: "",
    code: "",
  });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let active = true;
    api<OwnerCredentials>("/credentials")
      .then((account) => {
        if (!active) return;
        setValue((current) => ({
          ...current,
          username: account.username,
          email: account.email,
        }));
        setReady(true);
        setError("");
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);
  const change = (field: keyof OwnerCredentialsInput, text: string) => {
    setValue((current) => ({ ...current, [field]: text }));
    setMessage("");
    setFields((current) => ({ ...current, [field]: "" }));
  };
  return (
    <details className="credentials-panel">
      <summary>
        <span>
          <span className="lbl">Account &amp; security</span>
          <strong>Your sign-in details</strong>
        </span>
        <span className="credentials-badge mono">
          2FA on <span aria-hidden="true">↗</span>
        </span>
      </summary>
      <form
        id="credentials-form"
        className="form"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          setMessage("");
          setFields({});
          const parsed = ownerCredentialsSchema.safeParse(value);
          if (!parsed.success) {
            const errors: Record<string, string> = {};
            for (const issue of parsed.error.issues)
              errors[String(issue.path[0])] = issue.message;
            setFields(errors);
            return;
          }
          if (value.newPassword !== confirmPassword) {
            setFields({ confirmPassword: "Passwords don’t match." });
            return;
          }
          setBusy(true);
          try {
            const result = await api<OwnerCredentials & { csrfToken: string }>(
              "/credentials",
              { method: "PATCH", body: JSON.stringify(parsed.data) },
            );
            setCsrf(result.csrfToken);
            setValue({
              username: result.username,
              email: result.email,
              newPassword: "",
              currentPassword: "",
              code: "",
            });
            setConfirmPassword("");
            setMessage("Saved. Your other sessions have been signed out.");
          } catch (e) {
            setError(errorText(e));
            if (e instanceof ApiError) setFields(e.fields);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="credentials-intro mono mu">
          Change how you sign in here. These details stay private and save
          immediately.
        </p>
        <fieldset disabled={!ready || busy}>
          <div className="g2">
            <Field
              label="Username"
              hint={
                fields.username ||
                "3–32 letters, numbers, dots, underscores or hyphens."
              }
            >
              <input
                className="in-t"
                autoComplete="username"
                value={value.username}
                onChange={(e) => change("username", e.target.value)}
                aria-invalid={!!fields.username}
                required
              />
            </Field>
            <Field
              label="Login email"
              hint={
                fields.email ||
                "This does not change your public contact email."
              }
            >
              <input
                className="in-t"
                type="email"
                autoComplete="email"
                value={value.email}
                onChange={(e) => change("email", e.target.value)}
                aria-invalid={!!fields.email}
                required
              />
            </Field>
            <Field
              label="New password"
              hint={
                fields.newPassword ||
                "At least 12 characters. Leave blank to keep your password."
              }
            >
              <input
                className="in-t"
                type="password"
                autoComplete="new-password"
                placeholder="Enter a new password"
                value={value.newPassword}
                onChange={(e) => change("newPassword", e.target.value)}
                aria-invalid={!!fields.newPassword}
                minLength={12}
                maxLength={128}
              />
            </Field>
            <Field label="Confirm new password" hint={fields.confirmPassword}>
              <input
                className="in-t"
                type="password"
                autoComplete="new-password"
                placeholder="Repeat your new password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setFields((f) => ({ ...f, confirmPassword: "" }));
                }}
                aria-invalid={!!fields.confirmPassword}
              />
            </Field>
          </div>
          <div className="credentials-verify">
            <p className="lbl">Confirm it’s you</p>
            <div className="g2">
              <Field label="Current password" hint={fields.currentPassword}>
                <input
                  className="in-t"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Your current password"
                  value={value.currentPassword}
                  onChange={(e) => change("currentPassword", e.target.value)}
                  aria-invalid={!!fields.currentPassword}
                  required
                />
              </Field>
              <Field
                label="Authenticator code"
                hint={
                  fields.code ||
                  "Just signed in? Wait for the next code before saving."
                }
              >
                <input
                  className="in-t credential-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  value={value.code}
                  onChange={(e) =>
                    change(
                      "code",
                      e.target.value.replace(/\D/g, "").slice(0, 6),
                    )
                  }
                  aria-invalid={!!fields.code}
                  pattern="[0-9]{6}"
                  required
                />
              </Field>
            </div>
          </div>
          <button className="pub" type="submit">
            {busy ? "Saving…" : "Save sign-in details →"}
          </button>
        </fieldset>
        {error && (
          <p className="credentials-error mono" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="credentials-success mono" role="status">
            ✓ {message}
          </p>
        )}
        {!ready && (
          <button
            className="btn"
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            Reload account details
          </button>
        )}
      </form>
    </details>
  );
}

function SettingsEditor({
  settings,
  save,
  setError,
}: {
  settings: Settings;
  save: (s: Settings) => Promise<void>;
  setError: (s: string) => void;
}) {
  const [value, setValue] = useState(settings),
    [busy, setBusy] = useState(false),
    [copy, setCopy] = useState(JSON.stringify(settings.copy, null, 2));
  return (
    <form
      className="form settings-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        try {
          await save({ ...value, copy: JSON.parse(copy) });
        } catch (e) {
          setError(errorText(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="g2">
        <div>
          <Field label="Site title">
            <input
              className="in-t"
              value={value.siteTitle}
              onChange={(e) =>
                setValue({ ...value, siteTitle: e.target.value })
              }
            />
          </Field>
          <Field label="Availability">
            <input
              className="in-t"
              value={value.availability}
              onChange={(e) =>
                setValue({ ...value, availability: e.target.value })
              }
            />
          </Field>
          {Object.entries(value.profile).map(([field, text]) => (
            <Field key={field} label={field}>
              {["description", "aboutCopy"].includes(field) ? (
                <textarea
                  className="in-t"
                  value={text}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      profile: { ...value.profile, [field]: e.target.value },
                    })
                  }
                />
              ) : (
                <input
                  className="in-t"
                  value={text}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      profile: { ...value.profile, [field]: e.target.value },
                    })
                  }
                />
              )}
            </Field>
          ))}
        </div>
        <div>
          <p className="lbl">Contact channels</p>
          {value.contact.map((contact, i) => (
            <div className="box in" key={i}>
              {["label", "value", "url"].map((field) => (
                <Field key={field} label={field}>
                  <input
                    className="in-t"
                    value={contact[field as "label" | "value" | "url"]}
                    onChange={(e) =>
                      setValue({
                        ...value,
                        contact: value.contact.map((c, n) =>
                          n === i ? { ...c, [field]: e.target.value } : c,
                        ),
                      })
                    }
                  />
                </Field>
              ))}
              <label className="mono">
                <input
                  type="checkbox"
                  checked={contact.isExample}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      contact: value.contact.map((c, n) =>
                        n === i ? { ...c, isExample: e.target.checked } : c,
                      ),
                    })
                  }
                />{" "}
                Example channel
              </label>
              <button
                className="tl danger"
                type="button"
                onClick={() =>
                  setValue({
                    ...value,
                    contact: value.contact.filter((_, n) => n !== i),
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            className="btn"
            type="button"
            disabled={value.contact.length >= 10}
            onClick={() =>
              setValue({
                ...value,
                contact: [
                  ...value.contact,
                  { label: "", value: "", url: "", isExample: true },
                ],
              })
            }
          >
            + Add channel
          </button>
          <p className="lbl" style={{ marginTop: "2rem" }}>
            Indonesian profile
          </p>
          {["description", "aboutCopy", "availability"].map((field) => (
            <Field key={field} label={field + " · ID"}>
              <textarea
                className="in-t"
                value={value.translations.id[field] || ""}
                onChange={(e) =>
                  setValue({
                    ...value,
                    translations: {
                      id: { ...value.translations.id, [field]: e.target.value },
                    },
                  })
                }
              />
            </Field>
          ))}
          <Field
            label="Copy overrides · JSON"
            hint={
              'Use {"Original text":{"en":"English","id":"Indonesia"}}. Layout stays the same.'
            }
          >
            <textarea
              className="in-t code-input"
              value={copy}
              onChange={(e) => setCopy(e.target.value)}
            />
          </Field>
        </div>
      </div>
      <button className="pub" disabled={busy} type="submit">
        {busy ? "Saving…" : "Save settings to draft"}
      </button>
    </form>
  );
}
function MediaLibrary({
  media,
  reload,
  setError,
}: {
  media: Media[];
  reload: () => Promise<void>;
  setError: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [alt, setAlt] = useState(""),
    [deleting, setDeleting] = useState<number | null>(null),
    [copied, setCopied] = useState<number | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );
  return (
    <>
      <p className="media-guide mono mu">
        Your image library. Upload here, then choose the image in Projects or
        Certificates. Save the entry and use Review &amp; publish to show it on
        your portfolio.
      </p>
      <div className="media-upload">
        <div className="media-upload-heading">
          <span className="lbl">Add to your library</span>
          <span className="mono mu">PNG / JPEG / WebP · up to 5 MB</span>
        </div>
        <Field label="Image description">
          <input
            className="in-t"
            placeholder="A short name to find it later"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
          />
        </Field>
        <label className="media-upload-picker">
          <span className="media-upload-icon" aria-hidden="true">
            ↑
          </span>
          <span className="media-upload-copy">
            <strong>
              {busy ? "Getting your image ready…" : "Choose an image"}
            </strong>
            <span>Optimized automatically for your portfolio.</span>
          </span>
          <span className="btn" aria-hidden="true">
            {busy ? "Uploading…" : "Browse files ↗"}
          </span>
          <input
            type="file"
            disabled={busy}
            accept="image/png,image/jpeg,image/webp"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setBusy(true);
              try {
                const form = new FormData();
                form.set("file", file);
                form.set("alt", alt);
                await api("/media", { method: "POST", body: form });
                await reload();
                setAlt("");
              } catch (e) {
                setError(errorText(e));
              } finally {
                setBusy(false);
                event.target.value = "";
              }
            }}
          />
        </label>
      </div>
      <div className="media-library-heading">
        <span className="lbl">Your images</span>
        <span className="mono mu">
          {media.length} {media.length === 1 ? "image" : "images"}
        </span>
      </div>
      <div className="media-grid">
        {!media.length && (
          <div className="media-empty">
            <span className="lbl">No images yet</span>
            <p>Start with a project screenshot or certificate.</p>
            <p className="mono mu">
              Uploading adds it to your library. Publishing the entry makes it
              visible on your site.
            </p>
          </div>
        )}
        {media.map((image) => (
          <article className="media-card" key={image.id}>
            <div className="media-card-preview">
              <img
                className="media-image"
                src={image.url}
                alt={image.alt || "Uploaded image"}
                loading="lazy"
              />
              <span className="media-format mono">WEBP</span>
            </div>
            <div className="media-card-info">
              <p className="media-card-number mono">
                ASSET / {String(image.id).padStart(3, "0")}
              </p>
              <h2>{image.alt || "Image #" + image.id}</h2>
              <p className="media-card-meta mono mu">
                <span>
                  {image.width} × {image.height}
                </span>
                <span>{Math.round(image.bytes / 1024)} KB</span>
              </p>
            </div>
            <div className="media-card-actions">
              <button
                className="media-copy"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(image.url);
                    setCopied(image.id);
                    if (copyTimer.current) clearTimeout(copyTimer.current);
                    copyTimer.current = setTimeout(() => setCopied(null), 2200);
                  } catch (e) {
                    setError(errorText(e));
                  }
                }}
              >
                <span aria-hidden="true">
                  {copied === image.id ? "✓" : "↗"}
                </span>{" "}
                {copied === image.id ? "Copied" : "Copy link"}
              </button>
              <button
                className="media-delete"
                aria-label={"Delete " + (image.alt || "Image #" + image.id)}
                disabled={busy || deleting !== null}
                onClick={async () => {
                  if (!confirm("Delete this unused image?")) return;
                  setDeleting(image.id);
                  try {
                    await api("/media/" + image.id, { method: "DELETE" });
                    await reload();
                  } catch (e) {
                    setError(errorText(e));
                  } finally {
                    setDeleting(null);
                  }
                }}
              >
                {deleting === image.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
