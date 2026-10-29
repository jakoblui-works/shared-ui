import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, screen } from "storybook/test";

import { sites } from "../../lib/sites";
import { SiteSwitcher } from "./site-switcher";

const meta: Meta<typeof SiteSwitcher> = {
  title: "SiteSwitcher",
  component: SiteSwitcher,
  args: { sites, current: sites[0] },
};
export default meta;

type Story = StoryObj<typeof SiteSwitcher>;

const opensWithTheOtherSites: Story["play"] = async ({ args, canvas, userEvent }) => {
  const trigger = canvas.getByRole("button", { name: "Switch site" });
  await expect(trigger.textContent?.trim()).toBe(args.current.subdomain);
  await userEvent.click(trigger);

  // The popup is portalled outside the canvas. The current site is the trigger, so it isn't listed.
  const others = args.sites.filter((site) => site.url !== args.current.url);
  const items = await screen.findAllByRole("menuitem");
  await expect(items.map((item) => item.getAttribute("href")).sort()).toEqual(
    others.map((site) => site.url).sort(),
  );
  for (const site of others) {
    const item = items.find((candidate) => candidate.getAttribute("href") === site.url);
    await expect(item).toHaveTextContent(site.subdomain);
    await expect(item).toHaveTextContent(site.label);
  }
};

export const OnTheHub: Story = {
  args: { current: sites[0] },
  play: opensWithTheOtherSites,
};

export const OnCv: Story = {
  args: { current: sites[1] },
  play: opensWithTheOtherSites,
};
