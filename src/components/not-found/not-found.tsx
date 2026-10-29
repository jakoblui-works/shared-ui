import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import { type ReactElement } from "react";

type NotFoundProps = {
  /** The path that was asked for, shown as it was requested. */
  path: string;
  /**
   * The element the way home renders as: an app passes its router's link (`<Link to="/" />`), as
   * with `SiteHeader`. Pass a bare element; its own children would replace the link's text.
   */
  homeLink?: ReactElement;
  className?: string;
};

/**
 * A 404 page's content, for apps that don't draw their own: what was asked for, and the way home.
 * The page adds the header around it.
 */
export const NotFound = ({ path, homeLink = <a href="/" />, className }: NotFoundProps) => {
  const home = useRender({
    render: homeLink,
    props: {
      className:
        "inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground outline-none hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50",
      children: "Back to the start",
    },
  });
  return (
    <section className={cn("mx-auto w-full max-w-6xl px-4 pt-12 pb-24 lg:py-16", className)}>
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="mt-2 font-heading text-4xl leading-none font-bold tracking-[-0.03em] sm:text-5xl">
        Nothing here
      </h1>
      <p className="mt-6 font-mono text-base break-all text-muted-foreground">GET {path}</p>
      <div className="mt-8">{home}</div>
    </section>
  );
};
