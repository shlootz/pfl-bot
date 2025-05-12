import React from "react";

export function Card({ children, className = "" }) {
  return (
    <div className={`rounded-xl border border-gray-300 bg-white shadow-sm p-4 ${className}`}>
      {children}
    </div>
  );
}

export function CardContent({ children, className = "" }) {
  return <div className={`mt-2 ${className}`}>{children}</div>;
}