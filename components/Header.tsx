import Link from "next/link";

export default function Header() {
  return (
    <header className="relative z-20 flex h-[var(--header-h)] shrink-0 items-center justify-between px-5 sm:px-8">
      <Link
        href="/"
        className="group inline-flex items-center gap-2 rounded-md text-[15px] font-semibold tracking-tight text-ink"
        aria-label="Desloper, home"
      >
        <span
          aria-hidden
          className="relative inline-block size-3.5 rounded-[4px] border-[1.5px] border-ink transition-transform duration-300 group-hover:rotate-45"
        >
          <span className="absolute inset-[3px] rounded-[1px] bg-accent" />
        </span>
        Desloper
      </Link>
      <Link
        href="/dashboard"
        className="rounded-md text-sm text-muted transition-colors hover:text-ink"
      >
        Saved
      </Link>
    </header>
  );
}
