import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import Script from 'next/script';
import './globals.css';
export const metadata: Metadata = {
  title: 'GE Opportunity Board',
  description: 'Global Encounters Opportunity Board',
  icons: { icon: '/favicon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&family=Questrial&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/icon?family=Material+Icons+Round"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Remove known extension attributes that can cause hydration mismatches
              try {
                var attrs = ['data-new-gr-c-s-check-loaded', 'data-gr-ext-installed'];
                var b = document && document.body;
                var h = document && document.documentElement;
                if (b) attrs.forEach(function(a){ if (b.hasAttribute && b.hasAttribute(a)) b.removeAttribute(a); });
                if (h) attrs.forEach(function(a){ if (h.hasAttribute && h.hasAttribute(a)) h.removeAttribute(a); });
              } catch (e) {}
            `,
          }}
        />
        <script src="https://cdn.tailwindcss.com?plugins=forms,typography" />
        <Script src="/resize-child.js?v=2" strategy="afterInteractive" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              tailwind.config = {
                darkMode: "class",
                theme: {
                  extend: {
                    colors: {
                      primary: "#00558C",
                      "primary-hover": "#00406A",
                      "background-light": "#F3F4F6",
                      "background-dark": "#000000",
                      "surface-light": "#ffffff",
                      "surface-dark": "#111111",
                    },
                    fontFamily: {
                      display: ["Questrial", "sans-serif"],
                      body: ["Montserrat", "sans-serif"],
                    },
                    borderRadius: {
                      DEFAULT: "0.5rem",
                      xl: "1rem",
                      "2xl": "1.5rem",
                      "3xl": "2rem",
                    },
                  },
                },
              };
            `,
          }}
        />
      </head>
      <body className="bg-background-light dark:bg-background-dark text-black dark:text-white font-body antialiased transition-colors duration-200">
        {children}
      </body>
    </html>
  );
}
