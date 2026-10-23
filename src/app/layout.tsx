import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "iLead", template: "%s · iLead" },
  description: "The iLead leadership program at Rwanda Coding Academy.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  appleWebApp: { capable: true, title: "iLead" },
  icons: { apple: "/brand/push-192.png" },
};
const theme = `(function(){try{var t;try{t=localStorage.getItem('ilead-theme')}catch(e){}var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})()`;
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: theme }} />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
