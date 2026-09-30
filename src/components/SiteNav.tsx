"use client";
import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useSpring } from "framer-motion";
import { Menu, Settings, X } from "lucide-react";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
  { href: "#repositories", label: "Repositories" },
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#updates", label: "Updates" },
];

export function SiteNav({ links = true }: { links?: boolean }) {
  const { scrollY, scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 200, damping: 30 });
  const [scrolled, setScrolled] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 12));

  return (
    <motion.header initial={{ y: -24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="sticky top-0 z-40">
      <div className={`transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300 ${scrolled ? "border-b border-line bg-bg/75 shadow-[0_8px_30px_-18px_rgb(0_0_0/0.25)] backdrop-blur-xl" : "border-b border-transparent bg-transparent"}`}>
        <div className={`mx-auto flex max-w-[1200px] items-center gap-8 px-6 transition-[height] duration-300 ${scrolled ? "h-14" : "h-[72px]"}`}>
          <Logo />
          {links && (
            <nav className="relative hidden items-center md:flex" onMouseLeave={() => setHover(null)}>
              {LINKS.map((l) => (
                <a key={l.href} href={l.href} onMouseEnter={() => setHover(l.href)} className="relative px-3 py-1.5 text-[14px] text-fg-2 transition-colors hover:text-fg">
                  {hover === l.href && <motion.span layoutId="nav-hover" className="absolute inset-0 rounded-lg bg-panel-2" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                  <span className="relative">{l.label}</span>
                </a>
              ))}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            <Link href="/settings" className="btn btn-sm hidden sm:inline-flex"><Settings size={14} /> Settings</Link>
            {links && (
              <button className="btn btn-ghost btn-sm h-8 w-8 px-0 md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">
                {open ? <X size={16} /> : <Menu size={16} />}
              </button>
            )}
          </div>
        </div>
      </div>
      <motion.div className="h-[2px] origin-left bg-accent" style={{ scaleX: progress }} />
      <AnimatePresence>
        {open && (
          <motion.nav initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="card mx-4 mt-2 flex flex-col p-2 md:hidden">
            {LINKS.map((l, i) => (
              <motion.a key={l.href} href={l.href} onClick={() => setOpen(false)} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                className="rounded-lg px-3 py-2.5 text-[15px] text-fg hover:bg-panel-2">{l.label}</motion.a>
            ))}
            <Link href="/settings" className="rounded-lg px-3 py-2.5 text-[15px] text-fg hover:bg-panel-2">Settings</Link>
          </motion.nav>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
