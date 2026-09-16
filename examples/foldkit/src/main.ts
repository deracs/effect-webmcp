import { mountCounterApp } from "./counter-app.js";

import "./counter.css";

const container = document.getElementById("app");
if (container === null) throw new Error("Counter app container is missing");
const app = mountCounterApp(container);
import.meta.hot?.dispose(() => app.dispose());
