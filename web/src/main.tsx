import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import "./lib/theme.ts";
import { captureTokenFromUrl } from "./lib/auth.ts";
import { ReviewListPage } from "./routes/ReviewListPage.tsx";
import { ReviewDetailPage } from "./routes/ReviewDetailPage.tsx";
import { PracticePage } from "./routes/PracticePage.tsx";

captureTokenFromUrl();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ReviewListPage />} />
        <Route path="/review/:id" element={<ReviewDetailPage />} />
        <Route path="/practice/:id" element={<PracticePage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
