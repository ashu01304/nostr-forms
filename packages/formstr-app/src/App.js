import { BrowserRouter } from "react-router-dom";
import "./App.css";
import Routing from "./components/Routing";
import { ProfileProvider } from "./provider/ProfileProvider";
import { ApplicationProvider } from "./provider/ApplicationProvider";
import { TemplateProvider } from "./provider/TemplateProvider";
import { HandleLegacyRoutes } from "./components/HandleLegacyRoutes";

function App() {
  return (
    <BrowserRouter>
        <HandleLegacyRoutes>
      <div className="App">
        <ProfileProvider>
          <ApplicationProvider>
            <TemplateProvider>
              <Routing />
            </TemplateProvider>
          </ApplicationProvider>
        </ProfileProvider>
      </div>
        </HandleLegacyRoutes>
    </BrowserRouter>
  );
}

export default App;
