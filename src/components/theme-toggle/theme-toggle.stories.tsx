import type { Meta, StoryObj } from "@storybook/react-vite";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, userEvent, waitFor } from "storybook/test";

import { THEME_STORAGE_KEY, ThemeToggle } from "./theme-toggle";

const root = document.documentElement;

/**
 * Starts the story with `<html>` in the given theme (as the app's inline script would leave it),
 * and puts back the class and the stored choice afterwards, so stories don't affect each other.
 */
const startIn = (dark: boolean) => () => {
  const wasDark = root.classList.contains("dark");
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  root.classList.toggle("dark", dark);
  return () => {
    root.classList.toggle("dark", wasDark);
    if (stored === null) localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, stored);
  };
};

const meta: Meta<typeof ThemeToggle> = {
  title: "ThemeToggle",
  component: ThemeToggle,
};
export default meta;

type Story = StoryObj<typeof ThemeToggle>;

export const StartsLight: Story = {
  // The toolbar's theme decorator agrees with the starting class, so it doesn't change it.
  parameters: { themes: { themeOverride: "light" } },
  beforeEach: startIn(false),
  play: async ({ canvas }) => {
    const toggle = canvas.getByRole("switch", { name: "Dark theme" });
    await expect(toggle).not.toBeChecked();

    await userEvent.click(toggle);
    await waitFor(() => expect(root).toHaveClass("dark"));
    await expect(toggle).toBeChecked();
    await expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    await userEvent.click(toggle);
    await waitFor(() => expect(root).not.toHaveClass("dark"));
    await expect(toggle).not.toBeChecked();
    await expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  },
};

export const StartsDark: Story = {
  parameters: { themes: { themeOverride: "dark" } },
  beforeEach: startIn(true),
  play: async ({ canvas }) => {
    const toggle = canvas.getByRole("switch", { name: "Dark theme" });
    await expect(toggle).toBeChecked();

    await userEvent.click(toggle);
    await waitFor(() => expect(root).not.toHaveClass("dark"));
    await expect(toggle).not.toBeChecked();
    await expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");

    await userEvent.click(toggle);
    await waitFor(() => expect(root).toHaveClass("dark"));
    await expect(toggle).toBeChecked();
    await expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  },
};

// Private browsing modes can make `localStorage.setItem` throw; the toggle must still work.
export const BlockedStorage: Story = {
  parameters: { themes: { themeOverride: "light" } },
  beforeEach: () => {
    const restoreTheme = startIn(false)();
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    };
    return () => {
      Storage.prototype.setItem = setItem;
      restoreTheme();
    };
  },
  play: async ({ canvas }) => {
    const toggle = canvas.getByRole("switch", { name: "Dark theme" });
    await expect(toggle).not.toBeChecked();

    await userEvent.click(toggle);
    await waitFor(() => expect(root).toHaveClass("dark"));
    await expect(toggle).toBeChecked();

    await userEvent.click(toggle);
    await waitFor(() => expect(root).not.toHaveClass("dark"));
    await expect(toggle).not.toBeChecked();
  },
};

const looks = (element: Element) => {
  const { translate, backgroundColor } = getComputedStyle(element);
  return { translate, backgroundColor };
};

/**
 * The toggle as a prerendered page shows it before its JavaScript runs, next to a mounted one: the
 * switch and its thumb must already look the same, or the thumb jumps on every load.
 */
const prerenderedMatchesMounted: Story = {
  render: () => (
    <>
      <div data-testid="prerendered" dangerouslySetInnerHTML={{ __html: renderToStaticMarkup(<ThemeToggle />) }} />
      <div data-testid="mounted">
        <ThemeToggle />
      </div>
    </>
  ),
  play: async ({ canvas }) => {
    const prerendered = canvas.getByTestId("prerendered").querySelector("[role=switch]")!;
    const mounted = canvas.getByTestId("mounted").querySelector("[role=switch]")!;
    await waitFor(() => {
      expect(looks(prerendered)).toEqual(looks(mounted));
      expect(looks(prerendered.firstElementChild!)).toEqual(looks(mounted.firstElementChild!));
    });
  },
};

export const PrerenderedLight: Story = {
  ...prerenderedMatchesMounted,
  parameters: { themes: { themeOverride: "light" } },
  beforeEach: startIn(false),
};

export const PrerenderedDark: Story = {
  ...prerenderedMatchesMounted,
  parameters: { themes: { themeOverride: "dark" } },
  beforeEach: startIn(true),
};
