"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUp } from "lucide-react";
import { LogoMark } from "./Logo";
import { ScheduleSummary } from "./SyncControls";

const WORD = "Software Archaeologist";

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-line bg-panel">
      <div className="mx-auto max-w-[1200px] px-6 pt-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5"><LogoMark size={26} /><span className="font-display text-[16px] font-semibold text-fg">Software Archaeologist</span></div>
            <p className="mt-3 max-w-sm text-[14px] leading-relaxed text-fg-2">Knowledge graphs, cited answers and change impact for any Git repository. Runs on your machine; your code and keys never leave it.</p>
            <div className="mt-5"><ScheduleSummary /></div>
          </div>
          <div>
            <p className="text-[13px] font-semibold text-fg">Explore</p>
            <ul className="mt-3 space-y-2 text-[14px] text-fg-2">
              {[["#repositories", "Repositories"], ["#how", "How it works"], ["#features", "Features"], ["#updates", "Automatic updates"]].map(([h, l]) => (
                <li key={h}><a href={h} className="group inline-flex items-center gap-1 hover:text-fg"><span className="h-px w-0 bg-fg transition-all duration-300 group-hover:w-3" />{l}</a></li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[13px] font-semibold text-fg">Setup</p>
            <ul className="mt-3 space-y-2 text-[14px] text-fg-2">
              <li><Link href="/settings" className="group inline-flex items-center gap-1 hover:text-fg"><span className="h-px w-0 bg-fg transition-all duration-300 group-hover:w-3" />API keys</Link></li>
              <li><Link href="/settings#updates" className="group inline-flex items-center gap-1 hover:text-fg"><span className="h-px w-0 bg-fg transition-all duration-300 group-hover:w-3" />Update schedule</Link></li>
              <li><a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="group inline-flex items-center gap-1 hover:text-fg"><span className="h-px w-0 bg-fg transition-all duration-300 group-hover:w-3" />Get a Gemini key</a></li>
            </ul>
          </div>
        </div>

        <div className="mt-14 flex items-center justify-between border-t border-line py-5 text-[13px] text-fg-3">
          <span>Built with Next.js, Prisma and a local knowledge graph.</span>
          <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.94 }} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="btn btn-sm">
            <ArrowUp size={13} /> Back to top
          </motion.button>
        </div>
      </div>
      <div aria-hidden className="pointer-events-none select-none overflow-hidden px-6">
        <div className="mx-auto flex max-w-[1200px] justify-between font-display text-[clamp(2.5rem,8.2vw,7.4rem)] font-semibold leading-[0.8] tracking-[-0.05em] text-fg/[0.06]">
          {WORD.split("").map((ch, i) => (
            <motion.span key={i} initial={{ y: "100%" }} whileInView={{ y: "12%" }} viewport={{ once: true }} transition={{ delay: i * 0.025, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}>
              {ch === " " ? "\u00a0" : ch}
            </motion.span>
          ))}
        </div>
      </div>
    </footer>
  );
}
