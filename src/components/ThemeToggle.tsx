"use client";
import { AnimatePresence, motion } from "framer-motion";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/client/theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, set] = useTheme();
  const dark = theme === "dark";
  return (
    <button
      className={`btn btn-ghost btn-sm relative h-8 w-8 overflow-hidden px-0 ${className}`}
      onClick={(e) => set(dark ? "light" : "dark", { x: e.clientX, y: e.clientY })}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ y: 14, rotate: -90, opacity: 0 }}
          animate={{ y: 0, rotate: 0, opacity: 1 }}
          exit={{ y: -14, rotate: 90, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="grid place-items-center"
        >
          {dark ? <Sun size={15} /> : <Moon size={15} />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
