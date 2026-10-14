import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "../auth";
import { ConfirmProvider, ToastProvider } from "../hooks";
import { AppRoutes } from "./AppRoutes";

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <a href="#main-content" className="skip-to-content">
            Skip to main content
          </a>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
