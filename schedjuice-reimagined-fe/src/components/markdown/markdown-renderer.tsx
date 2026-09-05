import Markdown from "marked-react";
import Link from "next/link";
import React from "react";

import { extractMarkdownHeadings } from "@/lib/product-docs/extract-headings";
import { headingToId } from "@/lib/product-docs/heading-to-id";
import { parseHostedVideoHref } from "@/lib/product-docs/video-markdown";
import { cn } from "@/lib/utils";

import { VideoEmbed } from "./video-embed";

interface IMarkdownRendererProps {
  value: string;
  showHeadingAnchors?: boolean;
}

function HeadingWithAnchor({
  id,
  level,
  showAnchor,
  className,
  children,
}: {
  id: string;
  level: 1 | 2 | 3;
  showAnchor: boolean;
  className: string;
  children: React.ReactNode;
}) {
  const Tag = `h${level}` as "h1" | "h2" | "h3";

  return (
    <Tag id={id} className={cn("group scroll-mt-24", className)}>
      {children}
      {showAnchor ? (
        <a
          href={`#${id}`}
          className={cn(
            "ml-2 font-normal text-muted-foreground no-underline opacity-0",
            "transition-opacity group-hover:opacity-100 focus:opacity-100",
          )}
          aria-label="Copy link to this section"
        >
          #
        </a>
      ) : null}
    </Tag>
  );
}

const MarkdownRenderer: React.FC<IMarkdownRendererProps> = ({
  value,
  showHeadingAnchors = false,
}) => {
  const headingQueue = [...extractMarkdownHeadings(value)];

  function renderHeading(level: 1 | 2 | 3, className: string, children: React.ReactNode) {
    const text = String(children);
    const next = headingQueue.shift();
    const id = next?.id ?? headingToId(text);
    return (
      <HeadingWithAnchor
        id={id}
        level={level}
        showAnchor={showHeadingAnchors}
        className={className}
      >
        {children}
      </HeadingWithAnchor>
    );
  }

  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none">
      <Markdown
        renderer={{
          heading: (children, level) => {
            if (level === 1) {
              return renderHeading(1, "text-3xl", children);
            }
            if (level === 2) {
              return renderHeading(2, "text-2xl", children);
            }
            if (level === 3) {
              return renderHeading(3, "text-xl", children);
            }
            if (level === 4) {
              return <h4 className="text-lg">{children}</h4>;
            }
            return <h5 className="text-md">{children}</h5>;
          },
          link: (href, text) => {
            const videoSrc = href ? parseHostedVideoHref(href) : null;
            if (videoSrc) {
              return <VideoEmbed src={videoSrc} title={String(text)} />;
            }
            if (href?.startsWith("/")) {
              return (
                <Link className="underline" href={href}>
                  {text}
                </Link>
              );
            }
            return (
              <a
                className="underline"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {text}
              </a>
            );
          },
        }}
        openLinksInNewTab={true}
        value={value}
        gfm
      />
    </div>
  );
};

export default MarkdownRenderer;
