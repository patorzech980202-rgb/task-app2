import "./globals.css"

export const metadata = {
  title: "Task System",
  description: "Internal task system",
  themeColor: "#000000",
  manifest: "/manifest.json"
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  )
}