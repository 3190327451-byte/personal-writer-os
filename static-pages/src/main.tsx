import { createRoot } from "react-dom/client";
import WriterApp from "../../app/WriterApp";
import "../../app/globals.css";
import "../../app/final.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing application root");
}

createRoot(root).render(<WriterApp />);
