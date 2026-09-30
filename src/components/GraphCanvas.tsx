"use client";
import dynamic from "next/dynamic";
import type { GraphProps } from "./GraphInner";

const Inner = dynamic(() => import("./GraphInner"), {
  ssr: false,
  loading: () => <div className="skeleton h-full min-h-[320px] w-full" />,
});

export function GraphCanvas(props: GraphProps) {
  return <Inner {...props} />;
}
export type { GNodeV, GLinkV } from "./GraphInner";
