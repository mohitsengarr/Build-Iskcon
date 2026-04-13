import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { Route, Switch } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/home";
import HowToBuildTemple from "@/pages/how-to-build-temple";
import KrishnaJanmabhoomi from "@/pages/krishna-janmabhoomi";
import Bhagwatham from "@/pages/bhagwatham";
import Gita from "@/pages/gita";
import Library from "@/pages/library";
import JapaCounter from "@/pages/japa-counter";
import PersonaGallery from "@/pages/persona-gallery";
import Admin from "@/pages/admin";

const queryClient = new QueryClient();

function App() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Switch>
            <Route path="/how-to-build-temple" component={HowToBuildTemple} />
            <Route path="/krishna-janmabhoomi" component={KrishnaJanmabhoomi} />
            <Route path="/bhagwatham" component={Bhagwatham} />
            <Route path="/gita" component={Gita} />
            <Route path="/library" component={Library} />
            <Route path="/admin" component={Admin} />
            <Route path="/japa" component={JapaCounter} />
            <Route path="/personas" component={PersonaGallery} />
            <Route path="/" component={Home} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;
