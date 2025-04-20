import { HashRouter } from "react-router-dom";
import "./App.css";
import Routing from "./components/Routing";
import { ProfileProvider } from "./provider/ProfileProvider";
import { ApplicationProvider } from "./provider/ApplicationProvider";
import { TemplateProvider } from "./provider/TemplateProvider";

function App() {
  return (
    <HashRouter>
      <div className="App">
        <ProfileProvider>
          <ApplicationProvider>
            <TemplateProvider>
              <Routing />
            </TemplateProvider>
          </ApplicationProvider>
        </ProfileProvider>
      </div>
    </HashRouter>
  );
}

export default App;
