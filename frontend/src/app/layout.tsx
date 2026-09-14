import { ClientComponents } from '@/app/ClientComponents';
import './globals.css';

export const metadata = {
  title: 'ZYRAA',
  description: 'A project management and issue tracking system',
};

/**
 * The type stack is Segoe UI, set in globals.css, so the portal matches Azure
 * DevOps on Windows and falls back to the platform UI face elsewhere. No webfont
 * is loaded: the ambient gradient backdrop it used to sit on is gone too, since
 * ADO surfaces are flat.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ClientComponents>{children}</ClientComponents>
      </body>
    </html>
  );
}
