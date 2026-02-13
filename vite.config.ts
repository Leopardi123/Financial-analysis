import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "react-google-charts": new URL("./src/vendor/react-google-charts.tsx", import.meta.url).pathname,
    },
  },
});
