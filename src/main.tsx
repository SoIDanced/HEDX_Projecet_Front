import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./styles/v14.css";
import "./styles/motion.css";
import "./platform/theme";

createRoot(document.getElementById("root")!).render(<App />);
