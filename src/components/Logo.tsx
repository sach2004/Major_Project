"use client";
import Link from "next/link";
import { motion } from "framer-motion";

export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <motion.svg width={size} height={size} viewBox="0 0 32 32" aria-hidden initial="rest" whileHover="hover" animate="rest">
      <rect width="32" height="32" rx="8" className="fill-fg" />
      <motion.path d="M10 11L16 22L22 11" className="stroke-bg" strokeWidth="1.6" fill="none"
        variants={{ rest: { pathLength: 1 }, hover: { pathLength: [0, 1], transition: { duration: 0.6 } } }} />
      <path d="M10 11H22" className="stroke-bg" strokeWidth="1.6" opacity=".5" />
      <circle cx="10" cy="11" r="2.8" className="fill-bg" />
      <circle cx="22" cy="11" r="2.8" className="fill-bg" />
      <motion.circle cx="16" cy="22" r="3.4" style={{ fill: "var(--accent)", transformBox: "fill-box", transformOrigin: "center" }}
        variants={{ rest: { scale: 1 }, hover: { scale: [1, 1.35, 1], transition: { duration: 0.5 } } }} />
    </motion.svg>
  );
}

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <Link href="/" className="group inline-flex items-center gap-2.5">
      <LogoMark size={small ? 24 : 28} />
      <span className={`font-display font-semibold tracking-tight text-fg ${small ? "text-[15px]" : "text-[17px]"}`}>Software Archaeologist</span>
    </Link>
  );
}
