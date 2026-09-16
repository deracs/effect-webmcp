import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { CounterPage } from "./counter-page.js";

import "./counter.css";

const rootRoute = createRootRoute({
  component: () => (
    <main>
      <nav>
        <Link to="/">Counter</Link>
        <Link to="/about">About</Link>
      </nav>
      <Outlet />
    </main>
  ),
});
const counterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: CounterPage,
});
const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/about",
  component: () => (
    <section>
      <h1>Route lifecycle</h1>
      <p>
        The counter tool is unregistered while this page is open. Return to
        Counter to register a fresh tool.
      </p>
    </section>
  ),
});
const router = createRouter({
  routeTree: rootRoute.addChildren([counterRoute, aboutRoute]),
});

declare module "@tanstack/react-router" {
  /** Keeps links checked against this example's route tree. */
  interface Register {
    router: typeof router;
  }
}

const container = document.getElementById("app");
if (container === null) throw new Error("Counter app container is missing");
const root = createRoot(container);
root.render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
import.meta.hot?.dispose(() => root.unmount());
