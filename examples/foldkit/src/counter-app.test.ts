import { testCounterIntegration } from "../../counter-integration.js";
import { mountCounterApp } from "./counter-app.js";

testCounterIntegration((container) => mountCounterApp(container).dispose);
