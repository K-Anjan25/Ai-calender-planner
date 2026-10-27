'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  ArrowUp,
  Menu,
  X,
  Plus,
  Minus,
  Check,
  ShieldCheck,
  Clock3,
  SlidersHorizontal,
} from 'lucide-react';
import { CalendraLogo } from '@/components/paper/CalendraMark';
import s from './site.module.css';

const FORM_ENDPOINTS = {
  contact: '/api/contact',
  newsletter: '/api/newsletter',
};
const NAV = [
  ['How it works', '#how-it-works'],
  ['The product', '#product'],
  ['Plans', '#plans'],
  ['FAQs', '#questions'],
];
const FAQ = [
  [
    'What happens when everything won’t fit?',
    'An honest answer. Calendra shows what could not be placed and why. You choose whether to change the scope, deadline or available hours. It never quietly overbooks your week.',
  ],
  [
    'Does AI decide when I work?',
    'AI can interpret your tasks and requests. A deterministic scheduling engine places the work around your hours, meetings and protected time. You review and adjust the result.',
  ],
  [
    'Will it change my Google Calendar automatically?',
    'No. Connecting Google Calendar is a separate permission. You approve specific blocks before they are written, and can preview the proposed changes first.',
  ],
  [
    'Do I need an AI subscription?',
    'The rule-based planner works without an external model. Live language-model features depend on the provider configured for your deployment.',
  ],
  [
    'Where are my tasks saved?',
    'Your tasks and preferences are saved in this browser. Google sign-in does not currently sync your tasks across devices.',
  ],
];

function Button({ href, children, secondary = false, ...props }) {
  return (
    <Link
      href={href}
      className={`${s.button} ${secondary ? s.secondary : ''}`}
      {...props}
    >
      {children}
      <ArrowUpRight size={19} aria-hidden="true" />
    </Link>
  );
}
function Brand() {
  return <CalendraLogo size={32} />;
}

const BLOCKS = [
  {
    day: 0,
    row: 0,
    span: 2,
    name: 'Deep work',
    time: '09:00 — 11:00',
    color: 'blue',
  },
  { day: 0, row: 3, span: 1, name: 'Admin', time: '12:00', color: 'yellow' },
  { day: 1, row: 0, span: 1, name: 'Review', time: '09:00', color: 'yellow' },
  {
    day: 1,
    row: 2,
    span: 2,
    name: 'Research',
    time: '11:00 — 13:00',
    color: 'red',
  },
  {
    day: 2,
    row: 1,
    span: 2,
    name: 'Create',
    time: '10:00 — 12:00',
    color: 'blue',
  },
  { day: 2, row: 4, span: 1, name: 'Walk', time: '13:00', color: 'yellow' },
  {
    day: 3,
    row: 0,
    span: 2,
    name: 'Focus',
    time: '09:00 — 11:00',
    color: 'red',
  },
  { day: 3, row: 3, span: 1, name: 'Inbox', time: '12:00', color: 'yellow' },
  {
    day: 4,
    row: 1,
    span: 2,
    name: 'Finish',
    time: '10:00 — 12:00',
    color: 'blue',
  },
];
function Week() {
  return (
    <div className={s.poster}>
      <div className={s.posterTop}>
        <span>YOUR WEEK, IN GOOD SHAPE.</span>
        <span>MON — FRI</span>
      </div>
      <div className={s.posterShapes} aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div
        className={s.week}
        role="img"
        aria-label="Illustrative weekly calendar: focused work, admin and breaks arranged across Monday to Friday. This is a sample, not your live plan."
      >
        <div className={s.weekTop}>
          <span>
            <span className={s.liveDot} />A week with room.
          </span>
          <span>Sample plan</span>
        </div>
        <div className={s.dayHeaders}>
          <span />
          <span>MON</span>
          <span>TUE</span>
          <span>WED</span>
          <span>THU</span>
          <span>FRI</span>
        </div>
        <div className={s.calendarBody}>
          <div className={s.hours}>
            {['09', '10', '11', '12', '13', '14'].map((hour) => (
              <span key={hour}>{hour}</span>
            ))}
          </div>
          <div className={s.calendarGrid}>
            {Array.from({ length: 30 }, (_, i) => (
              <span
                className={s.cell}
                key={i}
                style={{
                  gridColumn: (i % 5) + 1,
                  gridRow: Math.floor(i / 5) + 1,
                }}
              />
            ))}
            {BLOCKS.map((block) => (
              <div
                key={`${block.day}-${block.row}`}
                className={`${s.block} ${s[block.color]}`}
                style={{
                  gridColumn: block.day + 1,
                  gridRow: `${block.row + 1} / span ${block.span}`,
                }}
              >
                <strong>{block.name}</strong>
                <span>{block.time}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={s.weekBottom}>
          <span>
            <Check size={14} aria-hidden="true" /> Focus protected
          </span>
          <span>Space is part of the plan.</span>
        </div>
      </div>
      <div className={s.posterBottom}>
        <span>LESS FRICTION.</span>
        <span>
          MORE INTENTION. <ArrowUpRight size={15} />
        </span>
      </div>
    </div>
  );
}

function FAQs() {
  const [open, setOpen] = useState(null);
  return (
    <div className={s.faqList}>
      {FAQ.map(([question, answer], index) => (
        <article className={s.faq} key={question}>
          <h3>
            <button
              aria-expanded={open === index}
              aria-controls={`faq-answer-${index}`}
              id={`faq-question-${index}`}
              onClick={() => setOpen(open === index ? null : index)}
            >
              {question}
              <span aria-hidden="true">
                {open === index ? <Minus size={20} /> : <Plus size={20} />}
              </span>
            </button>
          </h3>
          <div
            id={`faq-answer-${index}`}
            role="region"
            aria-labelledby={`faq-question-${index}`}
            hidden={open !== index}
          >
            <p>{answer}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
function Form({ newsletter = false }) {
  const [errors, setErrors] = useState({}),
    [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false),
    ref = useRef(null);
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const data = Object.fromEntries(new FormData(e.currentTarget));
    const next = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((data.email || '').trim()))
      next.email = 'Enter a valid email address.';
    if (!newsletter) {
      if (!(data.name || '').trim()) next.name = 'Enter your name.';
      if ((data.message || '').trim().length < 15)
        next.message = 'Please enter at least 15 characters.';
      if (!data.consent) next.consent = 'Please agree before sending.';
    }
    setErrors(next);
    setStatus('');
    if (Object.keys(next).length) {
      setTimeout(
        () => ref.current?.querySelector('[aria-invalid="true"]')?.focus(),
        0,
      );
      return;
    }
    setBusy(true);
    try {
      const endpoint = FORM_ENDPOINTS[newsletter ? 'newsletter' : 'contact'];
      if (!endpoint) throw Error('unavailable');
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw Error('rejected');
      setStatus(
        newsletter
          ? 'You’re subscribed. Thanks for making room for us.'
          : 'Message received. Thank you for getting in touch.',
      );
      ref.current.reset();
    } catch {
      setStatus('We couldn’t send this right now. Please try again later.');
    } finally {
      setBusy(false);
    }
  }
  const id = newsletter ? 'newsletter' : 'contact';
  return (
    <form
      ref={ref}
      onSubmit={submit}
      noValidate
      aria-busy={busy}
      onInput={(event) => {
        const name = event.target.name;
        if (name)
          setErrors((previous) => {
            if (!previous[name]) return previous;
            const next = { ...previous };
            delete next[name];
            return next;
          });
        setStatus('');
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
            placeholder="you@example.com"
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
  );
}
export default function Landing() {
  const [menu, setMenu] = useState(false);
  const dialog = useRef(null),
    toggle = useRef(null);
  useEffect(() => {
    if (menu) dialog.current?.showModal();
    else dialog.current?.close();
    const previous = document.body.style.overflow;
    if (menu) document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menu]);
  function close() {
    setMenu(false);
    toggle.current?.focus();
  }
  function followAnchor(event) {
    const link = event.target.closest('a[href^="#"]');
    if (
      !link ||
      event.button > 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const target = document.getElementById(link.getAttribute('href').slice(1));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
      block: 'start',
    });
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    history.replaceState(null, '', link.getAttribute('href'));
  }
  return (
    <div className={s.app} id="top" onClickCapture={followAnchor}>
      <a className={s.skip} href="#main-content">
        Skip to content
      </a>
      <header className={s.header}>
        <div className={s.headerInner}>
          <Link className={s.brand} href="/" aria-label="Calendra home">
            <Brand />
          </Link>
          <nav className={s.desktopNav} aria-label="Main navigation">
            {NAV.slice(0, 3).map(([label, href]) => (
              <a href={href} key={href}>
                {label}
              </a>
            ))}
          </nav>
          <div className={s.headerActions}>
            <Link className={s.signIn} href="/signin">
              Sign in <ArrowUpRight size={15} />
            </Link>
            <Link className={s.headerCta} href="/planner">
              Start planning <ArrowUpRight size={17} />
            </Link>
            <button
              ref={toggle}
              className={s.menuButton}
              aria-label="Open navigation"
              aria-expanded={menu}
              aria-controls="navigation-dialog"
              onClick={() => setMenu(true)}
            >
              <Menu size={24} />
            </button>
          </div>
        </div>
      </header>
      <dialog
        ref={dialog}
        id="navigation-dialog"
        className={s.menuDialog}
        aria-label="Main navigation"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={(event) => {
          if (event.target === dialog.current) close();
        }}
      >
        <div className={s.menuTop}>
          <Brand />
          <button autoFocus onClick={close} aria-label="Close navigation">
            <X />
          </button>
        </div>
        <nav>
          {NAV.map(([label, href]) => (
            <a href={href} onClick={close} key={href}>
              {label}
              <ArrowUpRight />
            </a>
          ))}
          <Link onClick={close} href="/signin">
            Sign in
            <ArrowUpRight />
          </Link>
          <Link onClick={close} href="/planner">
            Start planning
            <ArrowUpRight />
          </Link>
        </nav>
      </dialog>
      <main id="main-content">
        <section className={`${s.hero} ${s.container}`}>
          <div className={s.heroCopy}>
            <p className={s.eyebrow}>
              <span className={s.blueDot} />
              THE AI CALENDAR PLANNER
            </p>
            <h1>
              A little order.
              <br />A lot more
              <br />
              <span>possible.</span>
            </h1>
            <p className={s.heroText}>
              Turn a head full of tasks into a week that works. Built around
              your time, your energy, your life.
            </p>
            <div className={s.heroActions}>
              <Button href="/planner">Give your week shape</Button>
              <a className={s.textLink} href="#how-it-works">
                See how it works <ArrowRight size={17} />
              </a>
            </div>
            <p className={s.heroNote}>
              <ShieldCheck size={15} />
              Your priorities. Your approval. Always.
            </p>
          </div>
          <Week />
          <div className={s.heroFoot}>
            <span>GOOD WEEKS DON’T HAPPEN BY ACCIDENT.</span>
            <span>
              DESIGNED AROUND YOU <ArrowRight size={16} />
            </span>
          </div>
        </section>
        <div className={s.principles} aria-label="Planning principles">
          <div className={s.container}>
            <span>
              <i className={s.smallCircle} />
              Form follows focus.
            </span>
            <span>
              <i className={s.smallSquare} />
              Structure creates space.
            </span>
            <span>
              <i className={s.smallTriangle} />
              You set the direction.
            </span>
          </div>
        </div>

        <section id="how-it-works" className={`${s.section} ${s.container}`}>
          <div className={s.sectionHeader}>
            <div>
              <p className={s.eyebrow}>LESS ORGANISING. MORE DOING.</p>
              <h2>
                From scattered
                <br />
                to structured.
              </h2>
            </div>
            <p>
              Not another list to manage.
              <br />A clear path from intention to action.
            </p>
          </div>
          <div className={s.steps}>
            {[
              [
                'circle',
                'Start with what’s on your mind.',
                'Add your tasks, estimates and deadlines. Or paste a brief, then review what Calendra understood.',
              ],
              [
                'square',
                'Give your time some boundaries.',
                'Set your working hours, focus windows and breaks. Your existing meetings stay exactly where they are.',
              ],
              [
                'triangle',
                'Make the week your own.',
                'Build a plan, see why each block is there, and adjust. Only publish to your calendar when you approve.',
              ],
            ].map(([shape, title, text]) => (
              <article key={shape}>
                <div
                  className={`${s.stepShape} ${s[shape]}`}
                  aria-hidden="true"
                />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="product" className={s.productSection}>
          <div className={`${s.product} ${s.container}`}>
            <div
              className={s.focusArt}
              role="img"
              aria-label="Geometric illustration of a balanced day, with protected focus, a break, and time left open."
            >
              <div className={s.artCaption}>
                <span>THE ART OF A REALISTIC DAY</span>
                <ArrowUpRight size={19} />
              </div>
              <div className={s.artCircle} />
              <div className={s.artSquare} />
              <div className={s.artTriangle} />
              <div className={s.artSchedule}>
                <div>
                  <span>09:00</span>
                  <strong>Room to focus.</strong>
                </div>
                <div>
                  <span>12:30</span>
                  <strong>Room to pause.</strong>
                </div>
                <div>
                  <span>15:00</span>
                  <strong>Room to breathe.</strong>
                </div>
              </div>
              <span className={s.artFooter}>
                A FULL LIFE. NOT JUST A FULL CALENDAR.
              </span>
            </div>
            <div className={s.productCopy}>
              <p className={s.eyebrow}>FUNCTION, NOT FRICTION.</p>
              <h2>
                Make room for
                <br />
                what matters.
              </h2>
              <p>
                A calendar should support your life.
                <br />
                Not compete with it.
              </p>
              <div className={s.featureList} id="features">
                {[
                  [
                    SlidersHorizontal,
                    'Your rules come first.',
                    'Working hours, protected breaks and daily caps are constraints, not suggestions.',
                  ],
                  [
                    Clock3,
                    'An honest view of your time.',
                    'If the work won’t fit, see the shortfall and choose a trade-off. No silent overbooking.',
                  ],
                  [
                    ShieldCheck,
                    'Always in your hands.',
                    'Move and resize blocks, export your week, or approve specific Google Calendar changes.',
                  ],
                ].map(([Icon, title, text]) => (
                  <article key={title}>
                    <Icon size={21} aria-hidden="true" />
                    <div>
                      <h3>{title}</h3>
                      <p>{text}</p>
                    </div>
                  </article>
                ))}
              </div>
              <a className={s.textLink} href="/planner">
                Explore the planner <ArrowRight size={18} />
              </a>
            </div>
          </div>
        </section>

        <section className={`${s.section} ${s.container}`} id="plans">
          <div className={s.sectionHeader}>
            <div>
              <p className={s.eyebrow}>A SIMPLE PLACE TO START.</p>
              <h2>
                Less overhead.
                <br />
                More headspace.
              </h2>
            </div>
            <p>
              Start with Personal. Pro and Teams are enquiries only; no checkout
              or payment is taken.
            </p>
          </div>
          <div className={s.plans}>
            <article
              className={`${s.plan} ${s.personal}`}
              aria-label="Personal plan"
            >
              <div className={s.planTitle}>
                <h3>Personal</h3>
                <span className={s.planDot} />
              </div>
              <p>For a week that feels like yours.</p>
              <div className={s.price}>
                Free<span> / to start</span>
              </div>
              <ul>
                {[
                  'Tasks, deadlines & weekly plans',
                  'Focus windows & protected breaks',
                  'Capacity reports & manual adjustments',
                  'Calendar export & approved Google sync',
                ].map((text) => (
                  <li key={text}>
                    <Check size={16} />
                    {text}
                  </li>
                ))}
              </ul>
              <Button href="/planner">Start planning</Button>
              <small>No payment required.</small>
            </article>
            {[
              [
                'Pro',
                'More room to think ahead.',
                'Longer horizons, planning history and your next priorities. Tell us what would help.',
                'A bigger personal workflow',
              ],
              [
                'Teams',
                'Better weeks, together.',
                'Shared planning, team workflows and privacy needs. Let’s explore what you need.',
                'A more coordinated team',
              ],
            ].map(([name, subtitle, text, tag]) => (
              <article
                className={s.plan}
                key={name}
                aria-label={`${name} plan`}
              >
                <div className={s.planTitle}>
                  <h3>{name}</h3>
                  <ArrowUpRight size={26} />
                </div>
                <p>{subtitle}</p>
                <div className={s.enquiry}>Let’s talk.</div>
                <span className={s.planTag}>{tag}</span>
                <p className={s.planDescription}>{text}</p>
                <Button
                  secondary
                  href={`#contact`}
                  onClick={() => {
                    const select = document.getElementById('contact-inquiry');
                    if (select) select.value = name.toLowerCase();
                  }}
                >
                  Ask about {name}
                </Button>
                <small>Enquiry only. No checkout or payment.</small>
              </article>
            ))}
          </div>
        </section>

        <section className={s.faqSection} id="questions">
          <div className={`${s.faqGrid} ${s.container}`}>
            <div>
              <p className={s.eyebrow}>CLEAR ANSWERS.</p>
              <h2>
                A little less
                <br />
                guesswork.
              </h2>
              <p>
                Still curious?{' '}
                <a href="#contact">
                  Let’s talk <ArrowUpRight size={15} />
                </a>
              </p>
              <div className={s.faqGeometry} aria-hidden="true">
                <i />
                <i />
              </div>
            </div>
            <FAQs />
          </div>
        </section>

        <section
          className={`${s.section} ${s.container} ${s.contact}`}
          id="contact"
        >
          <div>
            <p className={s.eyebrow}>A CONVERSATION STARTS HERE.</p>
            <h2>
              What’s on
              <br />
              your mind?
            </h2>
            <p>
              A question, an idea, a better way to plan.
              <br />
              We’re listening.
            </p>
            <div className={s.contactShape} aria-hidden="true">
              <span />
              <ArrowUpRight size={48} strokeWidth={1.5} />
            </div>
          </div>
          <Form />
        </section>

        <section className={s.closing}>
          <div className={s.container}>
            <span className={s.closingCircle} aria-hidden="true" />
            <p className={s.eyebrow}>LESS CHAOS. MORE POSSIBILITY.</p>
            <h2>
              Your time.
              <br />
              By design.
            </h2>
            <Button href="/planner">Build a week that fits</Button>
            <span className={s.closingSquare} aria-hidden="true" />
          </div>
        </section>
      </main>
      <footer className={s.footer}>
        <div className={`${s.footerTop} ${s.container}`}>
          <div>
            <Link className={s.brand} href="/" aria-label="Calendra home">
              <Brand />
            </Link>
            <p>Good weeks, by design.</p>
            <div className={s.tinyMap}>
              <iframe
                title="Map of Hyderabad in the footer"
                src="https://www.google.com/maps?q=Hyderabad%2C%20India&z=11&output=embed"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              <a
                href="https://www.google.com/maps?q=Hyderabad%2C%20India"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open Hyderabad location map (new tab)"
              >
                Hyderabad, India <ArrowUpRight size={12} />
              </a>
            </div>
          </div>
          <div className={s.footerLinks}>
            <a href="#how-it-works">How it works</a>
            <Link href="/planner">Planner</Link>
            <a href="#plans">Plans</a>
            <a href="#contact">Contact</a>
            <Link href="/signin">Sign in</Link>
            <Link href="/legal#privacy">Privacy</Link>
          </div>
          <div className={s.newsletter}>
            <p>A little clarity in your inbox.</p>
            <Form newsletter />
          </div>
        </div>
        <div className={`${s.footerBottom} ${s.container}`}>
          <span>© {new Date().getFullYear()} Calendra</span>
          <span>FORM FOLLOWS FOCUS.</span>
          <a href="#top" aria-label="Back to top">
            Back to top <ArrowUp size={16} />
          </a>
        </div>
      </footer>
    </div>
  );
}
