import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { testCounterIntegration } from "../../counter-integration.js";
import { CounterPage } from "./counter-page.js";

testCounterIntegration((container) => {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <CounterPage />
    </StrictMode>,
  );
  return () => root.unmount();
});
