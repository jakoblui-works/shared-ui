import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";

import { NotFound } from "./not-found";

// A path a visitor might have asked for, with a query so it's clearly shown as requested.
const testPath = "/no/such/page?ref=old-link";

// What an app's router link renders to: a plain anchor with the app's own href and attributes.
const testHref = "/test-home";
const testAttribute = "data-test-link";

const meta: Meta<typeof NotFound> = {
  title: "NotFound",
  component: NotFound,
  args: {
    path: testPath,
  },
};
export default meta;

type Story = StoryObj<typeof NotFound>;

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText(testPath, { exact: false })).toBeVisible();

    // Without `homeLink`, the way home is a plain link to the site's root, and it has a name.
    const home = canvas.getByRole("link");
    await expect(home.tagName).toBe("A");
    await expect(home).toHaveAttribute("href", "/");
    await expect(home).toHaveAccessibleName();
    await expect(home).toBeVisible();
  },
};

export const WithHomeLink: Story = {
  args: {
    homeLink: <a href={testHref} {...{ [testAttribute]: "" }} />,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(testPath, { exact: false })).toBeVisible();

    // The app's element is the link, its own attributes intact, and it still reads as the way home.
    const home = canvas.getByRole("link");
    await expect(home.tagName).toBe("A");
    await expect(home).toHaveAttribute("href", testHref);
    await expect(home).toHaveAttribute(testAttribute);
    await expect(home).toHaveAccessibleName();
    await expect(home).toBeVisible();
  },
};
