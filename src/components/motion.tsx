"use client";
import { animate, motion, useInView, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";

export const ease = [0.16, 1, 0.3, 1] as const;

/** Headline that rises in word by word. */
export function RevealWords({ text, className = "", delay = 0 }: { text: string; className?: string; delay?: number }) {
  const words = text.split(" ");
  return (
    <span className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom" aria-hidden>
          <motion.span className="inline-block" initial={{ y: "105%", opacity: 0, filter: "blur(6px)" }} animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
            transition={{ delay: delay + i * 0.06, duration: 0.8, ease }}>
            {w}
            {i < words.length - 1 ? "\u00a0" : ""}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/** Fades and lifts children when they scroll into view. */
export function Reveal({ children, delay = 0, y = 24, className = "" }: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ delay, duration: 0.7, ease }}>
      {children}
    </motion.div>
  );
}

/** Card whose border lights up under the cursor. */
export function Spotlight({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`spotlight ${className}`}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--sx", `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty("--sy", `${e.clientY - r.top}px`);
      }}
    >
      {children}
    </div>
  );
}

/** Gentle 3D tilt that follows the pointer. */
export function Tilt({ children, className = "", max = 6 }: { children: ReactNode; className?: string; max?: number }) {
  const reduce = useReducedMotion();
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const rx = useSpring(useTransform(my, [0, 1], [max, -max]), { stiffness: 150, damping: 18 });
  const ry = useSpring(useTransform(mx, [0, 1], [-max, max]), { stiffness: 150, damping: 18 });
  return (
    <div style={{ perspective: 1200 }} className={className}>
      <motion.div
        style={reduce ? undefined : { rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          mx.set((e.clientX - r.left) / r.width);
          my.set((e.clientY - r.top) / r.height);
        }}
        onMouseLeave={() => { mx.set(0.5); my.set(0.5); }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/** Draws a horizontal line from left to right when visible. */
export function DrawLine({ className = "", delay = 0 }: { className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <div ref={ref} className={`relative h-px overflow-hidden bg-line ${className}`}>
      <motion.div className="absolute inset-0 origin-left bg-fg-3" initial={{ scaleX: 0 }} animate={{ scaleX: inView ? 1 : 0 }} transition={{ delay, duration: 1.1, ease }} />
    </div>
  );
}

/** Text typed out character by character once visible. */
export function TypeOut({ text, className = "", speed = 18 }: { text: string; className?: string; speed?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const n = useMotionValue(0);
  const shown = useTransform(n, (v) => text.slice(0, Math.round(v)));
  useEffect(() => {
    if (!inView) return;
    const c = animate(n, text.length, { duration: (text.length * speed) / 1000, ease: "linear" });
    return () => c.stop();
  }, [inView, n, text.length, speed]);
  return <motion.span ref={ref} className={className}>{shown}</motion.span>;
}
