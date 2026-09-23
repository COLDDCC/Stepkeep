import { useEffect, useState } from "preact/hooks";
import { loadSettings, type Settings } from "../settings";
import { ImportView } from "./ImportView";
import { SettingsView } from "./SettingsView";
import { TaskList } from "./TaskList";
import { TaskView } from "./TaskView";

export type Route = { name: "list" } | { name: "import" } | { name: "settings" } | { name: "task"; id: string };

export function App() {
  const [route, setRoute] = useState<Route>({ name: "list" });
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  if (!settings) return null;

  switch (route.name) {
    case "list":
      return <TaskList settings={settings} go={setRoute} />;
    case "import":
      return <ImportView settings={settings} go={setRoute} />;
    case "settings":
      return <SettingsView settings={settings} onSaved={setSettings} go={setRoute} />;
    case "task":
      return <TaskView key={route.id} taskId={route.id} settings={settings} go={setRoute} />;
  }
}
