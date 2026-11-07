import type { Meta, StoryObj } from "@storybook/react-vite";

import { SiteHeader } from "../site-header/site-header";

// The cover is drawn by theme.css from the mark on <html> alone. Each story sets the mark and removes it
// on cleanup, so other stories aren't affected. The mark's names are the C1 strings.
const MARK = "data-site-transition";
const MARK_TO = "data-site-transition-to";
const root = document.documentElement;

const setMark = (mark: string, to?: string) => () => {
  const reset = () => {
    root.removeAttribute(MARK);
    root.removeAttribute(MARK_TO);
  };
  reset();
  root.setAttribute(MARK, mark);
  if (to) root.setAttribute(MARK_TO, to);
  return reset;
};

/**
 * Covered, held: the header's arrival handling turns `covered` into `revealing` unless the page is
 * prerendering, so `document.prerendering` is stubbed true (no `prerenderingchange` ever comes).
 */
const holdCovered = () => {
  const reset = setMark("covered")();
  const own = Object.getOwnPropertyDescriptor(document, "prerendering");
  Object.defineProperty(document, "prerendering", { value: true, configurable: true });
  return () => {
    if (own) Object.defineProperty(document, "prerendering", own);
    else Reflect.deleteProperty(document, "prerendering");
    reset();
  };
};

/** Freezes the slide half-way, so the story shows the cover mid-motion. */
const freezeMidway = (mark: string, to?: string) => () => {
  const reset = setMark(mark, to)();
  let frame = requestAnimationFrame(function freeze() {
    const animations = document.getAnimations().filter((animation) => (animation.effect as KeyframeEffect | null)?.target === root);
    if (animations.length === 0) {
      frame = requestAnimationFrame(freeze);
      return;
    }
    for (const animation of animations) {
      animation.pause();
      animation.currentTime = Number(animation.effect?.getComputedTiming().duration ?? 0) / 2;
    }
  });
  return () => {
    cancelAnimationFrame(frame);
    reset();
  };
};

const meta: Meta<typeof SiteHeader> = {
  title: "SiteTransitionCover",
  component: SiteHeader,
  parameters: { layout: "fullscreen" },
  args: { current: "www" },
  render: (args) => (
    <>
      <SiteHeader {...args} />
      <main className="p-8">
        <h1 className="font-heading text-3xl">Page content</h1>
        <p className="text-muted-foreground">The cover sits over the header and this content.</p>
      </main>
    </>
  ),
};
export default meta;

type Story = StoryObj<typeof SiteHeader>;

export const LeavingViolet: Story = { beforeEach: freezeMidway("leaving", "violet") };
export const LeavingEmerald: Story = { beforeEach: freezeMidway("leaving", "emerald") };
export const LeavingAmber: Story = { beforeEach: freezeMidway("leaving", "amber") };
export const Covered: Story = { beforeEach: holdCovered };
export const Revealing: Story = { beforeEach: freezeMidway("revealing") };
