interface SpinnerProps {
  size?: number;
  color?: string;
  className?: string;
}

export function Spinner({ size = 18, color = "currentColor", className = "" }: SpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{
        animation: "ui-spin 0.75s linear infinite",
        display: "inline-block",
        verticalAlign: "middle",
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke={color}
        strokeWidth="3"
        strokeOpacity="0.25"
      />
      <path
        d="M12 2C6.47715 2 2 6.47715 2 12C2 13.8214 2.48697 15.5291 3.33782 17"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <style>{`
        @keyframes ui-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </svg>
  );
}
