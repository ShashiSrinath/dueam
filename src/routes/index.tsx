import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button.tsx";

export const Route = createFileRoute("/")({
  component: App,
});

function App() {
  return (
    <div className="p-8">
      <Button asChild>
        <Link to="/accounts/new-account"> New Account</Link>
      </Button>
    </div>
  );
}

export default App;
