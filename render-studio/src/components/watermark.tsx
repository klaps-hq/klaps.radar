import React from "react";
import { cn } from "../utils";
interface WatermarkProps {
  className?: string;
}

const Watermark: React.FC<WatermarkProps> = ({ className }) => {
  return (
    <img
      src="/klaps-logo.png"
      alt="watermark"
      className={cn(
        "absolute bottom-6 right-6 w-16 h-16 object-cover opacity-40",
        className
      )}
    />
  );
};

export default Watermark;
