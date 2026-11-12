import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#14231C",
        paper: "#F6F5F1",
        moss: {
          50: "#F1F5F1",
          100: "#DCE7DC",
          200: "#B9CFB9",
          300: "#8FB28F",
          400: "#5F8F62",
          500: "#3F7245",
          600: "#2F5A36",
          700: "#26472C",
          800: "#1F3A24",
          900: "#152A19"
        },
        clay: {
          400: "#C97B4A",
          500: "#B4652F",
          600: "#95511F"
        },
        rust: {
          500: "#B4452F",
          600: "#963521"
        }
      },
      fontFamily: {
        display: ["'Fraunces'", "serif"],
        body: ["'Inter'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"]
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "10px"
      }
    }
  },
  plugins: []
};

export default config;
