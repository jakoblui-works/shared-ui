import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { Placeholder } from "./placeholder";

const meta: Meta<typeof Placeholder> = {
  title: "Placeholder",
  component: Placeholder,
};
export default meta;

type Story = StoryObj<typeof Placeholder>;

export const Default: Story = {
  args: { label: "shared-ui" },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByText(args.label)).toBeVisible();
  },
};
