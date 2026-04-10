import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'

export default async function HomePage() {
  const { userId, orgId } = await auth()

  if (!userId) redirect('/login')
  if (!orgId) redirect('/onboarding')
  redirect('/devedores')
}
