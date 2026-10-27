import { CalendraLogo } from '@/components/paper/CalendraMark'

export default function LoadingPage() {
  return (
    <main className="bauhaus-recovery" role="status" aria-live="polite">
      <CalendraLogo size={32} />
      <div className="bauhaus-auth-art my-10" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <p className="bauhaus-eyebrow mt-10">Loading Calendra…</p>
    </main>
  )
}
