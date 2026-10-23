import { submitMarketing } from '@/lib/marketing'
export const runtime = 'nodejs'
export async function POST(request: Request) {
  return submitMarketing(request, 'newsletter')
}
