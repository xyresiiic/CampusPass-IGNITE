import "./ui.css";

export interface StepItem {
  number: number;
  label: string;
}

export interface StepperProps {
  steps: StepItem[];
  currentStep: number;
  failedStep?: number | null;
  className?: string;
}

export function Stepper({
  steps,
  currentStep,
  failedStep = null,
  className = "",
}: StepperProps) {
  // Compute progress percentage
  const progressPercent =
    steps.length > 1
      ? Math.min(100, Math.max(0, ((currentStep - 1) / (steps.length - 1)) * 100))
      : 100;

  return (
    <div className={`ui-stepper ${className}`} role="progressbar" aria-valuenow={currentStep} aria-valuemin={1} aria-valuemax={steps.length}>
      <div className="ui-stepper-track">
        <div
          className="ui-stepper-progress"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {steps.map((step) => {
        const isDone = currentStep > step.number;
        const isActive = currentStep === step.number;
        const isError = failedStep === step.number;

        let statusClass = "";
        if (isError) statusClass = "ui-step-error";
        else if (isDone) statusClass = "ui-step-done";
        else if (isActive) statusClass = "ui-step-active";

        return (
          <div key={step.number} className={`ui-step-item ${statusClass}`}>
            <div className="ui-step-badge" aria-hidden="true">
              {isError ? "✕" : isDone ? "✓" : step.number}
            </div>
            <span className="ui-step-label">{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}
