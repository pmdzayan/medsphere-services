import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[#f7f6f0] p-3 sm:p-5">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-[1500px] overflow-hidden rounded-[1.75rem] border border-[#10201c]/[.07] bg-[#fffef9] shadow-[0_30px_100px_-50px_rgba(7,17,15,.5)] sm:min-h-[calc(100vh-2.5rem)] sm:rounded-[2.25rem] lg:grid-cols-[.88fr_1.12fr]">
        <section className="relative flex items-center justify-center px-6 py-10 sm:px-12 lg:px-16">
          <Link
            href="/"
            className="absolute left-6 top-6 inline-flex items-center gap-3 font-[var(--font-display)] font-bold sm:left-10 sm:top-9"
          >
            <span className="grid size-10 place-items-center rounded-[.9rem] bg-[#0b2f28] text-sm text-emerald-300 shadow-inner">
              M
            </span>
            <span>MedSphere</span>
          </Link>

          <div className="w-full max-w-[27rem] pt-20 lg:pt-10">
            <div className="mb-8 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.2em] text-emerald-700">
              <span className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_10px_#34d399]" />
              Secure organization access
            </div>
            <h1 className="font-[var(--font-display)] text-4xl font-semibold tracking-[-.05em] text-[#10201c] sm:text-5xl">
              Welcome to your workspace.
            </h1>
            <p className="mb-9 mt-4 max-w-sm text-sm leading-7 text-[#60706b]">
              Use the organization identity issued by your administrator to continue.
            </p>
            <LoginForm />
            <div className="mt-7 flex items-start gap-3 border-t border-[#10201c]/[.08] pt-5 text-xs leading-5 text-[#71807b]">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[#d7b56d]" />
              This stabilization environment must not contain real patient or clinical data.
            </div>
          </div>
        </section>

        <aside className="fine-noise premium-grid relative hidden overflow-hidden bg-[#07110f] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
          <div className="pointer-events-none absolute -right-32 -top-32 size-[28rem] rounded-full bg-emerald-400/15 blur-[100px]" />
          <div className="relative flex items-center justify-between text-[10px] font-bold uppercase tracking-[.18em] text-white/40">
            <span>MedSphere identity boundary</span>
            <span className="rounded-full border border-white/10 px-3 py-1.5 text-emerald-300">
              Protected
            </span>
          </div>

          <div className="relative max-w-2xl">
            <div className="mb-8 flex gap-2">
              {[0, 1, 2].map((item) => (
                <span
                  key={item}
                  className={`h-1 rounded-full ${item === 0 ? 'w-12 bg-emerald-300' : 'w-5 bg-white/15'}`}
                />
              ))}
            </div>
            <p className="font-[var(--font-display)] text-5xl font-semibold leading-[1.02] tracking-[-.055em] xl:text-6xl">
              Context before access.
              <span className="block text-white/38">Trust before action.</span>
            </p>
            <p className="mt-7 max-w-lg text-base leading-8 text-white/48">
              Each session is bound to a verified user, an active membership, and one explicit
              tenant context.
            </p>

            <div className="mt-10 grid max-w-lg grid-cols-2 gap-3">
              {[
                ['01', 'Verified identity'],
                ['02', 'Active membership'],
                ['03', 'Tenant context'],
                ['04', 'Attributable audit'],
              ].map(([number, label]) => (
                <div
                  key={number}
                  className="rounded-2xl border border-white/[.09] bg-white/[.045] p-4 backdrop-blur"
                >
                  <span className="text-[9px] font-bold text-[#d7b56d]">{number}</span>
                  <p className="mt-5 text-xs font-semibold text-white/75">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative flex items-center justify-between text-[10px] text-white/28">
            <span>Identity · Membership · Tenant</span>
            <Link href="/" className="transition hover:text-white/70">
              Return home ↗
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
