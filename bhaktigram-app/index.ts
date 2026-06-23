import "react-native-url-polyfill/auto"; // URL/URLSearchParams for @supabase/supabase-js in RN
import { registerRootComponent } from "expo";
import App from "./App";

registerRootComponent(App);
