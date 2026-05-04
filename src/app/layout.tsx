import "./globals.css"

export const metadata = {
  title: "Task System",
  description: "Internal task system",
  manifest: "/manifest.json"
}

export const viewport = {
  themeColor: "#000000"
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