import { ArrowRight, MessageCircle, Send, Users, Sparkles, Shield, Zap, Gift } from 'lucide-react';
import { OneChatWordmark, OneChatLogo } from './Brand';

interface LandingPageProps {
  onGetStarted: () => void;
}

export function LandingPage({ onGetStarted }: LandingPageProps) {
  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg)' }}>
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 md:px-12"
        style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid var(--border)' }}>
        <OneChatWordmark height={28} />
        <div className="flex items-center gap-3">
          <button
            onClick={onGetStarted}
            className="text-sm font-medium px-4 py-2 rounded-full transition-all"
            style={{ color: 'var(--muted)' }}
          >
            Sign in
          </button>
          <button
            onClick={onGetStarted}
            className="text-sm font-semibold px-5 py-2 rounded-full transition-all"
            style={{ background: 'var(--ink)', color: 'var(--bg)' }}
          >
            Get started
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden pt-32 pb-24 px-6 md:px-12 text-center">
        {/* Background blobs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div style={{ position: 'absolute', top: '10%', left: '10%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(237,229,216,0.6) 0%, transparent 70%)', filter: 'blur(80px)' }} />
          <div style={{ position: 'absolute', bottom: '15%', right: '5%', width: 350, height: 350, borderRadius: '50%', background: 'radial-gradient(circle, rgba(220,207,189,0.5) 0%, transparent 70%)', filter: 'blur(70px)' }} />
        </div>

        <div className="relative z-10 max-w-3xl mx-auto">
          <div className="flex justify-center mb-8">
            <OneChatLogo size={72} />
          </div>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-8"
            style={{ background: 'var(--surface-muted)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
            <Zap size={12} />
            Built on Arc Network · Powered by USDC
          </div>

          <h1 className="display text-5xl md:text-7xl font-700 mb-6 text-balance"
            style={{ color: 'var(--ink)', letterSpacing: '-0.04em', lineHeight: '1.05' }}>
            Your conversations<br />
            <span style={{ color: 'var(--muted)' }}>can do more.</span>
          </h1>

          <p className="text-lg md:text-xl mb-10 text-pretty max-w-xl mx-auto"
            style={{ color: 'var(--muted)', lineHeight: '1.6' }}>
            Chat with friends, send USDC, split bills, save together, and let ALLIE handle the busywork — all in one place.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <button
              onClick={onGetStarted}
              className="flex items-center gap-2 px-8 py-4 rounded-2xl font-semibold text-base transition-all group"
              style={{ background: 'var(--ink)', color: 'var(--bg)' }}
            >
              Get started
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </button>
            <button
              onClick={onGetStarted}
              className="flex items-center gap-2 px-8 py-4 rounded-2xl font-medium text-base transition-all"
              style={{ background: 'var(--surface-muted)', color: 'var(--ink)', border: '1px solid var(--border)' }}
            >
              Explore One Chat
            </button>
          </div>
        </div>

        {/* Hero product mockup */}
        <div className="relative z-10 mt-20 max-w-sm mx-auto md:max-w-2xl">
          <div className="rounded-3xl overflow-hidden shadow-glass border"
            style={{ background: 'var(--surface-strong)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderColor: 'var(--border-strong)' }}>
            {/* Mock chat header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold"
                style={{ background: 'var(--oat-beige, #EDE5D8)', color: 'var(--ink)' }}>DA</div>
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Daniel</div>
                <div className="text-xs" style={{ color: 'var(--success)' }}>daniel.one · online</div>
              </div>
            </div>
            {/* Mock messages */}
            <div className="px-5 py-5 space-y-3">
              <div className="flex justify-start">
                <div className="px-4 py-2.5 rounded-2xl rounded-tl-sm text-sm max-w-xs" style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}>
                  Hey! Can you cover dinner? $40 each
                </div>
              </div>
              <div className="flex justify-end">
                <div className="px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm max-w-xs" style={{ background: 'var(--oat-beige, #EDE5D8)', color: 'var(--ink)' }}>
                  Sure! Sending now
                </div>
              </div>
              {/* Payment card */}
              <div className="mx-auto max-w-xs rounded-2xl p-4 border" style={{ background: 'var(--surface-strong)', borderColor: 'var(--border-strong)' }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'var(--surface-muted)' }}>
                      <Send size={12} style={{ color: 'var(--muted)' }} />
                    </div>
                    <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Payment sent</span>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(39,132,91,0.12)', color: 'var(--success)' }}>Confirmed</span>
                </div>
                <div className="display text-2xl font-700 tabular-nums" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>$40 USDC</div>
                <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>amara.one → daniel.one · Arc Network</div>
              </div>
              <div className="flex justify-start">
                <div className="px-4 py-2.5 rounded-2xl rounded-tl-sm text-sm max-w-xs" style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}>
                  Got it, thank you!
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-6 md:px-12">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="display text-3xl md:text-5xl font-700 mb-4" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
              One place for everything
            </h2>
            <p className="text-base md:text-lg" style={{ color: 'var(--muted)' }}>
              Financial functionality appears when it's relevant, not when it overwhelms.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-3xl p-6 border transition-all hover:border-opacity-40"
                style={{ background: 'var(--soft-ivory, #FAF8F4)', border: '1px solid var(--border)', color: 'var(--ink)' }}>
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-4"
                  style={{ background: 'var(--oat-beige, #EDE5D8)' }}>
                  <f.icon size={18} style={{ color: 'var(--ink)' }} />
                </div>
                <h3 className="font-semibold text-base mb-2" style={{ color: 'var(--ink)' }}>{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Identity section */}
      <section className="py-24 px-6 md:px-12" style={{ background: 'var(--surface-muted, #EDE5D8)' }}>
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="display text-3xl md:text-5xl font-700 mb-6" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
            One identity.<br />Every conversation.
          </h2>
          <p className="text-base md:text-lg mb-10" style={{ color: 'var(--muted)' }}>
            Your ONE identity like <span className="font-semibold" style={{ color: 'var(--ink)' }}>amara.one</span> connects messaging, payments, and creator discovery. No wallet addresses. No confusion.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            {['amara.one', 'daniel.one', 'sofia.one', 'kai.one', 'benneth.one'].map((id) => (
              <span key={id} className="px-4 py-2 rounded-full text-sm font-medium"
                style={{ background: 'var(--surface-strong, rgba(255,255,255,0.72))', color: 'var(--ink)', border: '1px solid var(--border)' }}>
                {id}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Built on Arc */}
      <section className="py-24 px-6 md:px-12">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="display text-3xl font-700 mb-4" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
            Built on Arc. Powered by Circle.
          </h2>
          <p className="text-base mb-8 max-w-xl mx-auto leading-relaxed" style={{ color: 'var(--muted)' }}>
            USDC is the native currency on Arc Network — making transactions fast, predictable, and economical. No ETH needed for gas. No conversion required.
          </p>
          <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto">
            {[['Sub-second', 'Finality'], ['Zero', 'Gas confusion'], ['USDC', 'Native currency']].map(([val, label]) => (
              <div key={label} className="text-center p-4 rounded-2xl" style={{ background: 'var(--surface-muted, #EDE5D8)' }}>
                <div className="display text-lg font-700 mb-1" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>{val}</div>
                <div className="text-xs" style={{ color: 'var(--muted)' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 md:px-12 text-center" style={{ background: 'var(--ink)' }}>
        <div className="max-w-xl mx-auto">
          <h2 className="display text-3xl md:text-4xl font-700 mb-4 text-balance" style={{ color: 'var(--bg)', letterSpacing: '-0.03em' }}>
            Ready to do more with your conversations?
          </h2>
          <p className="text-base mb-10" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Claim your ONE identity and start in minutes.
          </p>
          <button
            onClick={onGetStarted}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl font-semibold text-base transition-all group"
            style={{ background: 'var(--oat-beige, #EDE5D8)', color: 'var(--ink)' }}
          >
            Get started — it's free
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 md:px-12 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <OneChatWordmark height={24} />
          <div className="flex flex-wrap gap-5 text-xs justify-center" style={{ color: 'var(--muted)' }}>
            {['About', 'Security', 'Privacy', 'Terms', 'Help', 'Contact'].map((l) => (
              <a key={l} href="#" className="transition-colors hover:opacity-70">{l}</a>
            ))}
          </div>
          <p className="text-xs text-center" style={{ color: 'var(--subtle, #a09890)' }}>
            Built on Arc Network · Circle infrastructure
          </p>
        </div>
      </footer>
    </div>
  );
}

const FEATURES = [
  {
    icon: MessageCircle,
    title: 'Chat without friction',
    description: 'Personal chats, group conversations, reactions, voice notes, and media sharing in a beautiful interface.',
  },
  {
    icon: Send,
    title: 'Money belongs in the conversation',
    description: 'Send USDC, request money, and split a dinner bill without leaving the chat.',
  },
  {
    icon: Users,
    title: 'Save toward something together',
    description: 'Create shared goals with friends — a trip, rent, or a gift. Track contributions transparently.',
  },
  {
    icon: Sparkles,
    title: 'Meet ALLIE',
    description: 'An AI assistant that executes financial actions after you authorize them. Routine tasks, no LLM needed.',
  },
  {
    icon: Gift,
    title: 'Creator gifting',
    description: 'Discover channels and support creators you love with direct USDC gifts — no virtual coins required.',
  },
  {
    icon: Shield,
    title: 'Privacy by design',
    description: 'Messages, financial information, and wallet operations are protected by carefully designed security boundaries.',
  },
];
