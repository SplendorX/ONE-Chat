import { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { View, Theme } from './types';
import { supabase } from './lib/supabase';
import { LandingPage } from './components/LandingPage';
import { AuthScreen } from './components/AuthScreen';
import { OnboardingFlow } from './components/OnboardingFlow';
import { AppShell } from './components/AppShell';
import { OneChatLogo } from './components/Brand';

export default function App() {
  const [view, setView] = useState<View>('landing');
  const [theme, setTheme] = useState<Theme>('light');
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Apply theme
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // Bootstrap: check for existing Supabase session (handles OAuth redirects too)
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      const s = data.session;
      setSession(s);
      if (s) {
        // Already authenticated — check if they have a ONE identity
        supabase
          .from('one_identities')
          .select('handle')
          .eq('user_id', s.user.id)
          .maybeSingle()
          .then(({ data: identity }) => {
            setView(identity ? 'app' : 'onboarding');
          });
      }
      setLoading(false);
    });

    // Listen for auth changes (OAuth callback, sign-out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) {
        setView('landing');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  function handleToggleTheme() {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  // Called by AuthScreen after OTP sent — move to onboarding check
  function handleAuthSuccess(s: Session) {
    setSession(s);
    supabase
      .from('one_identities')
      .select('handle')
      .eq('user_id', s.user.id)
      .maybeSingle()
      .then(({ data: identity }) => {
        setView(identity ? 'app' : 'onboarding');
      });
  }

  function handleSignOut() {
    void supabase.auth.signOut().then(() => {
      setSession(null);
      setView('landing');
    });
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="flex flex-col items-center gap-4">
          <OneChatLogo size={64} />
          <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--ink)' }} />
        </div>
      </div>
    );
  }

  return (
    <>
      {view === 'landing' && (
        <LandingPage onGetStarted={() => setView('auth')} />
      )}

      {view === 'auth' && (
        <AuthScreen
          onAuthSuccess={handleAuthSuccess}
          onBack={() => setView('landing')}
        />
      )}

      {view === 'onboarding' && session && (
        <OnboardingFlow
          session={session}
          onComplete={() => setView('app')}
        />
      )}

      {view === 'app' && session && (
        <AppShell
          session={session}
          theme={theme}
          onThemeToggle={handleToggleTheme}
          onSignOut={handleSignOut}
        />
      )}
    </>
  );
}
