import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'eBird Life List Optimizer',
  description: 'Optimize your birding trips to maximize new species sightings',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
