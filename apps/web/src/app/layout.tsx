import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Quitr — Cobrança inteligente',
  description: 'Automação de cobrança e recuperação de crédito para empresas brasileiras',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      signInUrl="/login"
      signUpUrl="/cadastro"
      signInForceRedirectUrl="/devedores"
      signUpForceRedirectUrl="/onboarding"
      appearance={{
        variables: {
          colorPrimary: 'hsl(221.2 83.2% 53.3%)',
          borderRadius: '0.5rem',
        },
      }}
    >
      <html lang="pt-BR">
        <body className={inter.className}>{children}</body>
      </html>
    </ClerkProvider>
  )
}
