import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { CalendraLogo } from '@/components/paper/CalendraMark'

export function SiteFooter() {
  return (
    <footer className="bauhaus-site-footer">
      <div className="bauhaus-footer-inner">
        <div>
          <Link href="/" aria-label="Calendra home" className="bauhaus-brand">
            <CalendraLogo size={30} />
          </Link>
          <p>Good weeks, by design.</p>
          <div className="bauhaus-footer-shapes" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        </div>
        <nav aria-label="Product">
          <h2>Product</h2>
          <Link href="/planner">
            Planner
            <ArrowUpRight size={13} />
          </Link>
          <Link href="/#product">The product</Link>
          <Link href="/pricing">Plans</Link>
          <Link href="/#contact">Contact</Link>
        </nav>
        <nav aria-label="Account">
          <h2>Account</h2>
          <Link href="/signin">Sign in</Link>
          <Link href="/signup">Create an account</Link>
          <Link href="/planner">Connect Google Calendar</Link>
        </nav>
        <nav aria-label="Legal">
          <h2>Legal</h2>
          <Link href="/legal#terms">Terms</Link>
          <Link href="/legal#privacy">Privacy notice</Link>
        </nav>
      </div>
      <div className="bauhaus-footer-bottom">
        <span>© {new Date().getFullYear()} Calendra</span>
        <span>FORM FOLLOWS FOCUS.</span>
        <Link href="/">
          Back to home
          <ArrowUpRight size={14} />
        </Link>
      </div>
    </footer>
  )
}
