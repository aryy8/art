import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "./style.css";
import { App } from "./core/app";
import { pieces } from "./pieces";
import { inject } from "@vercel/analytics";
import { injectSpeedInsights } from "@vercel/speed-insights";

new App(document.getElementById("app")!, pieces);

// Vercel Web Analytics + Speed Insights (no-ops outside Vercel deployments)
inject();
injectSpeedInsights();
