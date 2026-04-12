import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { Route, Switch } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/home";
import HowToBuildTemple from "@/pages/how-to-build-temple";
import KrishnaJanmabhoomi from "@/pages/krishna-janmabhoomi";
import Bhagwatham from "@/pages/bhagwatham";
import JapaCounter from "@/pages/japa-counter";

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
            <Route path="/japa" component={JapaCounter} />
            <Route path="/" component={Home} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;
