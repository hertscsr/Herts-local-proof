import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#1b3a5c", // Herts navy — swap for the real brand hex
          accent: "#c8102e", // Herts red — swap for the real brand hex
        },
      },
    },
  },
  plugins: [],
};

export default config;
