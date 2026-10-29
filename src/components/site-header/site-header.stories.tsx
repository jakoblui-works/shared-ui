import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { SiteHeader } from "./site-header";

// What an app's router link renders to: a plain anchor with the app's own href and attributes.
const testHref = "/test-home";
const testAttribute = "data-test-link";

const meta: Meta<typeof SiteHeader> = {
  title: "SiteHeader",
  component: SiteHeader,
  args: {
    current: "www",
    children: (
      <button type="button" className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground">
        work
      </button>
    ),
  },
};
export default meta;

type Story = StoryObj<typeof SiteHeader>;

export const Default: Story = {
  play: async ({ canvas }) => {
    // Without `homeLink`, `.jakoblui` is a plain link to the site's root.
    const home = canvas.getByRole("link", { name: "jakoblui home" });
    await expect(home.tagName).toBe("A");
    await expect(home).toHaveAttribute("href", "/");
    await expect(canvas.getByRole("button", { name: "work" })).toBeVisible();
  },
};

export const WithHomeLink: Story = {
  args: {
    homeLink: <a href={testHref} {...{ [testAttribute]: "" }} />,
  },
  play: async ({ canvas }) => {
    // The app's element is the link, its own attributes intact, with the header's name.
    const home = canvas.getByRole("link", { name: "jakoblui home" });
    await expect(home.tagName).toBe("A");
    await expect(home).toHaveAttribute("href", testHref);
    await expect(home).toHaveAttribute(testAttribute);
    await expect(canvas.getByRole("button", { name: "work" })).toBeVisible();
  },
};
