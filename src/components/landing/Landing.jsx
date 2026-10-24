'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowUpRight,
  ArrowRight,
  ArrowUp,
  Menu,
  X,
  Plus,
  Minus,
  Check,
  CalendarDays,
  Clock3,
  ShieldCheck,
  MapPin,
  Sparkles,
} from 'lucide-react'
import s from './site.module.css'
import { CalendraLogo } from '@/components/paper/CalendraMark'

/* Same-origin App Router handlers own validation, delivery configuration and credentials.
   Only an accepted server response can produce a success message. */
const FORM_ENDPOINTS = {
  contact: '/api/contact',
  newsletter: '/api/newsletter',
}
const NAV = [
  { label: 'Home', href: '#top' },
  { label: 'Product', href: '#product' },
  { label: 'Pricing', href: '#plans' },
  { label: 'FAQs', href: '#questions' },
  { label: 'Contact', href: '#contact' },
]

const FAQ = [
  [
    'What happens when everything won’t fit?',
    'You get a clear capacity report, not an impossibly busy calendar. Calendra shows what could not be placed so you can change the scope, deadline or available hours.',
  ],
  [
    'Does AI decide when I work?',
    'AI interprets your tasks and requests. A constraint-based scheduling engine places the work around your hours, meetings and protected time. You review the result.',
  ],
  [
    'Will it change my Google Calendar automatically?',
    'No. Calendar access is a separate permission, and you approve specific blocks before they are written. You stay in control.',
  ],
  [
    'Can I use it without an AI subscription?',
    'Yes. The planner can use its rule-based mode without an external model. Live language-model features depend on the provider configured for your deployment.',
  ],
  [
    'Where are my tasks saved?',
    'Tasks and preferences are currently saved in your browser. Signing in connects your Google identity; it does not sync those tasks between devices.',
  ],
]
// Brand icons use inline SVG; Lucide supplies the interface icons.
function Github() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.86c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.95 0-1.1.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03A9.58 9.58 0 0 1 12 6.82c.85 0 1.71.11 2.51.34 1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.69 0 3.85-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.75c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
    </svg>
  )
}
function Linkedin() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM3 9h4v12H3V9Zm6 0h4v1.6c.6-1 1.7-1.9 3.5-1.9 3.7 0 4.5 2.4 4.5 5.5V21h-4v-6c0-1.5 0-3.3-2-3.3s-2.1 1.6-2.1 3.2V21H9V9Z" />
    </svg>
  )
}
// Use the same original mark and wordmark as the dashboard, auth pages and favicon.
function Mark() {
  return <CalendraLogo size={32} className={s.brand} />
}
function LinkButton({
  children,
  href = '/planner',
  secondary = false,
  className = '',
  ...rest
}) {
  return (
    <Link
      href={href}
      data-attention={!secondary && href === '/planner' ? true : undefined}
      className={`${s.button} ${secondary ? s.secondary : ''} ${className}`}
      {...rest}
    >
      {children}
      <ArrowUpRight size={17} />
    </Link>
  )
}

function Week({ compact = false }) {
  const blocks = [
    ['Deep work', '09:00 – 10:30', 0, 17, 31, 'sage'],
    ['Product review', '11:00 – 12:00', 0, 57, 21, 'clay'],
    ['Write the brief', '09:00 – 11:00', 1, 17, 42, 'sage'],
    ['Research', '14:00 – 15:00', 1, 70, 21, 'cream'],
    ['Focus time', '09:00 – 10:30', 2, 17, 31, 'sage'],
    ['Team sync', '11:00 – 12:00', 2, 57, 21, 'clay'],
    ['Build & refine', '09:00 – 11:00', 3, 17, 42, 'sage'],
    ['Read & reflect', '14:00 – 15:00', 3, 70, 21, 'cream'],
    ['Wrap up', '09:00 – 10:30', 4, 17, 31, 'sage'],
  ]
  return (
    <div
      className={`${s.week} ${compact ? s.compact : ''}`}
      role="figure"
      aria-label="Illustrative weekly schedule, not a live calendar"
    >
      <div className={s.weekTop}>
        <div>
          <span className={s.eyebrow}>YOUR WEEK, WITH ROOM TO BREATHE</span>
          <p className={s.weekTitle}>A little more possible.</p>
        </div>
        <CalendarDays size={20} />
      </div>
      <div className={s.weekDays}>
        {['MON', 'TUE', 'WED', 'THU', 'FRI'].map((d, i) => (
          <div key={d}>
            {d}
            <b>{19 + i}</b>
          </div>
        ))}
      </div>
      <div className={s.weekBody}>
        {Array.from({ length: 5 }, (_, i) => (
          <div className={s.gridCol} key={i} />
        ))}
        {blocks.map(([title, time, col, top, height, tone]) => (
          <div
            key={title}
            className={`${s.block} ${s[tone]}`}
            style={{
              left: `calc(${col * 20}% + 5px)`,
              top: `${Math.round(top * 3.2)}px`,
              height: `${Math.round(height * 3.2)}px`,
              width: 'calc(20% - 10px)',
            }}
          >
            <span>{title}</span>
            <small>{time}</small>
          </div>
        ))}
      </div>
      <div className={s.weekBottom}>
        <span>
          <i /> A realistic plan. Not a perfect fiction.
        </span>
        <span>Illustrative week</span>
      </div>
    </div>
  )
}
function Reveal({ children, className = '', ...props }) {
  return (
    <div className={`${s.reveal} ${className}`} data-reveal {...props}>
      {children}
    </div>
  )
}
function Counter({ value, label, suffix = '' }) {
  const ref = useRef(null),
    [count, setCount] = useState(value)
  useEffect(() => {
    let raf = 0
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    if (mq.matches) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          const start = performance.now()
          function tick(t) {
            const p = Math.min((t - start) / 1000, 1)
            setCount(Math.round(value * (1 - Math.pow(1 - p, 3))))
            if (p < 1) raf = requestAnimationFrame(tick)
          }
          setCount(0)
          raf = requestAnimationFrame(tick)
          observer.disconnect()
        }
      },
      { threshold: 0.5 },
    )
    observer.observe(ref.current)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [value])
  return (
    <div ref={ref} className={s.stat}>
      <strong aria-hidden="true">
        {count}
        <span>{suffix}</span>
      </strong>
      <span className={s.srOnly}>
        {value}
        {suffix}
      </span>
      <p>{label}</p>
    </div>
  )
}
function FAQs() {
  const [open, setOpen] = useState(0)
  return (
    <section className={`${s.section} ${s.faqSection}`} id="questions">
      <Reveal>
        <div className={s.sectionHeading}>
          <span className={s.eyebrow}>GOOD QUESTIONS</span>
          <h2>
            A little clarity
            <br />
            before you begin.
          </h2>
        </div>
        <div className={s.faq}>
          {FAQ.map(([q, a], i) => (
            <div key={q} className={s.faqItem}>
              <h3>
                <button
                  id={`question-${i}`}
                  aria-expanded={open === i}
                  aria-controls={`answer-${i}`}
                  onClick={() => setOpen(open === i ? null : i)}
                >
                  <span className={s.faqQuestion}>{q}</span>
                  {open === i ? (
                    <Minus size={18} aria-hidden="true" />
                  ) : (
                    <Plus size={18} aria-hidden="true" />
                  )}
                </button>
              </h3>
              <div
                id={`answer-${i}`}
                role="region"
                aria-labelledby={`question-${i}`}
                hidden={open !== i}
              >
                <p>{a}</p>
              </div>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  )
}
function Home() {
  return (
    <>
      <section className={s.hero}>
        <div className={s.orbit} aria-hidden="true" />
        <div className={s.heroInner}>
          <Reveal>
            <div className={s.pill}>
              <span /> LESS GUESSWORK. MORE GOOD WEEKS.
            </div>
            <h1>
              Your time is finite.
              <br />
              Your calendar
              <br />
              <em>should know that.</em>
            </h1>
            <p className={s.heroCopy}>
              Give it your tasks, deadlines and preferences. Calendra builds a
              realistic week — and tells you the truth when it doesn’t fit.
            </p>
            <div className={s.heroActions}>
              <LinkButton>Build my week</LinkButton>
              <Link className={s.textLink} href="#product">
                Meet your planner <ArrowRight size={16} />
              </Link>
            </div>
            <div className={s.heroFoot}>
              <ShieldCheck size={15} />
              <span>
                No card required. Your calendar stays in your control.
              </span>
            </div>
          </Reveal>
          <div className={s.heroVisual}>
            <div className={s.visualLabel}>
              <span>YOUR WEEK, AT A GLANCE</span>
            </div>
            <div
              className={s.calendarScroll}
              role="region"
              aria-label="Illustrative weekly calendar"
              tabIndex={0}
            >
              <Week />
            </div>
            <div className={s.floatingNote}>
              <span className={s.noteIcon}>
                <Check size={16} />
              </span>
              <div>
                <b>Enough space for the work.</b>
                <span>And the life around it.</span>
              </div>
            </div>
            <div className={s.smallOrbit} aria-hidden="true" />
          </div>
        </div>
        <div className={s.heroBase}>
          <span>BUILT FOR REAL LIFE, NOT JUST OPEN SLOTS.</span>
          <span>SCROLL TO FIND YOUR RHYTHM ↓</span>
        </div>
      </section>
      <section className={`${s.section} ${s.intro}`} id="product">
        <Reveal>
          <span className={s.eyebrow}>A BETTER RELATIONSHIP WITH TIME</span>
          <h2>
            Most calendars show what’s next.
            <br />
            Calendra asks <em>what’s possible.</em>
          </h2>
          <p>
            Busy isn’t the goal. A week you can actually finish is. Connect the
            dots between what matters, the energy you have, and the hours that
            are really yours.
          </p>
        </Reveal>
      </section>
      <section className={s.section} id="how-it-works">
        <div className={s.split}>
          <Reveal>
            <div className={s.number}>MAKE SENSE OF THE MESS</div>
            <h2>
              A head full of tasks.
              <br />
              <em>A clear place to start.</em>
            </h2>
            <p>
              Drop the to-dos, the deadlines, the “I really shoulds.” Turn a
              messy list into work with a realistic shape — without filling in a
              dozen fields first.
            </p>
            <Link href="#product" className={s.textLink}>
              See how it works <ArrowUpRight size={17} />
            </Link>
          </Reveal>
          <Reveal
            className={s.intake}
            role="figure"
            aria-label="Illustrative task intake"
          >
            <span className={s.eyebrow}>ON YOUR MIND</span>
            <blockquote>
              “Finish the proposal by Thursday. Three runs this week. Keep my
              mornings for deep work.”
            </blockquote>
            <div className={s.intakeLine}>
              <Sparkles size={17} /> A little structure. A lot less friction.
            </div>
            <div className={s.taskRow}>
              <i className={s.taskDot} />
              Finish proposal <span>THU · DEEP WORK</span>
            </div>
            <div className={s.taskRow}>
              <i className={s.taskDot} />
              Go for a run <span>3 × THIS WEEK</span>
            </div>
          </Reveal>
        </div>
      </section>
      <section className={`${s.section} ${s.softSection}`} id="features">
        <div className={`${s.split} ${s.reverse}`}>
          <Reveal
            className={s.capacity}
            role="figure"
            aria-label="Illustrative capacity report"
          >
            <div className={s.capacityTop}>
              <Clock3 size={20} />
              <span>THE HONEST ANSWER</span>
            </div>
            <h3>
              Too much week.
              <br />
              Not enough hours.
            </h3>
            <div className={s.capacityBar}>
              <span />
            </div>
            <div className={s.capacityNumbers}>
              <span>28h requested</span>
              <span>22h available</span>
            </div>
            <p>6 hours need a different plan.</p>
            <div className={s.capacityChoices}>
              <span>Reduce scope</span>
              <span>Move a deadline</span>
              <span>Make room</span>
            </div>
            <small>Illustrative capacity report</small>
          </Reveal>
          <Reveal>
            <div className={s.number}>KNOW YOUR LIMITS</div>
            <h2>
              “It doesn’t fit”
              <br />
              <em>is a useful answer.</em>
            </h2>
            <p>
              No squeezing eight hours of work into a four-hour afternoon. See
              what fits, what doesn’t, and what you can change. Make a trade-off
              before your week makes it for you.
            </p>
            <LinkButton href="#product" secondary>
              Meet the honest planner
            </LinkButton>
          </Reveal>
        </div>
      </section>
      <section className={`${s.section} ${s.statsSection}`}>
        <Reveal>
          <span className={s.eyebrow}>THE PLANNING PRINCIPLES</span>
          <div className={s.stats}>
            <Counter value={7} label="days, seen as one connected week" />
            <Counter value={1} label="realistic plan you can adjust" />
            <Counter value={0} label="calendar writes without your approval" />
          </div>
        </Reveal>
      </section>
      <Pricing preview />
      <FAQs />
      <section id="contact">
        <Contact />
      </section>
    </>
  )
}
const plans = [
  {
    name: 'Personal',
    price: 'Free',
    desc: 'For a week that feels like yours.',
    features: [
      'Task and deadline planning',
      'Working hours and focus preferences',
      'Capacity reports and manual adjustments',
      'Calendar export and approved Google sync',
    ],
    cta: 'Start planning',
    href: '/planner',
  },
  {
    name: 'Pro',
    price: 'Enquiry only',
    desc: 'For a bigger planning horizon.',
    features: [
      'Share your planning requirements',
      'Discuss history and longer horizons',
      'Help shape the next chapter',
    ],
    cta: 'Ask about Pro',
    inquiry: 'pro',
    href: '#contact',
    tag: 'REGISTER YOUR INTEREST',
  },
  {
    name: 'Teams',
    price: 'Enquiry only',
    desc: 'For people doing meaningful work together.',
    features: [
      'Discuss your team’s workflow',
      'Explore shared planning needs',
      'Talk through privacy requirements',
    ],
    cta: 'Ask about Teams',
    inquiry: 'teams',
    href: '#contact',
  },
]
function Pricing({ preview = false }) {
  return (
    <section className={`${s.section} ${s.pricing}`} id="plans">
      <Reveal>
        <div className={s.sectionHeading}>
          <span className={s.eyebrow}>ROOM FOR A BETTER WEEK</span>
          <h2>
            {preview ? (
              <>
                Start with a little clarity.
                <br />
                <em>Stay for the breathing room.</em>
              </>
            ) : (
              <>
                Simple plans.
                <br />
                <em>No calendar gymnastics.</em>
              </>
            )}
          </h2>
          <p>
            Start with Personal for free. Pro and Teams are enquiries only; no
            checkout or payment is taken.
          </p>
        </div>
        <div className={s.plans}>
          {plans.map((p, i) => (
            <article
              className={s.plan}
              data-plan={p.name}
              aria-label={`${p.name} plan`}
              key={p.name}
            >
              <span className={s.eyebrow}>
                {p.tag ||
                  (i === 0 ? 'YOUR PLACE TO START' : 'LET’S FIND YOUR FIT')}
              </span>
              <h3>{p.name}</h3>
              <p>{p.desc}</p>
              <div className={s.price}>{p.price}</div>
              <ul>
                {p.features.map((f) => (
                  <li key={f}>
                    <Check size={15} />
                    {f}
                  </li>
                ))}
              </ul>
              <LinkButton
                href={p.href}
                secondary={i !== 0}
                data-inquiry={p.inquiry}
                aria-describedby={
                  p.inquiry ? `${p.inquiry}-inquiry-help` : undefined
                }
              >
                {p.cta}
              </LinkButton>
              <p
                id={p.inquiry ? `${p.inquiry}-inquiry-help` : undefined}
                className={s.inquiryHint}
              >
                {p.inquiry
                  ? `Opens the contact form below with ${p.name} selected. No payment required.`
                  : 'Opens the free planner. No payment required.'}
              </p>
            </article>
          ))}
        </div>
      </Reveal>
    </section>
  )
}
function PageIntro({ label, title, text }) {
  return (
    <section className={s.pageIntro}>
      <Reveal>
        <span className={s.eyebrow}>{label}</span>
        <h2>{title}</h2>
        <p>{text}</p>
      </Reveal>
    </section>
  )
}
function Form({ newsletter = false }) {
  const [errors, setErrors] = useState({}),
    [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false),
    ref = useRef(null)
  async function submit(e) {
    e.preventDefault()
    if (busy) return
    const data = Object.fromEntries(new FormData(e.currentTarget))
    const next = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((data.email || '').trim()))
      next.email = 'Enter a valid email address.'
    if (!newsletter) {
      if (!(data.name || '').trim()) next.name = 'Enter your name.'
      if ((data.message || '').trim().length < 15)
        next.message = 'Please enter at least 15 characters.'
      if (!data.consent) next.consent = 'Please agree before sending.'
    }
    setErrors(next)
    setStatus('')
    if (Object.keys(next).length) {
      setTimeout(
        () => ref.current?.querySelector('[aria-invalid="true"]')?.focus(),
        0,
      )
      return
    }
    setBusy(true)
    try {
      const endpoint = FORM_ENDPOINTS[newsletter ? 'newsletter' : 'contact']
      if (!endpoint) throw Error('unavailable')
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!response.ok) throw Error('rejected')
      setStatus(
        newsletter
          ? 'You’re subscribed. Thanks for making room for us.'
          : 'Message received. Thank you for getting in touch.',
      )
      ref.current.reset()
    } catch {
      setStatus('We couldn’t send this right now. Please try again later.')
    } finally {
      setBusy(false)
    }
  }
  const id = newsletter ? 'newsletter' : 'contact'
  return (
    <form
      ref={ref}
      onSubmit={submit}
      noValidate
      aria-busy={busy}
      onInput={(event) => {
        const name = event.target.name
        if (name)
          setErrors((previous) => {
            if (!previous[name]) return previous
            const next = { ...previous }
            delete next[name]
            return next
          })
        setStatus('')
      }}
      className={newsletter ? s.newsletterForm : s.contactForm}
      aria-label={newsletter ? 'Newsletter subscription' : 'Contact Calendra'}
    >
      {!newsletter && (
        <div className={s.field}>
          <label htmlFor="contact-inquiry">
            What would you like to discuss?
          </label>
          <select id="contact-inquiry" name="inquiry" defaultValue="general">
            <option value="general">General question</option>
            <option value="pro">Pro enquiry</option>
            <option value="teams">Teams enquiry</option>
          </select>
          <p className={s.inquiryHint}>
            Your selection is included with your message. This form does not
            take payment.
          </p>
        </div>
      )}
      {!newsletter && (
        <div className={s.field}>
          <label htmlFor={`${id}-name`}>Your name</label>
          <input
            id={`${id}-name`}
            name="name"
            autoComplete="name"
            placeholder="Your full name"
            maxLength={120}
            required
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? `${id}-name-error` : undefined}
          />
          {errors.name && (
            <span id={`${id}-name-error`} className={s.error}>
              {errors.name}
            </span>
          )}
        </div>
      )}
      <div className={s.field}>
        <label htmlFor={`${id}-email`}>
          {newsletter ? 'Your email address' : 'Email address'}
        </label>
        <div className={s.inputRow}>
          <input
            id={`${id}-email`}
            type="email"
            name="email"
            autoComplete="email"
            placeholder={newsletter ? 'you@somewhere.good' : 'you@example.com'}
            required
            maxLength={254}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? `${id}-email-error` : undefined}
          />
          {newsletter && (
            <button disabled={busy} aria-label="Subscribe to newsletter">
              <ArrowRight size={20} />
            </button>
          )}
        </div>
        {errors.email && (
          <span id={`${id}-email-error`} className={s.error}>
            {errors.email}
          </span>
        )}
      </div>
      {!newsletter && (
        <>
          <div className={s.field}>
            <label htmlFor="contact-message">What’s on your mind?</label>
            <textarea
              id="contact-message"
              name="message"
              placeholder="How can we help with your planning?"
              rows={5}
              maxLength={4000}
              required
              aria-invalid={!!errors.message}
              aria-describedby={
                errors.message ? 'contact-message-error' : undefined
              }
            />
            {errors.message && (
              <span id="contact-message-error" className={s.error}>
                {errors.message}
              </span>
            )}
          </div>
          <label className={s.checkbox}>
            <input
              type="checkbox"
              name="consent"
              required
              aria-invalid={!!errors.consent}
              aria-describedby={
                errors.consent ? 'contact-consent-error' : undefined
              }
            />
            <span>
              I agree to the <Link href="/legal#privacy">privacy notice</Link>.
            </span>
          </label>
          {errors.consent && (
            <span id="contact-consent-error" className={s.error}>
              {errors.consent}
            </span>
          )}
          <button className={s.button} disabled={busy}>
            {busy ? 'Sending…' : 'Send message'}
            <ArrowUpRight size={17} />
          </button>
        </>
      )}
      <p role="status" aria-live="polite" className={s.formStatus}>
        {busy ? 'Sending…' : status}
      </p>
    </form>
  )
}
function Contact() {
  return (
    <>
      <PageIntro
        label="LET’S TALK"
        title={
          <>
            Good weeks start
            <br />
            <em>with a conversation.</em>
          </>
        }
        text="A question, a thoughtful suggestion, or a workflow worth untangling. We’d like to hear it."
      />
      <section className={`${s.section} ${s.contactGrid}`}>
        <Reveal>
          <h2>
            A real conversation.
            <br />
            Not another ticket.
          </h2>
          <p>
            Tell us what you’re trying to make room for. For account questions,
            please don’t include passwords, API keys or private calendar
            details.
          </p>
          <div className={s.contactDetail}>
            <MapPin size={19} />
            <span>
              Built in Hyderabad, India.
              <br />
              <small>Made for weeks everywhere.</small>
            </span>
          </div>
          <div
            className={s.map}
            role="img"
            aria-label="Decorative location illustration for Hyderabad, India"
          >
            <div className={s.mapRoad} />
            <MapPin size={30} />
            <b>HYDERABAD</b>
            <span>17.3850° N · 78.4867° E</span>
          </div>
        </Reveal>
        <Reveal>
          <Form />
        </Reveal>
      </section>
    </>
  )
}
function Footer() {
  return (
    <footer className={s.footer}>
      <div className={s.footerTop}>
        <div>
          <Mark />
          <h2>
            A better week.
            <br />A note now and then.
          </h2>
          <p>Thoughtful updates on planning, focus and making room.</p>
          <Form newsletter />
        </div>
        <div className={s.footerLinks}>
          <div>
            <h3>EXPLORE</h3>
            <Link href="#product">The planner</Link>
            <Link href="#plans">Pricing</Link>
            <Link href="#contact">Get in touch</Link>
            <Link href="/signin">Sign in</Link>
          </div>
          <div>
            <h3>THE DETAILS</h3>
            <Link href="/legal#privacy">Privacy</Link>
            <Link href="/legal#terms">Terms</Link>
            <Link href="/planner">
              Start planning <ArrowUpRight size={12} />
            </Link>
            <div className={s.social}>
              <Link
                href="https://github.com/K-Anjan25/Ai-calender-planner"
                aria-label="Calendra source on GitHub"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github size={18} />
              </Link>
              <Link
                href="https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fgithub.com%2FK-Anjan25%2FAi-calender-planner"
                aria-label="Share Calendra on LinkedIn"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Linkedin size={18} />
              </Link>
            </div>
          </div>
        </div>
        <div className={s.footerLocation}>
          <div className={s.tinyMap} aria-hidden="true">
            <MapPin size={24} />
          </div>
          <span>HYDERABAD, INDIA</span>
          <p>
            A small point on the map.
            <br />A little more room in your week.
          </p>
        </div>
      </div>
      <div className={s.footerBottom}>
        <span>© {new Date().getFullYear()} Calendra</span>
        <span>THE AI CALENDAR PLANNER</span>
        <Link href="#top">
          Back to a better week <ArrowUpRight size={14} />
        </Link>
      </div>
    </footer>
  )
}
export default function Landing() {
  const [menu, setMenu] = useState(false),
    [scrolled, setScrolled] = useState(false)
  const toggle = useRef(null),
    dialog = useRef(null),
    main = useRef(null)
  // All marketing sections are server-rendered by Next.js; motion enhances rather than hides them.
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add(s.visible)
            observer.unobserve(e.target)
          }
        })
      },
      { threshold: 0.08 },
    )
    document
      .querySelectorAll('[data-reveal]')
      .forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    let raf = 0
    function update() {
      const y = window.scrollY
      setScrolled(y > 40)
      raf = 0
    }
    function scroll() {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', scroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', scroll)
      cancelAnimationFrame(raf)
    }
  }, [])
  useEffect(() => {
    if (menu) {
      dialog.current?.showModal()
      document.body.style.overflow = 'hidden'
    } else {
      dialog.current?.close()
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [menu])
  function followAnchor(event) {
    const link = event.target.closest?.('a[href^="#"]')
    if (
      !link ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return
    const hash = link.getAttribute('href')
    const target = document.getElementById(hash.slice(1))
    if (!target) return
    event.preventDefault()
    // Run after drawer close/focus restoration, without letting Next reset scroll behavior.
    setTimeout(() => {
      target.scrollIntoView({
        block: 'start',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
      })
      if (!target.hasAttribute('tabindex'))
        target.setAttribute('tabindex', '-1')
      const inquiry = link.dataset.inquiry
      const selector = document.getElementById('contact-inquiry')
      if (selector && ['pro', 'teams'].includes(inquiry)) {
        selector.value = inquiry
        selector.dispatchEvent(new Event('input', { bubbles: true }))
        selector.focus({ preventScroll: true })
      } else target.focus({ preventScroll: true })
      if (window.location.hash !== hash)
        window.history.pushState(null, '', hash)
    }, 0)
  }
  function close() {
    setMenu(false)
    toggle.current?.focus()
  }
  return (
    <div className={s.app} id="top" onClickCapture={followAnchor}>
      <Link className={s.skip} href="#main-content">
        Skip to content
      </Link>
      <header className={`${s.header} ${scrolled ? s.headerScrolled : ''}`}>
        <div className={s.headerInner}>
          <div className={s.brandGroup}>
            <Link href="#top" aria-label="Calendra home">
              <Mark />
            </Link>
            <span className={s.headerTag}>THE AI CALENDAR PLANNER</span>
          </div>
          <button
            ref={toggle}
            className={s.menuButton}
            onClick={() => setMenu(true)}
            aria-expanded={menu}
            aria-controls="navigation-dialog"
          >
            <span>MENU</span>
            <Menu size={22} />
          </button>
        </div>
      </header>
      <dialog
        id="navigation-dialog"
        ref={dialog}
        className={s.menuDialog}
        aria-label="Main navigation"
        onCancel={(e) => {
          e.preventDefault()
          close()
        }}
        onClick={(e) => {
          if (e.target === dialog.current) close()
        }}
      >
        <div className={s.menuPanel}>
          <div className={s.menuTop}>
            <Mark />
            <button autoFocus onClick={close} aria-label="Close navigation">
              <X />
            </button>
          </div>
          <nav aria-label="Main">
            {NAV.map(({ label, href }) => (
              <Link key={href} href={href} onClick={close}>
                {label}
                <ArrowUpRight />
              </Link>
            ))}
            <Link href="/signin">
              Sign in
              <ArrowUpRight />
            </Link>
          </nav>
          <LinkButton href="/planner">Build my week</LinkButton>
          <p>Less guesswork. More good weeks.</p>
        </div>
      </dialog>
      <main id="main-content" ref={main} tabIndex={-1}>
        <Home />
      </main>
      <nav className={s.actionBar} aria-label="Planner actions">
        <LinkButton className={s.stickyCTA} data-bottom-cta>
          Build my week
        </LinkButton>
        <button
          className={s.backTop}
          aria-label="Back to top"
          onClick={() =>
            window.scrollTo({
              top: 0,
              behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
                ? 'instant'
                : 'smooth',
            })
          }
        >
          <ArrowUp size={18} aria-hidden="true" />
        </button>
      </nav>
      <Footer />
    </div>
  )
}
