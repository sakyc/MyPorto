/* eslint-disable @next/next/no-head-element, @next/next/no-page-custom-font, @next/next/no-css-tags -- Shared App Router root layout. Keep the approved CSS cascade and font link identical in both root layouts. */
import type { ReactNode } from "react";
const init = `(()=>{let t;try{t=localStorage.getItem('theme')}catch{}document.documentElement.dataset.theme=['light','dark'].includes(t)?t:matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';if(!matchMedia('(prefers-reduced-motion: reduce)').matches&&!location.hash.startsWith('#project')&&!location.pathname.startsWith('/projects'))document.documentElement.classList.add('splash')})();`;
export function DesignLayout({
  children,
  admin = false,
}: {
  children: ReactNode;
  admin?: boolean;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300..800&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: init }} />
        <link
          rel="stylesheet"
          href={admin ? "/design/admin-dashboard.css" : "/design/portfolio.css"}
        />
        {!admin && (
          <>
            <link rel="stylesheet" href="/design/refinements.css" />
            <link rel="stylesheet" href="/design/projects.css" />
            <link rel="stylesheet" href="/design/contact.css" />
          </>
        )}
        <link rel="stylesheet" href="/design/splash.css" />
        {admin && (
          <>
            <link rel="stylesheet" href="/design/admin-motion.css" />
            <link rel="stylesheet" href="/design/admin-live.css" />
          </>
        )}
      </head>
      <body>{children}</body>
    </html>
  );
}
