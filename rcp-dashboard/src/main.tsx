import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource/doto/800.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "./dither-kit.css";
import "./styles.css";
import { applyTheme } from "./theme";

applyTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
