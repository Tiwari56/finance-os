import "./globals.css";
import { Providers } from "./providers";

export const metadata = {
  title: "Finance OS — Nishit",
  description: "Daily debt-clearing command center",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
