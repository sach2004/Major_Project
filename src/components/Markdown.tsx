"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { memo } from "react";
import { CodeBlock } from "./CodeBlock";
import { Mermaid } from "./Mermaid";

function MarkdownImpl({ children, className = "" }: { children: string; className?: string }) {
  return (
    <div className={`prose-arch ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }) => {
            const text = String(children ?? "");
            const lang = /language-([\w+#-]+)/.exec(className || "")?.[1];
            const block = !!lang || text.includes("\n");
            if (!block) return <code>{children}</code>;
            if (lang === "mermaid") return <Mermaid code={text} />;
            return <div className="my-3"><CodeBlock code={text} language={lang} showLines={text.split("\n").length > 4} /></div>;
          },
          a: ({ href, children }) => <a href={href} target={href?.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{children}</a>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
export const Markdown = memo(MarkdownImpl);
