import "react-native-url-polyfill/auto"; // URL/URLSearchParams for @supabase/supabase-js + matrix-js-sdk in RN
import "react-native-get-random-values"; // crypto.getRandomValues for matrix-js-sdk (E2EE stays OFF)
import { registerRootComponent } from "expo";
import App from "./App";

registerRootComponent(App);
