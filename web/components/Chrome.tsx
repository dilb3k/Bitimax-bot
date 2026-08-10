'use client';

import { useEffect, useState } from 'react';
import { botLink } from '@/lib/api';
import { Logo, LogoMark } from './Logo';

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ground/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <a href="/" className="flex items-center gap-2.5">
          <Logo priority />
          <span className="hidden text-xs text-faint sm:inline">kafil bilan savdo</span>
        </a>

        <nav className="flex items-center gap-2">
          <a href="#katalog" className="hidden px-3 py-2 text-sm text-muted hover:text-ink sm:block">
            Katalog
          </a>
          <a
            href="#qanday"
            className="hidden px-3 py-2 text-sm text-muted hover:text-ink sm:block"
          >
            Qanday ishlaydi
          </a>
          <ThemeToggle />
          <a
            href={botLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-accent px-3.5 py-2 text-sm"
          >
            Botni ochish
          </a>
        </nav>
      </div>
    </header>
  );
}

function ThemeToggle() {
  // Starts null so the button renders nothing theme-specific until the client has read the
  // stored preference — otherwise the server-rendered icon can contradict the applied theme.
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('bitimax-theme', next ? 'dark' : 'light');
    } catch {
      /* private mode — the choice just won't persist */
    }
    setDark(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? 'Yorug‘ rejimga o‘tish' : 'Qorong‘i rejimga o‘tish'}
      className="rounded-lg border border-line p-2 text-muted transition hover:bg-raised hover:text-ink"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.8" />
            <path
              d="M12 2.6v2.2M12 19.2v2.2M21.4 12h-2.2M4.8 12H2.6M18.6 5.4l-1.6 1.6M7 17l-1.6 1.6M18.6 18.6L17 17M7 7L5.4 5.4"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </>
        ) : (
          <path
            d="M20 14.2A8.2 8.2 0 1 1 9.8 4a6.6 6.6 0 0 0 10.2 10.2Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </button>
  );
}

export function Footer() {
  return (
    <footer className="mt-8 border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <div className="mb-2 flex items-center gap-2.5">
              <LogoMark size={26} />
              <p className="font-display text-lg font-bold text-ink">Bitimax</p>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              P2P escrow bozori. Pul kafilda saqlanadi, xaridor tasdiqlagach sotuvchiga o‘tadi.
            </p>
          </div>

          <div className="flex gap-12 text-sm">
            <div>
              <p className="mb-2 text-xs uppercase tracking-wider text-faint">Havolalar</p>
              <ul className="space-y-1.5">
                <li>
                  <a href="#katalog" className="text-muted hover:text-ink">
                    Katalog
                  </a>
                </li>
                <li>
                  <a href="#qanday" className="text-muted hover:text-ink">
                    Qanday ishlaydi
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="mb-2 text-xs uppercase tracking-wider text-faint">Aloqa</p>
              <ul className="space-y-1.5">
                <li>
                  <a
                    href={botLink()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted hover:text-ink"
                  >
                    Telegram bot
                  </a>
                </li>
                <li>
                  <a
                    href="https://t.me/bitimax_admin"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted hover:text-ink"
                  >
                    Qo‘llab-quvvatlash
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <p className="mt-8 border-t border-line pt-6 text-xs text-faint">
          © {new Date().getFullYear()} Bitimax. Platformadan tashqaridagi kelishuvlarga tizim
          javob bermaydi.
        </p>
      </div>
    </footer>
  );
}
