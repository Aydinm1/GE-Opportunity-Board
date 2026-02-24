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
    <html lang="en" suppressHydrationWarning>
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
        <Script src="/resize-child-v2.js" strategy="afterInteractive" />
      </head>
      <body suppressHydrationWarning className="bg-background-light dark:bg-background-dark text-black dark:text-white font-body antialiased transition-colors duration-200">
        {children}
      </body>
    </html>
  );
}
