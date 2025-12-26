import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Mail,
  Shield,
  Sparkles,
  Zap,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEmailStore } from "@/lib/store";
import { useEffect, useState } from "react";
import { ThemeSettings } from "@/components/settings/theme-settings";
import { AiSettings } from "@/components/settings/ai-settings";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/onboarding")({
  component: OnboardingComponent,
});

const STEPS = ["Welcome", "Appearance", "AI Intelligence", "Connect"];

export function OnboardingComponent() {
  const navigate = useNavigate();
  const accounts = useEmailStore((state) => state.accounts);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (accounts.length > 0) {
      navigate({ to: "/" });
    }
  }, [accounts, navigate]);

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      navigate({ to: "/accounts/new" });
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const progress = ((currentStep + 1) / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 transition-all duration-300">
      <div className="max-w-3xl w-full space-y-8">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground font-medium">
            <span>
              Step {currentStep + 1} of {STEPS.length}
            </span>
            <span>{STEPS[currentStep]}</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Step Content */}
        <div className="min-h-[400px] flex flex-col justify-center">
          {currentStep === 0 && (
            <div className="text-center space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-4">
                <div className="flex justify-center">
                  <div className="bg-primary/10 p-4 rounded-3xl">
                    <Mail className="w-16 h-16 text-primary" />
                  </div>
                </div>
                <h1 className="text-5xl font-extrabold tracking-tight">
                  Welcome to Dream Email
                </h1>
                <p className="text-xl text-muted-foreground max-w-lg mx-auto">
                  The modern, lightning-fast desktop email client designed for
                  power users.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="space-y-3">
                  <div className="bg-muted w-10 h-10 rounded-full flex items-center justify-center mx-auto text-primary">
                    <Zap className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold">Unified Inbox</h3>
                  <p className="text-sm text-muted-foreground">
                    All your accounts in one beautiful view.
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="bg-muted w-10 h-10 rounded-full flex items-center justify-center mx-auto text-primary">
                    <Shield className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold">Privacy First</h3>
                  <p className="text-sm text-muted-foreground">
                    Local data storage and secure OAuth authentication.
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="bg-muted w-10 h-10 rounded-full flex items-center justify-center mx-auto text-primary">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold">Offline Sync</h3>
                  <p className="text-sm text-muted-foreground">
                    Search and read emails even without internet.
                  </p>
                </div>
              </div>
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-6 text-left animate-in fade-in slide-in-from-right-8 duration-300">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">
                  Make it yours
                </h2>
                <p className="text-muted-foreground">
                  Customize the look and feel of your inbox. You can always
                  change this later in settings.
                </p>
              </div>
              <ThemeSettings />
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6 text-left animate-in fade-in slide-in-from-right-8 duration-300">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tight">
                  Supercharge with AI
                </h2>
                <p className="text-muted-foreground">
                  Enable smart features like email summarization, sender
                  enrichment, and improved search.
                </p>
              </div>
              <AiSettings />
            </div>
          )}

          {currentStep === 3 && (
            <div className="text-center space-y-8 animate-in fade-in slide-in-from-right-8 duration-300">
              <div className="space-y-4">
                <div className="bg-primary/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
                  <Mail className="w-10 h-10 text-primary" />
                </div>
                <h2 className="text-3xl font-bold tracking-tight">
                  Let's get connected
                </h2>
                <p className="text-muted-foreground max-w-md mx-auto">
                  You're all set! Now let's connect your first email account to
                  start syncing your messages.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Footer */}
        <div className="flex justify-between pt-8 border-t">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={currentStep === 0}
            className={currentStep === 0 ? "invisible" : ""}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>

          <Button onClick={handleNext} size="lg" className="min-w-[140px]">
            {currentStep === STEPS.length - 1 ? (
              "Add Account"
            ) : (
              <>
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}