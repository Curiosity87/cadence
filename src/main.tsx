import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { Landing } from "./pages/Landing.tsx";
import { AppLayout } from "./pages/app/AppLayout.tsx";
import { Availability } from "./pages/app/Availability.tsx";
import { EventTypeEditor } from "./pages/app/EventTypeEditor.tsx";
import { EventTypes } from "./pages/app/EventTypes.tsx";
import { Meetings } from "./pages/app/Meetings.tsx";
import { Settings } from "./pages/app/Settings.tsx";
import { BookingPage } from "./pages/booking/BookingPage.tsx";
import { EventPage } from "./pages/booking/EventPage.tsx";
import { HostPage } from "./pages/booking/HostPage.tsx";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<EventTypes />} />
          <Route path="event-types/:id" element={<EventTypeEditor />} />
          <Route path="meetings" element={<Meetings />} />
          <Route path="availability" element={<Availability />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="/booking/:token" element={<BookingPage />} />
        <Route path="/:host" element={<HostPage />} />
        <Route path="/:host/:event" element={<EventPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
