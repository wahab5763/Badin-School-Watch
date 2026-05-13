import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardList,
  MapPinned,
  Menu,
  ShieldCheck,
  Wrench,
  X
} from 'lucide-react';
import LogoMark from '../components/LogoMark';
import { useDashboard } from '../lib/useDashboard';

gsap.registerPlugin(ScrollTrigger);

const heroImage = 'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1800&q=80';
const textureImage = 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1600&q=80';

const auditCards = [
  ['Electricity coverage', 'Functional', 'Most monitored schools report active power access.'],
  ['Drinking water access', 'Needs repair', 'Intermittent water supply remains a recurring service gap.'],
  ['Boundary wall safety', 'Critical', 'Perimeter and structural risks are escalated for action.']
];
const liveFeed = [
  'Teacher presence verified against latest monitoring logs.',
  'Overcrowded classrooms detected above safe learning thresholds.',
  'Missing blackboards repeated across multiple union councils.',
  'Unsafe building condition flagged for urgent district review.'
];

function MagneticButton({ children, href = '/dashboard', dark = false }) {
  return (
    <Link
      to={href}
      className={`group relative inline-flex items-center gap-2 overflow-hidden rounded-full px-5 py-3 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-px hover:scale-[1.03] ${dark ? 'bg-slatebrand' : 'bg-signal shadow-glow'}`}
      style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}
    >
      <span className={`absolute inset-0 translate-y-full transition-transform duration-300 group-hover:translate-y-0 ${dark ? 'bg-signal' : 'bg-slatebrand'}`} />
      <span className="relative z-10">{children}</span>
      <ArrowRight className="relative z-10 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
    </Link>
  );
}

export default function LandingPage() {
  const heroRef = useRef(null);
  const [solidNav, setSolidNav] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [stack, setStack] = useState(auditCards);
  const [messageIndex, setMessageIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const { data: liveData } = useDashboard();

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setSolidNav(!entry.isIntersecting), { threshold: 0.18 });
    if (heroRef.current) observer.observe(heroRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setStack((prev) => {
        const next = [...prev];
        next.unshift(next.pop());
        return next;
      });
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const current = liveFeed[messageIndex];
    let index = 0;
    setTyped('');
    const typer = setInterval(() => {
      index += 1;
      setTyped(current.slice(0, index));
      if (index >= current.length) {
        clearInterval(typer);
        setTimeout(() => setMessageIndex((value) => (value + 1) % liveFeed.length), 1300);
      }
    }, 28);
    return () => clearInterval(typer);
  }, [messageIndex]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.hero-item', { y: 40, opacity: 0, duration: 0.9, stagger: 0.08, ease: 'power3.out' });
      gsap.from('.feature-card', {
        scrollTrigger: { trigger: '#features', start: 'top 70%' },
        y: 40,
        opacity: 0,
        duration: 0.85,
        stagger: 0.15,
        ease: 'power3.out'
      });
      gsap.from('.manifesto-word', {
        scrollTrigger: { trigger: '#manifesto', start: 'top 72%' },
        y: 28,
        opacity: 0,
        duration: 0.65,
        stagger: 0.03,
        ease: 'power3.out'
      });
    });
    return () => ctx.revert();
  }, []);

  const words = useMemo(
    () => ['Most', 'education', 'oversight', 'waits', 'for', 'late', 'reports', 'and', 'fragmented', 'facility', 'records.'],
    []
  );

  return (
    <div className="relative z-10 min-h-screen overflow-x-hidden bg-[#ECF2F6] text-slatebrand">
      <nav className="fixed left-1/2 top-4 z-50 w-[calc(100%-1.5rem)] max-w-6xl -translate-x-1/2 px-1">
        <div className={`mx-auto flex items-center justify-between rounded-full border px-4 py-3 backdrop-blur-xl transition-all duration-300 ${solidNav ? 'border-slatebrand/10 bg-surface/80 shadow-soft text-slatebrand' : 'border-white/15 bg-white/5 text-white'}`}>
          <LogoMark light={!solidNav} compact />
          {/* Desktop links */}
          <div className="hidden items-center gap-7 md:flex">
            <a href="#features" className="text-base font-medium transition hover:-translate-y-px">Features</a>
            <a href="#protocol" className="text-base font-medium transition hover:-translate-y-px">Protocol</a>
            <a href="#access" className="text-base font-medium transition hover:-translate-y-px">Access</a>
          </div>
          <div className="flex items-center gap-2">
            <MagneticButton>Access Live Dashboard</MagneticButton>
            {/* Hamburger — mobile only */}
            <button
              aria-label="Toggle menu"
              onClick={() => setMenuOpen((v) => !v)}
              className={`ml-1 flex h-9 w-9 items-center justify-center rounded-full border transition md:hidden ${solidNav ? 'border-slatebrand/15 text-slatebrand hover:bg-slatebrand/5' : 'border-white/20 text-white hover:bg-white/10'}`}
            >
              {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {/* Mobile dropdown menu */}
        {menuOpen && (
          <div className={`mx-1 mt-2 rounded-3xl border px-5 py-4 backdrop-blur-xl md:hidden ${solidNav ? 'border-slatebrand/10 bg-surface/95 text-slatebrand' : 'border-white/15 bg-slatebrand/90 text-white'}`}>
            <div className="flex flex-col gap-4">
              <a href="#features" onClick={() => setMenuOpen(false)} className="text-base font-semibold transition hover:text-signal">Features</a>
              <a href="#protocol" onClick={() => setMenuOpen(false)} className="text-base font-semibold transition hover:text-signal">Protocol</a>
              <a href="#access" onClick={() => setMenuOpen(false)} className="text-base font-semibold transition hover:text-signal">Access</a>
            </div>
          </div>
        )}
      </nav>

      <section ref={heroRef} className="relative flex min-h-screen items-end overflow-hidden bg-slatebrand">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${heroImage})` }} />
        <div className="absolute inset-0 hero-gradient" />
        <div className="relative z-10 mx-auto grid w-full max-w-6xl gap-10 px-5 pb-10 pt-28 md:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end lg:pb-16">
          <div>
            <div className="hero-item inline-flex rounded-full border border-white/12 bg-white/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.25em] text-white/80">
              Trustworthy government tech
            </div>
            <h1 className="hero-item mt-6 max-w-4xl text-5xl font-semibold leading-[0.94] tracking-[-0.06em] text-white sm:text-7xl lg:text-[5.6rem]">
              See every school.
            </h1>
            <div
              className="hero-item mt-2 text-6xl italic leading-[0.9] tracking-[-0.05em] text-white sm:text-7xl lg:text-[6.8rem]"
              style={{
                fontFamily: "Georgia, 'Times New Roman', serif",
                textShadow: '0 3px 18px rgba(9, 14, 18, 0.65)'
              }}
            >
              As it really is.
            </div>
            <p
              className="hero-item mt-6 max-w-2xl text-base leading-8 text-white/95 md:text-lg"
              style={{ textShadow: '0 2px 14px rgba(9, 14, 18, 0.58)' }}
            >
              Real-time insights into school infrastructure, facilities, and learning conditions — empowering data-driven improvements across Badin district.
            </p>
            <div className="hero-item mt-8 flex flex-wrap items-center gap-4">
              <MagneticButton>Access Live Dashboard</MagneticButton>
              <a href="#features" className="inline-flex items-center gap-2 text-sm font-medium text-white/80 transition hover:-translate-y-px hover:text-white">
                Explore features <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="hero-item rounded-5xl border border-white/12 bg-white/10 p-5 shadow-[0_30px_80px_rgba(13,20,23,0.26)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <div className="font-mono text-xs uppercase tracking-[0.25em] text-white/50">District snapshot</div>
                <div className="mt-2 text-lg font-semibold text-white">Open landing + secure operations</div>
              </div>
              <ShieldCheck className="h-5 w-5 text-white/80" />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {[
                ['Total schools', liveData?.summary?.totalSchools?.toLocaleString() ?? '—'],
                ['Critical flags', liveData?.summary?.criticalFlags?.toLocaleString() ?? '—'],
                ['Recent visits', liveData?.summary?.totalVisits?.toLocaleString() ?? '—']
              ].map(([label, value]) => (
                <div key={label} className="rounded-4xl border border-white/10 bg-white/8 px-4 py-3">
                  <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/55">{label}</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-4xl border border-white/10 bg-slate-950/35 p-4">
              <div className="flex items-center justify-between gap-3 font-mono text-[11px] uppercase tracking-[0.24em] text-white/55">
                <span>Top deficiencies</span>
                <span>Updated live</span>
              </div>
              <div className="mt-4 space-y-3">
                {(liveData?.summary?.topDeficiencies ?? [
                  { flag: 'No drinking water', count: null },
                  { flag: 'Unsafe structure', count: null },
                  { flag: 'Missing toilets', count: null }
                ]).map(({ flag, count }, idx) => (
                  <div key={flag} className="flex items-center justify-between gap-3 text-sm text-white/85">
                    <div className="flex items-center gap-3">
                      <span className={`h-2.5 w-2.5 rounded-full ${idx === 1 ? 'bg-warn' : 'bg-danger'}`} />
                      <span className="capitalize">{flag}</span>
                    </div>
                    <span className="font-mono text-white/55">{count !== null ? `${count} schools` : '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-28">
        <div className="max-w-3xl">
          <div className="inline-flex rounded-full border border-slatebrand/10 bg-white/70 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.25em] text-slatebrand/70">
            Three operational lenses
          </div>
          <h2 className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-slatebrand sm:text-5xl">
            A monitoring system designed for action, not just reporting.
          </h2>
        </div>
        <div className="mt-12 grid gap-6 xl:grid-cols-3">
          <div className="feature-card metric-panel rounded-5xl p-6 shadow-soft">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slatebrand"><Building2 className="h-4 w-4 text-signal" /> Infrastructure & facility audit</div>
                <p className="mt-2 text-sm leading-6 text-slatebrand/62">See the true state of every school across water, toilets, electricity, walls, and structure.</p>
              </div>
              <span className="rounded-full bg-signal/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-signal">Live audit</span>
            </div>
            <div className="relative mt-8 h-72">
              {stack.map(([title, status, detail], index) => (
                <div
                  key={`${title}-${index}`}
                  className="absolute inset-x-0 rounded-4xl border border-slatebrand/8 bg-white/90 p-5 transition-all duration-700"
                  style={{
                    top: index * 18,
                    transform: `scale(${1 - index * 0.05})`,
                    opacity: 1 - index * 0.12,
                    zIndex: 8 - index
                  }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slatebrand">{title}</div>
                      <div className="mt-2 text-sm leading-6 text-slatebrand/62">{detail}</div>
                    </div>
                    <span className={`rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.2em] ${status === 'Functional' ? 'bg-ok/10 text-ok' : status === 'Needs repair' ? 'bg-warn/10 text-warn' : 'bg-danger/10 text-danger'}`}>
                      {status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="feature-card metric-panel rounded-5xl p-6 shadow-soft">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slatebrand"><ClipboardList className="h-4 w-4 text-signal" /> Learning environment quality</div>
                <p className="mt-2 text-sm leading-6 text-slatebrand/62">Track teacher presence, attendance, classroom readiness, and material availability.</p>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-slatebrand/55"><span className="h-2.5 w-2.5 rounded-full bg-ok animate-pulse" /> Live feed</div>
            </div>
            <div className="mt-8 rounded-5xl border border-white/10 bg-ink p-5">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3 font-mono text-[11px] uppercase tracking-[0.22em] text-white/45">
                <span>Quality signal stream</span>
                <span>Score: 78 / 100</span>
              </div>
              <div className="mt-5 min-h-[140px] font-mono text-[15px] leading-8 text-white/90">
                <span className="text-white/35">&gt; </span>{typed}<span className="ml-1 inline-block h-5 w-[9px] animate-pulse bg-signal" />
              </div>
              <div className="mt-6 grid grid-cols-3 gap-3 text-xs">
                {[
                  ['Teacher presence', '89%'],
                  ['Student attendance', '84%'],
                  ['Materials readiness', '61%']
                ].map(([label, value]) => (
                  <div key={label} className="rounded-3xl border border-white/10 bg-white/5 p-3">
                    <div className="font-mono text-white/45">{label}</div>
                    <div className="mt-1 text-lg font-semibold text-white">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="feature-card metric-panel rounded-5xl p-6 shadow-soft">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slatebrand"><AlertTriangle className="h-4 w-4 text-danger" /> Critical issues & follow-up</div>
                <p className="mt-2 text-sm leading-6 text-slatebrand/62">Prioritize unsafe buildings, water gaps, missing staff, and export field-team action lists.</p>
              </div>
              <span className="rounded-full bg-danger/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-danger">Urgent queue</span>
            </div>
            <div className="mt-8 rounded-5xl border border-slatebrand/8 bg-white/90 p-5">
              <div className="grid grid-cols-7 gap-2">
                {['S','M','T','W','T','F','S'].map((day, index) => (
                  <div key={`${day}-${index}`} className={`rounded-3xl px-0 py-4 text-center text-sm font-semibold ${index === 2 ? 'bg-signal text-white shadow-glow' : 'border border-slatebrand/8 bg-white text-slatebrand'}`}>{day}</div>
                ))}
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {[
                  ['Unsafe building', '14 schools'],
                  ['No drinking water', '21 schools'],
                  ['Missing teachers', '17 schools'],
                  ['Export ready', 'Field team PDF']
                ].map(([label, value]) => (
                  <div key={label} className="rounded-3xl border border-slatebrand/8 bg-surface p-3">
                    <div className="font-mono text-xs text-slatebrand/48">{label}</div>
                    <div className="mt-1 text-sm font-semibold text-slatebrand">{value}</div>
                  </div>
                ))}
              </div>
              <button className="mt-5 inline-flex items-center gap-2 rounded-full bg-slatebrand px-4 py-3 text-sm font-semibold text-white shadow-soft transition hover:-translate-y-px hover:scale-[1.03]" style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}>
                <Wrench className="h-4 w-4" /> Export priority list
              </button>
            </div>
          </div>
        </div>
      </section>

      <section id="manifesto" className="relative overflow-hidden bg-ink">
        <div className="absolute inset-0 bg-cover bg-center opacity-20" style={{ backgroundImage: `url(${textureImage})` }} />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(42,127,170,0.22),transparent_28%)]" />
        <div className="relative z-10 mx-auto max-w-6xl px-5 py-20 md:px-8 md:py-28">
          <p className="text-lg leading-8 text-white/58 md:text-xl">
            {words.map((word, index) => <span key={`${word}-${index}`} className="manifesto-word mr-[0.4ch] inline-block">{word}</span>)}
          </p>
          <h2 className="mt-8 max-w-5xl text-4xl leading-[0.95] tracking-[-0.05em] text-white sm:text-6xl md:text-7xl" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
            We focus on <span className="text-signal">timely evidence</span>, visible risk, and public-service accountability.
          </h2>
        </div>
      </section>

      <section id="protocol" className="mx-auto max-w-6xl px-5 py-20 md:px-8">
        <div className="inline-flex rounded-full border border-slatebrand/10 bg-white/70 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.25em] text-slatebrand/65">Badin monitoring protocol</div>
        <h2 className="mt-5 max-w-3xl text-3xl font-semibold tracking-[-0.04em] text-slatebrand sm:text-5xl">From field visit to district action.</h2>
        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {[
            ['01', 'Capture verified field evidence', 'Turn school visits into structured indicators on facilities and learning conditions.', <BarChart3 className="h-10 w-10 text-signal" />],
            ['02', 'Surface district-level priorities', 'Translate raw inspection data into maps, rankings, and critical issue queues.', <MapPinned className="h-10 w-10 text-signal" />],
            ['03', 'Drive timely department action', 'Move from discovery to follow-up with exports, profiles, and live dashboard views.', <CheckCircle2 className="h-10 w-10 text-signal" />]
          ].map(([step, title, detail, icon]) => (
            <div key={step} className="metric-panel rounded-5xl border border-slatebrand/8 p-6 shadow-soft">
              <div className="font-mono text-xs uppercase tracking-[0.25em] text-slatebrand/45">Step {step}</div>
              <div className="mt-5 flex h-28 items-center justify-center rounded-4xl bg-slatebrand text-white">{icon}</div>
              <h3 className="mt-5 text-xl font-semibold text-slatebrand">{title}</h3>
              <p className="mt-3 text-sm leading-7 text-slatebrand/66">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="access" className="mx-auto max-w-6xl px-5 pb-20 md:px-8 md:pb-28">
        <div className="metric-panel rounded-5xl p-7 shadow-soft md:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
            <div>
              <div className="inline-flex rounded-full border border-slatebrand/10 bg-white/70 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.25em] text-slatebrand/65">Open landing, secure operations</div>
              <h2 className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-slatebrand sm:text-5xl">Start with district visibility. Drill down when action is needed.</h2>
              <p className="mt-5 max-w-2xl text-base leading-8 text-slatebrand/66 md:text-lg">The public page surfaces overview insights. Authorized officials continue into a secure dashboard for school KPIs, monitoring matrices, visit logs, attendance, census, enrollment, and textbook reports.</p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <MagneticButton>Access Live Dashboard</MagneticButton>
                <div className="inline-flex items-center gap-2 text-sm text-slatebrand/65"><ShieldCheck className="h-4 w-4 text-ok" /> Secure login layer can be added on top of the dashboard route</div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ['Union council drill-down', 'Move from district summary to local priorities without losing context.'],
                ['School profiles', 'Inspect facility conditions, learning quality, and latest monitoring evidence.'],
                ['Critical flags', 'Keep unsafe buildings, water gaps, and staffing risks visible.'],
                ['Export for response', 'Turn findings into field-team-ready lists for follow-up.']
              ].map(([title, detail]) => (
                <div key={title} className="rounded-4xl border border-slatebrand/8 bg-white/80 p-5">
                  <h3 className="text-lg font-semibold text-slatebrand">{title}</h3>
                  <p className="mt-2 text-sm leading-7 text-slatebrand/64">{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="rounded-t-[3rem] bg-[#070d10]">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 md:grid-cols-[1.2fr_0.8fr_0.8fr] md:px-8 md:py-16">
          <div><LogoMark light /></div>
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.24em] text-[#b7c7cf]">Navigation</div>
            <div className="mt-4 space-y-3 text-sm font-semibold text-[#f4f8fb]">
              <a href="#features" className="block underline-offset-4 transition hover:text-signal hover:underline">Features</a>
              <a href="#protocol" className="block underline-offset-4 transition hover:text-signal hover:underline">Protocol</a>
              <Link to="/dashboard" className="block underline-offset-4 transition hover:text-signal hover:underline">Dashboard</Link>
            </div>
          </div>
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.24em] text-[#b7c7cf]">System status</div>
            <div className="mt-4 inline-flex items-center gap-3 rounded-full border border-white/25 bg-white/12 px-4 py-3 text-sm text-white">
              <span className="h-2.5 w-2.5 rounded-full bg-ok animate-pulse" />
              <span className="font-mono">SYSTEM OPERATIONAL</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
