import type { Metadata } from 'next'
import Landing from '@/components/landing/Landing'

export const metadata: Metadata = {
  title: 'Calendra — The AI calendar planner',
  description: 'Give Calendra your tasks, deadlines and preferences. It builds a realistic week and tells you when it does not fit.',
  openGraph: {
    title: 'Calendra — The AI calendar planner',
    description: 'A realistic week. An honest answer when it does not fit.',
    type: 'website',
  },
  twitter: { card: 'summary', title: 'Calendra — The AI calendar planner' },
}

export default function HomePage() {
  return <Landing />
}
