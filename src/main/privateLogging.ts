import { app } from "electron";
import { configurePrivacyConsole } from "./privacyConsole";

// Load before services: their constructors may log database paths or other private data.
configurePrivacyConsole(console, app.isPackaged);
